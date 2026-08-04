// Property 10: Credential validity requires every binding
// Validates: Requirements 3.3, 3.4, 3.5

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock server-only (no-op)
vi.mock('server-only', () => ({}));

// Mock Firestore — we control credential records per test scenario
const mockQueryGet = vi.fn();
const mockDocUpdate = vi.fn();

vi.mock('../../lib/server/firebase-admin.js', () => {
  const mockCollection = () => ({
    where: () => ({
      where: () => ({
        where: () => ({
          limit: () => ({
            get: mockQueryGet,
          }),
        }),
      }),
    }),
    doc: () => ({
      id: 'mock-credential-id',
      set: vi.fn().mockResolvedValue(undefined),
    }),
  });

  return {
    firestore: {
      collection: mockCollection,
      runTransaction: vi.fn(),
    },
    auth: {},
  };
});

import { validateCredential, CredentialInvalidError, VALID_PURPOSES } from '../../lib/server/services/credential.js';
import crypto from 'node:crypto';

/**
 * Helper: compute the HMAC digest for a given token, matching the service's logic.
 */
function computeTestDigest(token) {
  const secret = process.env.CREDENTIAL_HMAC_SECRET || 'dev-credential-hmac-secret-do-not-use-in-production';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

/**
 * Helper: build a valid, non-expired, non-consumed credential record.
 */
function buildValidRecord({ purpose, actorUid, subject, token }) {
  const digest = computeTestDigest(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
  return {
    purpose,
    actorUid,
    subject: subject || null,
    digest,
    keyId: 'key-v1',
    expiresAt,
    maxAttempts: 5,
    failedAttempts: 0,
    consumed: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Helper: set up Firestore mock to return a specific credential record.
 */
function setupFirestoreMock(record) {
  const docRef = { update: mockDocUpdate };
  mockQueryGet.mockResolvedValue({
    empty: false,
    docs: [
      {
        id: 'mock-credential-id',
        data: () => record,
        ref: docRef,
      },
    ],
  });
}

/**
 * Helper: set up Firestore mock to return no matching credential (empty result).
 */
function setupFirestoreEmpty() {
  mockQueryGet.mockResolvedValue({
    empty: true,
    docs: [],
  });
}

// Arbitraries
const purposeArb = fc.constantFrom(...VALID_PURPOSES);
const actorUidArb = fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0);
const subjectArb = fc.emailAddress();
const tokenArb = fc.string({ minLength: 20, maxLength: 60 }).filter((s) => s.trim().length > 0);

describe('Property 10: Credential validity requires every binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocUpdate.mockResolvedValue(undefined);
  });

  it('a credential with purpose P, actor A, subject S can ONLY be validated when all three match — varying one binding causes failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        purposeArb,
        actorUidArb,
        subjectArb,
        tokenArb,
        fc.constantFrom('purpose', 'actor', 'subject'),
        async (purpose, actorUid, subject, token, varyField) => {
          vi.clearAllMocks();
          mockDocUpdate.mockResolvedValue(undefined);

          const record = buildValidRecord({ purpose, actorUid, subject, token });
          setupFirestoreMock(record);

          // Valid case: all bindings match — should succeed
          const validResult = await validateCredential({
            purpose,
            token,
            actorUid,
            subject,
          });
          expect(validResult).toBeDefined();
          expect(validResult.id).toBe('mock-credential-id');

          // Now vary one binding and assert failure
          vi.clearAllMocks();
          mockDocUpdate.mockResolvedValue(undefined);

          if (varyField === 'purpose') {
            // Different purpose — Firestore query returns empty since digest+purpose won't match
            setupFirestoreEmpty();
            await expect(
              validateCredential({ purpose: purpose + '-wrong', token, actorUid, subject }),
            ).rejects.toThrow(CredentialInvalidError);
          } else if (varyField === 'actor') {
            // Different actor — record found but actorUid doesn't match
            setupFirestoreMock(record);
            await expect(
              validateCredential({ purpose, token, actorUid: actorUid + '-wrong', subject }),
            ).rejects.toThrow(CredentialInvalidError);
          } else if (varyField === 'subject') {
            // Different subject — record found but subject doesn't match
            setupFirestoreMock(record);
            await expect(
              validateCredential({ purpose, token, actorUid, subject: subject + '.wrong' }),
            ).rejects.toThrow(CredentialInvalidError);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a consumed credential always fails validation regardless of correct bindings', async () => {
    await fc.assert(
      fc.asyncProperty(
        purposeArb,
        actorUidArb,
        subjectArb,
        tokenArb,
        async (purpose, actorUid, subject, token) => {
          vi.clearAllMocks();
          mockDocUpdate.mockResolvedValue(undefined);

          const record = buildValidRecord({ purpose, actorUid, subject, token });
          record.consumed = true; // Mark as consumed

          setupFirestoreMock(record);

          await expect(
            validateCredential({ purpose, token, actorUid, subject }),
          ).rejects.toThrow(CredentialInvalidError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('an expired credential always fails validation regardless of correct bindings', async () => {
    await fc.assert(
      fc.asyncProperty(
        purposeArb,
        actorUidArb,
        subjectArb,
        tokenArb,
        async (purpose, actorUid, subject, token) => {
          vi.clearAllMocks();
          mockDocUpdate.mockResolvedValue(undefined);

          const record = buildValidRecord({ purpose, actorUid, subject, token });
          // Set expiry to the past
          record.expiresAt = new Date(Date.now() - 60 * 1000).toISOString();

          setupFirestoreMock(record);

          await expect(
            validateCredential({ purpose, token, actorUid, subject }),
          ).rejects.toThrow(CredentialInvalidError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a credential with exhausted attempts always fails validation regardless of correct bindings', async () => {
    await fc.assert(
      fc.asyncProperty(
        purposeArb,
        actorUidArb,
        subjectArb,
        tokenArb,
        async (purpose, actorUid, subject, token) => {
          vi.clearAllMocks();
          mockDocUpdate.mockResolvedValue(undefined);

          const record = buildValidRecord({ purpose, actorUid, subject, token });
          // Exhaust attempts: set failedAttempts >= maxAttempts
          record.failedAttempts = record.maxAttempts;

          setupFirestoreMock(record);

          await expect(
            validateCredential({ purpose, token, actorUid, subject }),
          ).rejects.toThrow(CredentialInvalidError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all failure modes produce the SAME generic error (CredentialInvalidError with message invalid_or_expired)', async () => {
    await fc.assert(
      fc.asyncProperty(
        purposeArb,
        actorUidArb,
        subjectArb,
        tokenArb,
        fc.constantFrom('consumed', 'expired', 'exhausted', 'wrong-actor', 'wrong-subject', 'wrong-purpose'),
        async (purpose, actorUid, subject, token, failureMode) => {
          vi.clearAllMocks();
          mockDocUpdate.mockResolvedValue(undefined);

          const record = buildValidRecord({ purpose, actorUid, subject, token });

          switch (failureMode) {
            case 'consumed':
              record.consumed = true;
              setupFirestoreMock(record);
              break;
            case 'expired':
              record.expiresAt = new Date(Date.now() - 60 * 1000).toISOString();
              setupFirestoreMock(record);
              break;
            case 'exhausted':
              record.failedAttempts = record.maxAttempts;
              setupFirestoreMock(record);
              break;
            case 'wrong-actor':
              setupFirestoreMock(record);
              break;
            case 'wrong-subject':
              setupFirestoreMock(record);
              break;
            case 'wrong-purpose':
              setupFirestoreEmpty();
              break;
          }

          const params = { purpose, token, actorUid, subject };
          if (failureMode === 'wrong-actor') params.actorUid = actorUid + '-mismatch';
          if (failureMode === 'wrong-subject') params.subject = subject + '.mismatch';
          if (failureMode === 'wrong-purpose') params.purpose = purpose + '-invalid';

          try {
            await validateCredential(params);
            // Should not reach here
            expect.fail('Expected CredentialInvalidError to be thrown');
          } catch (err) {
            // ALL failure modes must produce the same generic error
            expect(err).toBeInstanceOf(CredentialInvalidError);
            expect(err.message).toBe('invalid_or_expired');
            expect(err.name).toBe('CredentialInvalidError');
            expect(err.code).toBe('INVALID_CREDENTIAL');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
