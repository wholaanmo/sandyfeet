// tests/integration/critical-workflows.integration.test.js
// Integration tests for critical business workflows: payment transitions, refunds,
// idempotent retries, check-in consumption, and reservation creation atomicity.
// Mocks Firebase Admin SDK. Requirements: 7.1–7.11, 14.11, 15.9, 15.10

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { createTestActor } from '../fixtures/deterministic.js';

// ─── Mock Firebase Admin SDK and server-only ────────────────────────────────

vi.mock('server-only', () => ({}));

// Shared mock state for Firestore
const mockFirestoreData = new Map();
let transactionSets = [];
let transactionUpdates = [];
let autoDocCounter = 0;

const makeMockDocRef = (id) => ({
  id,
  get: vi.fn(async () => {
    const data = mockFirestoreData.get(id);
    return { exists: !!data, data: () => data, ref: makeMockDocRef(id) };
  }),
  set: vi.fn(async (data) => { mockFirestoreData.set(id, data); }),
  update: vi.fn(async (updates) => {
    const existing = mockFirestoreData.get(id) || {};
    mockFirestoreData.set(id, { ...existing, ...updates });
  }),
});

/**
 * Build a query chain mock that filters mockFirestoreData by field matches.
 * Supports chained .where() calls and returns matching docs.
 */
function buildQueryMock(filters = []) {
  const chain = {
    where: vi.fn((field, _op, value) => buildQueryMock([...filters, { field, value }])),
    limit: vi.fn(() => chain),
    get: vi.fn(async () => {
      const results = [];
      for (const [id, data] of mockFirestoreData.entries()) {
        if (!data || typeof data !== 'object') continue;
        const matches = filters.every((f) => data[f.field] === f.value);
        if (matches) {
          results.push({ id, data: () => data, ref: makeMockDocRef(id) });
        }
      }
      return { empty: results.length === 0, docs: results };
    }),
  };
  return chain;
}

const mockCollection = vi.fn((collectionName) => ({
  doc: vi.fn((id) => {
    const docId = id || `auto-${collectionName}-${++autoDocCounter}`;
    return makeMockDocRef(docId);
  }),
  where: vi.fn((field, op, value) => buildQueryMock([{ field, value }])),
}));

const mockFirestore = {
  collection: mockCollection,
  runTransaction: vi.fn(async (fn) => {
    transactionSets = [];
    transactionUpdates = [];
    const transaction = {
      get: vi.fn(async (refOrQuery) => {
        // Handle query-style gets (for transaction.get(query))
        if (refOrQuery && typeof refOrQuery.where === 'function') {
          // It's a query object — execute it
          return refOrQuery.get();
        }
        // It's a doc ref
        const data = mockFirestoreData.get(refOrQuery.id);
        return { exists: !!data, data: () => data, ref: refOrQuery };
      }),
      getAll: vi.fn(async (...refs) => {
        return refs.map((ref) => {
          const data = mockFirestoreData.get(ref.id);
          return { exists: !!data, data: () => data, ref };
        });
      }),
      set: vi.fn((ref, data) => {
        transactionSets.push({ id: ref.id, data });
        mockFirestoreData.set(ref.id, data);
      }),
      update: vi.fn((ref, updates) => {
        transactionUpdates.push({ id: ref.id, updates });
        const existing = mockFirestoreData.get(ref.id) || {};
        mockFirestoreData.set(ref.id, { ...existing, ...updates });
      }),
    };
    return fn(transaction);
  }),
};

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {},
  firestore: mockFirestore,
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
    APP_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

// ─── Test Actors ────────────────────────────────────────────────────────────

const adminActor = createTestActor(0, 'admin');
const staffActor = createTestActor(1, 'staff');
const guestActor = createTestActor(2, 'guest');

// ─── Helpers ────────────────────────────────────────────────────────────────

