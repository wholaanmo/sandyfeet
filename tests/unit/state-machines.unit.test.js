// tests/unit/state-machines.unit.test.js
// Unit tests for lib/domain/state-machines.js,
// lib/server/services/audit.js, and lib/server/services/outbox.js
import { describe, it, expect, vi } from 'vitest';

import {
  PAYMENT_REQUEST_MACHINE,
  RESERVATION_PAYMENT_MACHINE,
  REFUND_MACHINE,
  CHECK_IN_MACHINE,
  RESERVATION_STATUS_MACHINE,
  isValidTransition,
  getNextStates,
  getTerminalStates,
  getAllStates,
  LEGACY_STATUS_MAPPINGS,
  normalizeLegacyStatus,
  TRANSITION_GUARDS,
  getGuardKey,
  isRoleAllowedForTransition,
} from '../../lib/domain/state-machines.js';

// ─── State Machine Adjacency Maps ──────────────────────────────────────────

describe('lib/domain/state-machines', () => {
  describe('PAYMENT_REQUEST_MACHINE', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(PAYMENT_REQUEST_MACHINE)).toBe(true);
    });

    it('defines the correct states', () => {
      const states = Object.keys(PAYMENT_REQUEST_MACHINE);
      expect(states).toContain('requested');
      expect(states).toContain('details_provided');
      expect(states).toContain('proof_submitted');
      expect(states).toContain('under_review');
      expect(states).toContain('approved');
      expect(states).toContain('rejected');
      expect(states).toContain('cancelled');
    });

    it('permits the documented happy-path transitions', () => {
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'requested', 'details_provided')).toBe(true);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'details_provided', 'proof_submitted')).toBe(true);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'proof_submitted', 'under_review')).toBe(true);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'under_review', 'approved')).toBe(true);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'under_review', 'rejected')).toBe(true);
    });

    it('allows cancellation from non-terminal states', () => {
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'requested', 'cancelled')).toBe(true);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'details_provided', 'cancelled')).toBe(true);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'proof_submitted', 'cancelled')).toBe(true);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'under_review', 'cancelled')).toBe(true);
    });

    it('terminal states have no outgoing transitions', () => {
      expect(PAYMENT_REQUEST_MACHINE.approved).toEqual([]);
      expect(PAYMENT_REQUEST_MACHINE.rejected).toEqual([]);
      expect(PAYMENT_REQUEST_MACHINE.cancelled).toEqual([]);
    });

    it('rejects invalid transitions', () => {
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'approved', 'requested')).toBe(false);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'requested', 'approved')).toBe(false);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'rejected', 'approved')).toBe(false);
    });
  });

  describe('RESERVATION_PAYMENT_MACHINE', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(RESERVATION_PAYMENT_MACHINE)).toBe(true);
    });

    it('permits the documented transitions', () => {
      expect(isValidTransition(RESERVATION_PAYMENT_MACHINE, 'unpaid', 'deposit_pending')).toBe(true);
      expect(isValidTransition(RESERVATION_PAYMENT_MACHINE, 'deposit_pending', 'partially_paid')).toBe(true);
      expect(isValidTransition(RESERVATION_PAYMENT_MACHINE, 'deposit_pending', 'paid')).toBe(true);
      expect(isValidTransition(RESERVATION_PAYMENT_MACHINE, 'partially_paid', 'paid')).toBe(true);
    });

    it('paid is terminal', () => {
      expect(RESERVATION_PAYMENT_MACHINE.paid).toEqual([]);
    });

    it('rejects skipping steps', () => {
      expect(isValidTransition(RESERVATION_PAYMENT_MACHINE, 'unpaid', 'paid')).toBe(false);
      expect(isValidTransition(RESERVATION_PAYMENT_MACHINE, 'unpaid', 'partially_paid')).toBe(false);
    });
  });

  describe('REFUND_MACHINE', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(REFUND_MACHINE)).toBe(true);
    });

    it('permits the documented transitions', () => {
      expect(isValidTransition(REFUND_MACHINE, 'not_requested', 'requested')).toBe(true);
      expect(isValidTransition(REFUND_MACHINE, 'requested', 'approved')).toBe(true);
      expect(isValidTransition(REFUND_MACHINE, 'requested', 'rejected')).toBe(true);
      expect(isValidTransition(REFUND_MACHINE, 'approved', 'processing')).toBe(true);
      expect(isValidTransition(REFUND_MACHINE, 'processing', 'refunded')).toBe(true);
      expect(isValidTransition(REFUND_MACHINE, 'processing', 'failed')).toBe(true);
    });

    it('terminal states have no outgoing transitions', () => {
      expect(REFUND_MACHINE.rejected).toEqual([]);
      expect(REFUND_MACHINE.refunded).toEqual([]);
      expect(REFUND_MACHINE.failed).toEqual([]);
    });

    it('rejects backwards transitions', () => {
      expect(isValidTransition(REFUND_MACHINE, 'approved', 'requested')).toBe(false);
      expect(isValidTransition(REFUND_MACHINE, 'refunded', 'processing')).toBe(false);
    });
  });

  describe('CHECK_IN_MACHINE', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(CHECK_IN_MACHINE)).toBe(true);
    });

    it('permits eligible to checked_in', () => {
      expect(isValidTransition(CHECK_IN_MACHINE, 'eligible', 'checked_in')).toBe(true);
    });

    it('checked_in is terminal', () => {
      expect(CHECK_IN_MACHINE.checked_in).toEqual([]);
    });

    it('rejects reverse transition', () => {
      expect(isValidTransition(CHECK_IN_MACHINE, 'checked_in', 'eligible')).toBe(false);
    });
  });

  describe('RESERVATION_STATUS_MACHINE', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(RESERVATION_STATUS_MACHINE)).toBe(true);
    });

    it('permits the documented happy-path', () => {
      expect(isValidTransition(RESERVATION_STATUS_MACHINE, 'pending_payment', 'confirmed')).toBe(true);
      expect(isValidTransition(RESERVATION_STATUS_MACHINE, 'confirmed', 'checked_in')).toBe(true);
      expect(isValidTransition(RESERVATION_STATUS_MACHINE, 'checked_in', 'completed')).toBe(true);
    });

    it('allows cancellation from pending_payment and confirmed', () => {
      expect(isValidTransition(RESERVATION_STATUS_MACHINE, 'pending_payment', 'cancelled')).toBe(true);
      expect(isValidTransition(RESERVATION_STATUS_MACHINE, 'confirmed', 'cancelled')).toBe(true);
    });

    it('does not allow cancellation from checked_in or later', () => {
      expect(isValidTransition(RESERVATION_STATUS_MACHINE, 'checked_in', 'cancelled')).toBe(false);
      expect(isValidTransition(RESERVATION_STATUS_MACHINE, 'completed', 'cancelled')).toBe(false);
    });

    it('terminal states have no outgoing transitions', () => {
      expect(RESERVATION_STATUS_MACHINE.completed).toEqual([]);
      expect(RESERVATION_STATUS_MACHINE.cancelled).toEqual([]);
    });
  });

  // ─── Utility Functions ──────────────────────────────────────────────────────

  describe('isValidTransition', () => {
    it('returns false for null/undefined machine', () => {
      expect(isValidTransition(null, 'a', 'b')).toBe(false);
      expect(isValidTransition(undefined, 'a', 'b')).toBe(false);
    });

    it('returns false for null/undefined from or to', () => {
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, null, 'approved')).toBe(false);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'requested', null)).toBe(false);
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, '', 'approved')).toBe(false);
    });

    it('returns false for unknown state', () => {
      expect(isValidTransition(PAYMENT_REQUEST_MACHINE, 'nonexistent', 'approved')).toBe(false);
    });
  });

  describe('getNextStates', () => {
    it('returns allowed transitions for a state', () => {
      const next = getNextStates(PAYMENT_REQUEST_MACHINE, 'requested');
      expect(next).toContain('details_provided');
      expect(next).toContain('cancelled');
    });

    it('returns empty array for terminal states', () => {
      expect(getNextStates(PAYMENT_REQUEST_MACHINE, 'approved')).toEqual([]);
    });

    it('returns empty for unknown state', () => {
      expect(getNextStates(PAYMENT_REQUEST_MACHINE, 'nonexistent')).toEqual([]);
    });

    it('returns empty for null machine', () => {
      expect(getNextStates(null, 'requested')).toEqual([]);
    });

    it('returns a copy, not the original array', () => {
      const next = getNextStates(REFUND_MACHINE, 'not_requested');
      next.push('fake');
      expect(REFUND_MACHINE.not_requested).toEqual(['requested']);
    });
  });

  describe('getTerminalStates', () => {
    it('identifies terminal states in PAYMENT_REQUEST_MACHINE', () => {
      const terminals = getTerminalStates(PAYMENT_REQUEST_MACHINE);
      expect(terminals).toContain('approved');
      expect(terminals).toContain('rejected');
      expect(terminals).toContain('cancelled');
      expect(terminals).not.toContain('requested');
    });

    it('identifies terminal states in CHECK_IN_MACHINE', () => {
      expect(getTerminalStates(CHECK_IN_MACHINE)).toEqual(['checked_in']);
    });
  });

  describe('getAllStates', () => {
    it('returns all states for a machine', () => {
      const states = getAllStates(RESERVATION_STATUS_MACHINE);
      expect(states).toEqual(['pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled']);
    });

    it('returns empty for null machine', () => {
      expect(getAllStates(null)).toEqual([]);
    });
  });

  // ─── Legacy Status Mappings ─────────────────────────────────────────────────

  describe('LEGACY_STATUS_MAPPINGS', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(LEGACY_STATUS_MAPPINGS)).toBe(true);
    });

    it('maps capitalized legacy statuses to canonical', () => {
      expect(LEGACY_STATUS_MAPPINGS['Pending']).toBe('pending_payment');
      expect(LEGACY_STATUS_MAPPINGS['Confirmed']).toBe('confirmed');
      expect(LEGACY_STATUS_MAPPINGS['Checked In']).toBe('checked_in');
      expect(LEGACY_STATUS_MAPPINGS['Cancelled']).toBe('cancelled');
    });

    it('maps legacy payment statuses', () => {
      expect(LEGACY_STATUS_MAPPINGS['Unpaid']).toBe('unpaid');
      expect(LEGACY_STATUS_MAPPINGS['Deposit Pending']).toBe('deposit_pending');
      expect(LEGACY_STATUS_MAPPINGS['Partially Paid']).toBe('partially_paid');
      expect(LEGACY_STATUS_MAPPINGS['Paid']).toBe('paid');
    });

    it('maps camelCase legacy statuses', () => {
      expect(LEGACY_STATUS_MAPPINGS['checkedIn']).toBe('checked_in');
    });

    it('preserves canonical values as identity mappings', () => {
      expect(LEGACY_STATUS_MAPPINGS['pending_payment']).toBe('pending_payment');
      expect(LEGACY_STATUS_MAPPINGS['confirmed']).toBe('confirmed');
      expect(LEGACY_STATUS_MAPPINGS['unpaid']).toBe('unpaid');
    });
  });

  describe('normalizeLegacyStatus', () => {
    it('normalizes known legacy values', () => {
      expect(normalizeLegacyStatus('Pending')).toBe('pending_payment');
      expect(normalizeLegacyStatus('Checked In')).toBe('checked_in');
      expect(normalizeLegacyStatus('canceled')).toBe('cancelled');
    });

    it('returns canonical values unchanged', () => {
      expect(normalizeLegacyStatus('pending_payment')).toBe('pending_payment');
      expect(normalizeLegacyStatus('confirmed')).toBe('confirmed');
    });

    it('returns unknown values unchanged', () => {
      expect(normalizeLegacyStatus('unknown_status')).toBe('unknown_status');
    });

    it('handles null/undefined gracefully', () => {
      expect(normalizeLegacyStatus(null)).toBe(null);
      expect(normalizeLegacyStatus(undefined)).toBe(undefined);
    });

    it('trims whitespace before lookup', () => {
      expect(normalizeLegacyStatus(' Pending ')).toBe('pending_payment');
    });
  });

  // ─── Transition Guards ──────────────────────────────────────────────────────

  describe('TRANSITION_GUARDS', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(TRANSITION_GUARDS)).toBe(true);
    });

    it('defines guards for payment request transitions', () => {
      const key = getGuardKey('payment_request', 'under_review', 'approved');
      expect(TRANSITION_GUARDS[key]).toBeDefined();
      expect(TRANSITION_GUARDS[key].roles).toContain('admin');
    });

    it('only admin can approve payments', () => {
      expect(isRoleAllowedForTransition('payment_request', 'under_review', 'approved', 'admin')).toBe(true);
      expect(isRoleAllowedForTransition('payment_request', 'under_review', 'approved', 'staff')).toBe(false);
      expect(isRoleAllowedForTransition('payment_request', 'under_review', 'approved', 'guest')).toBe(false);
    });

    it('guest can submit proof', () => {
      expect(isRoleAllowedForTransition('payment_request', 'details_provided', 'proof_submitted', 'guest')).toBe(true);
    });

    it('admin can approve refunds', () => {
      expect(isRoleAllowedForTransition('refund', 'requested', 'approved', 'admin')).toBe(true);
      expect(isRoleAllowedForTransition('refund', 'requested', 'approved', 'guest')).toBe(false);
    });

    it('staff can complete check-in', () => {
      expect(isRoleAllowedForTransition('check_in', 'eligible', 'checked_in', 'staff')).toBe(true);
      expect(isRoleAllowedForTransition('check_in', 'eligible', 'checked_in', 'admin')).toBe(true);
      expect(isRoleAllowedForTransition('check_in', 'eligible', 'checked_in', 'guest')).toBe(false);
    });
  });

  describe('isRoleAllowedForTransition', () => {
    it('returns false for null/undefined role', () => {
      expect(isRoleAllowedForTransition('payment_request', 'under_review', 'approved', null)).toBe(false);
      expect(isRoleAllowedForTransition('payment_request', 'under_review', 'approved', undefined)).toBe(false);
    });

    it('returns false for undefined guard key', () => {
      expect(isRoleAllowedForTransition('unknown', 'a', 'b', 'admin')).toBe(false);
    });
  });
});


