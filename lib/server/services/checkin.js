// lib/server/services/checkin.js
// Check-in credential issuance and atomic consumption.
// Issues digest-backed, purpose/interval/reservation-bound credentials.
// QR data encodes only an approved Sandyfeet URL — no third-party QR service.
// Consumption atomically: validates credential, transitions booking status,
// transitions all child bookings, and writes audit event.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { requireRole } from '../auth/authorization.js';
import { issueCredential, validateCredential, consumeWithMutation } from './credential.js';
import { buildAuditEvent, writeAuditEvent } from './audit.js';
import { RESERVATION_STATUS_MACHINE } from '../../domain/state-machines.js';
import { env } from '../env.js';

/**
 * Check-in credential TTL: 24 hours in milliseconds.
 */
const CHECK_IN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Reservation statuses eligible for check-in credential issuance.
 * Only 'confirmed' bookings can be checked in per the RESERVATION_STATUS_MACHINE.
 */
const CHECK_IN_ELIGIBLE_STATUSES = new Set(['confirmed']);

/**
 * The target status after check-in consumption.
 */
const CHECKED_IN_STATUS = 'checked_in';

/**
 * Firestore collection names.
 */
const BOOKINGS_COLLECTION = 'bookings';
const DAY_TOUR_BOOKINGS_COLLECTION = 'dayTourBookings';

/**
 * Issue a check-in credential for a booking.
 *
 * Verifies staff/admin role, confirms booking is in 'confirmed' status,
 * issues a digest-backed credential bound to the booking, and returns
 * a QR-ready URL using only the approved APP_ORIGIN.
 *
 * @param {{ uid: string, role: string }} actor - Verified actor
 * @param {string} bookingId - The booking identifier to check in
 * @returns {Promise<{ token: string, qrUrl: string, expiresAt: Date }>}
 * @throws {Error} FORBIDDEN if role insufficient, NOT_FOUND if booking missing, CONFLICT if status ineligible
 */
