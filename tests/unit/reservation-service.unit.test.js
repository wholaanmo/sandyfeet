// tests/unit/reservation-service.unit.test.js
// Unit tests for lib/server/services/reservation.js, ledger.js, and idempotency.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock firebase-admin
const mockTransactionGet = vi.fn();
const mockTransactionGetAll = vi.fn();
const mockTransactionSet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();
const mockDocGet = vi.fn();

let docIdCounter = 0;

const mockFirestore = {
  collection: (name) => ({
    doc: (id) => {
      const docId = id || `auto-id-${++docIdCounter}`;
      return {
        id: docId,
        get: mockDocGet,
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

// ─── Ledger Service Tests ────────────────────────────────────────────────────

describe('lib/server/services/ledger', () => {
  let computeLedgerKeys, computeLedgerDeltas, readLedgers, writeLedgerDeltas, verifyCapacity;

  beforeEach(async () => {
    vi.clearAllMocks();
    docIdCounter = 0;
    const mod = await import('../../lib/server/services/ledger.js');
    computeLedgerKeys = mod.computeLedgerKeys;
    computeLedgerDeltas = mod.computeLedgerDeltas;
    readLedgers = mod.readLedgers;
    writeLedgerDeltas = mod.writeLedgerDeltas;
    verifyCapacity = mod.verifyCapacity;
  });

  describe('computeLedgerKeys', () => {
    it('returns sorted keys for a room stay: {roomId}_{date}', () => {
      const keys = computeLedgerKeys({
        checkIn: '2025-06-10',
        checkOut: '2025-06-12',
        rooms: [{ roomId: 'deluxe', quantity: 1 }],
      });
      expect(keys).toEqual(['deluxe_2025-06-10', 'deluxe_2025-06-11']);
    });

    it('produces keys for each room type × each date', () => {
      const keys = computeLedgerKeys({
        checkIn: '2025-06-10',
        checkOut: '2025-06-12',
        rooms: [
          { roomId: 'deluxe', quantity: 2 },
          { roomId: 'standard', quantity: 1 },
        ],
      });
      expect(keys).toContain('deluxe_2025-06-10');
      expect(keys).toContain('deluxe_2025-06-11');
      expect(keys).toContain('standard_2025-06-10');
      expect(keys).toContain('standard_2025-06-11');
      expect(keys.length).toBe(4);
    });

    it('returns daytour key for day-tour commands', () => {
      const keys = computeLedgerKeys({
        isDayTour: true,
        selectedDate: '2025-06-15',
      });
      expect(keys).toEqual(['daytour_2025-06-15']);
    });

    it('returns empty for null command', () => {
      expect(computeLedgerKeys(null)).toEqual([]);
    });

    it('returns empty for missing dates', () => {
      expect(computeLedgerKeys({ rooms: [{ roomId: 'a' }] })).toEqual([]);
    });

    it('returns empty for missing rooms', () => {
      expect(computeLedgerKeys({ checkIn: '2025-06-10', checkOut: '2025-06-12' })).toEqual([]);
    });
  });

  describe('computeLedgerDeltas', () => {
    it('returns room demand per key for room stays', () => {
      const deltas = computeLedgerDeltas({
        checkIn: '2025-06-10',
        checkOut: '2025-06-12',
        rooms: [{ roomId: 'deluxe', quantity: 2 }],
      });
      expect(deltas.get('deluxe_2025-06-10')).toBe(2);
      expect(deltas.get('deluxe_2025-06-11')).toBe(2);
    });

    it('returns total guest count for day tours', () => {
      const deltas = computeLedgerDeltas({
        isDayTour: true,
        selectedDate: '2025-06-15',
        adults: 4,
        children: 2,
        seniors: 1,
      });
      expect(deltas.get('daytour_2025-06-15')).toBe(7);
    });

    it('returns empty map for null', () => {
      expect(computeLedgerDeltas(null).size).toBe(0);
    });
  });

  describe('readLedgers', () => {
    it('returns ledger state from transaction reads', async () => {
      const mockSnaps = [
        { exists: true, data: () => ({ reserved: 3, capacity: 10, exclusiveLockGroupId: null }) },
        { exists: false },
      ];
      mockTransactionGetAll.mockResolvedValue(mockSnaps);
      const tx = { getAll: mockTransactionGetAll };

      const result = await readLedgers(tx, ['deluxe_2025-06-10', 'deluxe_2025-06-11']);
      expect(result.get('deluxe_2025-06-10')).toEqual({ reserved: 3, capacity: 10, exclusiveLockGroupId: null });
      expect(result.get('deluxe_2025-06-11')).toEqual({ reserved: 0, capacity: 0, exclusiveLockGroupId: null });
    });

    it('returns empty map for empty keys', async () => {
      const tx = { getAll: mockTransactionGetAll };
      const result = await readLedgers(tx, []);
      expect(result.size).toBe(0);
    });
  });

  describe('verifyCapacity', () => {
    it('passes when capacity is available', () => {
      const state = new Map([
        ['deluxe_2025-06-10', { reserved: 3, capacity: 10, exclusiveLockGroupId: null }],
      ]);
      const deltas = new Map([['deluxe_2025-06-10', 2]]);
      expect(() => verifyCapacity(state, deltas)).not.toThrow();
    });

    it('throws CAPACITY_EXCEEDED when demand exceeds capacity', () => {
      const state = new Map([
        ['deluxe_2025-06-10', { reserved: 9, capacity: 10, exclusiveLockGroupId: null }],
      ]);
      const deltas = new Map([['deluxe_2025-06-10', 2]]);
      expect(() => verifyCapacity(state, deltas)).toThrow();
      try {
        verifyCapacity(state, deltas);
      } catch (err) {
        expect(err.code).toBe('CAPACITY_EXCEEDED');
      }
    });

    it('allows releases (negative deltas) without capacity check', () => {
      const state = new Map([
        ['deluxe_2025-06-10', { reserved: 10, capacity: 10, exclusiveLockGroupId: null }],
      ]);
      const deltas = new Map([['deluxe_2025-06-10', -2]]);
      expect(() => verifyCapacity(state, deltas)).not.toThrow();
    });

    it('rejects when another group has exclusive lock', () => {
      const state = new Map([
        ['deluxe_2025-06-10', { reserved: 0, capacity: 10, exclusiveLockGroupId: 'other-group' }],
      ]);
      const deltas = new Map([['deluxe_2025-06-10', 1]]);
      expect(() => verifyCapacity(state, deltas)).toThrow();
      try {
        verifyCapacity(state, deltas);
      } catch (err) {
        expect(err.code).toBe('CAPACITY_EXCEEDED');
      }
    });

    it('allows the same group to use its own exclusive lock', () => {
      const state = new Map([
        ['deluxe_2025-06-10', { reserved: 5, capacity: 10, exclusiveLockGroupId: 'my-group' }],
      ]);
      const deltas = new Map([['deluxe_2025-06-10', 2]]);
      expect(() => verifyCapacity(state, deltas, { exclusiveLockGroupId: 'my-group' })).not.toThrow();
    });

    it('passes for unlimited capacity (capacity=0)', () => {
      const state = new Map([
        ['deluxe_2025-06-10', { reserved: 999, capacity: 0, exclusiveLockGroupId: null }],
      ]);
      const deltas = new Map([['deluxe_2025-06-10', 5]]);
      expect(() => verifyCapacity(state, deltas)).not.toThrow();
    });
  });
});

// ─── Idempotency Service Tests ───────────────────────────────────────────────

describe('lib/server/services/idempotency', () => {
  let computeCommandHash, computeIdempotencyDocId, checkIdempotency, checkIdempotencyInTransaction, recordIdempotency;

  beforeEach(async () => {
    vi.clearAllMocks();
    docIdCounter = 0;
    const mod = await import('../../lib/server/services/idempotency.js');
    computeCommandHash = mod.computeCommandHash;
    computeIdempotencyDocId = mod.computeIdempotencyDocId;
    checkIdempotency = mod.checkIdempotency;
    checkIdempotencyInTransaction = mod.checkIdempotencyInTransaction;
    recordIdempotency = mod.recordIdempotency;
  });

  describe('computeCommandHash', () => {
    it('produces a deterministic SHA-256 hex hash', () => {
      const hash = computeCommandHash({ checkIn: '2025-06-10', rooms: [{ roomId: 'a' }] });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces same hash for same object regardless of key order', () => {
      const h1 = computeCommandHash({ a: 1, b: 2 });
      const h2 = computeCommandHash({ b: 2, a: 1 });
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different commands', () => {
      const h1 = computeCommandHash({ checkIn: '2025-06-10' });
      const h2 = computeCommandHash({ checkIn: '2025-06-11' });
      expect(h1).not.toBe(h2);
    });

    it('handles null/undefined command', () => {
      const h = computeCommandHash(null);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('computeIdempotencyDocId', () => {
    it('combines actor UID and key digest', () => {
      const docId = computeIdempotencyDocId('my-key', 'user123');
      expect(docId).toContain('user123_');
      expect(docId.length).toBeGreaterThan('user123_'.length);
    });

    it('is deterministic', () => {
      const id1 = computeIdempotencyDocId('key-a', 'uid-1');
      const id2 = computeIdempotencyDocId('key-a', 'uid-1');
      expect(id1).toBe(id2);
    });

    it('differs for different keys', () => {
      const id1 = computeIdempotencyDocId('key-a', 'uid-1');
      const id2 = computeIdempotencyDocId('key-b', 'uid-1');
      expect(id1).not.toBe(id2);
    });
  });

  describe('checkIdempotency', () => {
    it('returns { exists: false } when no record exists', async () => {
      mockDocGet.mockResolvedValue({ exists: false });
      const result = await checkIdempotency('new-key', 'user1', 'hash123');
      expect(result.exists).toBe(false);
    });

    it('returns stored result when same command hash matches', async () => {
      const storedResult = { bookingId: 'BK-123' };
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          commandDigest: 'hash123',
          resultProjection: storedResult,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }),
      });
      const result = await checkIdempotency('key-1', 'user1', 'hash123');
      expect(result.exists).toBe(true);
      expect(result.result).toEqual(storedResult);
    });

    it('throws CONFLICT when command hash differs', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          commandDigest: 'different-hash',
          resultProjection: {},
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }),
      });
      await expect(checkIdempotency('key-1', 'user1', 'hash123'))
        .rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('treats expired records as non-existent', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          commandDigest: 'hash123',
          resultProjection: {},
          expiresAt: new Date(Date.now() - 60000).toISOString(),
        }),
      });
      const result = await checkIdempotency('key-1', 'user1', 'hash123');
      expect(result.exists).toBe(false);
    });
  });

  describe('checkIdempotencyInTransaction', () => {
    it('returns { exists: false } for new records', async () => {
      const tx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
      };
      const result = await checkIdempotencyInTransaction(tx, 'key', 'user1', 'hash');
      expect(result.exists).toBe(false);
      expect(result.docRef).toBeDefined();
    });

    it('returns stored result for matching command', async () => {
      const tx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            commandDigest: 'myhash',
            resultProjection: { id: 'BK-1' },
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        }),
      };
      const result = await checkIdempotencyInTransaction(tx, 'key', 'user1', 'myhash');
      expect(result.exists).toBe(true);
      expect(result.result).toEqual({ id: 'BK-1' });
    });
  });

  describe('recordIdempotency', () => {
    it('calls transaction.set with proper record structure', () => {
      const tx = { set: vi.fn() };
      recordIdempotency(tx, 'key-1', 'user1', 'hash123', { bookingId: 'BK-1' }, {
        scope: 'reservation',
        businessEntityIds: ['BK-1', 'CH-1'],
      });
      expect(tx.set).toHaveBeenCalledTimes(1);
      const [ref, record] = tx.set.mock.calls[0];
      expect(record.actorUid).toBe('user1');
      expect(record.commandDigest).toBe('hash123');
      expect(record.scope).toBe('reservation');
      expect(record.resultProjection).toEqual({ bookingId: 'BK-1' });
      expect(record.businessEntityIds).toEqual(['BK-1', 'CH-1']);
      expect(record.schemaVersion).toBe(1);
    });
  });
});

