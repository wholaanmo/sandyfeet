// lib/server/repositories/guest.js
// Actor-scoped guest profile repository.
// Enforces ownership and restricts writes to privileged fields.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import {
  toISOString,
  projectFields,
  throwNotFound,
  requireAuthenticatedActor,
  GUEST_RESTRICTED_FIELDS,
  stripRestrictedFields,
} from './base.js';

/**
 * Fields returned for guest's own profile view.
 */
const OWN_PROFILE_FIELDS = [
  'uid',
  'email',
  'displayName',
  'name',
  'firstName',
  'lastName',
  'phone',
  'address',
  'city',
  'country',
  'status',
  'emailVerified',
  'validIdType',
  'createdAt',
  'updatedAt',
];

/**
 * Fields a guest is allowed to update on their own profile.
 */
const GUEST_WRITABLE_FIELDS = [
  'displayName',
  'name',
  'firstName',
  'lastName',
  'phone',
  'address',
  'city',
  'country',
];

/**
 * Get the authenticated guest's own profile.
 * Actor.uid is used directly — no submitted ID is trusted.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated guest actor
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if profile doesn't exist; UNAUTHENTICATED if no actor
 */
export async function getOwnProfile(actor) {
  requireAuthenticatedActor(actor);

  const doc = await firestore.collection('guestProfiles').doc(actor.uid).get();
  if (!doc.exists) {
    throwNotFound();
  }

  const data = { uid: doc.id, ...doc.data() };

  // Convert timestamps
  if (data.createdAt) data.createdAt = toISOString(data.createdAt);
  if (data.updatedAt) data.updatedAt = toISOString(data.updatedAt);

  return projectFields(data, OWN_PROFILE_FIELDS);
}

/**
 * Update the authenticated guest's own profile.
 * Strips restricted fields (role, status, emailVerified, audit fields).
 * Only accepts fields from the writable allowlist.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated guest actor
 * @param {Record<string, any>} validatedPatch - Pre-validated field updates
 * @returns {Promise<Record<string, any>>} The updated profile projection
 * @throws {Error} NOT_FOUND if profile missing; UNAUTHENTICATED if no actor
 */
export async function updateOwnProfile(actor, validatedPatch) {
  requireAuthenticatedActor(actor);

  if (!validatedPatch || typeof validatedPatch !== 'object') {
    throwNotFound();
  }

  const docRef = firestore.collection('guestProfiles').doc(actor.uid);
  const doc = await docRef.get();
  if (!doc.exists) {
    throwNotFound();
  }

  // Strip restricted fields — never allow writing role, status, emailVerified, etc.
  const stripped = stripRestrictedFields(validatedPatch, GUEST_RESTRICTED_FIELDS);

  // Further restrict to only writable fields
  const safePatch = {};
  for (const [key, value] of Object.entries(stripped)) {
    if (GUEST_WRITABLE_FIELDS.includes(key)) {
      safePatch[key] = value;
    }
  }

  // Nothing to update after filtering
  if (Object.keys(safePatch).length === 0) {
    const current = { uid: doc.id, ...doc.data() };
    if (current.createdAt) current.createdAt = toISOString(current.createdAt);
    if (current.updatedAt) current.updatedAt = toISOString(current.updatedAt);
    return projectFields(current, OWN_PROFILE_FIELDS);
  }

  // Add server-controlled updatedAt
  const { FieldValue } = await import('firebase-admin/firestore');
  safePatch.updatedAt = FieldValue.serverTimestamp();

  await docRef.update(safePatch);

  // Re-read for consistent return value
  const updated = await docRef.get();
  const data = { uid: updated.id, ...updated.data() };
  if (data.createdAt) data.createdAt = toISOString(data.createdAt);
  if (data.updatedAt) data.updatedAt = toISOString(data.updatedAt);

  return projectFields(data, OWN_PROFILE_FIELDS);
}

/**
 * Get a guest profile for staff/admin operational use.
 * Does NOT require ownership — requires staff or admin role.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated staff/admin actor
 * @param {string} guestUid - The guest's UID
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if missing; FORBIDDEN if wrong role
 */
export async function getForStaff(actor, guestUid) {
  requireAuthenticatedActor(actor);

  const { requireRole } = await import('../auth/authorization.js');
  requireRole(actor, ['staff', 'admin']);

  if (!guestUid || typeof guestUid !== 'string') {
    throwNotFound();
  }

  const doc = await firestore.collection('guestProfiles').doc(guestUid).get();
  if (!doc.exists) {
    throwNotFound();
  }

  const data = { uid: doc.id, ...doc.data() };
  if (data.createdAt) data.createdAt = toISOString(data.createdAt);
  if (data.updatedAt) data.updatedAt = toISOString(data.updatedAt);

  // Staff sees all profile fields except internal system fields
  const staffFields = [
    ...OWN_PROFILE_FIELDS,
    'validIdUrl',
    'notes',
    'bookingCount',
  ];

  return projectFields(data, staffFields);
}
