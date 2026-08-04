// Property 3: Return-path normalization rejects untrusted destinations
// Validates: Requirements 4.11

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { normalizeReturnPath, matchRoute } from '../../lib/routes/registry.js';
import { ROUTE_MANIFEST, PUBLIC_LANDING } from '../../lib/routes/manifest.js';

/**
 * Active routes that are not legacy-redirect entries.
 * These are valid return-path destinations.
 */
const ACTIVE_ROUTES = ROUTE_MANIFEST.filter(
  (r) => r.status === 'active' && r.methods.includes('GET'),
);

/**
 * Static active paths (routes without dynamic segments).
 */
const STATIC_ACTIVE_PATHS = ACTIVE_ROUTES
  .filter((r) => !r.pattern.includes('['))
  .map((r) => r.pattern);

describe('Property 3: Return-path normalization rejects untrusted destinations', () => {
  it('never returns a value containing :// (no absolute URLs with scheme)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.stringMatching(/^[\u0000-\uffff]{0,100}$/),
          fc.webUrl(),
        ),
        (input) => {
          const result = normalizeReturnPath(input);
          expect(result).not.toContain('://');
        },
      ),
      { numRuns: 500 },
    );
  });

  it('rejects backslashes, control characters, and protocol-relative URLs', () => {
    const maliciousArb = fc.oneof(
      // Paths with backslashes
      fc.tuple(fc.string({ minLength: 0, maxLength: 50 }), fc.string({ minLength: 0, maxLength: 50 }))
        .map(([a, b]) => `/${a}\\${b}`),
      // Paths with control characters (U+0000–U+001F, U+007F)
      fc.tuple(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.integer({ min: 0, max: 0x1f }),
      ).map(([s, code]) => `/${s}${String.fromCharCode(code)}`),
      // Control character U+007F (DEL)
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `/${s}\x7f`),
      // Protocol-relative URLs
      fc.domain().map((domain) => `//${domain}/path`),
      fc.string({ minLength: 1, maxLength: 50 }).map((s) => `//${s}`),
    );

    fc.assert(
      fc.property(maliciousArb, (input) => {
        const result = normalizeReturnPath(input);
        // Must return fallback (PUBLIC_LANDING) for all these malicious inputs
        expect(result).toBe(PUBLIC_LANDING);
      }),
      { numRuns: 500 },
    );
  });

  it('valid same-origin active paths pass through unchanged', () => {
    // Only test static paths (no dynamic segments) since they are guaranteed to match
    fc.assert(
      fc.property(
        fc.constantFrom(...STATIC_ACTIVE_PATHS),
        (path) => {
          const result = normalizeReturnPath(path);
          expect(result).toBe(path);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('output always starts with / and matches an active route or is the fallback', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.stringMatching(/^[\u0000-\uffff]{0,100}$/),
          fc.webUrl(),
          fc.constantFrom(...STATIC_ACTIVE_PATHS),
        ),
        (input) => {
          const result = normalizeReturnPath(input);

          // Must always start with /
          expect(result.startsWith('/')).toBe(true);

          // Must either match an active route or be the fallback
          const matched = matchRoute(result);
          if (matched) {
            expect(matched.route.status).toBe('active');
          } else {
            expect(result).toBe(PUBLIC_LANDING);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('rejects javascript:, data:, and vbscript: scheme prefixes', () => {
    const dangerousSchemeArb = fc.oneof(
      // javascript: variants
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `javascript:${s}`),
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `JavaScript:${s}`),
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `JAVASCRIPT:${s}`),
      // data: variants
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `data:${s}`),
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `Data:${s}`),
      // vbscript: variants
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `vbscript:${s}`),
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `VbScript:${s}`),
      // Other schemes that should be rejected
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `http:${s}`),
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `https:${s}`),
      fc.string({ minLength: 0, maxLength: 50 }).map((s) => `ftp:${s}`),
    );

    fc.assert(
      fc.property(dangerousSchemeArb, (input) => {
        const result = normalizeReturnPath(input);
        expect(result).toBe(PUBLIC_LANDING);
      }),
      { numRuns: 500 },
    );
  });
});
