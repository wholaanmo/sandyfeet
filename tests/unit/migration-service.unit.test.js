// tests/unit/migration-service.unit.test.js
// Unit tests for ledger migration and reconciliation safeguards.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock firebase-admin (migration service accepts db as a parameter, so this is minimal)
vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {},
  firestore: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) },
}));

import {
  MIGRATION_SCHEMA_VERSION,
  BATCH_WRITE_BUDGET,
  LEDGER_COLLECTION,
  ledgerKey,
  dayTourLedgerKey,
  computeExpectedLedgerEntries,
  runLedgerBackfill,
  runReconciliation,
} from '../../lib/server/services/migration.js';

import {
  getReadMode,
  setReadMode,
  isCanonicalLedgerAvailable,
  readWithLegacyFallback,
  rollbackToLegacyReads,
  restoreDualReads,
} from '../../lib/server/services/migration-adapter.js';

// ─── Mock Firestore ──────────────────────────────────────────────────────────

/**
 * In-memory Firestore mock that supports:
 * - collection().doc().get()
 * - collection().doc().set()
 * - collection().where().orderBy().limit().startAfter().get()
 */
function createMockFirestore(initialData = {}) {
  const store = {};

  // Deep copy initial data into store
  for (const [col, docs] of Object.entries(initialData)) {
    store[col] = {};
    for (const [id, data] of Object.entries(docs)) {
      store[col][id] = { ...data };
    }
  }

  function collection(name) {
    if (!store[name]) store[name] = {};

    return {
      doc(id) {
        return {
          get() {
            const data = store[name]?.[id];
            return Promise.resolve({
              exists: !!data,
              id,
              data: () => (data ? { ...data } : undefined),
              ref: { id, path: `${name}/${id}` },
            });
          },
          set(newData) {
            store[name][id] = { ...newData };
            return Promise.resolve();
          },
        };
      },
      where(field, op, value) {
        return {
          orderBy() { return this; },
          limit() { return this; },
          startAfter() { return this; },
          get() {
            const docs = Object.entries(store[name] || {})
              .filter(([, data]) => {
                if (op === 'in') return Array.isArray(value) && value.includes(data[field]);
                if (op === '==') return data[field] === value;
                return false;
              })
              .map(([id, data]) => ({
                id,
                exists: true,
                data: () => ({ ...data }),
                ref: { id, path: `${name}/${id}` },
              }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          },
        };
      },
      get() {
        const docs = Object.entries(store[name] || {})
          .map(([id, data]) => ({
            id,
            exists: true,
            data: () => ({ ...data }),
            ref: { id, path: `${name}/${id}` },
          }));
        return Promise.resolve({ docs, empty: docs.length === 0 });
      },
    };
  }

  return { collection, _store: store };
}

// ─── Migration Constants ─────────────────────────────────────────────────────

describe('migration constants', () => {
  it('MIGRATION_SCHEMA_VERSION is a positive integer', () => {
    expect(MIGRATION_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(MIGRATION_SCHEMA_VERSION)).toBe(true);
  });

  it('BATCH_WRITE_BUDGET is 400', () => {
    expect(BATCH_WRITE_BUDGET).toBe(400);
  });

  it('LEDGER_COLLECTION is capacityLedgers', () => {
    expect(LEDGER_COLLECTION).toBe('capacityLedgers');
  });
});

// ─── Ledger Key Computation ──────────────────────────────────────────────────

describe('ledgerKey', () => {
  it('produces deterministic room+date keys', () => {
    expect(ledgerKey('deluxe', '2025-06-10')).toBe('deluxe__2025-06-10');
  });

  it('returns empty string for missing roomId', () => {
    expect(ledgerKey('', '2025-06-10')).toBe('');
    expect(ledgerKey(null, '2025-06-10')).toBe('');
  });

  it('returns empty string for missing date', () => {
    expect(ledgerKey('deluxe', '')).toBe('');
    expect(ledgerKey('deluxe', null)).toBe('');
  });
});

describe('dayTourLedgerKey', () => {
  it('produces deterministic day-tour keys', () => {
    expect(dayTourLedgerKey('2025-06-10')).toBe('daytour__2025-06-10');
  });

  it('returns empty string for missing date', () => {
    expect(dayTourLedgerKey('')).toBe('');
    expect(dayTourLedgerKey(null)).toBe('');
  });
});

// ─── computeExpectedLedgerEntries ────────────────────────────────────────────

describe('computeExpectedLedgerEntries', () => {
  it('returns empty for null booking', () => {
    expect(computeExpectedLedgerEntries(null)).toEqual([]);
  });

  it('returns empty for non-active status', () => {
    const booking = { status: 'cancelled', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-12' };
    expect(computeExpectedLedgerEntries(booking)).toEqual([]);
  });

  it('computes entries for a single-room confirmed booking', () => {
    const booking = {
      status: 'confirmed',
      roomType: 'deluxe',
      checkInDate: '2025-06-10',
      checkOutDate: '2025-06-12',
    };
    const entries = computeExpectedLedgerEntries(booking);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      key: 'deluxe__2025-06-10',
      roomId: 'deluxe',
      date: '2025-06-10',
      count: 1,
      isDayTour: false,
    });
    expect(entries[1]).toEqual({
      key: 'deluxe__2025-06-11',
      roomId: 'deluxe',
      date: '2025-06-11',
      count: 1,
      isDayTour: false,
    });
  });

  it('computes entries for multi-room booking with rooms array', () => {
    const booking = {
      status: 'checked_in',
      rooms: [{ roomId: 'deluxe', quantity: 2 }, { roomId: 'standard', quantity: 1 }],
      checkInDate: '2025-06-10',
      checkOutDate: '2025-06-11',
    };
    const entries = computeExpectedLedgerEntries(booking);
    // 2 room types × 1 night = 2 entries
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.roomId === 'deluxe').count).toBe(2);
    expect(entries.find(e => e.roomId === 'standard').count).toBe(1);
  });

  it('computes entries for day-tour booking', () => {
    const booking = {
      status: 'confirmed',
      type: 'day_tour',
      tourDate: '2025-06-10',
      adults: 3,
      children: 2,
      seniors: 1,
    };
    const entries = computeExpectedLedgerEntries(booking);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      key: 'daytour__2025-06-10',
      roomId: null,
      date: '2025-06-10',
      count: 6,
      isDayTour: true,
    });
  });

  it('handles legacy roomTypesArray field', () => {
    const booking = {
      status: 'pending_payment',
      roomTypesArray: ['deluxe', 'deluxe', 'standard'],
      checkInDate: '2025-06-10',
      checkOutDate: '2025-06-11',
    };
    const entries = computeExpectedLedgerEntries(booking);
    expect(entries.find(e => e.roomId === 'deluxe').count).toBe(2);
    expect(entries.find(e => e.roomId === 'standard').count).toBe(1);
  });

  it('returns empty for booking with no date info', () => {
    const booking = { status: 'confirmed', roomType: 'deluxe' };
    expect(computeExpectedLedgerEntries(booking)).toEqual([]);
  });
});

