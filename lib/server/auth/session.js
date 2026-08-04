// lib/server/auth/session.js
// Server-authoritative session management.
// Exchanges Firebase ID tokens for HttpOnly session cookies and
// resolves sessions with revocation checking and authoritative account data.
import 'server-only';

import { auth, firestore } from '../firebase-admin.js';
import { env } from '../env.js';

/**
 * Session cookie configuration.
 * Uses __Host- prefix for maximum cookie security (requires Secure, Path=/, no Domain).
 */
export const SESSION_COOKIE_NAME = '__Host-sf_session';

/** Default session lifetime: 7 days in milliseconds */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Remember-me session lifetime: 30 days in milliseconds */
const REMEMBER_ME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} Actor
 * @property {string} uid - Firebase UID
 * @property {'admin' | 'staff' | 'guest'} role - Authoritative role from account document
 * @property {'staff' | 'guest'} accountType - Account type (users = staff, guestProfiles = guest)
 * @property {'active' | 'inactive'} status - Account status
 * @property {boolean} emailVerified - Whether email is verified
 * @property {number} sessionIssuedAt - Session creation timestamp (seconds since epoch)
 * @property {string} [email] - Account email (optional, for display)
 * @property {string} [displayName] - Account display name (optional, for display)
 */

/**
 * Resolve the authoritative account document for a verified UID.
 * Checks `users/{uid}` first (staff/admin accounts), then `guestProfiles/{uid}`.
 *
 * @param {string} uid - The Firebase UID
 * @returns {Promise<{ data: object, accountType: 'staff' | 'guest' } | null>}
 */
async function resolveAccountDocument(uid) {
  // Check staff/admin account first
  const userDoc = await firestore.collection('users').doc(uid).get();
  if (userDoc.exists) {
    return { data: userDoc.data(), accountType: 'staff' };
  }

  // Check guest account
  const guestDoc = await firestore.collection('guestProfiles').doc(uid).get();
  if (guestDoc.exists) {
    return { data: guestDoc.data(), accountType: 'guest' };
  }

  return null;
}

/**
 * Build an Actor from a verified token and authoritative account data.
 *
 * @param {object} decodedToken - Firebase Admin decoded token
 * @param {object} accountData - Account document data
 * @param {'staff' | 'guest'} accountType - Which collection the account is from
 * @returns {Actor}
 */
function buildActor(decodedToken, accountData, accountType) {
  // Derive role: users collection may have role field; guests are always 'guest'
  let role;
  if (accountType === 'staff') {
    role = accountData.role || 'staff';
  } else {
    role = 'guest';
  }

  return {
    uid: decodedToken.uid,
    role,
    accountType,
    status: accountData.status || 'active',
    emailVerified: decodedToken.email_verified || false,
    sessionIssuedAt: decodedToken.iat || 0,
    email: decodedToken.email || accountData.email || undefined,
    displayName: accountData.displayName || accountData.name || undefined,
  };
}

/**
 * Exchange a fresh Firebase ID token for a server-managed session cookie.
 * Verifies the token, resolves the authoritative account, rejects inactive/unverified
 * accounts, and creates a Firebase Admin session cookie.
 *
 * @param {string} idToken - The Firebase ID token from the client
 * @param {boolean} [rememberMe=false] - Whether to use extended session lifetime
 * @returns {Promise<{ cookie: string, maxAge: number, actor: Actor }>}
 * @throws {Error} With code 'UNAUTHENTICATED' for invalid tokens or ineligible accounts
 */
export async function createSession(idToken, rememberMe = false) {
  if (!idToken || typeof idToken !== 'string') {
    const err = new Error('Invalid ID token');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // Verify the ID token (check revoked to ensure it's still valid)
  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken, true);
  } catch {
    const err = new Error('Invalid or expired token');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // Reject tokens older than 5 minutes to prevent replay
  const now = Math.floor(Date.now() / 1000);
  if (now - decodedToken.auth_time > 5 * 60) {
    const err = new Error('Token too old; please re-authenticate');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // Resolve authoritative account
  const account = await resolveAccountDocument(decodedToken.uid);
  if (!account) {
    const err = new Error('Account not found');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const actor = buildActor(decodedToken, account.data, account.accountType);

  // Reject inactive accounts
  if (actor.status === 'inactive') {
    const err = new Error('Account is inactive');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // For staff/admin, require email verification
  if (actor.accountType === 'staff' && !actor.emailVerified) {
    const err = new Error('Email not verified');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // Create session cookie
  const maxAge = rememberMe ? REMEMBER_ME_MAX_AGE_MS : DEFAULT_MAX_AGE_MS;
  let cookie;
  try {
    cookie = await auth.createSessionCookie(idToken, { expiresIn: maxAge });
  } catch {
    const err = new Error('Failed to create session');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  return { cookie, maxAge, actor };
}

/**
 * Verify a session cookie and resolve the authoritative actor.
 * Always checks revocation and reloads account status/role from Firestore.
 *
 * @param {string} cookie - The session cookie value
 * @param {{ checkRevoked?: boolean }} [options]
 * @returns {Promise<Actor>}
 * @throws {Error} With code 'UNAUTHENTICATED' if session is invalid, revoked, or account is ineligible
 */
export async function resolveSession(cookie, { checkRevoked = true } = {}) {
  if (!cookie || typeof cookie !== 'string') {
    const err = new Error('No session');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  let decodedClaims;
  try {
    decodedClaims = await auth.verifySessionCookie(cookie, checkRevoked);
  } catch {
    const err = new Error('Invalid or revoked session');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // Reload authoritative account data
  const account = await resolveAccountDocument(decodedClaims.uid);
  if (!account) {
    const err = new Error('Account not found');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const actor = buildActor(decodedClaims, account.data, account.accountType);

  // Reject inactive accounts even if session cookie is technically valid
  if (actor.status === 'inactive') {
    const err = new Error('Account is inactive');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  return actor;
}

/**
 * Revoke all sessions for an actor (e.g., on deactivation, password change, role change).
 * Invalidates all refresh tokens; existing session cookies will fail revocation check.
 *
 * @param {string} uid - The Firebase UID to revoke
 * @returns {Promise<void>}
 */
export async function revokeActorSessions(uid) {
  await auth.revokeRefreshTokens(uid);
}

/**
 * Clear the session cookie from the response.
 *
 * @param {Headers} headers - Response headers to append Set-Cookie to
 */
export function clearSessionCookie(headers) {
  const isProduction = env.NODE_ENV === 'production';

  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  headers.append('Set-Cookie', parts.join('; '));
}

/**
 * Build the Set-Cookie header value for the session cookie.
 *
 * @param {string} cookieValue - The session cookie value
 * @param {number} maxAgeMs - Max age in milliseconds
 * @returns {string}
 */
export function buildSessionCookieHeader(cookieValue, maxAgeMs) {
  const isProduction = env.NODE_ENV === 'production';
  const maxAgeSec = Math.floor(maxAgeMs / 1000);

  const parts = [
    `${SESSION_COOKIE_NAME}=${cookieValue}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}
