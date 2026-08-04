// tests/unit/credential-service.unit.test.js
// Unit tests for lib/server/services/credential.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock Firestore interactions
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockQueryGet = vi.fn();
const mockTransactionGet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();

let docIdCounter = 0;

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {},
  firestore: {
    collection: (name) => ({
      doc: (id) => {
        if (id) {
          return {
            id,
            set: mockSet,
            update: mockUpdate,
            get: mockGet,
            ref: { update: mockUpdate },
          };
        }
        // Auto-generated ID
        const autoId = `auto-id-${++docIdCounter}`;
        return {
          id: autoId,
          set: mockSet,
          update: mockUpdate,
          get: mockGet,
        };
      },
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
    runTransaction: mockRunTransaction,
  },
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3000',
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
  },
}));

describe('lib/server/services/credential', () => {
  let issueCredential, validateCredential, consumeWithMutation, CredentialInvalidError, VALID_PURPOSES;

  beforeEach(async () => {
    vi.resetModules();
    docIdCounter = 0;
    mockSet.mockReset().mockResolvedValue(undefined);
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockGet.mockReset();
    mockQueryGet.mockReset();
    mockTransactionGet.mockReset();
    mockTransactionUpdate.mockReset();
    mockRunTransaction.mockReset();

    const mod = await import('../../lib/server/services/credential.js');
    issueCredential = mod.issueCredential;
    validateCredential = mod.validateCredential;
    consumeWithMutation = mod.consumeWithMutation;
    CredentialInvalidError = mod.CredentialInvalidError;
    VALID_PURPOSES = mod.VALID_PURPOSES;
  });

  describe('VALID_PURPOSES', () => {
    it('contains all required verification purposes', () => {
      expect(VALID_PURPOSES.has('email-verify')).toBe(true);
      expect(VALID_PURPOSES.has('password-reset')).toBe(true);
      expect(VALID_PURPOSES.has('guest-password-reset')).toBe(true);
      expect(VALID_PURPOSES.has('device-verify')).toBe(true);
      expect(VALID_PURPOSES.has('staff-verify')).toBe(true);
    });
  });

  describe('issueCredential', () => {
    it('generates a base64url-encoded token of sufficient length', async () => {
      const result = await issueCredential({
        purpose: 'password-reset',
        actorUid: 'user-123',
      });

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      // 32 random bytes as base64url = 43 characters
      expect(result.token.length).toBe(43);
      // Validate base64url characters only
      expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('returns an expiresAt date in the future', async () => {
      const before = Date.now();
      const result = await issueCredential({
        purpose: 'email-verify',
        actorUid: 'user-456',
      });

      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(before);
    });

    it('stores a digest (not the raw token) in Firestore', async () => {
      const result = await issueCredential({
        purpose: 'staff-verify',
        actorUid: 'user-789',
        subject: 'staff@sandyfeet.com',
      });

      expect(mockSet).toHaveBeenCalledTimes(1);
      const storedRecord = mockSet.mock.calls[0][0];

      // The raw token must NOT appear in the stored record
      expect(storedRecord.digest).toBeDefined();
      expect(storedRecord.digest).not.toBe(result.token);
      // Digest is a hex-encoded HMAC-SHA-256 (64 hex chars)
      expect(storedRecord.digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('stores correct metadata in the credential record', async () => {
      await issueCredential({
        purpose: 'device-verify',
        actorUid: 'user-abc',
        subject: 'fingerprint-xyz',
        ttlMs: 30 * 60 * 1000,
        maxAttempts: 3,
      });

      const storedRecord = mockSet.mock.calls[0][0];

      expect(storedRecord.purpose).toBe('device-verify');
      expect(storedRecord.actorUid).toBe('user-abc');
      expect(storedRecord.subject).toBe('fingerprint-xyz');
      expect(storedRecord.keyId).toBe('key-v1');
      expect(storedRecord.maxAttempts).toBe(3);
      expect(storedRecord.failedAttempts).toBe(0);
      expect(storedRecord.consumed).toBe(false);
      expect(storedRecord.createdAt).toBeDefined();
      expect(storedRecord.expiresAt).toBeDefined();
    });

    it('uses default TTL of 15 minutes when not specified', async () => {
      const before = Date.now();
      await issueCredential({
        purpose: 'password-reset',
        actorUid: 'user-1',
      });

      const storedRecord = mockSet.mock.calls[0][0];
      const expiresAt = new Date(storedRecord.expiresAt).getTime();
      const expectedExpiry = before + 15 * 60 * 1000;

      // Allow 1 second tolerance
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(1000);
    });

    it('uses default maxAttempts of 5 when not specified', async () => {
      await issueCredential({
        purpose: 'password-reset',
        actorUid: 'user-1',
      });

      const storedRecord = mockSet.mock.calls[0][0];
      expect(storedRecord.maxAttempts).toBe(5);
    });

    it('rejects invalid purposes', async () => {
      await expect(
        issueCredential({ purpose: 'invalid-purpose', actorUid: 'user-1' })
      ).rejects.toThrow('Invalid credential purpose');
    });

    it('rejects missing actorUid', async () => {
      await expect(
        issueCredential({ purpose: 'password-reset', actorUid: '' })
      ).rejects.toThrow('actorUid is required');

      await expect(
        issueCredential({ purpose: 'password-reset', actorUid: null })
      ).rejects.toThrow('actorUid is required');
    });

    it('generates unique tokens on each call', async () => {
      const result1 = await issueCredential({ purpose: 'password-reset', actorUid: 'u1' });
      const result2 = await issueCredential({ purpose: 'password-reset', actorUid: 'u1' });

      expect(result1.token).not.toBe(result2.token);
    });

    it('returns a credentialId', async () => {
      const result = await issueCredential({ purpose: 'password-reset', actorUid: 'u1' });
      expect(result.credentialId).toBeDefined();
      expect(typeof result.credentialId).toBe('string');
    });
  });

  describe('validateCredential', () => {
    it('throws CredentialInvalidError for missing token', async () => {
      await expect(
        validateCredential({ purpose: 'password-reset', token: '' })
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError for missing purpose', async () => {
      await expect(
        validateCredential({ purpose: '', token: 'some-token' })
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError for invalid purpose', async () => {
      await expect(
        validateCredential({ purpose: 'bad-purpose', token: 'some-token' })
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError when no matching credential found', async () => {
      mockQueryGet.mockResolvedValue({ empty: true, docs: [] });

      await expect(
        validateCredential({ purpose: 'password-reset', token: 'unknown-token' })
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError for consumed credentials', async () => {
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-1',
            data: () => ({
              purpose: 'password-reset',
              actorUid: 'user-1',
              consumed: true,
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              failedAttempts: 0,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });

      await expect(
        validateCredential({ purpose: 'password-reset', token: 'some-token' })
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError for expired credentials', async () => {
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-1',
            data: () => ({
              purpose: 'password-reset',
              actorUid: 'user-1',
              consumed: false,
              expiresAt: new Date(Date.now() - 60000).toISOString(), // expired
              failedAttempts: 0,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });

      await expect(
        validateCredential({ purpose: 'password-reset', token: 'some-token' })
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError when attempts exhausted', async () => {
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-1',
            data: () => ({
              purpose: 'password-reset',
              actorUid: 'user-1',
              consumed: false,
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              failedAttempts: 5,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });

      await expect(
        validateCredential({ purpose: 'password-reset', token: 'some-token' })
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError and increments attempts on actorUid mismatch', async () => {
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-1',
            data: () => ({
              purpose: 'password-reset',
              actorUid: 'user-1',
              consumed: false,
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              failedAttempts: 0,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });

      await expect(
        validateCredential({
          purpose: 'password-reset',
          token: 'some-token',
          actorUid: 'wrong-user',
        })
      ).rejects.toBeInstanceOf(CredentialInvalidError);

      expect(mockUpdate).toHaveBeenCalledWith({ failedAttempts: 1 });
    });

    it('throws CredentialInvalidError and increments attempts on subject mismatch', async () => {
      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-1',
            data: () => ({
              purpose: 'device-verify',
              actorUid: 'user-1',
              subject: 'fingerprint-a',
              consumed: false,
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              failedAttempts: 2,
              maxAttempts: 5,
            }),
            ref: { update: mockUpdate },
          },
        ],
      });

      await expect(
        validateCredential({
          purpose: 'device-verify',
          token: 'some-token',
          subject: 'fingerprint-b',
        })
      ).rejects.toBeInstanceOf(CredentialInvalidError);

      expect(mockUpdate).toHaveBeenCalledWith({ failedAttempts: 3 });
    });

    it('returns credential record on valid lookup with matching bindings', async () => {
      const record = {
        purpose: 'password-reset',
        actorUid: 'user-1',
        subject: null,
        consumed: false,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        failedAttempts: 0,
        maxAttempts: 5,
        keyId: 'key-v1',
        digest: 'abc123',
      };

      mockQueryGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'cred-1',
            data: () => record,
            ref: { update: mockUpdate },
          },
        ],
      });

      const result = await validateCredential({
        purpose: 'password-reset',
        token: 'valid-token',
        actorUid: 'user-1',
      });

      expect(result.id).toBe('cred-1');
      expect(result.record.purpose).toBe('password-reset');
      expect(result.record.actorUid).toBe('user-1');
    });

    it('returns the same generic error message for all failure types', async () => {
      // Test that all failure modes produce CredentialInvalidError with message 'invalid_or_expired'
      mockQueryGet.mockResolvedValue({ empty: true, docs: [] });

      try {
        await validateCredential({ purpose: 'password-reset', token: 'bad' });
      } catch (e) {
        expect(e.message).toBe('invalid_or_expired');
        expect(e.code).toBe('INVALID_CREDENTIAL');
      }
    });
  });

  describe('consumeWithMutation', () => {
    it('throws CredentialInvalidError for missing credentialId', async () => {
      await expect(consumeWithMutation('', vi.fn())).rejects.toBeInstanceOf(CredentialInvalidError);
      await expect(consumeWithMutation(null, vi.fn())).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('executes mutation and marks credential consumed in a transaction', async () => {
      const mutationResult = { passwordUpdated: true };
      const mutationFn = vi.fn().mockResolvedValue(mutationResult);

      mockRunTransaction.mockImplementation(async (fn) => {
        const transaction = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              consumed: false,
              purpose: 'password-reset',
              actorUid: 'user-1',
            }),
          }),
          update: mockTransactionUpdate,
        };
        return await fn(transaction);
      });

      const result = await consumeWithMutation('cred-123', mutationFn);

      expect(result).toEqual(mutationResult);
      expect(mutationFn).toHaveBeenCalledTimes(1);
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ consumed: true })
      );
    });

    it('throws CredentialInvalidError when credential is already consumed', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const transaction = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              consumed: true,
              purpose: 'password-reset',
            }),
          }),
          update: mockTransactionUpdate,
        };
        return await fn(transaction);
      });

      await expect(
        consumeWithMutation('cred-123', vi.fn())
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('throws CredentialInvalidError when credential document does not exist', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const transaction = {
          get: vi.fn().mockResolvedValue({ exists: false }),
          update: mockTransactionUpdate,
        };
        return await fn(transaction);
      });

      await expect(
        consumeWithMutation('cred-missing', vi.fn())
      ).rejects.toBeInstanceOf(CredentialInvalidError);
    });

    it('does not consume credential if mutation throws', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const transaction = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ consumed: false }),
          }),
          update: mockTransactionUpdate,
        };
        return await fn(transaction);
      });

      const failingMutation = vi.fn().mockRejectedValue(new Error('Mutation failed'));

      await expect(
        consumeWithMutation('cred-123', failingMutation)
      ).rejects.toThrow('Mutation failed');
    });
  });
});