// ─── runLedgerBackfill ───────────────────────────────────────────────────────

describe('runLedgerBackfill', () => {
  it('dry-run reports without writing', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-12' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {},
    });

    const result = await runLedgerBackfill({ dryRun: true, db });

    expect(result.dryRun).toBe(true);
    expect(result.processed).toBe(1);
    expect(result.created).toBe(2); // 2 nights
    expect(result.skipped).toBe(0);
    expect(result.schemaVersion).toBe(MIGRATION_SCHEMA_VERSION);
    // Nothing actually written
    expect(Object.keys(db._store[LEDGER_COLLECTION])).toHaveLength(0);
  });

  it('backfill creates ledger documents with schema version', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'standard', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {},
    });

    const result = await runLedgerBackfill({ dryRun: false, db });

    expect(result.dryRun).toBe(false);
    expect(result.created).toBe(1);
    // Verify document was written with schema version
    const written = db._store[LEDGER_COLLECTION]['standard__2025-06-10'];
    expect(written).toBeDefined();
    expect(written._schemaVersion).toBe(MIGRATION_SCHEMA_VERSION);
    expect(written.count).toBe(1);
    expect(written.roomId).toBe('standard');
  });

  it('skips existing ledger documents and reports discrepancies', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {
        'deluxe__2025-06-10': { count: 5, roomId: 'deluxe', date: '2025-06-10' },
      },
    });

    const result = await runLedgerBackfill({ dryRun: false, db });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toEqual({
      bookingId: 'b1',
      key: 'deluxe__2025-06-10',
      expected: 1,
      actual: 5,
    });
  });

  it('returns checkpoint for resume', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {},
    });

    const result = await runLedgerBackfill({ dryRun: false, db });

    expect(result.checkpoint).toBe('b1');
  });

  it('handles day-tour bookings', async () => {
    const db = createMockFirestore({
      bookings: {},
      dayTourBookings: {
        dt1: { status: 'confirmed', type: 'day_tour', tourDate: '2025-06-10', adults: 2, children: 1, seniors: 0 },
      },
      [LEDGER_COLLECTION]: {},
    });

    const result = await runLedgerBackfill({ dryRun: false, db });

    expect(result.created).toBe(1);
    const written = db._store[LEDGER_COLLECTION]['daytour__2025-06-10'];
    expect(written).toBeDefined();
    expect(written.count).toBe(3);
    expect(written.isDayTour).toBe(true);
  });
});

