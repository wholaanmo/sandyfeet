// lib/server/repositories/identity.js
// Actor-scoped identity document repository.
// Identity documents are RESTRICTED to admin with purpose-specific projection.
// Never returned to guests or unauthenticated users.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { requireRole } from '../auth/authorization.js';
import {
  toISOString,
  projectFields,
  throwNotFound,
  requireAuthenticatedActor,
} from './base.js';

/**
 * Fields projected for admin identity document access.
 * Purpose-specific: only the minimum needed for verification workflows.
 */
const ADMIN_IDENTITY_PROJECTION = [
  'uid',
  'guestUid',
  'validIdType',
  'validIdUrl',
  'validIdImage',
  'status',
  'verifiedAt',
  'verifiedBy',
  'requestedAt',
  'updatedAt',
];

/**
 * Get an identity document for a guest.
 * RESTRICTED: only admin can access identity documents, and only with
 * an authorized business purpose (e.g., guest verification workflow).
 *
 * This method never returns identity data to guests or unauthenticated users.
 * Non-disclosing miss: does not confirm whether the document exists.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated admin actor
 * @param {string} guestUid - The guest whose identity document is requested
 * @returns {Promise<Record<string, any>>}
 * @throws {Error} NOT_FOUND if missing; FORBIDDEN if wrong role
 */
export async function getIdentityDocument(actor, guestUid) {
  requireAuthenticatedActor(actor);
  requireRole(actor, ['admin']);

  if (!guestUid || typeof guestUid !== 'string') {
    throwNotFound();
  }

  // Identity data is stored on the guest profile document
  const guestDoc = await firestore.collection('guestProfiles').doc(guestUid).get();
  if (!guestDoc.exists) {
    throwNotFound();
  }

  const data = guestDoc.data();

  // Only return if identity data actually exists
  if (!data.validIdType && !data.validIdUrl && !data.validIdImage) {
    throwNotFound();
  }

  const identityData = {
    uid: guestDoc.id,
    guestUid: guestDoc.id,
    validIdType: data.validIdType || null,
    validIdUrl: data.validIdUrl || null,
    validIdImage: data.validIdImage || null,
    status: data.idVerificationStatus || null,
    verifiedAt: toISOString(data.idVerifiedAt) || null,
    verifiedBy: data.idVerifiedBy || null,
    requestedAt: toISOString(data.idRequestedAt) || null,
    updatedAt: toISOString(data.updatedAt) || null,
  };

  return projectFields(identityData, ADMIN_IDENTITY_PROJECTION);
}

/**
 * Check if a guest has submitted identity documents.
 * RESTRICTED: only staff/admin can check this.
 * Returns a boolean — no document content is disclosed.
 *
 * @param {import('../auth/session.js').Actor} actor - Authenticated staff/admin actor
 * @param {string} guestUid - The guest UID to check
 * @returns {Promise<boolean>}
 * @throws {Error} FORBIDDEN if wrong role
 */
export async function hasIdentityDocument(actor, guestUid) {
  requireAuthenticatedActor(actor);
  requireRole(actor, ['admin', 'staff']);

  if (!guestUid || typeof guestUid !== 'string') {
    return false;
  }

  const guestDoc = await firestore.collection('guestProfiles').doc(guestUid).get();
  if (!guestDoc.exists) {
    return false;
  }

  const data = guestDoc.data();
  return Boolean(data.validIdType || data.validIdUrl || data.validIdImage);
}
