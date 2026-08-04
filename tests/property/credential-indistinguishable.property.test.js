// Property 11: Invalid credential states are publicly indistinguishable
// Validates: Requirements 3.7

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

vi.mock('server-only', () => ({}));

// Mock Firestore interactions with controllable behavior
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockQueryGet = vi.fn();

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {},
  firestore: {
    collection: () => ({
      doc: (id) => ({
        id: id || 'auto-id',
        set: vi.fn().mockResolvedValue(undefined),
        update: mockUpdate,
        get: vi.fn(),
        ref: { update: mockUpdate },
      }),
      where: () => ({
        where: () => ({
          where: () => ({
            limit: () => ({
              get: mockQueryGet,
            }),
          }),
        }),
      }),
    }),
    runTransaction: vi.fn(),
  },
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3000',
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
  },
}));

/**
 * Enum of all invalid credential states we need to verify produce
 * indistinguishable error responses.
 */
const INVALID_STATES = [
  'non-existent',
  'expired',
  'consumed',
  'attempts-exhausted',
  'wrong-purpose',
  'wrong-actor',
  'wrong-subject',
];

/**
 * Arbitrary for valid purposes
 */
const purposeArb = fc.constantFrom(
  'email-verify',
  'password-reset',
  'guest-password-reset',
  'device-verify',
  'staff-verify',
);

/**
 * Arbitrary for actor UIDs
 */
const actorUidArb = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0);

/**
 * Arbitrary for subjects
 */
const subjectArb = fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0);

/**
 * Arbitrary for tokens (non-empty strings)
 */
const tokenArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/**
 * Arbitrary for invalid state selection
 */
const invalidStateArb = fc.constantFrom(...INVALID_STATES);

/**
 * Configure the mock to simulate a specific invalid credential state.
 */
function configureMockForState(state, { purpose, actorUid, subject }) {
  const futureDate = new Date(Date.now() + 60000).toISOString();
  const pastDate = new Date(Date.now() - 60000).toISOString();

  switch (state) {
    case 'non-existent':
      mockQueryGet.mockResolvedValue({ empty: true, docs: [] });
      break;

    case 'expired':
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-expired',
            data: () => ({
              purpose,
              actorUid,
              subject: subject || null,
              consumed: false,
              expiresAt: pastDate,
              failedAttempts: 0,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });
      break;

    case 'consumed':
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-consumed',
            data: () => ({
              purpose,
              actorUid,
              subject: subject || null,
              consumed: true,
              expiresAt: futureDate,
              failedAttempts: 0,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });
      break;

    case 'attempts-exhausted':
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-exhausted',
            data: () => ({
              purpose,
              actorUid,
              subject: subject || null,
              consumed: false,
              expiresAt: futureDate,
              failedAttempts: 5,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });
      break;

    case 'wrong-purpose':
      // Credential exists but queried with mismatched purpose — Firestore returns empty
      mockQueryGet.mockResolvedValue({ empty: true, docs: [] });
      break;

    case 'wrong-actor':
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-wrong-actor',
            data: () => ({
              purpose,
              actorUid: 'different-actor-uid',
              subject: subject || null,
              consumed: false,
              expiresAt: futureDate,
              failedAttempts: 0,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });
      break;

    case 'wrong-subject':
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-wrong-subject',
            data: () => ({
              purpose,
              actorUid,
              subject: 'different-subject-value',
              consumed: false,
              expiresAt: futureDate,
              failedAttempts: 0,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });
      break;
  }
}

describe('Property 11: Invalid credential states are publicly indistinguishable', () => {
  let validateCredential, CredentialInvalidError;

  beforeEach(async () => {
    vi.resetModules();
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockQueryGet.mockReset();

    const mod = await import('../../lib/server/services/credential.js');
    validateCredential = mod.validateCredential;
    CredentialInvalidError = mod.CredentialInvalidError;
  });

  it('all invalid credential states produce exactly the same error message and code', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidStateArb,
        purposeArb,
        actorUidArb,
        subjectArb,
        tokenArb,
        async (state, purpose, actorUid, subject, token) => {
          mockQueryGet.mockReset();
          mockUpdate.mockReset().mockResolvedValue(undefined);

          configureMockForState(state, { purpose, actorUid, subject });

          // For wrong-actor and wrong-subject, pass mismatched bindings
          const params = { purpose, token };
          if (state === 'wrong-actor') {
            params.actorUid = actorUid; // will differ from 'different-actor-uid' in mock
          } else if (state === 'wrong-subject') {
            params.actorUid = actorUid;
            params.subject = subject; // will differ from 'different-subject-value' in mock
          }

          let caughtError;
          try {
            await validateCredential(params);
            // Should never succeed for these invalid states
            throw new Error('Expected validation to fail');
          } catch (e) {
            caughtError = e;
          }

          // All invalid states must produce CredentialInvalidError
          expect(caughtError).toBeInstanceOf(CredentialInvalidError);
          // Exactly the same generic message
          expect(caughtError.message).toBe('invalid_or_expired');
          // Exactly the same error code
          expect(caughtError.code).toBe('INVALID_CREDENTIAL');
          // Error name is consistent
          expect(caughtError.name).toBe('CredentialInvalidError');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no error message reveals which specific binding failed, credential existence, or internal state', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidStateArb,
        purposeArb,
        actorUidArb,
        subjectArb,
        tokenArb,
        async (state, purpose, actorUid, subject, token) => {
          mockQueryGet.mockReset();
          mockUpdate.mockReset().mockResolvedValue(undefined);

          configureMockForState(state, { purpose, actorUid, subject });

          const params = { purpose, token };
          if (state === 'wrong-actor') {
            params.actorUid = actorUid;
          } else if (state === 'wrong-subject') {
            params.actorUid = actorUid;
            params.subject = subject;
          }

          let caughtError;
          try {
            await validateCredential(params);
            throw new Error('Expected validation to fail');
          } catch (e) {
            caughtError = e;
          }

          // Verify the error does not leak internal state information
          const errorStr = JSON.stringify({
            message: caughtError.message,
            code: caughtError.code,
            name: caughtError.name,
            stack: caughtError.stack,
          });

          // Must not reveal which specific failure reason occurred
          const forbiddenLeaks = [
            'expired',
            'consumed',
            'exhausted',
            'mismatch',
            'not found',
            'does not exist',
            'wrong actor',
            'wrong subject',
            'wrong purpose',
            'attempts',
            'max_attempts',
            'actor_mismatch',
            'subject_mismatch',
            'purpose_mismatch',
          ];

          // The message and code fields specifically must not contain leak terms
          // (stack traces may contain function names, which is acceptable for server-only code)
          const publicFields = `${caughtError.message} ${caughtError.code}`.toLowerCase();

          for (const leak of forbiddenLeaks) {
            // The one allowed word in the message is 'expired' as part of the generic 'invalid_or_expired'
            if (leak === 'expired') {
              // 'invalid_or_expired' is the canonical generic message — it's acceptable
              expect(publicFields).toBe('invalid_or_expired invalid_credential');
              continue;
            }
            expect(publicFields).not.toContain(leak.toLowerCase());
          }

          // Error must have no additional enumerable properties beyond standard Error + code
          const ownKeys = Object.keys(caughtError);
          // Allowed own properties: standard Error fields + our known 'code' field
          const allowedKeys = new Set(['code', 'name', 'message', 'stack']);
          for (const key of ownKeys) {
            expect(allowedKeys.has(key)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