// ─── runReconciliation ───────────────────────────────────────────────────────

describe('runReconciliation', () => {
  it('reports no discrepancies when ledgers match bookings', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {
        'deluxe__2025-06-10': { count: 1, roomId: 'deluxe', date: '2025-06-10' },
      },
    });

    const result = await runReconciliation({ dryRun: true, db });

    expect(result.checked).toBe(1);
    expect(result.discrepancies).toHaveLength(0);
    expect(result.schemaVersion).toBe(MIGRATION_SCHEMA_VERSION);
  });

  it('reports discrepancies when ledger count differs from computed', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {
        'deluxe__2025-06-10': { count: 3, roomId: 'deluxe', date: '2025-06-10' },
      },
    });

    const result = await runReconciliation({ dryRun: true, db });

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toEqual({
      ledgerKey: 'deluxe__2025-06-10',
      expected: 1,
      actual: 3,
    });
  });

  it('reports missing ledger documents', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {},
    });

    const result = await runReconciliation({ dryRun: true, db });

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toEqual({
      ledgerKey: 'deluxe__2025-06-10',
      expected: 1,
      actual: 0,
    });
  });

  it('never mutates data — reconciliation is read-only', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {
        'deluxe__2025-06-10': { count: 99, roomId: 'deluxe', date: '2025-06-10' },
      },
    });

    await runReconciliation({ dryRun: true, db });

    // Verify the ledger was NOT overwritten
    expect(db._store[LEDGER_COLLECTION]['deluxe__2025-06-10'].count).toBe(99);
  });

  it('aggregates counts from multiple bookings for same ledger', async () => {
    const db = createMockFirestore({
      bookings: {
        b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
        b2: { status: 'checked_in', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
      },
      dayTourBookings: {},
      [LEDGER_COLLECTION]: {
        'deluxe__2025-06-10': { count: 2, roomId: 'deluxe', date: '2025-06-10' },
      },
    });

    const result = await runReconciliation({ dryRun: true, db });

    expect(result.discrepancies).toHaveLength(0);
  });
});

// ─── Migration Adapter ───────────────────────────────────────────────────────

