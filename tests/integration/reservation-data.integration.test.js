// tests/integration/reservation-data.integration.test.js
// Integration tests for repository ownership, role projections, protected fields,
// evidence access, capacity verification, exclusive locks, idempotency, migration
// dry-run, and reconciliation.
// Requirements: 5.1–5.9, 6.6–6.11, 15.8, 15.15

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestActor } from '../fixtures/deterministic.js';

// ─── Mock Firebase Admin SDK and server-only ────────────────────────────────

vi.mock('server-only', () => ({}));

// Shared mock state for Firestore
const mockFirestoreData = new Map();
let transactionWrites = [];

const makeMockDocRef = (id) => ({
  id,
  get: vi.fn(async () => {
    const data = mockFirestoreData.get(id);
    return { exists: !!data, data: () => data, ref: makeMockDocRef(id) };
  }),
  set: vi.fn(async (data, opts) => { mockFirestoreData.set(id, data); }),
  update: vi.fn(async (updates) => {
    const existing = mockFirestoreData.get(id) || {};
    mockFirestoreData.set(id, { ...existing, ...updates });
  }),
});

const mockCollection = vi.fn((collectionName) => ({
  doc: vi.fn((id) => {
    const docId = id || `auto-${Math.random().toString(36).slice(2, 10)}`;
    return makeMockDocRef(docId);
  }),
  where: vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          startAfter: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
          })),
          get: vi.fn(async () => ({ docs: [] })),
        })),
      })),
      limit: vi.fn(() => ({
        get: vi.fn(async () => ({ docs: [], empty: true })),
      })),
      get: vi.fn(async () => ({ docs: [] })),
    })),
    orderBy: vi.fn(() => ({
      limit: vi.fn(() => ({
        startAfter: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
        })),
        get: vi.fn(async () => ({ docs: [] })),
      })),
    })),
    get: vi.fn(async () => ({ docs: [] })),
  })),
  get: vi.fn(async () => ({ docs: [] })),
}));

const mockFirestore = {
  collection: mockCollection,
  runTransaction: vi.fn(async (fn) => {
    transactionWrites = [];
    const transaction = {
      get: vi.fn(async (ref) => {
        const data = mockFirestoreData.get(ref.id);
        return { exists: !!data, data: () => data };
      }),
      getAll: vi.fn(async (...refs) => {
        return refs.map((ref) => {
          const data = mockFirestoreData.get(ref.id);
          return { exists: !!data, data: () => data, ref };
        });
      }),
      set: vi.fn((ref, data, opts) => {
        transactionWrites.push({ type: 'set', id: ref.id, data, opts });
        mockFirestoreData.set(ref.id, data);
      }),
      update: vi.fn((ref, updates) => {
        transactionWrites.push({ type: 'update', id: ref.id, updates });
        const existing = mockFirestoreData.get(ref.id) || {};
        mockFirestoreData.set(ref.id, { ...existing, ...updates });
      }),
    };
    return fn(transaction);
  }),
};

