// lib/server/http/redact.js
// Recursive redacted logging — removes sensitive values while
// retaining safe operational metadata.

/**
 * Keys whose values must always be redacted (case-insensitive match).
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'cookie',
  'authorization',
  'secret',
  'credential',
  'code',
  'private_key',
  'evidence',
  'document_url',
  // PII patterns
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'pin',
  'bank_account',
  'routing_number',
  'id_number',
  'passport',
  'driver_license',
]);

/**
 * Keys that are safe to retain in log output regardless of nesting.
 */
const SAFE_KEYS = new Set([
  'correlationid',
  'correlationId',
  'eventtype',
  'eventType',
  'actoruid',
  'actorUid',
  'timestamp',
  'action',
  'method',
  'path',
  'status',
  'statuscode',
  'statusCode',
  'duration',
  'requestid',
  'requestId',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 20;

/**
 * Returns true if the key (case-insensitive) matches a sensitive pattern.
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  const lower = key.toLowerCase().replace(/[-_]/g, '_');
  if (SENSITIVE_KEYS.has(lower)) return true;

  // Partial match patterns for compound keys like "accessToken", "authCookie", etc.
  for (const sensitive of SENSITIVE_KEYS) {
    if (lower.includes(sensitive)) return true;
  }
  return false;
}

/**
 * Recursively traverse an object and replace sensitive values with '[REDACTED]'.
 * Safe metadata keys are retained. Circular references and deep nesting
 * are handled gracefully.
 *
 * @param {any} obj - The value to redact
 * @param {number} [depth=0] - Current recursion depth
 * @param {WeakSet} [seen] - Circular reference tracker
 * @returns {any} A new object with sensitive values redacted
 */
export function redactForLog(obj, depth = 0, seen = new WeakSet()) {
  // Primitive values at the top level are returned as-is
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  // Guard against circular references
  if (seen.has(obj)) return '[Circular]';

  // Guard against excessive depth
  if (depth > MAX_DEPTH) return '[MaxDepth]';

  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => redactForLog(item, depth + 1, seen));
  }

  // Handle plain objects
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    // Safe keys pass through without redaction
    if (SAFE_KEYS.has(key) || SAFE_KEYS.has(key.toLowerCase())) {
      result[key] = value;
      continue;
    }

    // Sensitive keys get redacted
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
      continue;
    }

    // Recurse into nested objects/arrays
    if (value !== null && typeof value === 'object') {
      result[key] = redactForLog(value, depth + 1, seen);
    } else {
      result[key] = value;
    }
  }

  return result;
}