export async function issueCheckInCredential(actor, bookingId) {
  // Step 1: Verify staff/admin role
  requireRole(actor, ['admin', 'staff']);

  // Step 2: Verify booking exists and is in 'confirmed' status
  const booking = await findBooking(bookingId);
  if (!booking) {
    const err = new Error('Booking not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const status = booking.data.status || booking.data.reservationStatus;
  if (!CHECK_IN_ELIGIBLE_STATUSES.has(status)) {
    const err = new Error(
      `Booking status '${status}' is not eligible for check-in. Must be 'confirmed'.`
    );
    err.code = 'CONFLICT';
    throw err;
  }

  // Step 3: Issue credential with purpose='check-in', bound to booking
  const { token, expiresAt } = await issueCredential({
    purpose: 'check-in',
    actorUid: actor.uid,
    subject: bookingId,
    ttlMs: CHECK_IN_TTL_MS,
    maxAttempts: 5,
  });

  // Step 4: Build QR URL using approved APP_ORIGIN only
  const qrUrl = `${env.APP_ORIGIN}/check-in?token=${encodeURIComponent(token)}`;

  return { token, qrUrl, expiresAt };
}

/**
 * Consume a check-in credential and atomically transition the booking.
 *
 * In ONE transaction: validates credential, marks it consumed, transitions
 * booking from 'confirmed' to 'checked_in', transitions all child bookings,
 * and writes an audit event.
 *
 * @param {{ uid: string, role: string }} actor - Verified actor
 * @param {string} token - The raw check-in token
 * @returns {Promise<{ bookingId: string, status: string }>}
 * @throws {Error} FORBIDDEN if role insufficient, INVALID_CREDENTIAL if token invalid
 */
export async function consumeCheckInCredential(actor, token) {
  // Step 1: Verify staff/admin role
  requireRole(actor, ['admin', 'staff']);

  // Step 2: Validate credential with purpose='check-in'
  const { id: credentialId, record: credentialRecord } = await validateCredential({
    purpose: 'check-in',
    token,
  });

  const bookingId = credentialRecord.subject;

  // Step 3: Consume credential atomically with booking transition + audit
  const result = await consumeWithMutation(credentialId, async (transaction) => {
    // Find all booking docs for this bookingId (parent + children)
    const bookingDocs = await findAllBookingDocsInTransaction(transaction, bookingId);

    if (bookingDocs.length === 0) {
      const err = new Error('Booking not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Verify at least the parent booking is in 'confirmed' status
    const parentDoc = bookingDocs.find(
      (d) => d.data.bookingId === bookingId && !d.data.parentBookingId
    ) || bookingDocs[0];

    const currentStatus = parentDoc.data.status || parentDoc.data.reservationStatus;
    if (!CHECK_IN_ELIGIBLE_STATUSES.has(currentStatus)) {
      const err = new Error(
        `Booking status '${currentStatus}' is not eligible for check-in`
      );
      err.code = 'CONFLICT';
      throw err;
    }

    // Validate transition is allowed by the state machine
    const allowed = RESERVATION_STATUS_MACHINE[currentStatus];
    if (!allowed || !allowed.includes(CHECKED_IN_STATUS)) {
      const err = new Error(
        `Transition from '${currentStatus}' to '${CHECKED_IN_STATUS}' is not permitted`
      );
      err.code = 'CONFLICT';
      throw err;
    }

    // Transition all booking docs to 'checked_in'
    const now = new Date().toISOString();
    for (const doc of bookingDocs) {
      transaction.update(doc.ref, {
        status: CHECKED_IN_STATUS,
        reservationStatus: CHECKED_IN_STATUS,
        checkedInAt: now,
        checkedInBy: actor.uid,
      });
    }

    // Write audit event
    const auditEvent = buildAuditEvent(
      actor,
      'check-in.consume',
      { type: 'booking', id: bookingId },
      {
        before: { status: currentStatus },
        after: { status: CHECKED_IN_STATUS },
        correlationId: `checkin-${bookingId}-${Date.now()}`,
      }
    );
    writeAuditEvent(transaction, auditEvent);

    return { bookingId, status: CHECKED_IN_STATUS };
  });

  return result;
}

/**
 * Find a booking by its bookingId across both collections.
 * Returns the first match or null.
 *
 * @param {string} bookingId
 * @returns {Promise<{ ref: FirebaseFirestore.DocumentReference, data: object } | null>}
 */
async function findBooking(bookingId) {
  // Search room bookings
  const roomQuery = firestore
    .collection(BOOKINGS_COLLECTION)
    .where('bookingId', '==', bookingId)
    .limit(1);
  const roomSnapshot = await roomQuery.get();
  if (!roomSnapshot.empty) {
    const doc = roomSnapshot.docs[0];
    return { ref: doc.ref, data: doc.data() };
  }

  // Search day tour bookings
  const dayTourQuery = firestore
    .collection(DAY_TOUR_BOOKINGS_COLLECTION)
    .where('bookingId', '==', bookingId)
    .limit(1);
  const dayTourSnapshot = await dayTourQuery.get();
  if (!dayTourSnapshot.empty) {
    const doc = dayTourSnapshot.docs[0];
    return { ref: doc.ref, data: doc.data() };
  }

  return null;
}

/**
 * Find all booking documents for a booking (parent + children) within a transaction.
 * Searches both bookings and dayTourBookings collections.
 *
 * @param {FirebaseFirestore.Transaction} transaction
 * @param {string} bookingId
 * @returns {Promise<Array<{ ref: FirebaseFirestore.DocumentReference, data: object }>>}
 */
async function findAllBookingDocsInTransaction(transaction, bookingId) {
  const results = [];

  // Room bookings by bookingId (parent)
  const roomByIdQuery = firestore
    .collection(BOOKINGS_COLLECTION)
    .where('bookingId', '==', bookingId);
  const roomByIdSnap = await transaction.get(roomByIdQuery);
  for (const doc of roomByIdSnap.docs) {
    results.push({ ref: doc.ref, data: doc.data() });
  }

  // Room bookings by parentBookingId (children)
  const roomByParentQuery = firestore
    .collection(BOOKINGS_COLLECTION)
    .where('parentBookingId', '==', bookingId);
  const roomByParentSnap = await transaction.get(roomByParentQuery);
  for (const doc of roomByParentSnap.docs) {
    results.push({ ref: doc.ref, data: doc.data() });
  }

  // Day tour bookings by bookingId
  const dayTourByIdQuery = firestore
    .collection(DAY_TOUR_BOOKINGS_COLLECTION)
    .where('bookingId', '==', bookingId);
  const dayTourByIdSnap = await transaction.get(dayTourByIdQuery);
  for (const doc of dayTourByIdSnap.docs) {
    results.push({ ref: doc.ref, data: doc.data() });
  }

  // Day tour bookings by parentBookingId (children)
  const dayTourByParentQuery = firestore
    .collection(DAY_TOUR_BOOKINGS_COLLECTION)
    .where('parentBookingId', '==', bookingId);
  const dayTourByParentSnap = await transaction.get(dayTourByParentQuery);
  for (const doc of dayTourByParentSnap.docs) {
    results.push({ ref: doc.ref, data: doc.data() });
  }

  return results;
}

export { CHECK_IN_TTL_MS, CHECK_IN_ELIGIBLE_STATUSES, CHECKED_IN_STATUS };