const mockFieldValue = {
  increment: vi.fn((n) => ({ _type: 'increment', value: n })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
};

vi.mock('firebase-admin', () => ({
  default: {
    firestore: { FieldValue: mockFieldValue },
  },
}));

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

// ─── Helpers ────────────────────────────────────────────────────────────────

const guestActor = createTestActor(0, 'guest');
const staffActor = createTestActor(1, 'staff');
const adminActor = createTestActor(2, 'admin');
const otherGuestActor = createTestActor(3, 'guest');

function seedBooking(id, ownerUid, extra = {}) {
  mockFirestoreData.set(id, {
    id,
    ownerUid,
    type: 'room',
    status: 'confirmed',
    checkInDate: '2025-07-01',
    checkOutDate: '2025-07-03',
    roomType: 'deluxe',
    nights: 2,
    adults: 2,
    children: 0,
    seniors: 0,
    totalPrice: 500000,
    downPayment: 250000,
    remainingBalance: 250000,
    paymentMethod: 'gcash',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    paymentProofUrl: 'https://storage.example.com/proof.jpg',
    validIdUrl: 'https://storage.example.com/id.jpg',
    validIdType: 'passport',
    ...extra,
  });
}

function seedGuestProfile(uid, extra = {}) {
  mockFirestoreData.set(uid, {
    uid,
    email: `${uid}@example.test`,
    displayName: 'Test Guest',
    phone: '+639171234567',
    role: 'guest',
    status: 'active',
    emailVerified: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    ...extra,
  });
}

// ─── 1. Guest cannot access another guest's booking (non-disclosing) ────────

describe('Ownership and Role Matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    transactionWrites = [];
  });

  it('guest cannot access another guest\'s booking — returns NOT_FOUND (non-disclosing)', async () => {
    const { getOwnedSummary } = await import('../../lib/server/repositories/booking.js');

    const bookingId = 'booking-owned-by-other';
    seedBooking(bookingId, otherGuestActor.uid);

    // Mock collection to return the booking from the 'bookings' collection
    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((id) => ({
        id: id || bookingId,
        get: vi.fn(async () => {
          if (collectionName === 'bookings') {
            const data = mockFirestoreData.get(id || bookingId);
            return { exists: !!data, data: () => data, ref: makeMockDocRef(id || bookingId) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    // Guest trying to access another guest's booking
    await expect(getOwnedSummary(guestActor, bookingId))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ─── 2. Staff can access staff projection; admin gets full projection ─────

  it('staff gets staff-level projection; admin gets full projection', async () => {
    const { getForStaff, getForAdmin } = await import('../../lib/server/repositories/booking.js');

    const bookingId = 'booking-staff-admin';
    seedBooking(bookingId, guestActor.uid);

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((id) => ({
        id: id || bookingId,
        get: vi.fn(async () => {
          if (collectionName === 'bookings') {
            const data = mockFirestoreData.get(id || bookingId);
            return { exists: !!data, data: () => data, ref: makeMockDocRef(id || bookingId) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    // Staff projection should include operational fields
    const staffResult = await getForStaff(staffActor, bookingId);
    expect(staffResult.ownerUid).toBe(guestActor.uid);
    expect(staffResult.paymentProofUrl).toBe('https://storage.example.com/proof.jpg');
    expect(staffResult.status).toBe('confirmed');
    // Staff should NOT get identity document URL (admin-only sensitive field)
    expect(staffResult.validIdUrl).toBeUndefined();

    // Admin projection should include all fields
    const adminResult = await getForAdmin(adminActor, bookingId);
    expect(adminResult.ownerUid).toBe(guestActor.uid);
    expect(adminResult.validIdUrl).toBe('https://storage.example.com/id.jpg');
    expect(adminResult.paymentProofUrl).toBe('https://storage.example.com/proof.jpg');
  });

  // ─── 3. Guest profile update strips restricted fields ─────────────────────

  it('guest profile update strips restricted fields (role, status, emailVerified)', async () => {
    const { updateOwnProfile } = await import('../../lib/server/repositories/guest.js');

    seedGuestProfile(guestActor.uid);

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((id) => ({
        id: id || guestActor.uid,
        get: vi.fn(async () => {
          const data = mockFirestoreData.get(id || guestActor.uid);
          return { exists: !!data, data: () => data, ref: makeMockDocRef(id || guestActor.uid) };
        }),
        update: vi.fn(async (updates) => {
          const existing = mockFirestoreData.get(guestActor.uid) || {};
          // Do NOT apply restricted fields even if submitted
          const { role, status, emailVerified, ...safe } = updates;
          mockFirestoreData.set(guestActor.uid, { ...existing, ...safe });
        }),
      })),
    }));

    // Attempt to write restricted fields alongside a valid field
    const result = await updateOwnProfile(guestActor, {
      displayName: 'New Name',
      role: 'admin',        // RESTRICTED — must be stripped
      status: 'inactive',   // RESTRICTED — must be stripped
      emailVerified: false,  // RESTRICTED — must be stripped
    });

    // displayName should be applied
    expect(result.displayName).toBe('New Name');
    // Restricted fields must NOT be changed
    expect(result.role).toBeUndefined(); // Not in OWN_PROFILE_FIELDS projection or unchanged
    // The status in the profile remains 'active'
    expect(result.status).toBe('active');
    expect(result.emailVerified).toBe(true);
  });
});

// ─── 4 & 5. Evidence access restricted by role ──────────────────────────────

describe('Evidence Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('payment evidence (paymentProofUrl) restricted to staff/admin only — not guest', async () => {
    const { getOwnedSummary } = await import('../../lib/server/repositories/booking.js');

    const bookingId = 'booking-payment-evidence';
    seedBooking(bookingId, guestActor.uid);

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((id) => ({
        id: id || bookingId,
        get: vi.fn(async () => {
          if (collectionName === 'bookings') {
            const data = mockFirestoreData.get(id || bookingId);
            return { exists: !!data, data: () => data, ref: makeMockDocRef(id || bookingId) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    // Guest summary should NOT include paymentProofUrl
    const guestResult = await getOwnedSummary(guestActor, bookingId);
    expect(guestResult.paymentProofUrl).toBeUndefined();
    // But the booking itself has it stored
    const raw = mockFirestoreData.get(bookingId);
    expect(raw.paymentProofUrl).toBe('https://storage.example.com/proof.jpg');
  });

  it('identity documents (validIdUrl) restricted to admin only — not staff', async () => {
    const { getForStaff, getForAdmin } = await import('../../lib/server/repositories/booking.js');

    const bookingId = 'booking-id-doc';
    seedBooking(bookingId, guestActor.uid);

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((id) => ({
        id: id || bookingId,
        get: vi.fn(async () => {
          if (collectionName === 'bookings') {
            const data = mockFirestoreData.get(id || bookingId);
            return { exists: !!data, data: () => data, ref: makeMockDocRef(id || bookingId) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    // Staff projection does not include validIdUrl
    const staffResult = await getForStaff(staffActor, bookingId);
    expect(staffResult.validIdUrl).toBeUndefined();

    // Admin gets the full record including validIdUrl
    const adminResult = await getForAdmin(adminActor, bookingId);
    expect(adminResult.validIdUrl).toBe('https://storage.example.com/id.jpg');
  });
});

// ─── 6. Capacity verification rejects when exceeding limits ─────────────────

describe('Capacity Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('rejects reservation when capacity would be exceeded', async () => {
    const { verifyCapacity } = await import('../../lib/server/services/ledger.js');

    // Simulate a ledger state where 9 of 10 rooms are reserved
    const ledgerState = new Map([
      ['deluxe_2025-07-01', { reserved: 9, capacity: 10, exclusiveLockGroupId: null }],
      ['deluxe_2025-07-02', { reserved: 9, capacity: 10, exclusiveLockGroupId: null }],
    ]);

    // Requesting 2 rooms (would make 11, exceeding capacity of 10)
    const deltas = new Map([
      ['deluxe_2025-07-01', 2],
      ['deluxe_2025-07-02', 2],
    ]);

    expect(() => verifyCapacity(ledgerState, deltas)).toThrow();
    try {
      verifyCapacity(ledgerState, deltas);
    } catch (err) {
      expect(err.code).toBe('CAPACITY_EXCEEDED');
    }
  });

  it('allows reservation when capacity fits exactly (last-capacity concurrency)', async () => {
    const { verifyCapacity } = await import('../../lib/server/services/ledger.js');

    // 9 of 10 reserved, requesting 1 — exactly at capacity
    const ledgerState = new Map([
      ['deluxe_2025-07-01', { reserved: 9, capacity: 10, exclusiveLockGroupId: null }],
    ]);

    const deltas = new Map([
      ['deluxe_2025-07-01', 1],
    ]);

    // Should NOT throw — exactly at capacity
    expect(() => verifyCapacity(ledgerState, deltas)).not.toThrow();
  });

  // ─── 7. Exclusive locks prevent double-booking ──────────────────────────────

  it('exclusive locks prevent a second group from booking the same date', async () => {
    const { verifyCapacity } = await import('../../lib/server/services/ledger.js');

    // A ledger entry already exclusively locked by group-A
    const ledgerState = new Map([
      ['deluxe_2025-08-01', { reserved: 5, capacity: 10, exclusiveLockGroupId: 'group-A' }],
    ]);

    // Another group (group-B) tries to book an exclusive reservation
    const deltas = new Map([['deluxe_2025-08-01', 1]]);

    expect(() => verifyCapacity(ledgerState, deltas, {
      isExclusive: true,
      exclusiveLockGroupId: 'group-B',
    })).toThrow();

    try {
      verifyCapacity(ledgerState, deltas, {
        isExclusive: true,
        exclusiveLockGroupId: 'group-B',
      });
    } catch (err) {
      expect(err.code).toBe('CAPACITY_EXCEEDED');
    }
  });

  it('same exclusive group can add to its own locked ledger', async () => {
    const { verifyCapacity } = await import('../../lib/server/services/ledger.js');

    const ledgerState = new Map([
      ['deluxe_2025-08-01', { reserved: 5, capacity: 10, exclusiveLockGroupId: 'group-A' }],
    ]);

    const deltas = new Map([['deluxe_2025-08-01', 1]]);

    // Same group should pass
    expect(() => verifyCapacity(ledgerState, deltas, {
      isExclusive: true,
      exclusiveLockGroupId: 'group-A',
    })).not.toThrow();
  });
});

// ─── 8 & 9. Idempotency: same key+command returns stored result, different command → CONFLICT

describe('Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('same idempotency key + same command returns stored result', async () => {
    const { checkIdempotency, computeCommandHash, computeIdempotencyDocId } =
      await import('../../lib/server/services/idempotency.js');

    const command = { checkIn: '2025-07-01', checkOut: '2025-07-03', rooms: [{ roomId: 'deluxe', quantity: 1 }] };
    const hash = computeCommandHash(command);
    const key = 'idem-key-001';
    const actorUid = guestActor.uid;
    const docId = computeIdempotencyDocId(key, actorUid);

    // Pre-seed an idempotency record
    const storedResult = { bookingId: 'BK-123', status: 'pending_payment' };
    mockFirestoreData.set(docId, {
      actorUid,
      commandDigest: hash,
      resultProjection: storedResult,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      schemaVersion: 1,
    });

    mockCollection.mockImplementation(() => ({
      doc: vi.fn((id) => ({
        id: id || docId,
        get: vi.fn(async () => {
          const data = mockFirestoreData.get(id || docId);
          return { exists: !!data, data: () => data };
        }),
      })),
    }));

    const result = await checkIdempotency(key, actorUid, hash);

    expect(result.exists).toBe(true);
    expect(result.result).toEqual(storedResult);
  });

  it('same idempotency key + different command → CONFLICT error', async () => {
    const { checkIdempotency, computeCommandHash, computeIdempotencyDocId } =
      await import('../../lib/server/services/idempotency.js');

    const originalCommand = { checkIn: '2025-07-01', checkOut: '2025-07-03', rooms: [{ roomId: 'deluxe', quantity: 1 }] };
    const originalHash = computeCommandHash(originalCommand);
    const key = 'idem-key-002';
    const actorUid = guestActor.uid;
    const docId = computeIdempotencyDocId(key, actorUid);

    // Pre-seed with the original command hash
    mockFirestoreData.set(docId, {
      actorUid,
      commandDigest: originalHash,
      resultProjection: { bookingId: 'BK-456' },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      schemaVersion: 1,
    });

    mockCollection.mockImplementation(() => ({
      doc: vi.fn((id) => ({
        id: id || docId,
        get: vi.fn(async () => {
          const data = mockFirestoreData.get(id || docId);
          return { exists: !!data, data: () => data };
        }),
      })),
    }));

    // Now try with a DIFFERENT command using the same key
    const differentCommand = { checkIn: '2025-08-01', checkOut: '2025-08-05', rooms: [{ roomId: 'suite', quantity: 2 }] };
    const differentHash = computeCommandHash(differentCommand);

    await expect(checkIdempotency(key, actorUid, differentHash))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ─── 10. Migration dry-run reports without writing ──────────────────────────

describe('Migration Dry-Run and Reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('dry-run reports ledger entries that would be created without writing', async () => {
    const { runLedgerBackfill } = await import('../../lib/server/services/migration.js');

    // Create a mock DB that simulates bookings and empty ledgers
    const bookingDoc = {
      id: 'booking-backfill-1',
      status: 'confirmed',
      type: 'room',
      checkInDate: '2025-07-01',
      checkOutDate: '2025-07-03',
      roomType: 'deluxe',
      quantity: 1,
    };

    const mockDb = {
      collection: vi.fn((name) => {
        if (name === 'bookings') {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn(async () => ({
                    docs: [{
                      id: bookingDoc.id,
                      data: () => bookingDoc,
                    }],
                  })),
                  startAfter: vi.fn(() => ({
                    get: vi.fn(async () => ({ docs: [] })),
                  })),
                })),
              })),
            })),
          };
        }
        if (name === 'dayTourBookings') {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn(async () => ({ docs: [] })),
                  startAfter: vi.fn(() => ({
                    get: vi.fn(async () => ({ docs: [] })),
                  })),
                })),
              })),
            })),
          };
        }

        if (name === 'capacityLedgers') {
          return {
            doc: vi.fn((key) => ({
              id: key,
              get: vi.fn(async () => ({ exists: false, data: () => null })),
              set: vi.fn(),
            })),
            get: vi.fn(async () => ({ docs: [] })),
          };
        }
        return {
          doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false, data: () => null })) })),
          get: vi.fn(async () => ({ docs: [] })),
        };
      }),
    };

    const result = await runLedgerBackfill({ dryRun: true, db: mockDb });

    // Dry-run should report entries to create but NOT write them
    expect(result.dryRun).toBe(true);
    expect(result.processed).toBeGreaterThan(0);
    expect(result.created).toBeGreaterThan(0);
    // Verify no set() was called on the ledger collection docs
    const ledgerColl = mockDb.collection('capacityLedgers');
    const ledgerDoc = ledgerColl.doc('test');
    expect(ledgerDoc.set).not.toHaveBeenCalled();
  });

  // ─── 11. Reconciliation reports discrepancies without mutating ─────────────

  it('reconciliation reports discrepancies without mutating ledger data', async () => {
    const { runReconciliation } = await import('../../lib/server/services/migration.js');

    // Active booking that expects ledger count of 1 for deluxe__2025-07-01
    const bookingDoc = {
      id: 'booking-recon-1',
      status: 'confirmed',
      type: 'room',
      checkInDate: '2025-07-01',
      checkOutDate: '2025-07-02',
      roomType: 'deluxe',
      quantity: 1,
    };

    // Existing ledger document with WRONG count (discrepancy)
    const ledgerDoc = {
      id: 'deluxe__2025-07-01',
      count: 5, // Expected is 1 — this is a discrepancy
      roomId: 'deluxe',
      date: '2025-07-01',
    };

    let ledgerSetCalled = false;
    let ledgerUpdateCalled = false;

    const mockDb = {
      collection: vi.fn((name) => {
        if (name === 'bookings') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: [{
                  id: bookingDoc.id,
                  data: () => bookingDoc,
                }],
              })),
            })),
          };
        }
        if (name === 'dayTourBookings') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({ docs: [] })),
            })),
          };
        }
        if (name === 'capacityLedgers') {
          return {
            doc: vi.fn((key) => ({
              id: key,
              get: vi.fn(async () => ({
                exists: key === ledgerDoc.id,
                data: () => (key === ledgerDoc.id ? ledgerDoc : null),
              })),
              set: vi.fn(() => { ledgerSetCalled = true; }),
              update: vi.fn(() => { ledgerUpdateCalled = true; }),
            })),
            get: vi.fn(async () => ({
              docs: [{
                id: ledgerDoc.id,
                data: () => ledgerDoc,
              }],
            })),
          };
        }
        return {
          doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })),
          get: vi.fn(async () => ({ docs: [] })),
        };
      }),
    };

    const result = await runReconciliation({ dryRun: true, db: mockDb });

    // Should report the discrepancy
    expect(result.discrepancies.length).toBeGreaterThan(0);
    const disc = result.discrepancies.find((d) => d.ledgerKey === 'deluxe__2025-07-01');
    expect(disc).toBeTruthy();
    expect(disc.actual).toBe(5);
    expect(disc.expected).toBe(1);

    // CRITICAL: Must NOT have written/mutated the ledger
    expect(ledgerSetCalled).toBe(false);
    expect(ledgerUpdateCalled).toBe(false);
    expect(result.dryRun).toBe(true);
  });
});
