// lib/server/services/credential.js
// Secure credential issuance, validation, and atomic consumption.
// Handles One_Time_Tokens for password reset, email verification, device verification,
// guest password reset, and staff verification flows.
// NEVER logs raw tokens, passwords, or verification codes.
import 'server-only';

import crypto from 'node:crypto';
import { firestore } from '../firebase-admin.js';

/**
 * The Firestore collection for credential records.
 */
const CREDENTIALS_COLLECTION = 'credentials';

/**
 * Active HMAC key configuration.
 * In production, this would rotate via environment/secret management.
 * The key ID allows lookup of the correct key for verification of older credentials.
 */
const CREDENTIAL_KEYS = {
  'key-v1': process.env.CREDENTIAL_HMAC_SECRET || 'dev-credential-hmac-secret-do-not-use-in-production',
};

const ACTIVE_KEY_ID = 'key-v1';

/**
 * Allowed credential purposes — rejects anything not in this set.
 */
const VALID_PURPOSES = new Set([
  'email-verify',
  'password-reset',
  'guest-password-reset',
  'device-verify',
  'staff-verify',
  'check-in',
]);

/**
 * Default TTL: 15 minutes in milliseconds.
 */
const DEFAULT_TTL_MS = 15 * 60 * 1000;

/**
 * Default maximum failed attempts before invalidation.
 */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Compute HMAC-SHA-256 digest of a token using the specified key.
 * @param {string} token - The raw token
 * @param {string} keyId - The key ID to use
 * @returns {string} Hex-encoded digest
 */
function computeDigest(token, keyId) {
  const secret = CREDENTIAL_KEYS[keyId];
  if (!secret) {
    throw new Error(`Unknown credential key ID: ${keyId}`);
  }
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

/**
 * Issue a new credential (One_Time_Token).
 *
 * Generates a cryptographically secure random token, stores its HMAC digest
 * in Firestore, and returns the raw token (the only time it is available).
 *
 * @param {Object} params
 * @param {string} params.purpose - One of the VALID_PURPOSES
 * @param {string} params.actorUid - The UID of the user this credential is for
 * @param {string} [params.subject] - Additional binding (e.g., email address, device fingerprint)
 * @param {number} [params.ttlMs] - Time-to-live in ms (default: 15 minutes)
 * @param {number} [params.maxAttempts] - Max failed validation attempts (default: 5)
 * @returns {Promise<{ token: string, expiresAt: Date, credentialId: string }>}
 */
export async function issueCredential({ purpose, actorUid, subject, ttlMs, maxAttempts }) {
  if (!VALID_PURPOSES.has(purpose)) {
    throw new Error(`Invalid credential purpose: ${purpose}`);
  }

  if (!actorUid || typeof actorUid !== 'string') {
    throw new Error('actorUid is required');
  }

  const ttl = ttlMs ?? DEFAULT_TTL_MS;
  const maxAtt = maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  // Generate 32 cryptographically secure random bytes, encode as base64url
  const rawBytes = crypto.randomBytes(32);
  const token = rawBytes.toString('base64url');

  // Compute keyed digest for storage (never store raw token)
  const digest = computeDigest(token, ACTIVE_KEY_ID);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl);

  // Store credential record in Firestore
  const credentialRef = firestore.collection(CREDENTIALS_COLLECTION).doc();
  const credentialRecord = {
    purpose,
    actorUid,
    subject: subject || null,
    digest,
    keyId: ACTIVE_KEY_ID,
    expiresAt: expiresAt.toISOString(),
    maxAttempts: maxAtt,
    failedAttempts: 0,
    consumed: false,
    createdAt: now.toISOString(),
  };

  await credentialRef.set(credentialRecord);

  // Return the raw token — this is the ONLY time it's available
  return {
    token,
    expiresAt,
    credentialId: credentialRef.id,
  };
}

/**
 * Generic error for all credential validation failures.
 * Never reveals the specific failure reason to the caller.
 */
class CredentialInvalidError extends Error {
  constructor() {
    super('invalid_or_expired');
    this.code = 'INVALID_CREDENTIAL';
    this.name = 'CredentialInvalidError';
  }
}

