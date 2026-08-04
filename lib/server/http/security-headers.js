// lib/server/http/security-headers.js
// Nonce-based browser security policy with staged CSP enforcement.
// Emits documented Content-Security-Policy directives, HSTS (production),
// frame denial, nosniff, strict referrer, and restrictive permissions policy.
// Supports report-only collection before an explicit enforcement gate.

import { randomBytes } from 'node:crypto';

/**
 * CSP enforcement mode read from the CSP_MODE environment variable.
 * Defaults to 'report-only' when unset to support staged rollout.
 * Set CSP_MODE=enforce for production enforcement after validation.
 * @type {'enforce' | 'report-only'}
 */
export const CSP_ENFORCEMENT_MODE =
  process.env.CSP_MODE === 'enforce' ? 'enforce' : 'report-only';

/**
 * Generate a cryptographically secure nonce for CSP script-src.
 * Returns a 16-byte random value encoded as base64.
 * @returns {string}
 */
export function generateNonce() {
  return randomBytes(16).toString('base64');
}

/**
 * Documented CSP source directives.
 * Each directive is limited to self, the nonce, and verified external
 * hosts required by the application (Firebase, Cloudinary, Google images).
 */
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"], // nonce appended at build time
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https://res.cloudinary.com', 'https://*.googleusercontent.com'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com'],
  'frame-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
};

/**
 * Build the CSP directive string with the provided nonce.
 * @param {string} nonce - Base64-encoded nonce value
 * @returns {string}
 */
function buildCspDirectiveString(nonce) {
  const directives = { ...CSP_DIRECTIVES };
  // Add nonce to script-src
  directives['script-src'] = ["'self'", `'nonce-${nonce}'`];

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Build the complete set of security response headers.
 *
 * @param {string} nonce - Cryptographic nonce for the current request
 * @param {Object} [options]
 * @param {boolean} [options.enforceCSP=false] - When true, uses Content-Security-Policy;
 *   when false, uses Content-Security-Policy-Report-Only for staged rollout.
 * @param {boolean} [options.isProduction] - Override production detection (defaults to NODE_ENV check)
 * @returns {Map<string, string>} Header name → value map
 */
export function buildSecurityHeaders(nonce, options = {}) {
  const {
    enforceCSP = CSP_ENFORCEMENT_MODE === 'enforce',
    isProduction = process.env.NODE_ENV === 'production',
  } = options;

  const headers = new Map();

  // CSP — staged enforcement support
  const cspHeaderName = enforceCSP
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
  headers.set(cspHeaderName, buildCspDirectiveString(nonce));

  // Prevent MIME-type sniffing (Requirement 8.4)
  headers.set('X-Content-Type-Options', 'nosniff');

  // Limit referrer to origin on cross-origin requests (Requirement 8.5)
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Prevent framing — CSP frame-ancestors is primary, X-Frame-Options for legacy (Requirement 8.3)
  headers.set('X-Frame-Options', 'DENY');

  // Disable unnecessary browser capabilities (Requirement 8.6)
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // HSTS — only in production to avoid breaking local dev (Requirement 8.2)
  if (isProduction) {
    headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  return headers;
}
