// lib/server/repositories/base.js
// Base converter helpers for server-only Firestore repositories.
// Provides timestamp conversion, safe field projection, and non-disclosing misses.
import 'server-only';

/**
 * Convert a Firestore Timestamp or seconds-based object to an ISO 8601 string.
 * Returns null for missing/invalid values rather than throwing.
 *
 * @param {any} value - Firestore Timestamp, { seconds, nanoseconds }, Date, or string
 * @returns {string | null}
 */
export function toISOString(value) {
  if (!value) return null;

  // Firestore Timestamp with toDate()
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  // Plain object with seconds (e.g., serialized Timestamp)
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }

  // Already a Date
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Already a string (pass through if valid ISO)
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

/**
 * Project only the specified fields from a data object.
 * Returns a new object containing only keys present in both `data` and `allowedFields`.
 * Timestamps are automatically converted to ISO strings.
 *
 * @param {Record<string, any>} data - Source document data
 * @param {string[]} allowedFields - Fields to include in the projection
 * @returns {Record<string, any>}
 */
export function projectFields(data, allowedFields) {
  if (!data || typeof data !== 'object') return {};

  const result = {};
  for (const field of allowedFields) {
    if (field in data) {
      const value = data[field];
      // Auto-convert Firestore timestamps
      if (value && typeof value === 'object' && typeof value.toDate === 'function') {
        result[field] = toISOString(value);
      } else if (value && typeof value === 'object' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
        result[field] = toISOString(value);
      } else {
        result[field] = value;
      }
    }
  }
  return result;
}

/**
 * Throw a non-disclosing NOT_FOUND error.
 * Does not confirm whether the resource exists or what it contains.
 * All missing/unauthorized access responses use this same shape.
 *
 * @param {string} [message='Resource not found'] - Generic message (never include IDs or field values)
 * @throws {Error} With code 'NOT_FOUND'
 */
export function throwNotFound(message = 'Resource not found') {
  const err = new Error(message);
  err.code = 'NOT_FOUND';
  throw err;
}

/**
 * Throw a FORBIDDEN error for unauthorized access attempts.
 *
 * @param {string} [message='Access denied'] - Generic message
 * @throws {Error} With code 'FORBIDDEN'
 */
export function throwForbidden(message = 'Access denied') {
  const err = new Error(message);
  err.code = 'FORBIDDEN';
  throw err;
}

/**
 * Verify that the actor is authenticated and has a valid UID.
 *
 * @param {import('../auth/session.js').Actor} actor
 * @throws {Error} With code 'UNAUTHENTICATED' if actor is missing or has no UID
 */
export function requireAuthenticatedActor(actor) {
  if (!actor || !actor.uid) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
}

/**
 * Fields that must never be written by guest profile updates.
 * These are privileged fields managed only by server operations.
 */
export const GUEST_RESTRICTED_FIELDS = Object.freeze([
  'role',
  'status',
  'emailVerified',
  'createdAt',
  'createdBy',
  'uid',
  'accountType',
]);

/**
 * Fields that must never be written by any client-initiated operation.
 * Enforced in both repositories and Firestore Security Rules.
 */
export const PRIVILEGED_WRITE_FIELDS = Object.freeze([
  'role',
  'status',
  'emailVerified',
  'createdAt',
  'createdBy',
  'uid',
  'auditId',
  'auditAction',
  'auditActorUid',
  'paymentState',
  'checkInState',
  'idempotencyKey',
]);

/**
 * Strip restricted fields from a patch object.
 * Returns a new object without the forbidden keys.
 *
 * @param {Record<string, any>} patch - The proposed update
 * @param {string[]} restrictedFields - Fields to remove
 * @returns {Record<string, any>}
 */
export function stripRestrictedFields(patch, restrictedFields) {
  if (!patch || typeof patch !== 'object') return {};

  const cleaned = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!restrictedFields.includes(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
