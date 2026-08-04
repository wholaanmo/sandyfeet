// lib/server/http/correlation.js
// Correlation-ID propagation for request tracing.
// Accepts an existing header or generates a new one.

import crypto from 'node:crypto';

const HEADER_NAME = 'x-correlation-id';

// Basic validation: UUID v4 format or any reasonable alphanumeric/dash string (1-128 chars).
const CORRELATION_ID_PATTERN = /^[\w-]{1,128}$/;

/**
 * Extract an existing correlation ID from the request or generate a new one.
 * The correlation ID is non-secret and safe to include in responses and logs.
 *
 * @param {Request | { headers: { get(name: string): string | null } }} request
 * @returns {string} A correlation ID (UUID v4 or the inbound header value)
 */
export function getCorrelationId(request) {
  const existing = request?.headers?.get?.(HEADER_NAME);

  if (existing && CORRELATION_ID_PATTERN.test(existing)) {
    return existing;
  }

  return crypto.randomUUID();
}
