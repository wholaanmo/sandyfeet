// lib/server/services/migration.js
// Idempotent ledger migration and reconciliation safeguards.
// Provides dry-run/backfill/reconcile commands with schema/version markers,
// resumable checkpoints, discrepancy reports, transaction-budget limits,
// and canonical-only writes.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { ACTIVE_OCCUPANCY_STATUSES, occupiedDateKeys } from '../../domain/occupancy.js';
import { calculateRoomDemand } from '../../domain/capacity.js';

/**
 * Current schema version for ledger documents.
 * Every ledger document written by the migration carries this marker.
 */
export const MIGRATION_SCHEMA_VERSION = 1;

/**
 * Maximum writes per batch. Firestore limits transactions to 500 writes.
 * We cap at 400 to leave room for overhead (audit, checkpoints, etc.).
 */
export const BATCH_WRITE_BUDGET = 400;

/**
 * Ledger collection name used by the migration.
 */
export const LEDGER_COLLECTION = 'capacityLedgers';

/**
 * Compute a deterministic ledger document key for a room on a given date.
 *
 * @param {string} roomId — inventory room identifier
 * @param {string} date — YYYY-MM-DD local date
 * @returns {string} — ledger document key
 */
export function ledgerKey(roomId, date) {
  if (!roomId || !date) return '';
  return `${roomId}__${date}`;
}

/**
 * Compute a deterministic ledger document key for day-tour capacity on a given date.
 *
 * @param {string} date — YYYY-MM-DD local date
 * @returns {string} — ledger document key
 */
export function dayTourLedgerKey(date) {
  if (!date) return '';
  return `daytour__${date}`;
}

/**
 * Compute expected ledger entries for a single booking document.
 * Returns an array of { key, roomId, date, count } objects.
 *
 * @param {Record<string, any>} booking — raw booking document data
 * @returns {Array<{ key: string, roomId: string | null, date: string, count: number, isDayTour: boolean }>}
 */
export function computeExpectedLedgerEntries(booking) {
  if (!booking) return [];

  const status = booking.status;
  if (!ACTIVE_OCCUPANCY_STATUSES.includes(status)) return [];

  // Day-tour bookings
  if (booking.type === 'day_tour' || booking.isDayTour) {
    const date = booking.tourDate || booking.checkInDate || booking.date;
    if (!date || typeof date !== 'string') return [];
    const normalizedDate = normalizeDateField(date);
    if (!normalizedDate) return [];

    const guests = Math.max(1, Math.floor(
      Number(booking.adults || 0) +
      Number(booking.children || 0) +
      Number(booking.seniors || 0)
    ) || 1);

    return [{
      key: dayTourLedgerKey(normalizedDate),
      roomId: null,
      date: normalizedDate,
      count: guests,
      isDayTour: true,
    }];
  }

  // Room bookings
  const checkIn = normalizeDateField(booking.checkInDate || booking.checkIn);
  const checkOut = normalizeDateField(booking.checkOutDate || booking.checkOut);
  if (!checkIn || !checkOut) return [];

  const dates = occupiedDateKeys(checkIn, checkOut);
  if (dates.length === 0) return [];

  // Resolve room demand
  const rooms = booking.rooms || booking.roomTypesArray;
  let demand;

  if (Array.isArray(rooms) && rooms.length > 0) {
    // If rooms are objects with roomId
    if (rooms[0] && typeof rooms[0] === 'object' && rooms[0].roomId) {
      demand = calculateRoomDemand({ rooms });
    } else {
      // Legacy: rooms is an array of room type strings
      demand = new Map();
      for (const roomType of rooms) {
        if (typeof roomType === 'string') {
          demand.set(roomType, (demand.get(roomType) || 0) + 1);
        }
      }
    }
  } else if (booking.roomType) {
    // Single room booking
    demand = new Map([[booking.roomType, Math.max(1, Number(booking.quantity || booking.roomCount || 1))]]);
  } else {
    return [];
  }

  const entries = [];
  for (const [roomId, count] of demand.entries()) {
    for (const date of dates) {
      entries.push({
        key: ledgerKey(roomId, date),
        roomId,
        date,
        count,
        isDayTour: false,
      });
    }
  }

  return entries;
}

/**
 * Normalize a date field that may be a string, Firestore timestamp, or Date.
 *
 * @param {any} value
 * @returns {string | null} — YYYY-MM-DD or null
 */
