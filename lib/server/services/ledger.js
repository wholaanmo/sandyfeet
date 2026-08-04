// lib/server/services/ledger.js
// Deterministic per-date capacity ledger operations.
// Provides key computation, transactional reads, and atomic delta writes.
import 'server-only';

import admin from 'firebase-admin';
import { firestore } from '../firebase-admin.js';
import { occupiedDateKeys } from '../../domain/occupancy.js';
import { calculateRoomDemand } from '../../domain/capacity.js';

/**
 * The Firestore collection for capacity ledger documents.
 */
export const LEDGER_COLLECTION = 'capacityLedgers';

/**
 * Compute deterministic ledger keys for a reservation command.
 * Keys follow the format `{roomId}_{date}` for each affected date per room type.
 * Day-tour commands produce `daytour_{date}` keys.
 *
 * @param {object} command - The reservation command
 * @param {string} [command.checkIn] - YYYY-MM-DD check-in date
 * @param {string} [command.checkOut] - YYYY-MM-DD check-out date
 * @param {string} [command.selectedDate] - YYYY-MM-DD for day tours
 * @param {boolean} [command.isDayTour] - Whether this is a day-tour reservation
 * @param {Array<{roomId: string, quantity?: number}>} [command.rooms] - Room selections
 * @returns {string[]} - Array of deterministic ledger keys
 */
export function computeLedgerKeys(command) {
  if (!command) return [];

  if (command.isDayTour) {
    const date = command.selectedDate;
    if (!date || typeof date !== 'string') return [];
    return [`daytour_${date}`];
  }

  const dates = occupiedDateKeys(command.checkIn, command.checkOut);
  if (dates.length === 0) return [];

  const demand = calculateRoomDemand(command);
  if (demand.size === 0) return [];

  const keys = [];
  for (const roomId of demand.keys()) {
    for (const date of dates) {
      keys.push(`${roomId}_${date}`);
    }
  }

  return keys.sort();
}

/**
 * Compute ledger deltas for a reservation command.
 * Returns a map of ledger key → increment value.
 *
 * @param {object} command - The reservation command
 * @returns {Map<string, number>} - ledgerKey → delta (positive = reserve, negative = release)
 */
export function computeLedgerDeltas(command) {
  const deltas = new Map();
  if (!command) return deltas;

  if (command.isDayTour) {
    const date = command.selectedDate;
    if (!date || typeof date !== 'string') return deltas;
    const total = Math.max(0, Math.floor(Number(command.adults) || 0))
      + Math.max(0, Math.floor(Number(command.children) || 0))
      + Math.max(0, Math.floor(Number(command.seniors) || 0));
    if (total > 0) {
      deltas.set(`daytour_${date}`, total);
    }
    return deltas;
  }

  const dates = occupiedDateKeys(command.checkIn, command.checkOut);
  if (dates.length === 0) return deltas;

  const demand = calculateRoomDemand(command);
  for (const [roomId, units] of demand.entries()) {
    for (const date of dates) {
      deltas.set(`${roomId}_${date}`, units);
    }
  }

  return deltas;
}

/**
 * Read ledger documents inside a Firestore transaction.
 * Returns a Map of ledger key → current reserved count.
 * Missing ledger documents are treated as 0 reserved.
 *
 * @param {FirebaseFirestore.Transaction} transaction - Active Firestore transaction
 * @param {string[]} keys - Array of ledger keys to read
 * @returns {Promise<Map<string, {reserved: number, capacity: number, exclusiveLockGroupId: string|null}>>}
 */
export async function readLedgers(transaction, keys) {
  const results = new Map();
  if (!keys || keys.length === 0) return results;

  const refs = keys.map((key) => firestore.collection(LEDGER_COLLECTION).doc(key));
  const snapshots = await transaction.getAll(...refs);

  for (let i = 0; i < keys.length; i++) {
    const snap = snapshots[i];
    if (snap.exists) {
      const data = snap.data();
      results.set(keys[i], {
        reserved: data.reserved || 0,
        capacity: data.capacity || 0,
        exclusiveLockGroupId: data.exclusiveLockGroupId || null,
      });
    } else {
      results.set(keys[i], { reserved: 0, capacity: 0, exclusiveLockGroupId: null });
    }
  }

  return results;
}

/**
 * Write ledger delta increments inside a Firestore transaction.
 * Creates ledger documents if they don't exist; increments the reserved count.
 *
 * @param {FirebaseFirestore.Transaction} transaction - Active Firestore transaction
 * @param {Map<string, number>} deltas - ledgerKey → increment value (positive to reserve, negative to release)
 * @param {object} [options]
 * @param {string} [options.exclusiveLockGroupId] - If set, applies exclusive lock to ledger entries
 */
export function writeLedgerDeltas(transaction, deltas, options = {}) {
  if (!deltas || deltas.size === 0) return;

  const FieldValue = admin.firestore.FieldValue;
  const now = new Date().toISOString();

  for (const [key, delta] of deltas.entries()) {
    const ref = firestore.collection(LEDGER_COLLECTION).doc(key);

    const updateData = {
      reserved: FieldValue.increment(delta),
      updatedAt: now,
      schemaVersion: 1,
    };

    if (options.exclusiveLockGroupId) {
      updateData.exclusiveLockGroupId = options.exclusiveLockGroupId;
    }

    transaction.set(ref, updateData, { merge: true });
  }
}

/**
 * Verify that all ledger entries have sufficient remaining capacity for the requested deltas.
 * Throws an error with code 'CAPACITY_EXCEEDED' if any ledger would go over capacity.
 *
 * @param {Map<string, {reserved: number, capacity: number, exclusiveLockGroupId: string|null}>} ledgerState
 * @param {Map<string, number>} deltas - Requested increments
 * @param {object} [options]
 * @param {string} [options.exclusiveLockGroupId] - The group requesting exclusive access
 * @param {boolean} [options.isExclusive] - Whether this is an exclusive reservation
 * @throws {Error} With code 'CAPACITY_EXCEEDED' if remaining capacity is insufficient
 */
export function verifyCapacity(ledgerState, deltas, options = {}) {
  for (const [key, delta] of deltas.entries()) {
    if (delta <= 0) continue; // Releases always succeed

    const state = ledgerState.get(key);
    if (!state) continue; // New ledger, no constraint (will be created with capacity later)

    // If this is an exclusive reservation and the ledger already has a lock from another group
    if (options.isExclusive && state.exclusiveLockGroupId && state.exclusiveLockGroupId !== options.exclusiveLockGroupId) {
      const err = new Error(`Capacity conflict: date already exclusively reserved`);
      err.code = 'CAPACITY_EXCEEDED';
      err.ledgerKey = key;
      throw err;
    }

    // If the ledger is exclusively locked by another group, reject
    if (state.exclusiveLockGroupId && state.exclusiveLockGroupId !== options.exclusiveLockGroupId) {
      const err = new Error(`Capacity conflict: date exclusively reserved by another booking`);
      err.code = 'CAPACITY_EXCEEDED';
      err.ledgerKey = key;
      throw err;
    }

    // Check numeric capacity (capacity of 0 means unlimited/unset)
    if (state.capacity > 0 && (state.reserved + delta) > state.capacity) {
      const err = new Error(`Capacity exceeded for ${key}: ${state.reserved} + ${delta} > ${state.capacity}`);
      err.code = 'CAPACITY_EXCEEDED';
      err.ledgerKey = key;
      throw err;
    }
  }
}
