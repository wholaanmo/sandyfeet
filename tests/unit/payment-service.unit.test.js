// tests/unit/payment-service.unit.test.js
// Unit tests for lib/server/services/payment.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock env.js to prevent environment variable validation
vi.mock('../../lib/server/env.js', () => ({
  env: {
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
    APP_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

// Mock firebase-admin
const mockRunTransaction = vi.fn();

let docIdCounter = 0;

const mockFirestore = {
  collection: (name) => ({
    doc: (id) => {
      const docId = id || `auto-id-${++docIdCounter}`;
      return {
        id: docId,
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
      };
    },
  }),
  runTransaction: mockRunTransaction,
};

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {},
  firestore: mockFirestore,
}));

// Mock firebase-admin module (for FieldValue)
vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: {
        increment: (val) => ({ _increment: val }),
      },
    },
    apps: [{}],
    app: () => ({}),
  },
}));

// Mock session.js to prevent its env.js import
vi.mock('../../lib/server/auth/session.js', () => ({
  resolveSession: vi.fn(),
  SESSION_COOKIE_NAME: '__Host-sf_session',
}));

// ─── State Machine Tests ─────────────────────────────────────────────────────

describe('Payment state machines', () => {
  let PAYMENT_REQUEST_MACHINE, RESERVATION_PAYMENT_MACHINE, REFUND_MACHINE;

  beforeEach(async () => {
    vi.clearAllMocks();
    docIdCounter = 0;
    const mod = await import('../../lib/server/services/payment.js');
    PAYMENT_REQUEST_MACHINE = mod.PAYMENT_REQUEST_MACHINE;
    RESERVATION_PAYMENT_MACHINE = mod.RESERVATION_PAYMENT_MACHINE;
    REFUND_MACHINE = mod.REFUND_MACHINE;
  });

  describe('PAYMENT_REQUEST_MACHINE', () => {
    it('allows requested -> details_provided', () => {
      expect(PAYMENT_REQUEST_MACHINE.requested).toContain('details_provided');
    });

    it('allows requested -> cancelled', () => {
      expect(PAYMENT_REQUEST_MACHINE.requested).toContain('cancelled');
    });

    it('allows details_provided -> proof_submitted', () => {
      expect(PAYMENT_REQUEST_MACHINE.details_provided).toContain('proof_submitted');
    });

    it('allows proof_submitted -> under_review', () => {
      expect(PAYMENT_REQUEST_MACHINE.proof_submitted).toContain('under_review');
    });

    it('allows under_review -> approved or rejected', () => {
      expect(PAYMENT_REQUEST_MACHINE.under_review).toContain('approved');
      expect(PAYMENT_REQUEST_MACHINE.under_review).toContain('rejected');
    });

    it('has no transitions from terminal states', () => {
      expect(PAYMENT_REQUEST_MACHINE.approved).toEqual([]);
      expect(PAYMENT_REQUEST_MACHINE.cancelled).toEqual([]);
    });

    it('allows rejected -> requested (re-submission)', () => {
      expect(PAYMENT_REQUEST_MACHINE.rejected).toContain('requested');
    });
  });

  describe('RESERVATION_PAYMENT_MACHINE', () => {
    it('allows unpaid -> deposit_pending', () => {
      expect(RESERVATION_PAYMENT_MACHINE.unpaid).toContain('deposit_pending');
    });

    it('allows deposit_pending -> partially_paid or paid', () => {
      expect(RESERVATION_PAYMENT_MACHINE.deposit_pending).toContain('partially_paid');
      expect(RESERVATION_PAYMENT_MACHINE.deposit_pending).toContain('paid');
    });

    it('allows partially_paid -> paid', () => {
      expect(RESERVATION_PAYMENT_MACHINE.partially_paid).toContain('paid');
    });

    it('paid is a terminal state', () => {
      expect(RESERVATION_PAYMENT_MACHINE.paid).toEqual([]);
    });
  });

  describe('REFUND_MACHINE', () => {
    it('allows not_requested -> requested', () => {
      expect(REFUND_MACHINE.not_requested).toContain('requested');
    });

    it('allows requested -> approved or rejected', () => {
      expect(REFUND_MACHINE.requested).toContain('approved');
      expect(REFUND_MACHINE.requested).toContain('rejected');
    });

    it('allows approved -> processing', () => {
      expect(REFUND_MACHINE.approved).toContain('processing');
    });

    it('allows processing -> refunded or failed', () => {
      expect(REFUND_MACHINE.processing).toContain('refunded');
      expect(REFUND_MACHINE.processing).toContain('failed');
    });

    it('rejected is a terminal state', () => {
      expect(REFUND_MACHINE.rejected).toEqual([]);
    });

    it('refunded is a terminal state', () => {
      expect(REFUND_MACHINE.refunded).toEqual([]);
    });

    it('allows failed -> requested (retry)', () => {
      expect(REFUND_MACHINE.failed).toContain('requested');
    });
  });
});

