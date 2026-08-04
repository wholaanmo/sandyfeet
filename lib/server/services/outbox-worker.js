// lib/server/services/outbox-worker.js
// Outbox worker: claims due entries with a lease, delivers notifications,
// handles retry with bounded exponential backoff, and marks terminal failures.
// Retry state is independent of business commits.
import 'server-only';

import { OUTBOX_STATUSES, isValidOutboxTransition } from './outbox.js';

/**
 * Default batch size for outbox processing.
 */
const DEFAULT_BATCH_SIZE = 10;

/**
 * Lease duration in milliseconds. Other workers cannot claim a leased entry.
 */
const LEASE_DURATION_MS = 60_000; // 1 minute

/**
 * Maximum retry attempts before marking terminal failure.
 */
const MAX_ATTEMPTS = 5;

/**
 * Base delay for exponential backoff in milliseconds.
 */
const BASE_BACKOFF_MS = 1_000;

/**
 * Maximum backoff delay in milliseconds (5 minutes).
 */
const MAX_BACKOFF_MS = 300_000;

/**
 * Calculate exponential backoff delay.
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt) {
  const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_BACKOFF_MS);
}

/**
 * @typedef {Object} OutboxWorkerDeps
 * @property {number} [batchSize] - Number of entries to process per batch
 * @property {object} db - Firestore instance
 * @property {(entry: object) => Promise<{ ok: boolean, error?: string, retryable?: boolean }>} sendNotification - Provider send function
 */

/**
 * Process a batch of due outbox entries.
 *
 * Flow:
 *  1. Claims due entries with a lease (prevents double-processing)
 *  2. For each entry: send via provider
 *  3. On success: mark 'delivered'
 *  4. On retryable failure: increment attempts, set nextAttemptAfter (exponential backoff)
 *  5. On terminal failure (max attempts or non-retryable): mark 'terminal_failed'
 *
 * @param {OutboxWorkerDeps} deps
 * @returns {Promise<{ processed: number, delivered: number, retried: number, failed: number }>}
 */
export async function processOutboxBatch(deps) {
  const { batchSize = DEFAULT_BATCH_SIZE, db, sendNotification } = deps;

  if (!db || typeof db.collection !== 'function') {
    throw new Error('processOutboxBatch requires a Firestore db instance');
  }
  if (typeof sendNotification !== 'function') {
    throw new Error('processOutboxBatch requires a sendNotification function');
  }

  const now = new Date();
  const leaseExpiry = new Date(now.getTime() + LEASE_DURATION_MS);

  // Query for due entries: pending or retryable_failed with nextAttemptAfter <= now
  const collection = db.collection('notificationOutbox');

  // Claim entries that are due for processing
  const dueEntries = await claimDueEntries(collection, db, batchSize, now, leaseExpiry);

  const stats = { processed: 0, delivered: 0, retried: 0, failed: 0 };

  for (const entry of dueEntries) {
    stats.processed++;
    try {
      const result = await sendNotification(entry.data);

      if (result.ok) {
        await markDelivered(collection, entry.id, db);
        stats.delivered++;
      } else if (result.retryable !== false && entry.data.attempts < MAX_ATTEMPTS - 1) {
        await markRetryable(collection, entry.id, entry.data.attempts, db);
        stats.retried++;
      } else {
        await markTerminalFailed(collection, entry.id, result.error || 'Delivery failed', db);
        stats.failed++;
      }
    } catch (err) {
      // Unexpected error during send — treat as retryable if under limit
      if (entry.data.attempts < MAX_ATTEMPTS - 1) {
        await markRetryable(collection, entry.id, entry.data.attempts, db);
        stats.retried++;
      } else {
        await markTerminalFailed(collection, entry.id, err.message || 'Unexpected error', db);
        stats.failed++;
      }
    }
  }

  return stats;
}

