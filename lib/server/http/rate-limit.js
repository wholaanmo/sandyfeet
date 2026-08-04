// lib/server/http/rate-limit.js
// In-memory rate limiter for development/testing (Map-based fixed window).
// Interface designed to swap to Firestore-backed implementation for production.

import crypto from 'node:crypto';

/**
 * Rate limit policy definitions per operation.
 * Each policy defines: maxRequests per windowMs.
 */
const RATE_LIMIT_POLICIES = {
  'auth-attempt': { maxRequests: 5, windowMs: 15 * 60 * 1000 },   // 5 per 15min
  'email-send': { maxRequests: 10, windowMs: 60 * 60 * 1000 },    // 10 per hour
  'chatbot': { maxRequests: 20, windowMs: 60 * 1000 },            // 20 per minute
  'admin-write': { maxRequests: 30, windowMs: 60 * 1000 },        // 30 per minute
  'checkin': { maxRequests: 10, windowMs: 60 * 1000 },            // 10 per minute
};

/**
 * Server secret for HMAC key generation.
 * In production this should come from environment; for dev/test we use a static fallback.
 */
const RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'dev-rate-limit-secret-not-for-production';

/**
 * In-memory store: Map<hashedKey, { count: number, windowStart: number }>
 */
const store = new Map();

/**
 * Generate an HMAC-keyed identifier for rate limiting.
 * Key = HMAC(serverSecret, operation + clientIdentifier)
 * This prevents client enumeration of rate-limit keys.
 *
 * @param {string} operation - The rate limit policy name
 * @param {string} clientIdentifier - Actor UID, IP, or other client identifier
 * @returns {string} The HMAC digest (hex)
 */
function generateKey(operation, clientIdentifier) {
  return crypto
    .createHmac('sha256', RATE_LIMIT_SECRET)
    .update(`${operation}:${clientIdentifier}`)
    .digest('hex');
}

/**
 * Check whether a request is within the rate limit for a given operation and client.
 *
 * @param {string} operation - The rate limit policy name (e.g. 'auth-attempt', 'email-send')
 * @param {string} clientIdentifier - Actor UID, IP address, or other identifier
 * @returns {{ allowed: boolean, retryAfter?: number }} Result indicating if request is allowed
 */
export function checkRateLimit(operation, clientIdentifier) {
  const policy = RATE_LIMIT_POLICIES[operation];

  if (!policy) {
    // Unknown policy — allow by default (fail-open for unconfigured operations)
    return { allowed: true };
  }

  const key = generateKey(operation, clientIdentifier);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= policy.windowMs) {
    // New window — record this request
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count < policy.maxRequests) {
    // Within window and under limit
    entry.count += 1;
    return { allowed: true };
  }

  // Rate limit exceeded
  const retryAfter = Math.ceil((entry.windowStart + policy.windowMs - now) / 1000);
  return { allowed: false, retryAfter };
}

/**
 * Reset the rate limit store (for testing purposes).
 */
export function resetRateLimitStore() {
  store.clear();
}

/**
 * Get the policy configuration for an operation (for testing/introspection).
 * @param {string} operation
 * @returns {{ maxRequests: number, windowMs: number } | undefined}
 */
export function getRateLimitPolicy(operation) {
  return RATE_LIMIT_POLICIES[operation];
}