// ─── recordPaymentTransition Tests ───────────────────────────────────────────

describe('recordPaymentTransition', () => {
  let recordPaymentTransition;

  const adminActor = { uid: 'admin1', role: 'admin', status: 'active' };
  const staffActor = { uid: 'staff1', role: 'staff', status: 'active' };
  const guestActor = { uid: 'guest1', role: 'guest', status: 'active' };

  beforeEach(async () => {
    vi.clearAllMocks();
    docIdCounter = 0;
    const mod = await import('../../lib/server/services/payment.js');
    recordPaymentTransition = mod.recordPaymentTransition;
  });

  describe('validation', () => {
    it('rejects unauthenticated actor', async () => {
      await expect(
        recordPaymentTransition(null, 'BK-1', { transition: 'details_provided', idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects guest role (insufficient permissions)', async () => {
      await expect(
        recordPaymentTransition(guestActor, 'BK-1', { transition: 'details_provided', idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects missing booking ID', async () => {
      await expect(
        recordPaymentTransition(adminActor, '', { transition: 'details_provided', idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects missing transition', async () => {
      await expect(
        recordPaymentTransition(adminActor, 'BK-1', { transition: '', idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects missing idempotency key', async () => {
      await expect(
        recordPaymentTransition(adminActor, 'BK-1', { transition: 'details_provided', idempotencyKey: '' })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('transactional behavior', () => {
    it('applies a valid payment transition and returns result', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        // Idempotency: not found
        tx.get.mockResolvedValueOnce({ exists: false });
        // Booking: found in bookings collection
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'pending_payment',
            paymentRequestState: 'requested',
            paymentStatus: 'unpaid',
            totals: { total: 1000000, downPayment: 500000, balance: 500000 },
          }),
        });
        return fn(tx);
      });

      const result = await recordPaymentTransition(adminActor, 'BK-1', {
        transition: 'details_provided',
        idempotencyKey: 'pay-key-1',
      });

      expect(result.bookingId).toBe('BK-1');
      expect(result.action).toBe('payment_transition');
      expect(result.previousPaymentRequestState).toBe('requested');
      expect(result.newPaymentRequestState).toBe('details_provided');
      expect(result.balances).toBeDefined();
      expect(result.balances.totalCentavos).toBe(1000000);
    });

    it('rejects invalid state transition', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'pending_payment',
            paymentRequestState: 'requested',
            paymentStatus: 'unpaid',
            totals: { total: 1000000, downPayment: 500000, balance: 500000 },
          }),
        });
        return fn(tx);
      });

      await expect(
        recordPaymentTransition(adminActor, 'BK-1', {
          transition: 'approved', // cannot go directly from requested -> approved
          idempotencyKey: 'pay-key-2',
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('returns idempotent result on retry', async () => {
      const storedResult = { bookingId: 'BK-1', action: 'payment_transition', newPaymentRequestState: 'details_provided' };
      const { computeCommandHash } = await import('../../lib/server/services/idempotency.js');
      const hash = computeCommandHash({ bookingId: 'BK-1', transition: 'details_provided', evidence: null });

      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            commandDigest: hash,
            resultProjection: storedResult,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        });
        return fn(tx);
      });

      const result = await recordPaymentTransition(adminActor, 'BK-1', {
        transition: 'details_provided',
        idempotencyKey: 'pay-key-1',
      });

      expect(result.idempotent).toBe(true);
      expect(result.bookingId).toBe('BK-1');
    });

    it('staff can also perform payment transitions', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'confirmed',
            paymentRequestState: 'proof_submitted',
            paymentStatus: 'deposit_pending',
            totals: { total: 2000000, downPayment: 1000000, balance: 1000000 },
          }),
        });
        return fn(tx);
      });

      const result = await recordPaymentTransition(staffActor, 'BK-2', {
        transition: 'under_review',
        idempotencyKey: 'pay-key-3',
      });

      expect(result.bookingId).toBe('BK-2');
      expect(result.newPaymentRequestState).toBe('under_review');
    });

    it('throws NOT_FOUND for non-existent booking', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        // Both collections return not found
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({ exists: false });
        return fn(tx);
      });

      await expect(
        recordPaymentTransition(adminActor, 'BK-NONEXISTENT', {
          transition: 'details_provided',
          idempotencyKey: 'pay-key-4',
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('includes evidence metadata when provided', async () => {
      let updatePayload;
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn((_ref, payload) => { updatePayload = payload; }),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'pending_payment',
            paymentRequestState: 'details_provided',
            paymentStatus: 'unpaid',
            totals: { total: 500000, downPayment: 250000, balance: 250000 },
          }),
        });
        return fn(tx);
      });

      await recordPaymentTransition(adminActor, 'BK-1', {
        transition: 'proof_submitted',
        evidence: { proofType: 'bank_transfer', evidenceRef: 'uploads/proof-1.jpg' },
        idempotencyKey: 'pay-key-5',
      });

      expect(updatePayload.evidenceMetadata).toBeDefined();
      expect(updatePayload.evidenceMetadata.hasProof).toBe(true);
      expect(updatePayload.evidenceMetadata.proofType).toBe('bank_transfer');
    });

    it('advances reservation payment status on approval', async () => {
      let updatePayload;
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn((_ref, payload) => { updatePayload = payload; }),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'confirmed',
            paymentRequestState: 'under_review',
            paymentStatus: 'unpaid',
            totals: { total: 1000000, downPayment: 500000, balance: 500000 },
          }),
        });
        return fn(tx);
      });

      const result = await recordPaymentTransition(adminActor, 'BK-1', {
        transition: 'approved',
        idempotencyKey: 'pay-key-6',
      });

      expect(result.paymentStatus).toBe('deposit_pending');
      expect(updatePayload.paymentStatus).toBe('deposit_pending');
    });
  });
});

