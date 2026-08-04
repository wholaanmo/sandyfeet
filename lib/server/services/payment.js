// lib/server/services/payment.js
// Atomic payment and refund services.
// All transitions, balance changes, evidence metadata, audit, outbox, and idempotency
// commit in one Firestore transaction. Monetary values use integer centavos.
// Evidence URLs are metadata only — never returned to unauthorized actors.
// Ineligible refunds are rejected without sending notification.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { requireRole } from '../auth/authorization.js';
import {
  computeCommandHash,
  checkIdempotencyInTransaction,
  recordIdempotency,
} from './idempotency.js';

// ─── State Machines (adjacency maps) ────────────────────────────────────────

/**
 * Payment request state machine.
 * requested -> details_provided -> proof_submitted -> under_review -> approved|rejected|cancelled
 */
export const PAYMENT_REQUEST_MACHINE = Object.freeze({
  requested: ['details_provided', 'cancelled'],
  details_provided: ['proof_submitted', 'cancelled'],
  proof_submitted: ['under_review', 'cancelled'],
  under_review: ['approved', 'rejected'],
  approved: [],
  rejected: ['requested'],
  cancelled: [],
});

/**
 * Reservation payment status machine.
 * unpaid -> deposit_pending -> partially_paid -> paid
 */
export const RESERVATION_PAYMENT_MACHINE = Object.freeze({
  unpaid: ['deposit_pending'],
  deposit_pending: ['partially_paid', 'paid'],
  partially_paid: ['paid'],
  paid: [],
});

/**
 * Refund state machine.
 * not_requested -> requested -> approved|rejected -> processing -> refunded|failed
 */
export const REFUND_MACHINE = Object.freeze({
  not_requested: ['requested'],
  requested: ['approved', 'rejected'],
  approved: ['processing'],
  rejected: [],
  processing: ['refunded', 'failed'],
  refunded: [],
  failed: ['requested'],
});

/**
 * Reservation statuses that are eligible for refund.
 * Only cancelled bookings with a paid/partially_paid status can be refunded.
 */
const REFUND_ELIGIBLE_RESERVATION_STATUSES = new Set([
  'cancelled',
]);

/**
 * Payment statuses that qualify for refund processing.
 */
const REFUND_ELIGIBLE_PAYMENT_STATUSES = new Set([
  'partially_paid',
  'paid',
]);

/**
 * Roles allowed to process payment transitions.
 */
const PAYMENT_ALLOWED_ROLES = ['admin', 'staff'];

/**
 * Roles allowed to process refunds.
 */
const REFUND_ALLOWED_ROLES = ['admin'];

// ─── Collections ─────────────────────────────────────────────────────────────

const BOOKINGS_COLLECTION = 'bookings';
const DAY_TOUR_BOOKINGS_COLLECTION = 'dayTourBookings';
const AUDIT_COLLECTION = 'auditEvents';
const OUTBOX_COLLECTION = 'notificationOutbox';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Assert a state transition is valid according to the given machine.
 *
 * @param {Record<string, string[]>} machine - Adjacency map
 * @param {string} from - Current state
 * @param {string} to - Target state
 * @throws {Error} With code 'CONFLICT' if transition is not permitted
 */
function assertTransition(machine, from, to) {
  const allowed = machine[from];
  if (!allowed || !allowed.includes(to)) {
    const err = new Error(
      `Transition from '${from}' to '${to}' is not permitted`
    );
    err.code = 'CONFLICT';
    throw err;
  }
}

/**
 * Load a booking from either bookings or dayTourBookings in a transaction.
 *
 * @param {FirebaseFirestore.Transaction} transaction
 * @param {string} bookingId
 * @returns {Promise<{ ref: FirebaseFirestore.DocumentReference, data: object, collection: string }>}
 * @throws {Error} With code 'NOT_FOUND' if not found
 */
async function loadBookingInTransaction(transaction, bookingId) {
  let ref = firestore.collection(BOOKINGS_COLLECTION).doc(bookingId);
  let snap = await transaction.get(ref);
  if (snap.exists) {
    return { ref, data: snap.data(), collection: BOOKINGS_COLLECTION };
  }

  ref = firestore.collection(DAY_TOUR_BOOKINGS_COLLECTION).doc(bookingId);
  snap = await transaction.get(ref);
  if (snap.exists) {
    return { ref, data: snap.data(), collection: DAY_TOUR_BOOKINGS_COLLECTION };
  }

  const err = new Error('Booking not found');
  err.code = 'NOT_FOUND';
  throw err;
}

/**
 * Derive balance centavos from the authoritative booking totals.
 * Never trusts client-supplied balance/total.
 *
 * @param {object} bookingData - The authoritative booking record
 * @returns {{ totalCentavos: number, paidCentavos: number, balanceCentavos: number }}
 */
function deriveAuthoritativeBalance(bookingData) {
  const totals = bookingData.totals || {};
  const totalCentavos = Math.max(0, Math.floor(Number(totals.total) || 0));
  const downPayment = Math.max(0, Math.floor(Number(totals.downPayment) || 0));
  const balance = Math.max(0, Math.floor(Number(totals.balance) || 0));

  // Derive paid from total - balance
  const paidCentavos = Math.max(0, totalCentavos - balance);

  return { totalCentavos, paidCentavos, balanceCentavos: balance };
}

