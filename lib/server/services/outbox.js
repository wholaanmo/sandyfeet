// lib/server/services/outbox.js
// Transactional notification outbox for reliable delivery after business mutations.
// Outbox entries are created atomically alongside business mutations.
// Provider delivery happens asynchronously and never rolls back committed business state.
import 'server-only';

import { firestore } from '../firebase-admin.js';

/**
 * The Firestore collection for notification outbox records.
 */
const OUTBOX_COLLECTION = 'notificationOutbox';

/**
 * Current outbox record schema version.
 */
const OUTBOX_SCHEMA_VERSION = 1;

/**
 * Outbox status lifecycle.
 * pending → processing → delivered | retryable_failed | terminal_failed
 */
export const OUTBOX_STATUSES = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  DELIVERED: 'delivered',
  RETRYABLE_FAILED: 'retryable_failed',
  TERMINAL_FAILED: 'terminal_failed',
});

/**
 * Valid outbox status transitions (adjacency map).
 */
export const OUTBOX_STATUS_MACHINE = Object.freeze({
  pending: ['processing'],
  processing: ['delivered', 'retryable_failed', 'terminal_failed'],
  retryable_failed: ['processing'],
  delivered: [],
  terminal_failed: [],
});

/**
 * Allowed notification types for outbox entries.
 */
export const OUTBOX_NOTIFICATION_TYPES = Object.freeze([
  'reservation_created',
  'reservation_cancelled',
  'reservation_edited',
  'payment_approved',
  'payment_rejected',
  'refund_approved',
  'refund_rejected',
  'refund_processed',
  'check_in_completed',
  'move_date_notification',
  'id_request',
]);

/**
 * Create a notification outbox entry within a Firestore transaction.
 * Outbox entries are transactional — created alongside business mutations
 * to guarantee notification delivery attempts for committed operations.
 *
 * @param {FirebaseFirestore.Transaction} transaction - Active Firestore transaction
 * @param {object} params - Outbox entry parameters
 * @param {string} params.type - Notification type (must be in OUTBOX_NOTIFICATION_TYPES)
 * @param {string} params.bookingId - Associated booking identifier
 * @param {string} params.actorUid - The actor who triggered the notification
 * @param {object} [params.payload] - Minimal additional payload (only essential fields)
 * @param {string} [params.correlationId] - Correlation identifier for retry tracking
 * @param {string} [params.idempotencyKey] - Idempotency key for deduplication
 * @returns {string} The generated outbox document ID
 * @throws {Error} If required fields are missing or invalid
 */
export function createOutboxEntry(transaction, { type, bookingId, actorUid, payload, correlationId, idempotencyKey }) {
  if (!transaction || typeof transaction.set !== 'function') {
    throw new Error('createOutboxEntry requires an active Firestore transaction');
  }
  if (!type || typeof type !== 'string') {
    throw new Error('Outbox entry requires a notification type');
  }
  if (!OUTBOX_NOTIFICATION_TYPES.includes(type)) {
    throw new Error(`Invalid outbox notification type: ${type}`);
  }
  if (!bookingId || typeof bookingId !== 'string') {
    throw new Error('Outbox entry requires a bookingId');
  }
  if (!actorUid || typeof actorUid !== 'string') {
    throw new Error('Outbox entry requires an actorUid');
  }

  const now = new Date().toISOString();
  const outboxRef = firestore.collection(OUTBOX_COLLECTION).doc();

  const entry = {
    type,
    bookingId,
    actorUid,
    status: OUTBOX_STATUSES.PENDING,
    payload: payload && typeof payload === 'object' ? payload : null,
    correlationId: correlationId || null,
    idempotencyKey: idempotencyKey || null,
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAfter: null,
    lastAttemptAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    schemaVersion: OUTBOX_SCHEMA_VERSION,
  };

  transaction.set(outboxRef, entry);
  return outboxRef.id;
}

/**
 * Check if an outbox status transition is valid.
 *
 * @param {string} from - Current status
 * @param {string} to - Target status
 * @returns {boolean}
 */
export function isValidOutboxTransition(from, to) {
  if (!from || !to || typeof from !== 'string' || typeof to !== 'string') return false;
  const allowed = OUTBOX_STATUS_MACHINE[from];
  if (!Array.isArray(allowed)) return false;
  return allowed.includes(to);
}

export { OUTBOX_COLLECTION, OUTBOX_SCHEMA_VERSION };
