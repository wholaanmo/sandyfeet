// lib/server/repositories/payment.js
// Actor-scoped payment repository.
// Guest sees payment status for owned bookings only.
// Payment evidence is restricted to admin/staff with business purpose.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { requireRole } from '../auth/authorization.js';
import {
  toISOString,
  projectFields,
  throwNotFound,
  throwForbidden,
  requireAuthenticatedActor,
} from './base.js';

/**
 * Fields visible to a guest about their payment status.
 * No evidence URLs, no internal state, no staff notes.
 */
const GUEST_PAYMENT_STATUS_FIELDS = [
  'bookingId',
  'paymentMethod',
  'balancePaymentMethod',
  'totalPrice',
  'downPayment',
  'remainingBalance',
  'paymentStatus',
  'status',
  'createdAt',
  'updatedAt',
];

/**
 * Fields visible when staff/admin access payment evidence for business purposes.
 */
const EVIDENCE_FIELDS = [
  'bookingId',
  'paymentMethod',
  'balancePaymentMethod',
  'totalPrice',
  'downPayment',
  'remainingBalance',
  'paymentStatus',
  'status',
  'paymentProofUrl',
  'paymentProof',
  'paymentProofImage',
  'bankDetails',
  'confirmedBy',
  'confirmedAt',
  'notes',
  'staffNotes',
  'createdAt',
  'updatedAt',
];

/**
 * Resolve the owner UID from a booking-like record.
 *
 * @param {Record<string, any>} data
 * @returns {string | null}
 */
function resolveOwner(data) {
  return data.ownerUid || data.userId || data.uid || null;
}

/**
 * Fetch a booking for payment context from the appropriate collection.
 *
 * @param {string} bookingId
 * @returns {Promise<{ data: Record<string, any> } | null>}
 */
async function fetchBookingForPayment(bookingId) {
  const roomDoc = await firestore.collection('bookings').doc(bookingId).get();
  if (roomDoc.exists) {
    return { data: { id: roomDoc.id, ...roomDoc.data() } };
  }

  const dayTourDoc = await firestore.collection('dayTourBookings').doc(bookingId).get();
  if (dayTourDoc.exists) {
    return { data: { id: dayTourDoc.id, ...dayTourDoc.data() } };
  }

  return null;
}

/**
 * Get payment status for a booking owned by the authenticated guest.
 * Verifies ownership from actor.uid — submitted bookingId locates but does not authorize.
 * Returns only status fields, no evidence URLs.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated guest
 * @param {string} bookingId - Booking document ID
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if booking missing or not owned
 */
export async function getGuestPaymentStatus(actor, bookingId) {
  requireAuthenticatedActor(actor);

  if (!bookingId || typeof bookingId !== 'string') {
    throwNotFound();
  }

  const doc = await fetchBookingForPayment(bookingId);
  if (!doc) {
    throwNotFound();
  }

  // Verify ownership
  const ownerUid = resolveOwner(doc.data);
  if (!ownerUid || ownerUid !== actor.uid) {
    // Non-disclosing: same error as not found
    throwNotFound();
  }

  const data = { ...doc.data, bookingId: doc.data.id };
  if (data.createdAt) data.createdAt = toISOString(data.createdAt);
  if (data.updatedAt) data.updatedAt = toISOString(data.updatedAt);
  if (data.confirmedAt) data.confirmedAt = toISOString(data.confirmedAt);

  return projectFields(data, GUEST_PAYMENT_STATUS_FIELDS);
}

/**
 * Get payment evidence for a booking.
 * RESTRICTED: only admin or staff with business purpose may access evidence.
 * Evidence includes payment proof URLs, bank details, and staff notes.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated admin/staff
 * @param {string} bookingId - Booking document ID
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if missing; FORBIDDEN if wrong role
 */
export async function getPaymentEvidence(actor, bookingId) {
  requireAuthenticatedActor(actor);
  requireRole(actor, ['admin', 'staff']);

  if (!bookingId || typeof bookingId !== 'string') {
    throwNotFound();
  }

  const doc = await fetchBookingForPayment(bookingId);
  if (!doc) {
    throwNotFound();
  }

  const data = { ...doc.data, bookingId: doc.data.id };
  if (data.createdAt) data.createdAt = toISOString(data.createdAt);
  if (data.updatedAt) data.updatedAt = toISOString(data.updatedAt);
  if (data.confirmedAt) data.confirmedAt = toISOString(data.confirmedAt);

  return projectFields(data, EVIDENCE_FIELDS);
}