// ─── Payment Transition Service ──────────────────────────────────────────────

/**
 * Record a payment state transition atomically.
 *
 * In ONE transaction:
 * - Verifies actor role and current payment/reservation state
 * - Validates the transition against PAYMENT_REQUEST_MACHINE
 * - Updates payment state, writes evidence metadata
 * - Writes audit event, writes outbox notification
 * - Records idempotency
 *
 * Never trusts client-supplied balance/total — derives from authoritative record.
 * Evidence URLs are metadata only — never returned to unauthorized actors.
 * Idempotent retries return stored result.
 *
 * @param {object} actor - The authenticated actor { uid, role, status }
 * @param {string} bookingId - The booking to update
 * @param {object} options
 * @param {string} options.transition - Target payment state
 * @param {object} [options.evidence] - Evidence metadata (URLs, notes)
 * @param {string} options.idempotencyKey - Unique key for this operation
 * @returns {Promise<object>} - The operation result
 */
export async function recordPaymentTransition(actor, bookingId, { transition, evidence, idempotencyKey }) {
  // Pre-transaction validation
  if (!actor || !actor.uid) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  requireRole(actor, PAYMENT_ALLOWED_ROLES);

  if (!bookingId || typeof bookingId !== 'string') {
    const err = new Error('Booking ID is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (!transition || typeof transition !== 'string') {
    const err = new Error('Transition target is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    const err = new Error('Idempotency key is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const command = { bookingId, transition, evidence: evidence || null };
  const commandHash = computeCommandHash(command);

  const result = await firestore.runTransaction(async (transaction_) => {
    // 1. Check idempotency
    const idempotencyCheck = await checkIdempotencyInTransaction(
      transaction_, idempotencyKey, actor.uid, commandHash
    );
    if (idempotencyCheck.exists) {
      return { idempotent: true, ...idempotencyCheck.result };
    }

    // 2. Load booking
    const { ref: bookingRef, data: bookingData } = await loadBookingInTransaction(transaction_, bookingId);

    // 3. Determine current payment request state
    const currentPaymentRequestState = bookingData.paymentRequestState || 'requested';

    // 4. Validate transition against PAYMENT_REQUEST_MACHINE
    assertTransition(PAYMENT_REQUEST_MACHINE, currentPaymentRequestState, transition);

    // 5. Derive authoritative balance — never trust client values
    const balances = deriveAuthoritativeBalance(bookingData);

    // 6. Determine new reservation payment status based on evidence
    let newReservationPaymentStatus = bookingData.paymentStatus || 'unpaid';
    if (transition === 'approved') {
      // When payment proof is approved, advance reservation payment status
      const currentReservationPayment = bookingData.paymentStatus || 'unpaid';
      if (currentReservationPayment === 'unpaid') {
        newReservationPaymentStatus = 'deposit_pending';
      } else if (currentReservationPayment === 'deposit_pending') {
        newReservationPaymentStatus = 'partially_paid';
      } else if (currentReservationPayment === 'partially_paid') {
        newReservationPaymentStatus = 'paid';
      }
    }

    const now = new Date().toISOString();

    // 7. Build evidence metadata (never store raw evidence to general record)
    const evidenceMetadata = evidence ? {
      hasProof: true,
      proofType: evidence.proofType || null,
      submittedAt: now,
      // URLs stored only as metadata references, not publicly accessible
      evidenceRef: evidence.evidenceRef || null,
    } : null;

    // 8. Update booking payment fields
    const updatePayload = {
      paymentRequestState: transition,
      paymentStatus: newReservationPaymentStatus,
      updatedAt: now,
    };
    if (evidenceMetadata) {
      updatePayload.evidenceMetadata = evidenceMetadata;
    }
    transaction_.update(bookingRef, updatePayload);

    // 9. Write audit event
    const auditRef = firestore.collection(AUDIT_COLLECTION).doc();
    transaction_.set(auditRef, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'payment.transition',
      targetType: 'booking',
      targetId: bookingId,
      correlationId: idempotencyKey,
      idempotencyKey,
      occurredAt: now,
      before: {
        paymentRequestState: currentPaymentRequestState,
        paymentStatus: bookingData.paymentStatus || 'unpaid',
      },
      after: {
        paymentRequestState: transition,
        paymentStatus: newReservationPaymentStatus,
      },
      schemaVersion: 1,
    });

    // 10. Write outbox notification
    const outboxRef = firestore.collection(OUTBOX_COLLECTION).doc();
    transaction_.set(outboxRef, {
      type: 'payment_transition',
      bookingId,
      actorUid: actor.uid,
      transition,
      status: 'pending',
      createdAt: now,
      schemaVersion: 1,
    });

    // 11. Record idempotency
    const operationResult = {
      bookingId,
      action: 'payment_transition',
      previousPaymentRequestState: currentPaymentRequestState,
      newPaymentRequestState: transition,
      paymentStatus: newReservationPaymentStatus,
      balances,
    };
    recordIdempotency(
      transaction_,
      idempotencyKey,
      actor.uid,
      commandHash,
      operationResult,
      { scope: 'payment', businessEntityIds: [bookingId] }
    );

    return operationResult;
  });

  return result;
}

// ─── Refund Service ──────────────────────────────────────────────────────────

/**
 * Process a refund atomically.
 *
 * In ONE transaction:
 * - Verifies admin role, current refund state allows transition (REFUND_MACHINE)
 * - IF reservation state is ineligible for refund → rejects WITHOUT sending notification
 * - Updates refund state, calculates refund amount from authoritative balance
 * - Writes audit event, writes outbox (only if eligible)
 * - Records idempotency
 *
 * Monetary values use integer centavos.
 * Idempotent retries return stored result.
 *
 * @param {object} actor - The authenticated actor { uid, role, status }
 * @param {string} bookingId - The booking to refund
 * @param {object} options
 * @param {string} [options.transition] - Target refund state (default: 'requested')
 * @param {string} [options.reasonCode] - Reason for the refund
 * @param {string} options.idempotencyKey - Unique key for this operation
 * @returns {Promise<object>} - The operation result
 */
export async function processRefund(actor, bookingId, { transition, reasonCode, idempotencyKey }) {
  // Pre-transaction validation
  if (!actor || !actor.uid) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  requireRole(actor, REFUND_ALLOWED_ROLES);

  if (!bookingId || typeof bookingId !== 'string') {
    const err = new Error('Booking ID is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    const err = new Error('Idempotency key is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const targetRefundState = transition || 'requested';
  const command = { bookingId, transition: targetRefundState, reasonCode: reasonCode || null };
  const commandHash = computeCommandHash(command);

  const result = await firestore.runTransaction(async (transaction_) => {
    // 1. Check idempotency
    const idempotencyCheck = await checkIdempotencyInTransaction(
      transaction_, idempotencyKey, actor.uid, commandHash
    );
    if (idempotencyCheck.exists) {
      return { idempotent: true, ...idempotencyCheck.result };
    }

    // 2. Load booking
    const { ref: bookingRef, data: bookingData } = await loadBookingInTransaction(transaction_, bookingId);

    // 3. Determine current refund state
    const currentRefundState = bookingData.refundState || 'not_requested';

    // 4. Validate transition against REFUND_MACHINE
    assertTransition(REFUND_MACHINE, currentRefundState, targetRefundState);

    // 5. Check reservation eligibility for refund
    const reservationStatus = bookingData.status || '';
    const paymentStatus = bookingData.paymentStatus || 'unpaid';

    const isReservationEligible = REFUND_ELIGIBLE_RESERVATION_STATUSES.has(reservationStatus);
    const isPaymentEligible = REFUND_ELIGIBLE_PAYMENT_STATUSES.has(paymentStatus);

    if (!isReservationEligible || !isPaymentEligible) {
      // Reject WITHOUT sending notification (Requirement 7.5)
      const err = new Error('Reservation is not eligible for refund');
      err.code = 'CONFLICT';
      err.details = { reservationStatus, paymentStatus };
      throw err;
    }

    // 6. Derive authoritative refund amount from booking balance
    const balances = deriveAuthoritativeBalance(bookingData);
    const refundAmountCentavos = balances.paidCentavos;

    const now = new Date().toISOString();

    // 7. Update booking refund state
    transaction_.update(bookingRef, {
      refundState: targetRefundState,
      refundAmountCentavos,
      refundRequestedAt: now,
      refundRequestedBy: actor.uid,
      refundReasonCode: reasonCode || null,
      updatedAt: now,
    });

    // 8. Write audit event
    const auditRef = firestore.collection(AUDIT_COLLECTION).doc();
    transaction_.set(auditRef, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'refund.transition',
      targetType: 'booking',
      targetId: bookingId,
      correlationId: idempotencyKey,
      idempotencyKey,
      occurredAt: now,
      before: {
        refundState: currentRefundState,
      },
      after: {
        refundState: targetRefundState,
        refundAmountCentavos,
      },
      schemaVersion: 1,
    });

    // 9. Write outbox notification — ONLY for eligible refunds (already verified above)
    const outboxRef = firestore.collection(OUTBOX_COLLECTION).doc();
    transaction_.set(outboxRef, {
      type: 'refund_transition',
      bookingId,
      actorUid: actor.uid,
      transition: targetRefundState,
      refundAmountCentavos,
      status: 'pending',
      createdAt: now,
      schemaVersion: 1,
    });

    // 10. Record idempotency
    const operationResult = {
      bookingId,
      action: 'refund_transition',
      previousRefundState: currentRefundState,
      newRefundState: targetRefundState,
      refundAmountCentavos,
      balances,
    };
    recordIdempotency(
      transaction_,
      idempotencyKey,
      actor.uid,
      commandHash,
      operationResult,
      { scope: 'payment', businessEntityIds: [bookingId] }
    );

    return operationResult;
  });

  return result;
}
