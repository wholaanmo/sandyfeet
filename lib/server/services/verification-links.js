// lib/server/services/verification-links.js
// Builds verification links using a configured trusted origin and allowlisted destination paths.
// Raw tokens are NEVER logged.
import 'server-only';

import { env } from '../env.js';

/**
 * Mapping from credential purpose to the allowlisted route path.
 * Only these purposes are permitted to generate verification links.
 */
const PURPOSE_ROUTES = {
  'email-verify': '/verify-staff',
  'password-reset': '/reset-password',
  'guest-password-reset': '/guest-reset-password',
  'device-verify': '/api/auth/verify-device',
  'staff-verify': '/verify-staff',
};

/**
 * Purposes that are allowed to generate verification links.
 */
const ALLOWED_PURPOSES = new Set(Object.keys(PURPOSE_ROUTES));

/**
 * Build a verification link for the given purpose and token.
 *
 * Uses the configured APP_ORIGIN (trusted origin) and the allowlisted
 * route for the purpose. The raw token is included as a query parameter
 * but MUST NOT be logged.
 *
 * @param {string} purpose - One of the allowed verification purposes
 * @param {string} token - The raw credential token (never log this)
 * @param {Object} [params] - Additional query parameters (e.g., email)
 * @returns {string} The full verification URL
 * @throws {Error} If purpose is not allowlisted
 */
export function buildVerificationLink(purpose, token, params = {}) {
  if (!ALLOWED_PURPOSES.has(purpose)) {
    throw new Error(`Purpose "${purpose}" is not allowlisted for verification links`);
  }

  if (!token || typeof token !== 'string') {
    throw new Error('Token is required to build a verification link');
  }

  const origin = env.APP_ORIGIN;
  const route = PURPOSE_ROUTES[purpose];

  const url = new URL(route, origin);
  url.searchParams.set('token', token);

  // Append additional params (e.g., email for staff verification)
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'token' && value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export { ALLOWED_PURPOSES, PURPOSE_ROUTES };
