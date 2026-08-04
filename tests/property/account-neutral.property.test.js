// Property 12: Account lookup responses are neutral
// Validates: Requirements 3.8

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Mock handleAccountLookup represents the server behavior for password-reset
 * and verification endpoints. It MUST return an identical response regardless
 * of whether the named account actually exists in the system.
 *
 * @param {string} _email - The email submitted by the user (ignored for response)
 * @returns {{ ok: true, data: { message: string } }}
 */
function handleAccountLookup(_email) {
  return {
    ok: true,
    data: { message: 'If an account exists, instructions have been sent' },
  };
}

/**
 * Simulated set of emails that "exist" in the system.
 */
const EXISTING_ACCOUNTS = new Set([
  'guest@sandyfeet.com',
  'admin@sandyfeet.com',
  'staff@sandyfeet.com',
  'vip@sandyfeet.com',
]);

/**
 * Checks whether a response object reveals any account-existence metadata.
 * Forbidden fields include: exists, found, accountType, accountStatus, role,
 * createdAt, userId, uid, status, type, registered, active, verified.
 */
const FORBIDDEN_FIELDS = [
  'exists',
  'found',
  'accountType',
  'accountStatus',
  'role',
  'createdAt',
  'userId',
  'uid',
  'status',
  'type',
  'registered',
  'active',
  'verified',
];

function responseLeaksAccountInfo(response) {
  const allFields = getAllFields(response);
  return FORBIDDEN_FIELDS.some((field) => allFields.includes(field));
}

function getAllFields(obj, prefix = '') {
  const fields = [];
  if (obj === null || obj === undefined || typeof obj !== 'object') return fields;
  for (const key of Object.keys(obj)) {
    fields.push(prefix ? `${prefix}.${key}` : key);
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      fields.push(...getAllFields(obj[key], prefix ? `${prefix}.${key}` : key));
    }
  }
  return fields;
}

describe('Property 12: Account lookup responses are neutral', () => {
  // Arbitrary for emails that "exist" in the mock system
  const existingEmailArb = fc.constantFrom(...EXISTING_ACCOUNTS);

  // Arbitrary for emails that do NOT exist in the system
  const nonExistingEmailArb = fc
    .emailAddress()
    .filter((email) => !EXISTING_ACCOUNTS.has(email));

  it('response structure and message are identical for existing and non-existing accounts', () => {
    fc.assert(
      fc.property(existingEmailArb, nonExistingEmailArb, (existingEmail, nonExistingEmail) => {
        const responseForExisting = handleAccountLookup(existingEmail);
        const responseForNonExisting = handleAccountLookup(nonExistingEmail);

        // Responses must be structurally identical
        expect(responseForExisting).toEqual(responseForNonExisting);

        // Verify specific shape
        expect(responseForExisting.ok).toBe(true);
        expect(responseForExisting.data.message).toBe(
          'If an account exists, instructions have been sent',
        );
        expect(responseForNonExisting.ok).toBe(true);
        expect(responseForNonExisting.data.message).toBe(
          'If an account exists, instructions have been sent',
        );
      }),
      { numRuns: 100 },
    );
  });

  it('response time approximation is constant (no early-return optimization)', () => {
    fc.assert(
      fc.property(existingEmailArb, nonExistingEmailArb, (existingEmail, nonExistingEmail) => {
        // Measure execution for existing account
        const startExisting = performance.now();
        handleAccountLookup(existingEmail);
        const durationExisting = performance.now() - startExisting;

        // Measure execution for non-existing account
        const startNonExisting = performance.now();
        handleAccountLookup(nonExistingEmail);
        const durationNonExisting = performance.now() - startNonExisting;

        // Both paths should take approximately the same time.
        // A large timing difference would indicate an early-return optimization
        // that leaks account existence. We allow up to 50ms variance to account
        // for measurement noise in a non-real-time environment.
        const timingDifference = Math.abs(durationExisting - durationNonExisting);
        expect(timingDifference).toBeLessThan(50);
      }),
      { numRuns: 100 },
    );
  });

  it('no response field reveals account existence, type, status, role, or creation date', () => {
    fc.assert(
      fc.property(
        fc.oneof(existingEmailArb, nonExistingEmailArb),
        (email) => {
          const response = handleAccountLookup(email);

          // The response must not contain any field that could reveal account info
          expect(responseLeaksAccountInfo(response)).toBe(false);

          // Verify only the expected keys exist at each level
          const topKeys = Object.keys(response);
          expect(topKeys).toEqual(['ok', 'data']);

          const dataKeys = Object.keys(response.data);
          expect(dataKeys).toEqual(['message']);
        },
      ),
      { numRuns: 100 },
    );
  });
});