// ─── Audit Service ────────────────────────────────────────────────────────────

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock firebase-admin with factory that doesn't reference top-level variables
vi.mock('../../lib/server/firebase-admin.js', () => {
  let docIdCounter = 0;
  return {
    auth: {},
    firestore: {
      collection: () => ({
        doc: (id) => {
          const docId = id || `auto-id-${++docIdCounter}`;
          return { id: docId, set: vi.fn() };
        },
      }),
    },
  };
});

import { buildAuditEvent, writeAuditEvent, AUDIT_SCHEMA_VERSION } from '../../lib/server/services/audit.js';

describe('lib/server/services/audit', () => {
  const validActor = { uid: 'user-1', role: 'admin' };
  const validAction = 'payment.approve';
  const validTarget = { type: 'booking', id: 'BK-123' };
  const validOptions = {
    correlationId: 'corr-1',
    idempotencyKey: 'idem-1',
    before: { status: 'under_review' },
    after: { status: 'approved' },
  };

  describe('buildAuditEvent', () => {
    it('builds a valid audit event from server context', () => {
      const event = buildAuditEvent(validActor, validAction, validTarget, validOptions);
      expect(event.actorUid).toBe('user-1');
      expect(event.actorRole).toBe('admin');
      expect(event.action).toBe('payment.approve');
      expect(event.targetType).toBe('booking');
      expect(event.targetId).toBe('BK-123');
      expect(event.correlationId).toBe('corr-1');
      expect(event.idempotencyKey).toBe('idem-1');
      expect(event.before).toEqual({ status: 'under_review' });
      expect(event.after).toEqual({ status: 'approved' });
      expect(event.schemaVersion).toBe(AUDIT_SCHEMA_VERSION);
      expect(event.occurredAt).toBeDefined();
    });

    it('returns a frozen (immutable) object', () => {
      const event = buildAuditEvent(validActor, validAction, validTarget, validOptions);
      expect(Object.isFrozen(event)).toBe(true);
    });

    it('includes reason when provided', () => {
      const event = buildAuditEvent(validActor, validAction, validTarget, {
        ...validOptions,
        reason: 'Valid proof received',
      });
      expect(event.reason).toBe('Valid proof received');
    });

    it('omits optional fields when not provided', () => {
      const event = buildAuditEvent(validActor, validAction, validTarget, {
        correlationId: 'c-1',
      });
      expect(event.idempotencyKey).toBeUndefined();
      expect(event.reason).toBeUndefined();
      expect(event.before).toBeNull();
      expect(event.after).toBeNull();
    });

    it('throws for missing actor uid', () => {
      expect(() => buildAuditEvent({}, validAction, validTarget, validOptions))
        .toThrow('verified actor with uid');
      expect(() => buildAuditEvent(null, validAction, validTarget, validOptions))
        .toThrow('verified actor with uid');
    });

    it('throws for missing actor role', () => {
      expect(() => buildAuditEvent({ uid: 'u1' }, validAction, validTarget, validOptions))
        .toThrow('verified actor role');
    });

    it('throws for missing action', () => {
      expect(() => buildAuditEvent(validActor, '', validTarget, validOptions))
        .toThrow('requires an action');
    });

    it('throws for missing target type or id', () => {
      expect(() => buildAuditEvent(validActor, validAction, { type: 'x' }, validOptions))
        .toThrow('target id');
      expect(() => buildAuditEvent(validActor, validAction, { id: 'x' }, validOptions))
        .toThrow('target type');
    });

    it('throws for missing correlationId', () => {
      expect(() => buildAuditEvent(validActor, validAction, validTarget, {}))
        .toThrow('correlationId');
    });
  });

  describe('writeAuditEvent', () => {
    it('writes event to Firestore within transaction', () => {
      const mockTx = { set: vi.fn() };
      const event = buildAuditEvent(validActor, validAction, validTarget, validOptions);
      writeAuditEvent(mockTx, event);
      expect(mockTx.set).toHaveBeenCalledTimes(1);
      const [ref, data] = mockTx.set.mock.calls[0];
      expect(data.actorUid).toBe('user-1');
      expect(data.action).toBe('payment.approve');
    });

    it('throws for null transaction', () => {
      const event = buildAuditEvent(validActor, validAction, validTarget, validOptions);
      expect(() => writeAuditEvent(null, event)).toThrow('active Firestore transaction');
    });

    it('throws for invalid event', () => {
      const mockTx = { set: vi.fn() };
      expect(() => writeAuditEvent(mockTx, {})).toThrow('valid audit event');
      expect(() => writeAuditEvent(mockTx, { actorUid: 'u', action: 'a', targetType: 't', targetId: 'i' }))
        .toThrow('occurredAt and correlationId');
    });
  });
});

