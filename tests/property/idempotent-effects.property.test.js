// Property 22: Idempotent retries have one business effect
// Validates: Requirements 6.10, 7.4, 15.9

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock server-only (no-op)
vi.mock('server-only', () => ({}));

// Track Firestore operations to count business effects
const storedRecords = new Map();
const mockTransaction = {
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../lib/server/firebase-admin.js', () => {
  const mockCollection = (collectionName) => ({
    doc: (docId) => {
      const ref = {
        id: docId || 'auto-id-' + Math.random().toString(36).slice(2, 8),
        collection: collectionName,
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
      };
      return ref;
    },
  });

  return {
    firestore: {
      collection: mockCollection,
      runTransaction: vi.fn(),
    },
    auth: {},
  };
});

import {
  computeCommandHash,
  checkIdempotency,
  IDEMPOTENCY_COLLECTION,
} from '../../lib/server/services/idempotency.js';
import { firestore } from '../../lib/server/firebase-admin.js';

// --- Arbitraries ---

/** Generate a date string YYYY-MM-DD within a safe range */
const dateArb = fc.tuple(
  fc.integer({ min: 2025, max: 2026 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 }),
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const roomIdArb = fc.constantFrom('room-aa', 'room-bb', 'room-cc', 'room-deluxe', 'room-std');

const commandArb = fc.record({
  checkIn: dateArb,
  checkOut: dateArb,
  rooms: fc.array(
    fc.record({
      roomId: roomIdArb,
      quantity: fc.integer({ min: 1, max: 3 }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
  specialRequest: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
});

const actorUidArb = fc.string({ minLength: 4, maxLength: 12, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) })
  .map((s) => `uid-${s}`);
const idempotencyKeyArb = fc.string({ minLength: 6, maxLength: 16, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) })
  .map((s) => `idem-${s}`);

describe('Property 22: Idempotent retries have one business effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedRecords.clear();
  });

  it('computeCommandHash is deterministic: same input always produces same hash', () => {
    fc.assert(
      fc.property(commandArb, (command) => {
        const hash1 = computeCommandHash(command);
        const hash2 = computeCommandHash(command);

        expect(hash1).toBe(hash2);
        expect(typeof hash1).toBe('string');
        expect(hash1.length).toBe(64); // SHA-256 hex
      }),
      { numRuns: 100 },
    );
  });

  it('computeCommandHash produces different hashes for different inputs', () => {
    fc.assert(
      fc.property(commandArb, commandArb, (cmd1, cmd2) => {
        // Only test when commands are actually different
        const s1 = JSON.stringify(cmd1, Object.keys(cmd1).sort());
        const s2 = JSON.stringify(cmd2, Object.keys(cmd2).sort());
        fc.pre(s1 !== s2);

        const hash1 = computeCommandHash(cmd1);
        const hash2 = computeCommandHash(cmd2);

        expect(hash1).not.toBe(hash2);
      }),
      { numRuns: 100 },
    );
  });

  it('same key + same hash returns stored result without additional business effect', async () => {
    await fc.assert(
      fc.asyncProperty(
        actorUidArb,
        idempotencyKeyArb,
        commandArb,
        async (actorUid, key, command) => {
          vi.clearAllMocks();

          const commandHash = computeCommandHash(command);
          const storedResult = { bookingId: 'BK-STORED', status: 'pending_payment' };

          // Simulate existing idempotency record with matching hash
          const mockDocRef = { id: `${actorUid}_mock`, update: vi.fn() };
          firestore.collection = vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              ...mockDocRef,
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  commandDigest: commandHash,
                  resultProjection: storedResult,
                  expiresAt: new Date(Date.now() + 86400000).toISOString(),
                  scope: 'reservation',
                }),
              }),
            }),
          });

          const result = await checkIdempotency(key, actorUid, commandHash);

          // Should return stored result
          expect(result.exists).toBe(true);
          expect(result.result).toEqual(storedResult);

          // No new writes should have occurred (one business effect only)
          expect(mockDocRef.update).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('same key + different hash produces CONFLICT without business effect', async () => {
    await fc.assert(
      fc.asyncProperty(
        actorUidArb,
        idempotencyKeyArb,
        commandArb,
        commandArb,
        async (actorUid, key, cmd1, cmd2) => {
          // Ensure commands are actually different
          const hash1 = computeCommandHash(cmd1);
          const hash2 = computeCommandHash(cmd2);
          fc.pre(hash1 !== hash2);

          vi.clearAllMocks();

          // Simulate existing record with hash1 stored
          const mockDocRef = { id: `${actorUid}_mock`, update: vi.fn(), set: vi.fn() };
          firestore.collection = vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              ...mockDocRef,
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  commandDigest: hash1,
                  resultProjection: { bookingId: 'BK-ORIGINAL' },
                  expiresAt: new Date(Date.now() + 86400000).toISOString(),
                  scope: 'reservation',
                }),
              }),
            }),
          });

          // Attempt with hash2 (different command, same key) → CONFLICT
          try {
            await checkIdempotency(key, actorUid, hash2);
            expect.fail('Expected CONFLICT error to be thrown');
          } catch (err) {
            expect(err.code).toBe('CONFLICT');
            expect(err.message).toContain('different command');
          }

          // No writes should have occurred
          expect(mockDocRef.set).not.toHaveBeenCalled();
          expect(mockDocRef.update).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('computeCommandHash is order-independent for object key ordering', () => {
    fc.assert(
      fc.property(commandArb, (command) => {
        // Create a copy with reversed key order
        const keys = Object.keys(command);
        const reversed = {};
        for (let i = keys.length - 1; i >= 0; i--) {
          reversed[keys[i]] = command[keys[i]];
        }

        const hash1 = computeCommandHash(command);
        const hash2 = computeCommandHash(reversed);

        // Same logical object → same hash regardless of insertion order
        expect(hash1).toBe(hash2);
      }),
      { numRuns: 100 },
    );
  });
});
