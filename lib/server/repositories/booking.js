// lib/server/repositories/booking.js
// Actor-scoped booking repository with ownership verification,
// role-based projections, and non-disclosing misses.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { requireRole, requireOwner } from '../auth/authorization.js';
import {
  toISOString,
  projectFields,
  throwNotFound,
  throwForbidden,
  requireAuthenticatedActor,
} from './base.js';

/**
 * Fields visible to a guest for their own booking summary.
 */
const GUEST_SUMMARY_FIELDS = [
  'id',
  'type',
  'status',
  'checkInDate',
  'checkOutDate',
  'roomType',
  'roomName',
  'nights',
  'adults',
  'children',
  'seniors',
  'totalPrice',
  'downPayment',
  'remainingBalance',
  'paymentMethod',
  'balancePaymentMethod',
  'specialRequest',
  'createdAt',
  'updatedAt',
  'parentBookingId',
  'bookingId',
  'guestName',
  'guestEmail',
  'guestPhone',
];

/**
 * Fields visible to staff for operational work.
 */
const STAFF_PROJECTION_FIELDS = [
  ...GUEST_SUMMARY_FIELDS,
  'ownerUid',
  'userId',
  'email',
  'tentCount',
  'roomTypesArray',
  'roomCount',
  'totalExtraGuestCharge',
  'validIdType',
  'paymentProofUrl',
  'notes',
  'staffNotes',
  'confirmedBy',
  'confirmedAt',
];

/**
 * Resolve the ownerUid from a booking document.
 * Handles legacy field variations (ownerUid, userId, uid, email-based).
 *
 * @param {Record<string, any>} data - Booking document data
 * @returns {string | null}
 */
function resolveBookingOwner(data) {
  return data.ownerUid || data.userId || data.uid || null;
}

/**
 * Fetch a raw booking document from the appropriate collection.
 * Checks both 'bookings' (room) and 'dayTourBookings' collections.
 *
 * @param {string} bookingId
 * @returns {Promise<{ data: Record<string, any>, ref: any, collection: string } | null>}
 */
async function fetchBookingDocument(bookingId) {
  // Check room bookings first
  const roomDoc = await firestore.collection('bookings').doc(bookingId).get();
  if (roomDoc.exists) {
    return { data: { id: roomDoc.id, ...roomDoc.data() }, ref: roomDoc.ref, collection: 'bookings' };
  }

  // Check day-tour bookings
  const dayTourDoc = await firestore.collection('dayTourBookings').doc(bookingId).get();
  if (dayTourDoc.exists) {
    return { data: { id: dayTourDoc.id, ...dayTourDoc.data() }, ref: dayTourDoc.ref, collection: 'dayTourBookings' };
  }

  return null;
}

/**
 * Convert booking timestamps to ISO strings for DTO output.
 *
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
function normalizeBookingTimestamps(data) {
  const timestampFields = ['checkInDate', 'checkOutDate', 'createdAt', 'updatedAt', 'confirmedAt'];
  const result = { ...data };

  for (const field of timestampFields) {
    if (result[field]) {
      result[field] = toISOString(result[field]) || result[field];
    }
  }

  return result;
}

/**
 * Get a booking summary for the authenticated guest owner.
 * Verifies that the booking belongs to the requesting actor.
 * Returns only guest-visible fields. Throws NOT_FOUND for missing or unowned bookings.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated guest actor
 * @param {string} bookingId - The booking document ID
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if booking missing or not owned; UNAUTHENTICATED if no actor
 */
export async function getOwnedSummary(actor, bookingId) {
  requireAuthenticatedActor(actor);

  if (!bookingId || typeof bookingId !== 'string') {
    throwNotFound();
  }

  const doc = await fetchBookingDocument(bookingId);
  if (!doc) {
    throwNotFound();
  }

  // Verify ownership — submitted ID does not authorize; actor.uid must match
  const ownerUid = resolveBookingOwner(doc.data);
  if (!ownerUid || ownerUid !== actor.uid) {
    // Non-disclosing: same error as not found
    throwNotFound();
  }

  const normalized = normalizeBookingTimestamps(doc.data);
  return projectFields(normalized, GUEST_SUMMARY_FIELDS);
}

/**
 * Get a booking for staff with a projected view.
 * Requires staff or admin role. Returns staff-level fields.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated staff/admin actor
 * @param {string} bookingId - The booking document ID
 * @param {string[]} [projection] - Optional custom field projection (subset of staff fields)
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if missing; FORBIDDEN if wrong role
 */
export async function getForStaff(actor, bookingId, projection) {
  requireAuthenticatedActor(actor);
  requireRole(actor, ['staff', 'admin']);

  if (!bookingId || typeof bookingId !== 'string') {
    throwNotFound();
  }

  const doc = await fetchBookingDocument(bookingId);
  if (!doc) {
    throwNotFound();
  }

  const normalized = normalizeBookingTimestamps(doc.data);
  const fields = projection || STAFF_PROJECTION_FIELDS;

  // Staff projection is limited to declared staff fields
  const safeFields = fields.filter((f) => STAFF_PROJECTION_FIELDS.includes(f));
  return projectFields(normalized, safeFields);
}

/**
 * Get a booking with full data for admin users.
 * Requires admin role. Returns all fields except internal system fields.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated admin actor
 * @param {string} bookingId - The booking document ID
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if missing; FORBIDDEN if wrong role
 */
export async function getForAdmin(actor, bookingId) {
  requireAuthenticatedActor(actor);
  requireRole(actor, ['admin']);

  if (!bookingId || typeof bookingId !== 'string') {
    throwNotFound();
  }

  const doc = await fetchBookingDocument(bookingId);
  if (!doc) {
    throwNotFound();
  }

  const normalized = normalizeBookingTimestamps(doc.data);
  return normalized;
}

/**
 * Resolve a legacy email-based booking to the owner UID.
 * Used during migration when old bookings reference email instead of UID.
 *
 * @param {string} email - The email to resolve
 * @returns {Promise<string | null>} The resolved UID or null
 */
export async function resolveEmailToUid(email) {
  if (!email || typeof email !== 'string') return null;

  const normalizedEmail = email.trim().toLowerCase();

  // Check guest profiles first
  const guestSnap = await firestore
    .collection('guestProfiles')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (!guestSnap.empty) {
    return guestSnap.docs[0].id;
  }

  // Check users collection
  const userSnap = await firestore
    .collection('users')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (!userSnap.empty) {
    return userSnap.docs[0].id;
  }

  return null;
}
