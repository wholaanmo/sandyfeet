// Property 6: Authenticated mutation origins are same-origin
// Validates: Requirements 2.4

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateOrigin } from '../../lib/server/http/origin.js';

/**
 * The configured application origin used as the trust anchor.
 */
const APP_ORIGIN = 'https://sandyfeet.com';

/**
 * Helper to create a minimal request-like object with an Origin header.
 */
function makeRequest(originValue) {
  return {
    headers: {
      get(name) {
        if (name === 'origin') return originValue;
        return null;
      },
    },
  };
}

/**
 * Arbitrary that generates a valid URL origin differing from APP_ORIGIN
 * in scheme, host, or port.
 */
const differentOriginArb = fc.oneof(
  // Different scheme
  fc.constantFrom(
    'http://sandyfeet.com',
    'ftp://sandyfeet.com',
    'ws://sandyfeet.com',
    'wss://sandyfeet.com',
  ),
  // Different host
  fc
    .tuple(
      fc.constantFrom('https', 'http'),
      fc.domain().filter((d) => d !== 'sandyfeet.com'),
    )
    .map(([scheme, host]) => `${scheme}://${host}`),
  // Different port
  fc
    .integer({ min: 1, max: 65535 })
    .filter((p) => p !== 443)
    .map((port) => `https://sandyfeet.com:${port}`),
  // Subdomain of the app host (still different)
  fc
    .stringMatching(/^[a-z]{2,8}$/)
    .map((sub) => `https://${sub}.sandyfeet.com`),
);

/**
 * Arbitrary that generates non-URL, malformed, null, or empty strings.
 */
const malformedOriginArb = fc.oneof(
  fc.constant(null),
  fc.constant(''),
  fc.constant('   '),
  fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
    try {
      new URL(s);
      return false; // exclude valid URLs
    } catch {
      return true;
    }
  }),
  fc.constantFrom(
    'not-a-url',
    '://missing-scheme',
    'https://',
    'javascript:alert(1)',
    'data:text/html,<h1>hi</h1>',
    'file:///etc/passwd',
  ),
);

/**
 * Arbitrary that generates URL variants with different case, trailing slashes,
 * or paths appended to the APP_ORIGIN.
 */
const originVariantArb = fc.oneof(
  // Different casing in scheme or host
  fc.constantFrom(
    'HTTPS://sandyfeet.com',
    'https://SANDYFEET.COM',
    'Https://Sandyfeet.Com',
    'HTTPS://SANDYFEET.COM',
  ),
  // With trailing slash
  fc.constant('https://sandyfeet.com/'),
  // With path segments
  fc
    .stringMatching(/^\/[a-z]{1,10}(\/[a-z]{1,10})?$/)
    .map((path) => `https://sandyfeet.com${path}`),
  // With query or fragment
  fc.constantFrom(
    'https://sandyfeet.com?foo=bar',
    'https://sandyfeet.com#section',
    'https://sandyfeet.com/path?q=1',
  ),
);

describe('Property 6: Authenticated mutation origins are same-origin', () => {
  it('rejects any origin differing in scheme, host, or port from APP_ORIGIN', () => {
    fc.assert(
      fc.property(differentOriginArb, (origin) => {
        const request = makeRequest(origin);
        const result = validateOrigin(request, APP_ORIGIN);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('accepts the exact APP_ORIGIN', () => {
    fc.assert(
      fc.property(fc.constant(APP_ORIGIN), (origin) => {
        const request = makeRequest(origin);
        const result = validateOrigin(request, APP_ORIGIN);
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('never throws for arbitrary strings, null, or empty — always returns a boolean', () => {
    fc.assert(
      fc.property(malformedOriginArb, (origin) => {
        const request = makeRequest(origin);
        const result = validateOrigin(request, APP_ORIGIN);
        expect(typeof result).toBe('boolean');
      }),
      { numRuns: 100 },
    );
  });

  it('only exact origin match returns true — case, trailing slashes, and paths all resolve via URL normalization', () => {
    fc.assert(
      fc.property(originVariantArb, (origin) => {
        const request = makeRequest(origin);
        const result = validateOrigin(request, APP_ORIGIN);
        // URL origin normalization: scheme and host are lowercased,
        // paths/queries/fragments are stripped by URL.origin.
        // So case-insensitive matches and paths should still yield true,
        // because new URL('HTTPS://SANDYFEET.COM/path').origin === 'https://sandyfeet.com'
        // The key property: the result is always a boolean
        expect(typeof result).toBe('boolean');

        // More specifically: URL.origin normalizes to lowercase and strips path,
        // so these variants that are semantically the same origin should return true.
        const expectedOrigin = (() => {
          try {
            return new URL(origin).origin;
          } catch {
            return null;
          }
        })();
        const appParsedOrigin = new URL(APP_ORIGIN).origin;

        if (expectedOrigin === appParsedOrigin) {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
