// tests/unit/checkin-service.unit.test.js
// Unit tests for lib/server/services/checkin.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// ─── Firestore mock infrastructure ──────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockQueryGet = vi.fn();
const mockTransactionGet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockTransactionSet = vi.fn();
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
        const autoId = `auto-id-${++docIdCounter}`;
        return {
          id: autoId,
          set: mockSet,
          update: mockUpdate,
          get: mockGet,
        };
      },
      where: (field, op, value) => ({
        where: (f2, o2, v2) => ({
          where: (f3, o3, v3) => ({
            limit: () => ({
              get: mockQueryGet,
            }),
          }),
          limit: () => ({
            get: mockQueryGet,
          }),
        }),
        limit: () => ({
          get: mockQueryGet,
        }),
        get: mockQueryGet,
      }),
    }),
    runTransaction: mockRunTransaction,
  },
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    APP_ORIGIN: 'https://sandyfeet.example.com',
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
  },
}));

describe('lib/server/services/checkin', () => {
  let issueCheckInCredential, consumeCheckInCredential;
  let CHECK_IN_TTL_MS, CHECK_IN_ELIGIBLE_STATUSES, CHECKED_IN_STATUS;

  // Mock issueCredential and validateCredential and consumeWithMutation
  const mockIssueCredential = vi.fn();
  const mockValidateCredential = vi.fn();
  const mockConsumeWithMutation = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    docIdCounter = 0;
    mockSet.mockReset().mockResolvedValue(undefined);
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockGet.mockReset();
    mockQueryGet.mockReset();
    mockTransactionGet.mockReset();
    mockTransactionUpdate.mockReset();
    mockTransactionSet.mockReset();
    mockRunTransaction.mockReset();
    mockIssueCredential.mockReset();
    mockValidateCredential.mockReset();
    mockConsumeWithMutation.mockReset();

    // Mock the credential service
    vi.doMock('../../lib/server/services/credential.js', () => ({
      issueCredential: mockIssueCredential,
      validateCredential: mockValidateCredential,
      consumeWithMutation: mockConsumeWithMutation,
      CredentialInvalidError: class CredentialInvalidError extends Error {
        constructor() {
          super('invalid_or_expired');
          this.code = 'INVALID_CREDENTIAL';
          this.name = 'CredentialInvalidError';
        }
      },
      VALID_PURPOSES: new Set(['check-in']),
    }));

    // Mock the audit service
    vi.doMock('../../lib/server/services/audit.js', () => ({
      buildAuditEvent: vi.fn((_actor, _action, _target, _opts) =>
        Object.freeze({
          actorUid: _actor.uid,
          actorRole: _actor.role,
          action: _action,
          targetType: _target.type,
          targetId: _target.id,
          correlationId: _opts.correlationId,
          occurredAt: new Date().toISOString(),
          before: _opts.before,
          after: _opts.after,
          schemaVersion: 1,
        })
      ),
      writeAuditEvent: vi.fn(),
    }));

    const mod = await import('../../lib/server/services/checkin.js');
    issueCheckInCredential = mod.issueCheckInCredential;
    consumeCheckInCredential = mod.consumeCheckInCredential;
    CHECK_IN_TTL_MS = mod.CHECK_IN_TTL_MS;
    CHECK_IN_ELIGIBLE_STATUSES = mod.CHECK_IN_ELIGIBLE_STATUSES;
    CHECKED_IN_STATUS = mod.CHECKED_IN_STATUS;
  });

  describe('module exports', () => {
    it('exports expected TTL of 24 hours', () => {
      expect(CHECK_IN_TTL_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('exports eligible statuses including confirmed', () => {
      expect(CHECK_IN_ELIGIBLE_STATUSES.has('confirmed')).toBe(true);
    });

    it('exports checked_in as the target status', () => {
      expect(CHECKED_IN_STATUS).toBe('checked_in');
    });
  });

  describe('issueCheckInCredential', () => {
    const staffActor = { uid: 'staff-1', role: 'staff' };
    const adminActor = { uid: 'admin-1', role: 'admin' };
    const guestActor = { uid: 'guest-1', role: 'guest' };

    it('rejects non-staff/admin actors with FORBIDDEN', async () => {
      await expect(
        issueCheckInCredential(guestActor, 'BK-001')
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects when booking is not found with NOT_FOUND', async () => {
      // Both queries return empty
      mockQueryGet.mockResolvedValue({ empty: true, docs: [] });

      await expect(
        issueCheckInCredential(staffActor, 'nonexistent-booking')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects when booking status is not confirmed with CONFLICT', async () => {
      // First query (room bookings by ID) returns a pending booking
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          ref: { id: 'doc-1' },
          data: () => ({ bookingId: 'BK-001', status: 'pending_payment' }),
        }],
      });

      await expect(
        issueCheckInCredential(staffActor, 'BK-001')
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('issues credential and returns token + QR URL for confirmed booking', async () => {
      // Booking query returns confirmed
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          ref: { id: 'doc-1' },
          data: () => ({ bookingId: 'BK-001', status: 'confirmed' }),
        }],
      });

      const fakeToken = 'abc123-fake-token';
      const fakeExpiry = new Date('2025-01-02T00:00:00Z');
      mockIssueCredential.mockResolvedValue({
        token: fakeToken,
        expiresAt: fakeExpiry,
        credentialId: 'cred-1',
      });

      const result = await issueCheckInCredential(staffActor, 'BK-001');

      expect(result.token).toBe(fakeToken);
      expect(result.expiresAt).toEqual(fakeExpiry);
      expect(result.qrUrl).toBe(
        `https://sandyfeet.example.com/check-in?token=${encodeURIComponent(fakeToken)}`
      );
    });

    it('QR URL uses only APP_ORIGIN — no third-party URL', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          ref: { id: 'doc-1' },
          data: () => ({ bookingId: 'BK-002', status: 'confirmed' }),
        }],
      });

      mockIssueCredential.mockResolvedValue({
        token: 'token-xyz',
        expiresAt: new Date(),
        credentialId: 'cred-2',
      });

      const result = await issueCheckInCredential(adminActor, 'BK-002');
      const url = new URL(result.qrUrl);
      expect(url.origin).toBe('https://sandyfeet.example.com');
      expect(url.pathname).toBe('/check-in');
      expect(url.searchParams.get('token')).toBe('token-xyz');
    });

    it('passes correct parameters to issueCredential', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          ref: { id: 'doc-1' },
          data: () => ({ bookingId: 'BK-003', status: 'confirmed' }),
        }],
      });

      mockIssueCredential.mockResolvedValue({
        token: 'tok',
        expiresAt: new Date(),
        credentialId: 'cred-3',
      });

      await issueCheckInCredential(staffActor, 'BK-003');

      expect(mockIssueCredential).toHaveBeenCalledWith({
        purpose: 'check-in',
        actorUid: 'staff-1',
        subject: 'BK-003',
        ttlMs: 24 * 60 * 60 * 1000,
        maxAttempts: 5,
      });
    });

    it('accepts admin role for issuance', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          ref: { id: 'doc-1' },
          data: () => ({ bookingId: 'BK-004', status: 'confirmed' }),
        }],
      });

      mockIssueCredential.mockResolvedValue({
        token: 'admin-tok',
        expiresAt: new Date(),
        credentialId: 'cred-4',
      });

      const result = await issueCheckInCredential(adminActor, 'BK-004');
      expect(result.token).toBe('admin-tok');
    });
  });

  describe('consumeCheckInCredential', () => {
    const staffActor = { uid: 'staff-1', role: 'staff' };
    const guestActor = { uid: 'guest-1', role: 'guest' };

    it('rejects non-staff/admin actors with FORBIDDEN', async () => {
      await expect(
        consumeCheckInCredential(guestActor, 'some-token')
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('validates credential with purpose check-in', async () => {
      mockValidateCredential.mockResolvedValue({
        id: 'cred-1',
        record: { subject: 'BK-001', purpose: 'check-in' },
      });

      mockConsumeWithMutation.mockResolvedValue({
        bookingId: 'BK-001',
        status: 'checked_in',
      });

      await consumeCheckInCredential(staffActor, 'valid-token');

      expect(mockValidateCredential).toHaveBeenCalledWith({
        purpose: 'check-in',
        token: 'valid-token',
      });
    });

    it('calls consumeWithMutation with credential ID', async () => {
      mockValidateCredential.mockResolvedValue({
        id: 'cred-abc',
        record: { subject: 'BK-001', purpose: 'check-in' },
      });

      mockConsumeWithMutation.mockResolvedValue({
        bookingId: 'BK-001',
        status: 'checked_in',
      });

      await consumeCheckInCredential(staffActor, 'valid-token');

      expect(mockConsumeWithMutation).toHaveBeenCalledWith(
        'cred-abc',
        expect.any(Function)
      );
    });

    it('returns bookingId and checked_in status on success', async () => {
      mockValidateCredential.mockResolvedValue({
        id: 'cred-1',
        record: { subject: 'BK-001', purpose: 'check-in' },
      });

      mockConsumeWithMutation.mockResolvedValue({
        bookingId: 'BK-001',
        status: 'checked_in',
      });

      const result = await consumeCheckInCredential(staffActor, 'valid-token');
      expect(result).toEqual({ bookingId: 'BK-001', status: 'checked_in' });
    });

    it('propagates INVALID_CREDENTIAL error from validateCredential', async () => {
      const err = new Error('invalid_or_expired');
      err.code = 'INVALID_CREDENTIAL';
      mockValidateCredential.mockRejectedValue(err);

      await expect(
        consumeCheckInCredential(staffActor, 'bad-token')
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
    });

    it('propagates errors from consumeWithMutation', async () => {
      mockValidateCredential.mockResolvedValue({
        id: 'cred-1',
        record: { subject: 'BK-001', purpose: 'check-in' },
      });

      const err = new Error('Booking not found');
      err.code = 'NOT_FOUND';
      mockConsumeWithMutation.mockRejectedValue(err);

      await expect(
        consumeCheckInCredential(staffActor, 'valid-token')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('consumeCheckInCredential — transaction mutation logic', () => {
    const staffActor = { uid: 'staff-1', role: 'staff' };

    it('transitions parent and child bookings to checked_in in transaction', async () => {
      mockValidateCredential.mockResolvedValue({
        id: 'cred-1',
        record: { subject: 'BK-GROUP', purpose: 'check-in' },
      });

      // Capture the mutation function passed to consumeWithMutation
      mockConsumeWithMutation.mockImplementation(async (credId, mutationFn) => {
        // Simulate the transaction with mocked data
        const parentRef = { id: 'parent-doc' };
        const child1Ref = { id: 'child-1-doc' };
        const child2Ref = { id: 'child-2-doc' };

        const mockTransaction = {
          get: vi.fn()
            .mockResolvedValueOnce({
              // room bookings by bookingId
              docs: [{
                ref: parentRef,
                data: () => ({ bookingId: 'BK-GROUP', status: 'confirmed' }),
              }],
            })
            .mockResolvedValueOnce({
              // room bookings by parentBookingId
              docs: [
                {
                  ref: child1Ref,
                  data: () => ({ bookingId: 'BK-CHILD-1', parentBookingId: 'BK-GROUP', status: 'confirmed' }),
                },
                {
                  ref: child2Ref,
                  data: () => ({ bookingId: 'BK-CHILD-2', parentBookingId: 'BK-GROUP', status: 'confirmed' }),
                },
              ],
            })
            .mockResolvedValueOnce({ docs: [] }) // day tour by bookingId
            .mockResolvedValueOnce({ docs: [] }), // day tour by parentBookingId
          update: mockTransactionUpdate,
          set: mockTransactionSet,
        };

        return await mutationFn(mockTransaction);
      });

      const result = await consumeCheckInCredential(staffActor, 'valid-token');

      expect(result).toEqual({ bookingId: 'BK-GROUP', status: 'checked_in' });
      // Parent + 2 children = 3 update calls
      expect(mockTransactionUpdate).toHaveBeenCalledTimes(3);

      // Verify all updates set status to checked_in
      for (const call of mockTransactionUpdate.mock.calls) {
        const updateData = call[1];
        expect(updateData.status).toBe('checked_in');
        expect(updateData.reservationStatus).toBe('checked_in');
        expect(updateData.checkedInBy).toBe('staff-1');
        expect(updateData.checkedInAt).toBeDefined();
      }
    });

    it('rejects when booking is not in confirmed status within transaction', async () => {
      mockValidateCredential.mockResolvedValue({
        id: 'cred-1',
        record: { subject: 'BK-PENDING', purpose: 'check-in' },
      });

      mockConsumeWithMutation.mockImplementation(async (credId, mutationFn) => {
        const mockTransaction = {
          get: vi.fn()
            .mockResolvedValueOnce({
              docs: [{
                ref: { id: 'doc-1' },
                data: () => ({ bookingId: 'BK-PENDING', status: 'pending_payment' }),
              }],
            })
            .mockResolvedValueOnce({ docs: [] })
            .mockResolvedValueOnce({ docs: [] })
            .mockResolvedValueOnce({ docs: [] }),
          update: mockTransactionUpdate,
          set: mockTransactionSet,
        };

        return await mutationFn(mockTransaction);
      });

      await expect(
        consumeCheckInCredential(staffActor, 'valid-token')
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects when no booking docs found in transaction', async () => {
      mockValidateCredential.mockResolvedValue({
        id: 'cred-1',
        record: { subject: 'BK-GONE', purpose: 'check-in' },
      });

      mockConsumeWithMutation.mockImplementation(async (credId, mutationFn) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ docs: [] }),
          update: mockTransactionUpdate,
          set: mockTransactionSet,
        };

        return await mutationFn(mockTransaction);
      });

      await expect(
        consumeCheckInCredential(staffActor, 'valid-token')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('writes an audit event within the transaction', async () => {
      const { writeAuditEvent } = await import('../../lib/server/services/audit.js');

      mockValidateCredential.mockResolvedValue({
        id: 'cred-1',
        record: { subject: 'BK-AUDIT', purpose: 'check-in' },
      });

      mockConsumeWithMutation.mockImplementation(async (credId, mutationFn) => {
        const mockTransaction = {
          get: vi.fn()
            .mockResolvedValueOnce({
              docs: [{
                ref: { id: 'doc-1' },
                data: () => ({ bookingId: 'BK-AUDIT', status: 'confirmed' }),
              }],
            })
            .mockResolvedValueOnce({ docs: [] })
            .mockResolvedValueOnce({ docs: [] })
            .mockResolvedValueOnce({ docs: [] }),
          update: mockTransactionUpdate,
          set: mockTransactionSet,
        };

        return await mutationFn(mockTransaction);
      });

      await consumeCheckInCredential(staffActor, 'valid-token');

      expect(writeAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ update: mockTransactionUpdate }),
        expect.objectContaining({
          action: 'check-in.consume',
          targetType: 'booking',
          targetId: 'BK-AUDIT',
          actorUid: 'staff-1',
          actorRole: 'staff',
        })
      );
    });
  });
});