// ─── Outbox Service ───────────────────────────────────────────────────────────

import {
  OUTBOX_STATUSES,
  OUTBOX_STATUS_MACHINE,
  OUTBOX_NOTIFICATION_TYPES,
  createOutboxEntry,
  isValidOutboxTransition,
} from '../../lib/server/services/outbox.js';

describe('lib/server/services/outbox', () => {
  describe('OUTBOX_STATUSES', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(OUTBOX_STATUSES)).toBe(true);
    });

    it('contains the documented statuses', () => {
      expect(OUTBOX_STATUSES.PENDING).toBe('pending');
      expect(OUTBOX_STATUSES.PROCESSING).toBe('processing');
      expect(OUTBOX_STATUSES.DELIVERED).toBe('delivered');
      expect(OUTBOX_STATUSES.RETRYABLE_FAILED).toBe('retryable_failed');
      expect(OUTBOX_STATUSES.TERMINAL_FAILED).toBe('terminal_failed');
    });
  });

  describe('OUTBOX_STATUS_MACHINE', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(OUTBOX_STATUS_MACHINE)).toBe(true);
    });

    it('defines the documented transitions', () => {
      expect(isValidOutboxTransition('pending', 'processing')).toBe(true);
      expect(isValidOutboxTransition('processing', 'delivered')).toBe(true);
      expect(isValidOutboxTransition('processing', 'retryable_failed')).toBe(true);
      expect(isValidOutboxTransition('processing', 'terminal_failed')).toBe(true);
      expect(isValidOutboxTransition('retryable_failed', 'processing')).toBe(true);
    });

    it('delivered and terminal_failed are terminal', () => {
      expect(OUTBOX_STATUS_MACHINE.delivered).toEqual([]);
      expect(OUTBOX_STATUS_MACHINE.terminal_failed).toEqual([]);
    });

    it('rejects invalid transitions', () => {
      expect(isValidOutboxTransition('pending', 'delivered')).toBe(false);
      expect(isValidOutboxTransition('delivered', 'processing')).toBe(false);
      expect(isValidOutboxTransition('terminal_failed', 'pending')).toBe(false);
    });
  });

  describe('isValidOutboxTransition', () => {
    it('returns false for null/undefined inputs', () => {
      expect(isValidOutboxTransition(null, 'processing')).toBe(false);
      expect(isValidOutboxTransition('pending', null)).toBe(false);
    });

    it('returns false for unknown states', () => {
      expect(isValidOutboxTransition('unknown', 'processing')).toBe(false);
    });
  });

  describe('OUTBOX_NOTIFICATION_TYPES', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(OUTBOX_NOTIFICATION_TYPES)).toBe(true);
    });

    it('contains documented notification types', () => {
      expect(OUTBOX_NOTIFICATION_TYPES).toContain('reservation_created');
      expect(OUTBOX_NOTIFICATION_TYPES).toContain('reservation_cancelled');
      expect(OUTBOX_NOTIFICATION_TYPES).toContain('payment_approved');
      expect(OUTBOX_NOTIFICATION_TYPES).toContain('refund_approved');
      expect(OUTBOX_NOTIFICATION_TYPES).toContain('check_in_completed');
    });
  });

  describe('createOutboxEntry', () => {
    const mockTx = { set: vi.fn() };

    it('creates an outbox entry with required fields', () => {
      mockTx.set.mockClear();
      const id = createOutboxEntry(mockTx, {
        type: 'reservation_created',
        bookingId: 'BK-123',
        actorUid: 'user-1',
      });
      expect(mockTx.set).toHaveBeenCalledTimes(1);
      const [ref, data] = mockTx.set.mock.calls[0];
      expect(data.type).toBe('reservation_created');
      expect(data.bookingId).toBe('BK-123');
      expect(data.actorUid).toBe('user-1');
      expect(data.status).toBe('pending');
      expect(data.attempts).toBe(0);
      expect(data.maxAttempts).toBe(5);
      expect(data.schemaVersion).toBe(1);
      expect(data.createdAt).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('includes optional payload, correlationId, and idempotencyKey', () => {
      mockTx.set.mockClear();
      createOutboxEntry(mockTx, {
        type: 'payment_approved',
        bookingId: 'BK-456',
        actorUid: 'admin-1',
        payload: { amount: 5000 },
        correlationId: 'corr-2',
        idempotencyKey: 'idem-2',
      });
      const [, data] = mockTx.set.mock.calls[0];
      expect(data.payload).toEqual({ amount: 5000 });
      expect(data.correlationId).toBe('corr-2');
      expect(data.idempotencyKey).toBe('idem-2');
    });

    it('throws for null transaction', () => {
      expect(() => createOutboxEntry(null, {
        type: 'reservation_created',
        bookingId: 'BK-1',
        actorUid: 'u1',
      })).toThrow('active Firestore transaction');
    });

    it('throws for invalid notification type', () => {
      expect(() => createOutboxEntry(mockTx, {
        type: 'invalid_type',
        bookingId: 'BK-1',
        actorUid: 'u1',
      })).toThrow('Invalid outbox notification type');
    });

    it('throws for missing bookingId', () => {
      expect(() => createOutboxEntry(mockTx, {
        type: 'reservation_created',
        bookingId: '',
        actorUid: 'u1',
      })).toThrow('bookingId');
    });

    it('throws for missing actorUid', () => {
      expect(() => createOutboxEntry(mockTx, {
        type: 'reservation_created',
        bookingId: 'BK-1',
        actorUid: '',
      })).toThrow('actorUid');
    });

    it('sets null payload when non-object payload provided', () => {
      mockTx.set.mockClear();
      createOutboxEntry(mockTx, {
        type: 'reservation_created',
        bookingId: 'BK-1',
        actorUid: 'u1',
        payload: 'not-an-object',
      });
      const [, data] = mockTx.set.mock.calls[0];
      expect(data.payload).toBeNull();
    });
  });
});