// ─── Reservation Service Tests ───────────────────────────────────────────────

describe('lib/server/services/reservation', () => {
  let createReservation, editReservation, cancelReservation;

  const validActor = { uid: 'user123', role: 'guest', status: 'active', emailVerified: true };
  const validRoomCommand = {
    checkIn: '2025-06-10',
    checkOut: '2025-06-12',
    rooms: [{ roomId: 'deluxe', quantity: 1 }],
    adults: 2,
    children: 0,
    seniors: 0,
    paymentMethod: 'gcash',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    docIdCounter = 0;

    // Setup default transaction behavior
    mockRunTransaction.mockImplementation(async (fn) => {
      const tx = {
        get: vi.fn(),
        getAll: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
      };

      // Default: no idempotency record
      tx.get.mockResolvedValue({ exists: false });
      // Default: inventory docs
      tx.get.mockImplementation((ref) => {
        if (ref && ref.id === 'deluxe') {
          return Promise.resolve({
            exists: true,
            data: () => ({ priceCentavos: 500000, capacity: 10, name: 'Deluxe Room' }),
          });
        }
        if (ref && ref.id === 'pricing') {
          return Promise.resolve({
            exists: true,
            data: () => ({ downPaymentPercent: 50 }),
          });
        }
        return Promise.resolve({ exists: false });
      });
      // Default: empty ledgers
      tx.getAll.mockResolvedValue([
        { exists: false },
        { exists: false },
      ]);

      return fn(tx);
    });

    const mod = await import('../../lib/server/services/reservation.js');
    createReservation = mod.createReservation;
    editReservation = mod.editReservation;
    cancelReservation = mod.cancelReservation;
  });

  describe('createReservation — validation', () => {
    it('rejects unauthenticated actor', async () => {
      await expect(createReservation(null, validRoomCommand, 'key-1'))
        .rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects inactive account', async () => {
      const actor = { ...validActor, status: 'inactive' };
      await expect(createReservation(actor, validRoomCommand, 'key-1'))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects null command', async () => {
      await expect(createReservation(validActor, null, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects missing idempotency key', async () => {
      await expect(createReservation(validActor, validRoomCommand, null))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects missing dates for room stays', async () => {
      const cmd = { ...validRoomCommand, checkIn: undefined, checkOut: undefined };
      await expect(createReservation(validActor, cmd, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects check-out before check-in', async () => {
      const cmd = { ...validRoomCommand, checkIn: '2025-06-15', checkOut: '2025-06-10' };
      await expect(createReservation(validActor, cmd, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects stay exceeding max nights', async () => {
      const cmd = { ...validRoomCommand, checkIn: '2025-01-01', checkOut: '2025-03-01' };
      await expect(createReservation(validActor, cmd, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects empty rooms array', async () => {
      const cmd = { ...validRoomCommand, rooms: [] };
      await expect(createReservation(validActor, cmd, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects rooms without roomId', async () => {
      const cmd = { ...validRoomCommand, rooms: [{ quantity: 2 }] };
      await expect(createReservation(validActor, cmd, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects day tour with no guests', async () => {
      const cmd = { isDayTour: true, selectedDate: '2025-06-15', adults: 0, children: 0, seniors: 0 };
      await expect(createReservation(validActor, cmd, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects day tour without selectedDate', async () => {
      const cmd = { isDayTour: true, adults: 3 };
      await expect(createReservation(validActor, cmd, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('createReservation — transactional behavior', () => {
    it('creates parent and child bookings in one transaction', async () => {
      const result = await createReservation(validActor, validRoomCommand, 'idem-key-1');
      expect(result).toBeDefined();
      expect(result.bookingId).toBeDefined();
      expect(result.totals).toBeDefined();
      expect(result.totals.total).toBe(1000000); // 500000 × 1 × 2 nights
      expect(result.totals.downPayment).toBe(500000);
      expect(result.totals.balance).toBe(500000);
      expect(result.nights).toBe(2);
      expect(result.roomCount).toBe(1);
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns idempotent result on retry with same key/command', async () => {
      const storedResult = { bookingId: 'BK-EXISTING', status: 'pending_payment' };
      mockRunTransaction.mockImplementation(async (fn) => {
        const tx = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              commandDigest: expect.any(String),
              resultProjection: storedResult,
              expiresAt: new Date(Date.now() + 60000).toISOString(),
            }),
          }),
          getAll: vi.fn().mockResolvedValue([]),
          set: vi.fn(),
          update: vi.fn(),
        };
        // Make the idempotency check return existing
        const { computeCommandHash } = await import('../../lib/server/services/idempotency.js');
        const hash = computeCommandHash(validRoomCommand);
        tx.get.mockResolvedValue({
          exists: true,
          data: () => ({
            commandDigest: hash,
            resultProjection: storedResult,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        });
        return fn(tx);
      });

      const result = await createReservation(validActor, validRoomCommand, 'idem-key-1');
      expect(result.idempotent).toBe(true);
      expect(result.bookingId).toBe('BK-EXISTING');
    });
  });

  describe('cancelReservation — validation', () => {
    it('rejects unauthenticated actor', async () => {
      await expect(cancelReservation(null, 'BK-1', 'key-1'))
        .rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects missing booking ID', async () => {
      await expect(cancelReservation(validActor, '', 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects missing idempotency key', async () => {
      await expect(cancelReservation(validActor, 'BK-1', null))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('editReservation — validation', () => {
    it('rejects unauthenticated actor', async () => {
      await expect(editReservation(null, 'BK-1', {}, 'key-1'))
        .rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects missing booking ID', async () => {
      await expect(editReservation(validActor, '', {}, 'key-1'))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects missing idempotency key', async () => {
      await expect(editReservation(validActor, 'BK-1', {}, null))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });
});