function normalizeDateField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // Try ISO string
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Run the ledger backfill operation.
 *
 * Reads all bookings with active occupancy statuses, computes expected ledger
 * entries, and writes ledger documents that don't already exist.
 *
 * In dry-run mode: reports what would be written without mutating.
 * In backfill mode: writes ledger documents, resumes from checkpoint.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=true] — if true, reports without writing
 * @param {number} [options.batchSize=100] — bookings per batch
 * @param {string|null} [options.checkpoint=null] — resume from this booking ID
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<{
 *   processed: number,
 *   created: number,
 *   skipped: number,
 *   checkpoint: string | null,
 *   discrepancies: Array<{ bookingId: string, key: string, expected: number, actual: number }>,
 *   dryRun: boolean,
 *   schemaVersion: number
 * }>}
 */
export async function runLedgerBackfill({
  dryRun = true,
  batchSize = 100,
  checkpoint = null,
  db = firestore,
} = {}) {
  const result = {
    processed: 0,
    created: 0,
    skipped: 0,
    checkpoint: null,
    discrepancies: [],
    dryRun,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  };

  let totalWritesInBatch = 0;

  // Query active bookings from both collections
  const collections = ['bookings', 'dayTourBookings'];

  for (const collectionName of collections) {
    let query = db.collection(collectionName)
      .where('status', 'in', [...ACTIVE_OCCUPANCY_STATUSES])
      .orderBy('__name__')
      .limit(batchSize);

    if (checkpoint && collectionName === collections[0]) {
      query = query.startAfter(checkpoint);
    }

    const snapshot = await query.get();

    for (const doc of snapshot.docs) {
      const booking = { id: doc.id, ...doc.data() };
      const entries = computeExpectedLedgerEntries(booking);

      result.processed++;
      result.checkpoint = doc.id;

      for (const entry of entries) {
        // Check if ledger document already exists
        const ledgerRef = db.collection(LEDGER_COLLECTION).doc(entry.key);
        const ledgerDoc = await ledgerRef.get();

        if (ledgerDoc.exists) {
          const existingData = ledgerDoc.data();
          const existingCount = existingData.count || 0;

          // Check for discrepancies — report but NEVER overwrite
          if (existingCount !== entry.count && !existingData._migrationMerged) {
            result.discrepancies.push({
              bookingId: booking.id,
              key: entry.key,
              expected: entry.count,
              actual: existingCount,
            });
          }
          result.skipped++;
        } else {
          // Write new ledger document
          if (!dryRun) {
            if (totalWritesInBatch >= BATCH_WRITE_BUDGET) {
              // Transaction budget exceeded — stop and return checkpoint
              return result;
            }

            await ledgerRef.set({
              key: entry.key,
              roomId: entry.roomId,
              date: entry.date,
              count: entry.count,
              isDayTour: entry.isDayTour,
              _schemaVersion: MIGRATION_SCHEMA_VERSION,
              _migratedAt: new Date().toISOString(),
              _sourceBookingId: booking.id,
            });

            totalWritesInBatch++;
          }
          result.created++;
        }
      }
    }
  }

  return result;
}

/**
 * Run the reconciliation check.
 *
 * Reads all ledger documents and all active bookings, recomputes expected capacity,
 * and reports discrepancies WITHOUT overwriting.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=true] — always reports, never mutates
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<{
 *   checked: number,
 *   discrepancies: Array<{ ledgerKey: string, expected: number, actual: number }>,
 *   dryRun: boolean,
 *   schemaVersion: number
 * }>}
 */
export async function runReconciliation({
  dryRun = true,
  db = firestore,
} = {}) {
  const result = {
    checked: 0,
    discrepancies: [],
    dryRun,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  };

  // Build the expected ledger counts from canonical bookings
  const expectedCounts = new Map();

  const collections = ['bookings', 'dayTourBookings'];
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName)
      .where('status', 'in', [...ACTIVE_OCCUPANCY_STATUSES])
      .get();

    for (const doc of snapshot.docs) {
      const booking = { id: doc.id, ...doc.data() };
      const entries = computeExpectedLedgerEntries(booking);

      for (const entry of entries) {
        const current = expectedCounts.get(entry.key) || 0;
        expectedCounts.set(entry.key, current + entry.count);
      }
    }
  }

  // Read all ledger documents and compare
  const ledgerSnapshot = await db.collection(LEDGER_COLLECTION).get();

  for (const doc of ledgerSnapshot.docs) {
    const data = doc.data();
    const key = doc.id;
    const actual = data.count || 0;
    const expected = expectedCounts.get(key) || 0;

    result.checked++;

    if (actual !== expected) {
      result.discrepancies.push({
        ledgerKey: key,
        expected,
        actual,
      });
    }

    // Remove from expected so we can detect missing ledgers
    expectedCounts.delete(key);
  }

  // Any remaining expected entries are missing ledger documents
  for (const [key, expected] of expectedCounts.entries()) {
    result.checked++;
    result.discrepancies.push({
      ledgerKey: key,
      expected,
      actual: 0,
    });
  }

  return result;
}
