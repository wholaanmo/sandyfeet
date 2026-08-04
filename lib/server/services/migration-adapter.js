// lib/server/services/migration-adapter.js
// Dual-read legacy compatibility and rollback adapter for ledger migration.
// Provides canonical-first reads with legacy fallback, and a rollback path
// that never silently rewrites reservations.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { ACTIVE_OCCUPANCY_STATUSES, occupiedDateKeys } from '../../domain/occupancy.js';
import { LEDGER_COLLECTION, MIGRATION_SCHEMA_VERSION, ledgerKey, computeExpectedLedgerEntries } from './migration.js';

/**
 * Read mode for the migration adapter.
 * - 'canonical': reads from ledger documents only
 * - 'legacy': computes from raw bookings only
 * - 'dual': reads canonical first, falls back to legacy computation
 */
let currentReadMode = 'dual';

/**
 * Get the current read mode.
 * @returns {'canonical' | 'legacy' | 'dual'}
 */
export function getReadMode() {
  return currentReadMode;
}

/**
 * Set the read mode. Used for testing and rollback scenarios.
 * @param {'canonical' | 'legacy' | 'dual'} mode
 */
export function setReadMode(mode) {
  if (!['canonical', 'legacy', 'dual'].includes(mode)) {
    throw new Error(`Invalid read mode: ${mode}. Must be 'canonical', 'legacy', or 'dual'.`);
  }
  currentReadMode = mode;
}

/**
 * Check if a canonical ledger document exists for a given room and date.
 *
 * @param {string} roomId — inventory room identifier
 * @param {string} date — YYYY-MM-DD local date
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<boolean>}
 */
export async function isCanonicalLedgerAvailable(roomId, date, { db = firestore } = {}) {
  if (!roomId || !date) return false;

  const key = ledgerKey(roomId, date);
  const doc = await db.collection(LEDGER_COLLECTION).doc(key).get();

  if (!doc.exists) return false;

  const data = doc.data();
  // Verify it has the migration schema version marker
  return data._schemaVersion === MIGRATION_SCHEMA_VERSION;
}

/**
 * Read capacity for a booking by ID using the current read mode.
 *
 * In dual mode: reads from canonical ledgers first, falls back to computing from raw bookings.
 * In canonical mode: reads only from ledger documents.
 * In legacy mode: computes only from raw bookings.
 *
 * @param {string} bookingId — the booking document ID
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<{
 *   source: 'canonical' | 'legacy' | 'not_found',
 *   entries: Array<{ key: string, roomId: string | null, date: string, count: number }>,
 *   booking: Record<string, any> | null
 * }>}
 */
export async function readWithLegacyFallback(bookingId, { db = firestore } = {}) {
  if (!bookingId || typeof bookingId !== 'string') {
    return { source: 'not_found', entries: [], booking: null };
  }

  // Fetch the booking document
  const booking = await fetchBooking(bookingId, db);
  if (!booking) {
    return { source: 'not_found', entries: [], booking: null };
  }

  const mode = currentReadMode;

  if (mode === 'canonical' || mode === 'dual') {
    // Try reading from canonical ledgers
    const expectedEntries = computeExpectedLedgerEntries(booking);
    const canonicalEntries = [];
    let allFound = true;

    for (const entry of expectedEntries) {
      const ledgerDoc = await db.collection(LEDGER_COLLECTION).doc(entry.key).get();
      if (ledgerDoc.exists) {
        const data = ledgerDoc.data();
        canonicalEntries.push({
          key: entry.key,
          roomId: data.roomId || null,
          date: data.date,
          count: data.count || 0,
        });
      } else {
        allFound = false;
        break;
      }
    }

    if (allFound && canonicalEntries.length > 0) {
      return { source: 'canonical', entries: canonicalEntries, booking };
    }

    // In canonical-only mode, don't fall back
    if (mode === 'canonical') {
      return { source: 'canonical', entries: canonicalEntries, booking };
    }
  }

  // Legacy fallback: compute from raw booking data
  if (mode === 'legacy' || mode === 'dual') {
    const entries = computeExpectedLedgerEntries(booking);
    return {
      source: 'legacy',
      entries: entries.map(e => ({
        key: e.key,
        roomId: e.roomId,
        date: e.date,
        count: e.count,
      })),
      booking,
    };
  }

  return { source: 'not_found', entries: [], booking: null };
}

/**
 * Roll back to legacy-only reads.
 * This switches the read path back to computed-from-bookings mode.
 * It NEVER restores client writes or silently rewrites reservations.
 * Canonical ledger documents remain intact — only the read path changes.
 *
 * @returns {{ previousMode: string, currentMode: string, ledgersPreserved: boolean }}
 */
export function rollbackToLegacyReads() {
  const previousMode = currentReadMode;
  currentReadMode = 'legacy';

  return {
    previousMode,
    currentMode: 'legacy',
    // Ledger documents are never deleted during rollback
    ledgersPreserved: true,
  };
}

/**
 * Restore dual-read mode after a rollback.
 * This re-enables canonical-first reads with legacy fallback.
 *
 * @returns {{ previousMode: string, currentMode: string }}
 */
export function restoreDualReads() {
  const previousMode = currentReadMode;
  currentReadMode = 'dual';

  return {
    previousMode,
    currentMode: 'dual',
  };
}

/**
 * Fetch a booking document from Firestore (checks both collections).
 *
 * @param {string} bookingId
 * @param {object} db — Firestore instance
 * @returns {Promise<Record<string, any> | null>}
 */
async function fetchBooking(bookingId, db) {
  // Check room bookings
  const roomDoc = await db.collection('bookings').doc(bookingId).get();
  if (roomDoc.exists) {
    return { id: roomDoc.id, ...roomDoc.data() };
  }

  // Check day-tour bookings
  const dayTourDoc = await db.collection('dayTourBookings').doc(bookingId).get();
  if (dayTourDoc.exists) {
    return { id: dayTourDoc.id, ...dayTourDoc.data() };
  }

  return null;
}