// ─── processRefund Tests ─────────────────────────────────────────────────────

describe('processRefund', () => {
  let processRefund;

  const adminActor = { uid: 'admin1', role: 'admin', status: 'active' };
  const staffActor = { uid: 'staff1', role: 'staff', status: 'active' };
  const guestActor = { uid: 'guest1', role: 'guest', status: 'active' };

  beforeEach(async () => {
    vi.clearAllMocks();
    docIdCounter = 0;
    const mod = await import('../../lib/server/services/payment.js');
    processRefund = mod.processRefund;
  });

  describe('validation', () => {
    it('rejects unauthenticated actor', async () => {
      await expect(
        processRefund(null, 'BK-1', { idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects non-admin role (staff cannot process refunds)', async () => {
      await expect(
        processRefund(staffActor, 'BK-1', { idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects guest role', async () => {
      await expect(
        processRefund(guestActor, 'BK-1', { idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects missing booking ID', async () => {
      await expect(
        processRefund(adminActor, '', { idempotencyKey: 'k1' })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects missing idempotency key', async () => {
      await expect(
        processRefund(adminActor, 'BK-1', { idempotencyKey: '' })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('eligibility enforcement', () => {
    it('rejects refund for non-cancelled reservation WITHOUT notification', async () => {
      let outboxWritten = false;
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn((_ref, data) => {
            if (data.type && data.type.includes('refund')) {
              outboxWritten = true;
            }
          }),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'confirmed', // NOT cancelled — ineligible
            paymentStatus: 'paid',
            refundState: 'not_requested',
            totals: { total: 1000000, downPayment: 500000, balance: 0 },
          }),
        });
        return fn(tx);
      });

      await expect(
        processRefund(adminActor, 'BK-1', { idempotencyKey: 'ref-key-1' })
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // Verify no outbox notification was written
      expect(outboxWritten).toBe(false);
    });

    it('rejects refund for unpaid booking WITHOUT notification', async () => {
      let outboxWritten = false;
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn((_ref, data) => {
            if (data.type && data.type.includes('refund')) {
              outboxWritten = true;
            }
          }),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'cancelled', // cancelled but...
            paymentStatus: 'unpaid', // ...unpaid — nothing to refund
            refundState: 'not_requested',
            totals: { total: 1000000, downPayment: 500000, balance: 500000 },
          }),
        });
        return fn(tx);
      });

      await expect(
        processRefund(adminActor, 'BK-1', { idempotencyKey: 'ref-key-2' })
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      expect(outboxWritten).toBe(false);
    });
  });

  describe('transactional behavior', () => {
    it('processes eligible refund and writes audit + outbox', async () => {
      let auditWritten = false;
      let outboxWritten = false;

      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn((_ref, data) => {
            if (data.action === 'refund.transition') auditWritten = true;
            if (data.type === 'refund_transition') outboxWritten = true;
          }),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'cancelled',
            paymentStatus: 'paid',
            refundState: 'not_requested',
            totals: { total: 1000000, downPayment: 500000, balance: 0 },
          }),
        });
        return fn(tx);
      });

      const result = await processRefund(adminActor, 'BK-1', {
        idempotencyKey: 'ref-key-3',
        reasonCode: 'guest_request',
      });

      expect(result.bookingId).toBe('BK-1');
      expect(result.action).toBe('refund_transition');
      expect(result.newRefundState).toBe('requested');
      expect(result.refundAmountCentavos).toBe(1000000); // paid amount
      expect(auditWritten).toBe(true);
      expect(outboxWritten).toBe(true);
    });

    it('derives refund amount from authoritative paid centavos', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'cancelled',
            paymentStatus: 'partially_paid',
            refundState: 'not_requested',
            totals: { total: 2000000, downPayment: 1000000, balance: 500000 },
          }),
        });
        return fn(tx);
      });

      const result = await processRefund(adminActor, 'BK-1', {
        idempotencyKey: 'ref-key-4',
      });

      // paid = total - balance = 2000000 - 500000 = 1500000
      expect(result.refundAmountCentavos).toBe(1500000);
    });

    it('rejects invalid refund state transition', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'cancelled',
            paymentStatus: 'paid',
            refundState: 'not_requested', // current state
            totals: { total: 1000000, downPayment: 500000, balance: 0 },
          }),
        });
        return fn(tx);
      });

      await expect(
        processRefund(adminActor, 'BK-1', {
          transition: 'approved', // cannot go directly from not_requested -> approved
          idempotencyKey: 'ref-key-5',
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('returns idempotent result on retry', async () => {
      const storedResult = { bookingId: 'BK-1', action: 'refund_transition', newRefundState: 'requested' };
      const { computeCommandHash } = await import('../../lib/server/services/idempotency.js');
      const hash = computeCommandHash({ bookingId: 'BK-1', transition: 'requested', reasonCode: null });

      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            commandDigest: hash,
            resultProjection: storedResult,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        });
        return fn(tx);
      });

      const result = await processRefund(adminActor, 'BK-1', {
        idempotencyKey: 'ref-key-3',
      });

      expect(result.idempotent).toBe(true);
      expect(result.bookingId).toBe('BK-1');
    });

    it('throws NOT_FOUND for non-existent booking', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({ exists: false });
        return fn(tx);
      });

      await expect(
        processRefund(adminActor, 'BK-NONEXISTENT', {
          idempotencyKey: 'ref-key-6',
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('uses integer centavos for monetary values', async () => {
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn(),
          set: vi.fn(),
          update: vi.fn(),
        };
        tx.get.mockResolvedValueOnce({ exists: false });
        tx.get.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ownerUid: 'guest1',
            status: 'cancelled',
            paymentStatus: 'paid',
            refundState: 'not_requested',
            // Use floating point to verify integer conversion
            totals: { total: 1500050.7, downPayment: 750025.3, balance: 0 },
          }),
        });
        return fn(tx);
      });

      const result = await processRefund(adminActor, 'BK-1', {
        idempotencyKey: 'ref-key-7',
      });

      // Should be floored to integers
      expect(Number.isInteger(result.refundAmountCentavos)).toBe(true);
      expect(Number.isInteger(result.balances.totalCentavos)).toBe(true);
      expect(Number.isInteger(result.balances.paidCentavos)).toBe(true);
      expect(Number.isInteger(result.balances.balanceCentavos)).toBe(true);
    });
  });
});