describe('migration-adapter', () => {
  beforeEach(() => {
    // Reset to default mode between tests
    setReadMode('dual');
  });

  describe('getReadMode / setReadMode', () => {
    it('defaults to dual mode', () => {
      expect(getReadMode()).toBe('dual');
    });

    it('allows setting to canonical', () => {
      setReadMode('canonical');
      expect(getReadMode()).toBe('canonical');
    });

    it('allows setting to legacy', () => {
      setReadMode('legacy');
      expect(getReadMode()).toBe('legacy');
    });

    it('throws for invalid mode', () => {
      expect(() => setReadMode('invalid')).toThrow();
    });
  });

  describe('isCanonicalLedgerAvailable', () => {
    it('returns true when ledger exists with correct schema version', async () => {
      const db = createMockFirestore({
        [LEDGER_COLLECTION]: {
          'deluxe__2025-06-10': { count: 1, _schemaVersion: MIGRATION_SCHEMA_VERSION },
        },
      });

      const result = await isCanonicalLedgerAvailable('deluxe', '2025-06-10', { db });
      expect(result).toBe(true);
    });

    it('returns false when ledger does not exist', async () => {
      const db = createMockFirestore({ [LEDGER_COLLECTION]: {} });
      const result = await isCanonicalLedgerAvailable('deluxe', '2025-06-10', { db });
      expect(result).toBe(false);
    });

    it('returns false for missing roomId or date', async () => {
      const db = createMockFirestore({ [LEDGER_COLLECTION]: {} });
      expect(await isCanonicalLedgerAvailable('', '2025-06-10', { db })).toBe(false);
      expect(await isCanonicalLedgerAvailable('deluxe', '', { db })).toBe(false);
    });
  });

  describe('readWithLegacyFallback', () => {
    it('returns canonical data when ledger exists in dual mode', async () => {
      const db = createMockFirestore({
        bookings: {
          b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
        },
        dayTourBookings: {},
        [LEDGER_COLLECTION]: {
          'deluxe__2025-06-10': { count: 1, roomId: 'deluxe', date: '2025-06-10', _schemaVersion: 1 },
        },
      });

      const result = await readWithLegacyFallback('b1', { db });
      expect(result.source).toBe('canonical');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].count).toBe(1);
    });

    it('falls back to legacy when ledger missing in dual mode', async () => {
      const db = createMockFirestore({
        bookings: {
          b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
        },
        dayTourBookings: {},
        [LEDGER_COLLECTION]: {},
      });

      const result = await readWithLegacyFallback('b1', { db });
      expect(result.source).toBe('legacy');
      expect(result.entries).toHaveLength(1);
    });

    it('returns not_found for missing booking', async () => {
      const db = createMockFirestore({
        bookings: {},
        dayTourBookings: {},
        [LEDGER_COLLECTION]: {},
      });

      const result = await readWithLegacyFallback('nonexistent', { db });
      expect(result.source).toBe('not_found');
      expect(result.entries).toHaveLength(0);
    });

    it('in legacy mode, always computes from booking data', async () => {
      setReadMode('legacy');
      const db = createMockFirestore({
        bookings: {
          b1: { status: 'confirmed', roomType: 'deluxe', checkInDate: '2025-06-10', checkOutDate: '2025-06-11' },
        },
        dayTourBookings: {},
        [LEDGER_COLLECTION]: {
          'deluxe__2025-06-10': { count: 99, roomId: 'deluxe', date: '2025-06-10' },
        },
      });

      const result = await readWithLegacyFallback('b1', { db });
      expect(result.source).toBe('legacy');
      expect(result.entries[0].count).toBe(1); // Computed, not the ledger value
    });
  });

  describe('rollbackToLegacyReads', () => {
    it('switches to legacy mode and preserves ledgers', () => {
      setReadMode('dual');
      const result = rollbackToLegacyReads();

      expect(result.previousMode).toBe('dual');
      expect(result.currentMode).toBe('legacy');
      expect(result.ledgersPreserved).toBe(true);
      expect(getReadMode()).toBe('legacy');
    });

    it('never restores client writes (ledgersPreserved is always true)', () => {
      setReadMode('canonical');
      const result = rollbackToLegacyReads();
      expect(result.ledgersPreserved).toBe(true);
    });
  });

  describe('restoreDualReads', () => {
    it('restores dual mode after rollback', () => {
      setReadMode('legacy');
      const result = restoreDualReads();

      expect(result.previousMode).toBe('legacy');
      expect(result.currentMode).toBe('dual');
      expect(getReadMode()).toBe('dual');
    });
  });
});