function seedBooking(id, ownerUid, overrides = {}) {
  mockFirestoreData.set(id, {
    id,
    ownerUid,
    type: 'room',
    status: 'confirmed',
    paymentRequestState: 'requested',
    paymentStatus: 'unpaid',
    refundState: 'not_requested',
    checkIn: '2025-07-01',
    checkOut: '2025-07-03',
    nights: 2,
    roomCount: 1,
    guestCounts: { adults: 2, children: 0, seniors: 0, total: 2 },
    totals: { total: 500000, downPayment: 250000, balance: 250000 },
    childIds: [],
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    schemaVersion: 1,
    ...overrides,
  });
}

function computeIdempotencyDocId(key, actorUid) {
  const keyDigest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `${actorUid}_${keyDigest}`;
}

function seedIdempotencyRecord(key, actorUid, command, result) {
  const commandHash = crypto.createHash('sha256')
    .update(JSON.stringify(command, Object.keys(command).sort()))
    .digest('hex');
  const docId = computeIdempotencyDocId(key, actorUid);
  mockFirestoreData.set(docId, {
    scope: 'payment',
    actorUid,
    commandDigest: commandHash,
    status: 'completed',
    resultCode: 'success',
    resultProjection: result,
    businessEntityIds: [result.bookingId],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    schemaVersion: 1,
  });
}

function getWrittenAuditEvents() {
  return transactionSets.filter((w) =>
    w.data && w.data.action && w.data.actorUid && w.data.targetId
  );
}

function getWrittenOutboxRecords() {
  return transactionSets.filter((w) =>
    w.data && w.data.type && w.data.status === 'pending' && w.data.bookingId
  );
}