/**
 * Claim due outbox entries with a lease to prevent double-processing.
 * Uses a Firestore transaction per entry to atomically set 'processing' status and lease.
 *
 * @param {object} collection - Firestore collection reference
 * @param {object} db - Firestore instance
 * @param {number} batchSize
 * @param {Date} now
 * @param {Date} leaseExpiry
 * @returns {Promise<Array<{ id: string, data: object }>>}
 */
async function claimDueEntries(collection, db, batchSize, now, leaseExpiry) {
  const nowIso = now.toISOString();

  // Query pending entries
  const pendingQuery = collection
    .where('status', '==', OUTBOX_STATUSES.PENDING)
    .limit(batchSize);

  // Query retryable entries that are due
  const retryableQuery = collection
    .where('status', '==', OUTBOX_STATUSES.RETRYABLE_FAILED)
    .where('nextAttemptAfter', '<=', nowIso)
    .limit(batchSize);

  const [pendingSnap, retryableSnap] = await Promise.all([
    pendingQuery.get(),
    retryableQuery.get(),
  ]);

  const candidates = [];
  pendingSnap.forEach((doc) => candidates.push({ id: doc.id, data: doc.data() }));
  retryableSnap.forEach((doc) => candidates.push({ id: doc.id, data: doc.data() }));

  // Limit total to batchSize
  const limited = candidates.slice(0, batchSize);

  // Claim each entry with a lease via transaction
  const claimed = [];
  for (const candidate of limited) {
    try {
      const claimResult = await db.runTransaction(async (tx) => {
        const docRef = collection.doc(candidate.id);
        const freshDoc = await tx.get(docRef);

        if (!freshDoc.exists) return null;

        const freshData = freshDoc.data();
        const currentStatus = freshData.status;

        // Only claim if still in a claimable state
        if (!isValidOutboxTransition(currentStatus, OUTBOX_STATUSES.PROCESSING)) {
          return null;
        }

        // Check if already leased by another worker
        if (freshData.leasedUntil && new Date(freshData.leasedUntil) > now) {
          return null;
        }

        // Claim with lease
        tx.update(docRef, {
          status: OUTBOX_STATUSES.PROCESSING,
          leasedUntil: leaseExpiry.toISOString(),
          updatedAt: now.toISOString(),
        });

        return { id: candidate.id, data: freshData };
      });

      if (claimResult) {
        claimed.push(claimResult);
      }
    } catch {
      // Transaction conflict — skip this entry, another worker claimed it
    }
  }

  return claimed;
}

/**
 * Mark an outbox entry as delivered.
 * @param {object} collection
 * @param {string} docId
 * @param {object} db
 */
async function markDelivered(collection, docId, db) {
  const now = new Date().toISOString();
  await collection.doc(docId).update({
    status: OUTBOX_STATUSES.DELIVERED,
    deliveredAt: now,
    leasedUntil: null,
    updatedAt: now,
  });
}

/**
 * Mark an outbox entry for retry with exponential backoff.
 * @param {object} collection
 * @param {string} docId
 * @param {number} currentAttempts
 * @param {object} db
 */
async function markRetryable(collection, docId, currentAttempts, db) {
  const now = new Date();
  const nextAttempt = currentAttempts + 1;
  const backoffMs = calculateBackoff(nextAttempt);
  const nextAttemptAfter = new Date(now.getTime() + backoffMs).toISOString();

  await collection.doc(docId).update({
    status: OUTBOX_STATUSES.RETRYABLE_FAILED,
    attempts: nextAttempt,
    lastAttemptAt: now.toISOString(),
    nextAttemptAfter,
    leasedUntil: null,
    updatedAt: now.toISOString(),
  });
}

/**
 * Mark an outbox entry as terminal failure.
 * @param {object} collection
 * @param {string} docId
 * @param {string} reason
 * @param {object} db
 */
async function markTerminalFailed(collection, docId, reason, db) {
  const now = new Date().toISOString();
  await collection.doc(docId).update({
    status: OUTBOX_STATUSES.TERMINAL_FAILED,
    failedAt: now,
    failureReason: reason,
    leasedUntil: null,
    updatedAt: now,
  });
}
