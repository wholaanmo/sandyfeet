// lib/server/http/response.js
// Stable response envelopes and sensitive-response cache policy.

/**
 * @typedef {Object} SuccessEnvelope
 * @property {true} ok
 * @property {any} data
 * @property {string} correlationId
 */

/**
 * @typedef {Object} ErrorEnvelope
 * @property {false} ok
 * @property {{ code: string, message: string }} error
 * @property {string} correlationId
 */

/**
 * Sensitive-response cache headers.
 * Prevents shared or persistent caching of authentication, personal,
 * financial, token, and mutation responses.
 */
const SENSITIVE_CACHE_HEADERS = {
  'Cache-Control': 'no-store, private',
};

/**
 * Build a stable success response envelope.
 *
 * @param {any} data - The response payload
 * @param {string} correlationId - Request correlation ID
 * @param {number} [status=200] - HTTP status code
 * @returns {Response}
 */
export function success(data, correlationId, status = 200) {
  /** @type {SuccessEnvelope} */
  const body = {
    ok: true,
    data,
    correlationId,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SENSITIVE_CACHE_HEADERS,
    },
  });
}

/**
 * Build a stable error response envelope.
 * Never includes stack traces, provider details, or sensitive data.
 *
 * @param {string} code - Stable error code (e.g. 'VALIDATION_ERROR', 'NOT_FOUND')
 * @param {string} message - Human-readable message safe for clients
 * @param {string} correlationId - Request correlation ID
 * @param {number} [status=400] - HTTP status code
 * @returns {Response}
 */
export function error(code, message, correlationId, status = 400) {
  /** @type {ErrorEnvelope} */
  const body = {
    ok: false,
    error: { code, message },
    correlationId,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SENSITIVE_CACHE_HEADERS,
    },
  });
}