function getIdempotencyWrites() {
  return transactionSets.filter((w) =>
    w.data && w.data.scope && w.data.resultProjection
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Payment Transition: Valid state → writes audit + outbox atomically
// ═══════════════════════════════════════════════════════════════════════════════

describe('Payment Transition: Valid State Change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('writes booking update, audit event, and outbox atomically', async () => {
    const { recordPaymentTransition } = await import(
      '../../lib/server/services/payment.js'
    );

    const bookingId = 'bk-payment-valid';
    seedBooking(bookingId, guestActor.uid, {
      paymentRequestState: 'requested',
    });

    const result = await recordPaymentTransition(adminActor, bookingId, {
      transition: 'details_provided',
      idempotencyKey: 'idem-pay-valid-1',
    });

    // Result contains the transition info
    expect(result.bookingId).toBe(bookingId);
    expect(result.newPaymentRequestState).toBe('details_provided');

    // Verify booking was updated
    const bookingUpdates = transactionUpdates.filter((u) => u.id === bookingId);
    expect(bookingUpdates.length).toBe(1);
    expect(bookingUpdates[0].updates.paymentRequestState).toBe('details_provided');

    // Verify audit event was written atomically
    const audits = getWrittenAuditEvents();
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const audit = audits[0].data;
    expect(audit.action).toBe('payment.transition');
    expect(audit.targetId).toBe(bookingId);
    expect(audit.actorUid).toBe(adminActor.uid);
    expect(audit.before.paymentRequestState).toBe('requested');
    expect(audit.after.paymentRequestState).toBe('details_provided');
    expect(audit.occurredAt).toBeTruthy();
    expect(audit.schemaVersion).toBe(1);

    // Verify outbox notification was written atomically
    const outbox = getWrittenOutboxRecords();
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0].data.type).toBe('payment_transition');
    expect(outbox[0].data.bookingId).toBe(bookingId);
    expect(outbox[0].data.status).toBe('pending');

    // Verify idempotency record was written
    expect(getIdempotencyWrites().length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Payment Transition: Invalid state → CONFLICT, no writes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Payment Transition: Invalid State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('rejects forbidden transition with CONFLICT and no writes', async () => {
    const { recordPaymentTransition } = await import(
      '../../lib/server/services/payment.js'
    );

    const bookingId = 'bk-payment-invalid';
    // 'approved' is terminal — no outgoing transitions
    seedBooking(bookingId, guestActor.uid, {
      paymentRequestState: 'approved',
    });

    await expect(
      recordPaymentTransition(adminActor, bookingId, {
        transition: 'rejected',
        idempotencyKey: 'idem-pay-invalid-1',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Booking data unchanged (transaction rolled back)
    const data = mockFirestoreData.get(bookingId);
    expect(data.paymentRequestState).toBe('approved');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Refund: Ineligible reservation → rejects WITHOUT notification outbox
// ═══════════════════════════════════════════════════════════════════════════════

describe('Refund: Ineligible Reservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('rejects refund for non-cancelled booking without outbox', async () => {
    const { processRefund } = await import(
      '../../lib/server/services/payment.js'
    );

    const bookingId = 'bk-refund-not-cancelled';
    seedBooking(bookingId, guestActor.uid, {
      status: 'confirmed', // NOT cancelled → ineligible
      paymentStatus: 'paid',
      refundState: 'not_requested',
    });

    await expect(
      processRefund(adminActor, bookingId, {
        transition: 'requested',
        idempotencyKey: 'idem-refund-inelig-1',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // NO outbox written (suppressed for ineligible refunds)
    expect(getWrittenOutboxRecords().length).toBe(0);
    // NO audit written (transaction rolled back)
    expect(getWrittenAuditEvents().length).toBe(0);
  });

  it('rejects refund for unpaid cancelled booking without outbox', async () => {
    const { processRefund } = await import(
      '../../lib/server/services/payment.js'
    );

    const bookingId = 'bk-refund-unpaid';
    seedBooking(bookingId, guestActor.uid, {
      status: 'cancelled',
      paymentStatus: 'unpaid', // Nothing paid → ineligible
      refundState: 'not_requested',
    });

    await expect(
      processRefund(adminActor, bookingId, {
        transition: 'requested',
        idempotencyKey: 'idem-refund-inelig-2',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(getWrittenOutboxRecords().length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Refund: Eligible reservation → writes refund state + audit + outbox
// ═══════════════════════════════════════════════════════════════════════════════

describe('Refund: Eligible Reservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('processes eligible refund atomically with correct amounts', async () => {
    const { processRefund } = await import(
      '../../lib/server/services/payment.js'
    );

    const bookingId = 'bk-refund-eligible';
    seedBooking(bookingId, guestActor.uid, {
      status: 'cancelled',
      paymentStatus: 'paid',
      refundState: 'not_requested',
      totals: { total: 400000, downPayment: 200000, balance: 0 },
    });

    const result = await processRefund(adminActor, bookingId, {
      transition: 'requested',
      reasonCode: 'guest_request',
      idempotencyKey: 'idem-refund-elig-1',
    });

    expect(result.bookingId).toBe(bookingId);
    expect(result.newRefundState).toBe('requested');
    // Refund amount = paidCentavos = total - balance = 400000 - 0 = 400000
    expect(result.refundAmountCentavos).toBe(400000);

    // Booking refund state updated
    const updates = transactionUpdates.filter((u) => u.id === bookingId);
    expect(updates.length).toBe(1);
    expect(updates[0].updates.refundState).toBe('requested');
    expect(updates[0].updates.refundAmountCentavos).toBe(400000);

    // Audit event written
    const audits = getWrittenAuditEvents();
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].data.action).toBe('refund.transition');
    expect(audits[0].data.targetId).toBe(bookingId);
    expect(audits[0].data.after.refundAmountCentavos).toBe(400000);

    // Outbox notification written (eligible refund gets notification)
    const outbox = getWrittenOutboxRecords();
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0].data.type).toBe('refund_transition');
    expect(outbox[0].data.refundAmountCentavos).toBe(400000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Idempotent payment retry → returns stored result, no duplicate effect
// ═══════════════════════════════════════════════════════════════════════════════

describe('Idempotent Payment Retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('returns stored result on retry with no duplicate writes', async () => {
    const { recordPaymentTransition } = await import(
      '../../lib/server/services/payment.js'
    );

    const bookingId = 'bk-idempotent';
    seedBooking(bookingId, guestActor.uid, {
      paymentRequestState: 'requested',
    });

    // Seed an existing idempotency record for this exact command
    const command = { bookingId, transition: 'details_provided', evidence: null };
    const storedResult = {
      bookingId,
      action: 'payment_transition',
      previousPaymentRequestState: 'requested',
      newPaymentRequestState: 'details_provided',
      paymentStatus: 'unpaid',
      balances: {
        totalCentavos: 500000,
        paidCentavos: 250000,
        balanceCentavos: 250000,
      },
    };
    seedIdempotencyRecord(
      'idem-pay-retry-1', adminActor.uid, command, storedResult
    );

    const result = await recordPaymentTransition(adminActor, bookingId, {
      transition: 'details_provided',
      idempotencyKey: 'idem-pay-retry-1',
    });

    // Returns stored result with idempotent flag
    expect(result.idempotent).toBe(true);
    expect(result.bookingId).toBe(bookingId);
    expect(result.newPaymentRequestState).toBe('details_provided');

    // No new booking updates (no duplicate effect)
    const updates = transactionUpdates.filter((u) => u.id === bookingId);
    expect(updates.length).toBe(0);

    // No new audit event
    expect(getWrittenAuditEvents().length).toBe(0);

    // No new outbox notification
    expect(getWrittenOutboxRecords().length).toBe(0);

    // No new idempotency record
    expect(getIdempotencyWrites().length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Check-in: Valid consumption transitions parent + children + audit
// ═══════════════════════════════════════════════════════════════════════════════

describe('Check-in: Valid Consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('transitions parent and child bookings to checked_in with audit', async () => {
    const { consumeCheckInCredential } = await import(
      '../../lib/server/services/checkin.js'
    );

    const bookingId = 'bk-checkin-valid';
    const childId1 = 'ch-checkin-1';
    const childId2 = 'ch-checkin-2';

    // Seed parent booking
    seedBooking(bookingId, guestActor.uid, {
      status: 'confirmed',
      bookingId: bookingId,
      reservationStatus: 'confirmed',
    });

    // Seed child bookings with parentBookingId reference
    mockFirestoreData.set(childId1, {
      id: childId1,
      bookingId: childId1,
      parentBookingId: bookingId,
      ownerUid: guestActor.uid,
      status: 'confirmed',
      reservationStatus: 'confirmed',
    });
    mockFirestoreData.set(childId2, {
      id: childId2,
      bookingId: childId2,
      parentBookingId: bookingId,
      ownerUid: guestActor.uid,
      status: 'confirmed',
      reservationStatus: 'confirmed',
    });

    // Mock credential validation and consumption for check-in
    const credentialModule = await import(
      '../../lib/server/services/credential.js'
    );

    vi.spyOn(credentialModule, 'validateCredential').mockResolvedValue({
      id: 'cred-checkin-1',
      record: {
        purpose: 'check-in',
        subject: bookingId,
        consumed: false,
        actorUid: staffActor.uid,
      },
    });

    // consumeWithMutation executes the mutation inside our mock transaction
    vi.spyOn(credentialModule, 'consumeWithMutation').mockImplementation(
      async (_credentialId, mutationFn) => {
        return mockFirestore.runTransaction(async (transaction) => {
          return mutationFn(transaction);
        });
      }
    );

    const result = await consumeCheckInCredential(staffActor, 'valid-token');

    expect(result.bookingId).toBe(bookingId);
    expect(result.status).toBe('checked_in');

    // Verify parent and children were all transitioned
    const statusUpdates = transactionUpdates.filter(
      (u) => u.updates.status === 'checked_in'
    );
    expect(statusUpdates.length).toBeGreaterThanOrEqual(3); // parent + 2 children

    // Verify audit event was written
    const audits = getWrittenAuditEvents();
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].data.action).toBe('check-in.consume');
    expect(audits[0].data.after.status).toBe('checked_in');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Check-in: Already consumed credential → INVALID_CREDENTIAL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Check-in: Already Consumed Credential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('rejects already-consumed credential with INVALID_CREDENTIAL', async () => {
    const { consumeCheckInCredential } = await import(
      '../../lib/server/services/checkin.js'
    );

    const credentialModule = await import(
      '../../lib/server/services/credential.js'
    );

    // validateCredential succeeds (it finds the record)
    vi.spyOn(credentialModule, 'validateCredential').mockResolvedValue({
      id: 'cred-consumed',
      record: {
        purpose: 'check-in',
        subject: 'bk-already-used',
        consumed: false,
        actorUid: staffActor.uid,
      },
    });

    // consumeWithMutation rejects because credential was already consumed
    vi.spyOn(credentialModule, 'consumeWithMutation').mockRejectedValue(
      (() => {
        const err = new Error('invalid_or_expired');
        err.code = 'INVALID_CREDENTIAL';
        err.name = 'CredentialInvalidError';
        return err;
      })()
    );

    await expect(
      consumeCheckInCredential(staffActor, 'already-consumed-token')
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });

    // No booking updates should have occurred
    expect(transactionUpdates.length).toBe(0);
    // No audit events
    expect(getWrittenAuditEvents().length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Reservation Create: writes booking + ledgers + audit + outbox atomically
// ═══════════════════════════════════════════════════════════════════════════════

describe('Reservation Create: Atomic Writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionSets = [];
    transactionUpdates = [];
    autoDocCounter = 0;
  });

  it('creates booking with parent, children, audit, and outbox atomically', async () => {
    const { createReservation } = await import(
      '../../lib/server/services/reservation.js'
    );

    // Seed inventory for room type
    mockFirestoreData.set('deluxe', {
      priceCentavos: 250000,
      capacity: 4,
      name: 'Deluxe Room',
    });
    // Seed pricing settings
    mockFirestoreData.set('pricing', {
      downPaymentPercent: 50,
    });

    const command = {
      checkIn: '2025-08-01',
      checkOut: '2025-08-03',
      rooms: [{ roomId: 'deluxe', quantity: 2 }],
      adults: 2,
      children: 0,
      seniors: 0,
      paymentMethod: 'gcash',
      isExclusiveResort: false,
    };

    const result = await createReservation(guestActor, command, 'idem-res-1');

    // Result should contain booking ID and expected fields
    expect(result.bookingId).toBeTruthy();
    expect(result.status).toBe('pending_payment');
    expect(result.type).toBe('room');
    expect(result.nights).toBe(2);
    expect(result.roomCount).toBe(2);
    expect(result.childIds.length).toBe(2);
    expect(result.totals).toBeTruthy();
    expect(result.totals.total).toBeGreaterThan(0);

    // Verify parent booking was written
    const parentSets = transactionSets.filter(
      (s) => s.data && s.data.id === result.bookingId && s.data.status === 'pending_payment'
    );
    expect(parentSets.length).toBe(1);
    expect(parentSets[0].data.ownerUid).toBe(guestActor.uid);
    expect(parentSets[0].data.childIds.length).toBe(2);

    // Verify child bookings were written
    const childSets = transactionSets.filter(
      (s) => s.data && s.data.parentBookingId === result.bookingId
    );
    expect(childSets.length).toBe(2);
    for (const child of childSets) {
      expect(child.data.ownerUid).toBe(guestActor.uid);
      expect(child.data.inventoryId).toBe('deluxe');
      expect(child.data.occupancyStatus).toBe('pending_payment');
    }

    // Verify audit event was written
    const audits = getWrittenAuditEvents();
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const audit = audits[0].data;
    expect(audit.action).toBe('reservation.create');
    expect(audit.targetId).toBe(result.bookingId);
    expect(audit.actorUid).toBe(guestActor.uid);
    expect(audit.after.status).toBe('pending_payment');

    // Verify outbox notification was written
    const outbox = getWrittenOutboxRecords();
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0].data.type).toBe('reservation_created');
    expect(outbox[0].data.bookingId).toBe(result.bookingId);

    // Verify idempotency record was written
    expect(getIdempotencyWrites().length).toBe(1);
    const idemRecord = getIdempotencyWrites()[0].data;
    expect(idemRecord.scope).toBe('reservation');
    expect(idemRecord.actorUid).toBe(guestActor.uid);
    expect(idemRecord.businessEntityIds).toContain(result.bookingId);
  });
});
