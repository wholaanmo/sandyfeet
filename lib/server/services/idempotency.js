// lib/server/services/idempotency.js
// Command-hash idempotency for reservation and payment operations.
// Ensures repeated equivalent requests produce one business effect.
// Different commands on the same key produce CONFLICT.
import 'server-only';

import crypto from 'node:crypto';
import { firestore } from '../firebase-admin.js';

/**
 * The Firestore collection for idempotency records.
 */
export const IDEMPOTENCY_COLLECTION = 'idempotencyRecords';

/**
 * Default TTL for idempotency records: 24 hours in milliseconds.
 */
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute a deterministic SHA-256 hash of a command object.
 * The command is serialized with sorted keys for canonical representation.
 *
 * @param {object} command - The command to hash
 * @returns {string} - Hex-encoded SHA-256 hash
 */
export function computeCommandHash(command) {
  if (!command || typeof command !== 'object') {
    return crypto.createHash('sha256').update('').digest('hex');
  }

  const canonical = JSON.stringify(command, Object.keys(command).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Compute a deterministic key digest for storage.
 * This avoids storing raw idempotency keys which could be user-supplied.
 *
 * @param {string} key - The raw idempotency key
 * @param {string} actorUid - The actor UID for scoping
 * @returns {string} - Composite document ID: `{actorUid}_{keyDigest}`
 */
export function computeIdempotencyDocId(key, actorUid) {
  const keyDigest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `${actorUid}_${keyDigest}`;
}

/**
 * Check whether an idempotency record already exists for the given key/actor.
 * If the record exists and the command hash matches, returns the stored result.
 * If the record exists but the command hash differs, throws CONFLICT.
 * If no record exists, returns { exists: false }.
 *
 * @param {string} key - The idempotency key
 * @param {string} actorUid - The actor UID
 * @param {string} commandHash - SHA-256 hash of the current command
 * @returns {Promise<{ exists: boolean, result?: object }>}
 * @throws {Error} With code 'CONFLICT' if key reused with different command
 */
export async function checkIdempotency(key, actorUid, commandHash) {
  if (!key || !actorUid || !commandHash) {
    return { exists: false };
  }

  const docId = computeIdempotencyDocId(key, actorUid);
  const docRef = firestore.collection(IDEMPOTENCY_COLLECTION).doc(docId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return { exists: false };
  }

  const data = snap.data();

  // Check expiry
  if (data.expiresAt) {
    const expiresAt = new Date(data.expiresAt);
    if (new Date() > expiresAt) {
      // Expired record — treat as non-existent
      return { exists: false };
    }
  }

  // Verify command hash matches
  if (data.commandDigest !== commandHash) {
    const err = new Error('Idempotency key reused with a different command');
    err.code = 'CONFLICT';
    throw err;
  }

  // Same command — return stored result
  return {
    exists: true,
    result: data.resultProjection || null,
  };
}

/**
 * Check idempotency within a Firestore transaction.
 * Returns the same semantics as checkIdempotency but uses transactional reads.
 *
 * @param {FirebaseFirestore.Transaction} transaction - Active Firestore transaction
 * @param {string} key - The idempotency key
 * @param {string} actorUid - The actor UID
 * @param {string} commandHash - SHA-256 hash of the current command
 * @returns {Promise<{ exists: boolean, result?: object, docRef: FirebaseFirestore.DocumentReference }>}
 * @throws {Error} With code 'CONFLICT' if key reused with different command
 */
export async function checkIdempotencyInTransaction(transaction, key, actorUid, commandHash) {
  if (!key || !actorUid || !commandHash) {
    const docId = computeIdempotencyDocId(key || '', actorUid || '');
    const docRef = firestore.collection(IDEMPOTENCY_COLLECTION).doc(docId);
    return { exists: false, docRef };
  }

  const docId = computeIdempotencyDocId(key, actorUid);
  const docRef = firestore.collection(IDEMPOTENCY_COLLECTION).doc(docId);
  const snap = await transaction.get(docRef);

  if (!snap.exists) {
    return { exists: false, docRef };
  }

  const data = snap.data();

  // Check expiry
  if (data.expiresAt) {
    const expiresAt = new Date(data.expiresAt);
    if (new Date() > expiresAt) {
      return { exists: false, docRef };
    }
  }

  // Verify command hash matches
  if (data.commandDigest !== commandHash) {
    const err = new Error('Idempotency key reused with a different command');
    err.code = 'CONFLICT';
    throw err;
  }

  return {
    exists: true,
    result: data.resultProjection || null,
    docRef,
  };
}

/**
 * Record an idempotency entry within a Firestore transaction.
 * Writes to `idempotencyRecords/{actorUid}_{keyDigest}`.
 *
 * @param {FirebaseFirestore.Transaction} transaction - Active Firestore transaction
 * @param {string} key - The idempotency key
 * @param {string} actorUid - The actor UID
 * @param {string} commandHash - SHA-256 hash of the command
 * @param {object} result - The operation result projection to store
 * @param {object} [options]
 * @param {string} [options.scope] - Operation scope (e.g., 'reservation', 'payment')
 * @param {string[]} [options.businessEntityIds] - IDs of created/modified business entities
 * @param {number} [options.expiryMs] - Custom TTL in ms (default: 24h)
 */
export function recordIdempotency(transaction, key, actorUid, commandHash, result, options = {}) {
  const docId = computeIdempotencyDocId(key, actorUid);
  const docRef = firestore.collection(IDEMPOTENCY_COLLECTION).doc(docId);

  const now = new Date();
  const expiryMs = options.expiryMs || DEFAULT_EXPIRY_MS;

  const record = {
    scope: options.scope || 'reservation',
    actorUid,
    keyDigest: crypto.createHash('sha256').update(key).digest('hex'),
    commandDigest: commandHash,
    status: 'completed',
    resultCode: 'success',
    resultProjection: result || null,
    businessEntityIds: options.businessEntityIds || [],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiryMs).toISOString(),
    schemaVersion: 1,
  };

  transaction.set(docRef, record);
}
