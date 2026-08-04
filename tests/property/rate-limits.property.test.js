// Property 7: Rate limiting respects operation quotas
// Validates: Requirements 2.3

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { checkRateLimit, resetRateLimitStore, getRateLimitPolicy } from '../../lib/server/http/rate-limit.js';

/**
 * Known operations with defined rate limit policies.
 */
const KNOWN_OPERATIONS = ['auth-attempt', 'email-send', 'chatbot', 'admin-write', 'checkin'];

describe('Property 7: Rate limiting respects operation quotas', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('the first N requests (up to maxRequests) are always allowed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_OPERATIONS),
        fc.string({ minLength: 1, maxLength: 30 }),
        (operation, clientId) => {
          resetRateLimitStore();
          const policy = getRateLimitPolicy(operation);

          // Every request up to maxRequests must be allowed
          for (let i = 0; i < policy.maxRequests; i++) {
            const result = checkRateLimit(operation, clientId);
            expect(result.allowed).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('after maxRequests requests in one window, subsequent requests are always rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_OPERATIONS),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.nat({ max: 10 }),
        (operation, clientId, extraRequests) => {
          resetRateLimitStore();
          const policy = getRateLimitPolicy(operation);

          // Exhaust the quota
          for (let i = 0; i < policy.maxRequests; i++) {
            checkRateLimit(operation, clientId);
          }

          // All subsequent requests in the same window must be rejected
          for (let i = 0; i < extraRequests + 1; i++) {
            const result = checkRateLimit(operation, clientId);
            expect(result.allowed).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different clients have independent limits', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_OPERATIONS),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.length > 0),
        (operation, clientA, clientBSuffix) => {
          // Ensure clients are distinct
          const clientB = clientA + '_' + clientBSuffix;
          resetRateLimitStore();
          const policy = getRateLimitPolicy(operation);

          // Exhaust clientA's quota
          for (let i = 0; i < policy.maxRequests; i++) {
            checkRateLimit(operation, clientA);
          }

          // clientA should now be rejected
          const resultA = checkRateLimit(operation, clientA);
          expect(resultA.allowed).toBe(false);

          // clientB should still be allowed (independent limit)
          const resultB = checkRateLimit(operation, clientB);
          expect(resultB.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the retryAfter value is always a positive number when rate limited', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_OPERATIONS),
        fc.string({ minLength: 1, maxLength: 30 }),
        (operation, clientId) => {
          resetRateLimitStore();
          const policy = getRateLimitPolicy(operation);

          // Exhaust the quota
          for (let i = 0; i < policy.maxRequests; i++) {
            checkRateLimit(operation, clientId);
          }

          // The rejected result must include a positive retryAfter
          const result = checkRateLimit(operation, clientId);
          expect(result.allowed).toBe(false);
          expect(result.retryAfter).toBeDefined();
          expect(typeof result.retryAfter).toBe('number');
          expect(result.retryAfter).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('unknown operations always allow (fail-open behavior)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (op) => !KNOWN_OPERATIONS.includes(op),
        ),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.nat({ max: 50 }),
        (unknownOperation, clientId, requestCount) => {
          resetRateLimitStore();

          // Any number of requests to an unknown operation must always be allowed
          for (let i = 0; i < requestCount + 1; i++) {
            const result = checkRateLimit(unknownOperation, clientId);
            expect(result.allowed).toBe(true);
            expect(result.retryAfter).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
