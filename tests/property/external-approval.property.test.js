// Property 26: External destinations require exact approval
// Validates: Requirements 8.8, 14.2

import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock server-only (no-op)
vi.mock('server-only', () => ({}));

import { validateExternalUrl, EXTERNAL_ALLOWLISTS } from '../../lib/server/http/content-safety.js';

// Collect all approved hostnames across all purposes
const ALL_APPROVED_HOSTS = [
  ...new Set(Object.values(EXTERNAL_ALLOWLISTS).flat()),
];

// All valid purpose keys
const PURPOSES = Object.keys(EXTERNAL_ALLOWLISTS);

// Arbitraries
const purposeArb = fc.constantFrom(...PURPOSES);

const alphanumChars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

/**
 * Generate a hostname that is NOT in the allowlist.
 * Uses common TLDs with random subdomains to avoid collisions.
 */
const nonAllowlistedHostArb = fc
  .tuple(
    fc.string({ minLength: 3, maxLength: 12, unit: fc.constantFrom(...alphanumChars) }),
    fc.constantFrom('.example.com', '.evil.org', '.attacker.net', '.malicious.io', '.notallowed.xyz'),
  )
  .map(([sub, tld]) => sub + tld)
  .filter((host) => !ALL_APPROVED_HOSTS.includes(host.toLowerCase()));

/**
 * Generate a path component for URLs.
 */
const pathSegmentChars = 'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('');
const pathArb = fc
  .array(fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...pathSegmentChars) }), { minLength: 0, maxLength: 3 })
  .map((parts) => '/' + parts.join('/'));

/**
 * Generate credentials (username and optional password) for URLs with userinfo.
 */
const usernameArb = fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...alphanumChars) });
const passwordArb = fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...alphanumChars) });

/**
 * Generate non-HTTPS protocols.
 */
const nonHttpsProtocolArb = fc.constantFrom('http:', 'ftp:', 'ws:', 'file:');

describe('Property 26: External destinations require exact approval', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('URLs with hostnames NOT in the allowlist return { valid: false }', () => {
    fc.assert(
      fc.property(
        nonAllowlistedHostArb,
        pathArb,
        purposeArb,
        (host, path, purpose) => {
          const url = `https://${host}${path}`;
          const result = validateExternalUrl(url, purpose);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('URLs with credentials (user:pass@) always return { valid: false }', () => {
    fc.assert(
      fc.property(
        usernameArb,
        passwordArb,
        fc.constantFrom(...ALL_APPROVED_HOSTS, ...['evil.com', 'attacker.net']),
        pathArb,
        purposeArb,
        (username, password, host, path, purpose) => {
          const url = `https://${username}:${password}@${host}${path}`;
          const result = validateExternalUrl(url, purpose);
          expect(result.valid).toBe(false);
          expect(result.reason).toContain('credentials');
        },
      ),
      { numRuns: 500 },
    );
  });

  it('non-HTTPS URLs in production always return { valid: false }', () => {
    process.env.NODE_ENV = 'production';

    fc.assert(
      fc.property(
        nonHttpsProtocolArb,
        fc.constantFrom(...ALL_APPROVED_HOSTS, 'localhost', '127.0.0.1', 'example.com'),
        pathArb,
        purposeArb,
        (protocol, host, path, purpose) => {
          // Construct URL with non-HTTPS protocol
          const url = `${protocol}//${host}${path}`;
          const result = validateExternalUrl(url, purpose);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('only exact allowlisted hostnames pass validation', () => {
    fc.assert(
      fc.property(
        purposeArb,
        pathArb,
        (purpose, path) => {
          const allowlist = EXTERNAL_ALLOWLISTS[purpose];

          // Each approved hostname should pass
          for (const host of allowlist) {
            const url = `https://${host}${path}`;
            const result = validateExternalUrl(url, purpose);
            expect(result.valid).toBe(true);
          }

          // Subdomains of approved hosts should NOT pass (not exact match)
          for (const host of allowlist) {
            const subdomainUrl = `https://sub.${host}${path}`;
            const subResult = validateExternalUrl(subdomainUrl, purpose);
            expect(subResult.valid).toBe(false);
          }

          // Suffixes appended to approved hosts should NOT pass
          for (const host of allowlist) {
            const suffixUrl = `https://${host}.evil.com${path}`;
            const suffixResult = validateExternalUrl(suffixUrl, purpose);
            expect(suffixResult.valid).toBe(false);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