/**
 * Validate a credential token against stored records.
 *
 * Computes the digest, looks up by digest + purpose, verifies all bindings
 * (actorUid, subject, expiry, consumption state, attempt count).
 * Returns the credential record on success, throws a generic error on any failure.
 *
 * @param {Object} params
 * @param {string} params.purpose - The expected purpose
 * @param {string} params.token - The raw token to validate
 * @param {string} [params.actorUid] - Expected actor UID (if binding verification needed)
 * @param {string} [params.subject] - Expected subject (if binding verification needed)
 * @returns {Promise<{ id: string, record: object }>} The credential record if valid
 * @throws {CredentialInvalidError} For ALL failure modes (expired, consumed, mismatch, etc.)
 */
export async function validateCredential({ purpose, token, actorUid, subject }) {
  if (!purpose || !token) {
    throw new CredentialInvalidError();
  }

  if (!VALID_PURPOSES.has(purpose)) {
    throw new CredentialInvalidError();
  }

  // Compute digest for all known key IDs and query
  // For simplicity with a single active key, compute with all known keys
  const digests = Object.entries(CREDENTIAL_KEYS).map(([keyId, _secret]) => ({
    keyId,
    digest: computeDigest(token, keyId),
  }));

  // Query Firestore for a matching credential by digest + purpose
  let credentialDoc = null;
  let credentialId = null;

  for (const { keyId, digest } of digests) {
    const query = firestore
      .collection(CREDENTIALS_COLLECTION)
      .where('digest', '==', digest)
      .where('purpose', '==', purpose)
      .where('keyId', '==', keyId)
      .limit(1);

    const snapshot = await query.get();
    if (!snapshot.empty) {
      credentialDoc = snapshot.docs[0];
      credentialId = credentialDoc.id;
      break;
    }
  }

  if (!credentialDoc) {
    throw new CredentialInvalidError();
  }

  const record = credentialDoc.data();

  // Check consumed state
  if (record.consumed) {
    throw new CredentialInvalidError();
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(record.expiresAt);
  if (now > expiresAt) {
    throw new CredentialInvalidError();
  }

  // Check attempt exhaustion
  if (record.failedAttempts >= record.maxAttempts) {
    throw new CredentialInvalidError();
  }

  // Verify actor binding if provided
  if (actorUid && record.actorUid !== actorUid) {
    // Increment failed attempts on mismatch
    await credentialDoc.ref.update({
      failedAttempts: (record.failedAttempts || 0) + 1,
    });
    throw new CredentialInvalidError();
  }

  // Verify subject binding if provided
  if (subject && record.subject !== subject) {
    // Increment failed attempts on mismatch
    await credentialDoc.ref.update({
      failedAttempts: (record.failedAttempts || 0) + 1,
    });
    throw new CredentialInvalidError();
  }

  return { id: credentialId, record };
}

/**
 * Consume a credential atomically with a mutation.
 *
 * In one Firestore transaction: verifies the credential is not consumed,
 * marks it consumed, and executes the provided mutation function.
 * If the transaction fails, the credential stays unconsumed.
 *
 * @param {string} credentialId - The Firestore document ID of the credential
 * @param {(transaction: FirebaseFirestore.Transaction) => Promise<any>} mutation - The mutation to execute atomically
 * @returns {Promise<any>} The result of the mutation
 * @throws {CredentialInvalidError} If credential is already consumed or missing
 */
export async function consumeWithMutation(credentialId, mutation) {
  if (!credentialId || typeof credentialId !== 'string') {
    throw new CredentialInvalidError();
  }

  const credentialRef = firestore.collection(CREDENTIALS_COLLECTION).doc(credentialId);

  const result = await firestore.runTransaction(async (transaction) => {
    const credentialSnap = await transaction.get(credentialRef);

    if (!credentialSnap.exists) {
      throw new CredentialInvalidError();
    }

    const data = credentialSnap.data();

    // Verify not already consumed (transaction-safe check)
    if (data.consumed) {
      throw new CredentialInvalidError();
    }

    // Mark as consumed within the transaction
    transaction.update(credentialRef, {
      consumed: true,
      consumedAt: new Date().toISOString(),
    });

    // Execute the mutation within the same transaction
    return await mutation(transaction);
  });

  return result;
}

export { CredentialInvalidError, VALID_PURPOSES };
