// tests/unit/reservation-policies.unit.test.js
// Unit tests for pure reservation domain modules:
//   lib/domain/occupancy.js, lib/domain/capacity.js,
//   lib/domain/pricing.js, lib/domain/booking-draft.js
import { describe, it, expect } from 'vitest';

import {
  ACTIVE_OCCUPANCY_STATUSES,
  RESORT_TIMEZONE,
  normalizeLocalDate,
  occupiedDateKeys,
  isActiveOccupancy,
} from '../../lib/domain/occupancy.js';

import {
  MAX_TRANSACTION_WRITES,
  calculateRoomDemand,
  calculateDayTourDemand,
  isExclusiveResortReservation,
  validateTransactionSize,
} from '../../lib/domain/capacity.js';

import {
  calculateNights,
  calculateRoomCount,
  calculateGuestCount,
  calculateAuthoritativePrice,
} from '../../lib/domain/pricing.js';

import {
  DRAFT_SCHEMA_VERSION,
  serializeBookingDraft,
  deserializeBookingDraft,
} from '../../lib/domain/booking-draft.js';

// ─── Occupancy ───────────────────────────────────────────────────────────────

describe('lib/domain/occupancy', () => {
  describe('ACTIVE_OCCUPANCY_STATUSES', () => {
    it('contains exactly the canonical statuses', () => {
      expect(ACTIVE_OCCUPANCY_STATUSES).toEqual(['confirmed', 'checked_in', 'pending_payment']);
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(ACTIVE_OCCUPANCY_STATUSES)).toBe(true);
    });
  });

  describe('RESORT_TIMEZONE', () => {
    it('is Asia/Manila', () => {
      expect(RESORT_TIMEZONE).toBe('Asia/Manila');
    });
  });

  describe('normalizeLocalDate', () => {
    it('passes through valid YYYY-MM-DD strings', () => {
      expect(normalizeLocalDate('2025-06-15')).toBe('2025-06-15');
    });

    it('rejects invalid date strings', () => {
      expect(normalizeLocalDate('2025-02-30')).toBeNull();
      expect(normalizeLocalDate('2025-13-01')).toBeNull();
      expect(normalizeLocalDate('not-a-date')).toBeNull();
    });

    it('handles Date objects', () => {
      // A Date object representing a known instant in Manila time
      const date = new Date('2025-01-15T20:00:00Z'); // Jan 16 04:00 Manila
      const result = normalizeLocalDate(date);
      expect(result).toBe('2025-01-16');
    });

    it('handles Firestore-like timestamp objects', () => {
      // seconds since epoch for 2025-03-10 12:00:00 UTC
      const ts = { seconds: 1741608000 };
      const result = normalizeLocalDate(ts);
      expect(result).not.toBeNull();
      expect(/^\d{4}-\d{2}-\d{2}$/.test(result)).toBe(true);
    });

    it('returns null for null/undefined', () => {
      expect(normalizeLocalDate(null)).toBeNull();
      expect(normalizeLocalDate(undefined)).toBeNull();
    });

    it('returns null for non-date types', () => {
      expect(normalizeLocalDate(12345)).toBeNull();
      expect(normalizeLocalDate(true)).toBeNull();
    });
  });

  describe('occupiedDateKeys', () => {
    it('returns occupied dates from check-in (inclusive) to check-out (exclusive)', () => {
      const keys = occupiedDateKeys('2025-06-10', '2025-06-13');
      expect(keys).toEqual(['2025-06-10', '2025-06-11', '2025-06-12']);
    });

    it('returns one date for a single-night stay', () => {
      const keys = occupiedDateKeys('2025-06-10', '2025-06-11');
      expect(keys).toEqual(['2025-06-10']);
    });

    it('returns empty array if check-out <= check-in', () => {
      expect(occupiedDateKeys('2025-06-10', '2025-06-10')).toEqual([]);
      expect(occupiedDateKeys('2025-06-10', '2025-06-09')).toEqual([]);
    });

    it('returns empty array for null/undefined inputs', () => {
      expect(occupiedDateKeys(null, '2025-06-10')).toEqual([]);
      expect(occupiedDateKeys('2025-06-10', null)).toEqual([]);
    });

    it('returns empty for invalid date format', () => {
      expect(occupiedDateKeys('June 10', '2025-06-12')).toEqual([]);
    });

    it('handles month boundaries', () => {
      const keys = occupiedDateKeys('2025-01-30', '2025-02-02');
      expect(keys).toEqual(['2025-01-30', '2025-01-31', '2025-02-01']);
    });

    it('handles year boundaries', () => {
      const keys = occupiedDateKeys('2025-12-30', '2026-01-02');
      expect(keys).toEqual(['2025-12-30', '2025-12-31', '2026-01-01']);
    });
  });

  describe('isActiveOccupancy', () => {
    it('returns true for canonical active statuses', () => {
      expect(isActiveOccupancy('confirmed')).toBe(true);
      expect(isActiveOccupancy('checked_in')).toBe(true);
      expect(isActiveOccupancy('pending_payment')).toBe(true);
    });

    it('returns false for inactive statuses', () => {
      expect(isActiveOccupancy('cancelled')).toBe(false);
      expect(isActiveOccupancy('completed')).toBe(false);
      expect(isActiveOccupancy('pending')).toBe(false);
    });
  });
});

// ─── Capacity ────────────────────────────────────────────────────────────────

describe('lib/domain/capacity', () => {
  describe('calculateRoomDemand', () => {
    it('aggregates room demand by roomId', () => {
      const demand = calculateRoomDemand({
        rooms: [
          { roomId: 'deluxe', quantity: 2 },
          { roomId: 'standard', quantity: 1 },
          { roomId: 'deluxe', quantity: 1 },
        ],
      });
      expect(demand.get('deluxe')).toBe(3);
      expect(demand.get('standard')).toBe(1);
    });

    it('defaults quantity to 1 if missing', () => {
      const demand = calculateRoomDemand({ rooms: [{ roomId: 'suite' }] });
      expect(demand.get('suite')).toBe(1);
    });

    it('returns empty map for null command', () => {
      expect(calculateRoomDemand(null).size).toBe(0);
    });

    it('returns empty map for command without rooms', () => {
      expect(calculateRoomDemand({}).size).toBe(0);
      expect(calculateRoomDemand({ rooms: 'invalid' }).size).toBe(0);
    });

    it('skips entries without roomId', () => {
      const demand = calculateRoomDemand({ rooms: [null, { quantity: 2 }, { roomId: 'a' }] });
      expect(demand.size).toBe(1);
      expect(demand.get('a')).toBe(1);
    });
  });

  describe('calculateDayTourDemand', () => {
    it('calculates guest totals', () => {
      const result = calculateDayTourDemand({ adults: 4, children: 2, seniors: 1 });
      expect(result).toEqual({ adults: 4, children: 2, seniors: 1, total: 7 });
    });

    it('defaults missing counts to 0', () => {
      const result = calculateDayTourDemand({ adults: 3 });
      expect(result).toEqual({ adults: 3, children: 0, seniors: 0, total: 3 });
    });

    it('floors fractional values', () => {
      const result = calculateDayTourDemand({ adults: 2.9, children: 1.5, seniors: 0.7 });
      expect(result).toEqual({ adults: 2, children: 1, seniors: 0, total: 3 });
    });

    it('returns zeros for null command', () => {
      expect(calculateDayTourDemand(null)).toEqual({ adults: 0, children: 0, seniors: 0, total: 0 });
    });

    it('clamps negatives to 0', () => {
      const result = calculateDayTourDemand({ adults: -5, children: -1, seniors: -2 });
      expect(result).toEqual({ adults: 0, children: 0, seniors: 0, total: 0 });
    });
  });

  describe('isExclusiveResortReservation', () => {
    it('returns true for explicit exclusive flag', () => {
      expect(isExclusiveResortReservation({ isExclusiveResort: true })).toBe(true);
    });

    it('returns false for non-exclusive', () => {
      expect(isExclusiveResortReservation({ isExclusiveResort: false })).toBe(false);
      expect(isExclusiveResortReservation({})).toBe(false);
    });

    it('returns false for truthy non-boolean values', () => {
      expect(isExclusiveResortReservation({ isExclusiveResort: 1 })).toBe(false);
      expect(isExclusiveResortReservation({ isExclusiveResort: 'yes' })).toBe(false);
    });

    it('returns false for null command', () => {
      expect(isExclusiveResortReservation(null)).toBe(false);
    });
  });

  describe('validateTransactionSize', () => {
    it('accepts a simple day tour', () => {
      const result = validateTransactionSize({ isDayTour: true });
      expect(result.valid).toBe(true);
      expect(result.estimatedWrites).toBeLessThan(MAX_TRANSACTION_WRITES);
    });

    it('accepts a typical room booking', () => {
      const result = validateTransactionSize({
        checkIn: '2025-06-10',
        checkOut: '2025-06-13',
        rooms: [{ roomId: 'deluxe', quantity: 2 }],
      });
      expect(result.valid).toBe(true);
      // 3 nights × 1 room type + 2 child writes + 4 overhead = 9
      expect(result.estimatedWrites).toBe(9);
    });

    it('rejects a command that exceeds transaction limits', () => {
      // 200 nights × 3 room types = 600 ledger writes + overhead
      const result = validateTransactionSize({
        checkIn: '2025-01-01',
        checkOut: '2025-07-20',
        rooms: [
          { roomId: 'a', quantity: 1 },
          { roomId: 'b', quantity: 1 },
          { roomId: 'c', quantity: 1 },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds transaction limit');
    });

    it('rejects null command', () => {
      const result = validateTransactionSize(null);
      expect(result.valid).toBe(false);
    });

    it('rejects missing dates for room bookings', () => {
      const result = validateTransactionSize({ rooms: [{ roomId: 'a' }] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dates are required');
    });

    it('rejects check-out before check-in', () => {
      const result = validateTransactionSize({
        checkIn: '2025-06-15',
        checkOut: '2025-06-10',
        rooms: [{ roomId: 'a' }],
      });
      expect(result.valid).toBe(false);
    });
  });
});

// ─── Pricing ─────────────────────────────────────────────────────────────────

describe('lib/domain/pricing', () => {
  describe('calculateNights', () => {
    it('counts nights between dates', () => {
      expect(calculateNights('2025-06-10', '2025-06-13')).toBe(3);
      expect(calculateNights('2025-06-10', '2025-06-11')).toBe(1);
    });

    it('returns 0 for same date or invalid order', () => {
      expect(calculateNights('2025-06-10', '2025-06-10')).toBe(0);
      expect(calculateNights('2025-06-10', '2025-06-09')).toBe(0);
    });

    it('returns 0 for invalid inputs', () => {
      expect(calculateNights(null, '2025-06-10')).toBe(0);
      expect(calculateNights('2025-06-10', undefined)).toBe(0);
      expect(calculateNights('bad', 'data')).toBe(0);
    });
  });

  describe('calculateRoomCount', () => {
    it('sums room quantities', () => {
      expect(calculateRoomCount([
        { quantity: 2 },
        { quantity: 3 },
      ])).toBe(5);
    });

    it('defaults missing quantity to 1', () => {
      expect(calculateRoomCount([{}, { quantity: 2 }])).toBe(3);
    });

    it('returns 0 for non-array', () => {
      expect(calculateRoomCount(null)).toBe(0);
      expect(calculateRoomCount('bad')).toBe(0);
    });
  });

  describe('calculateGuestCount', () => {
    it('sums guest categories', () => {
      const result = calculateGuestCount({ adults: 2, children: 3, seniors: 1 });
      expect(result).toEqual({ adults: 2, children: 3, seniors: 1, total: 6 });
    });

    it('returns zeros for null', () => {
      expect(calculateGuestCount(null)).toEqual({ adults: 0, children: 0, seniors: 0, total: 0 });
    });
  });

  describe('calculateAuthoritativePrice', () => {
    const inventory = {
      rooms: {
        deluxe: { priceCentavos: 500000 }, // 5,000 PHP
        standard: { priceCentavos: 300000 }, // 3,000 PHP
      },
      downPaymentPercent: 50,
    };

    it('calculates total, down payment, and balance in centavos', () => {
      const result = calculateAuthoritativePrice(inventory, {
        checkIn: '2025-06-10',
        checkOut: '2025-06-12',
        rooms: [{ roomId: 'deluxe', quantity: 1 }],
      });
      // 500000 centavos × 1 room × 2 nights = 1,000,000 centavos
      expect(result.total).toBe(1000000);
      expect(result.downPayment).toBe(500000);
      expect(result.balance).toBe(500000);
    });

    it('handles multiple room types', () => {
      const result = calculateAuthoritativePrice(inventory, {
        checkIn: '2025-06-10',
        checkOut: '2025-06-11',
        rooms: [
          { roomId: 'deluxe', quantity: 2 },
          { roomId: 'standard', quantity: 1 },
        ],
      });
      // (500000×2 + 300000×1) × 1 night = 1,300,000
      expect(result.total).toBe(1300000);
      expect(result.downPayment).toBe(650000);
      expect(result.balance).toBe(650000);
    });

    it('uses integer arithmetic — no floating-point rounding', () => {
      const inv = {
        rooms: { room1: { priceCentavos: 33333 } },
        downPaymentPercent: 33,
      };
      const result = calculateAuthoritativePrice(inv, {
        checkIn: '2025-06-10',
        checkOut: '2025-06-13',
        rooms: [{ roomId: 'room1', quantity: 1 }],
      });
      // 33333 × 1 × 3 = 99999
      expect(result.total).toBe(99999);
      // floor(99999 × 33 / 100) = floor(32999.67) = 32999
      expect(result.downPayment).toBe(32999);
      expect(result.balance).toBe(99999 - 32999);
      // Verify no floating-point residue
      expect(Number.isInteger(result.total)).toBe(true);
      expect(Number.isInteger(result.downPayment)).toBe(true);
      expect(Number.isInteger(result.balance)).toBe(true);
    });

    it('accepts inventory.rooms as a Map', () => {
      const inv = {
        rooms: new Map([['suite', { priceCentavos: 800000 }]]),
        downPaymentPercent: 50,
      };
      const result = calculateAuthoritativePrice(inv, {
        checkIn: '2025-06-10',
        checkOut: '2025-06-11',
        rooms: [{ roomId: 'suite', quantity: 1 }],
      });
      expect(result.total).toBe(800000);
    });

    it('returns zeros for null inputs', () => {
      expect(calculateAuthoritativePrice(null, {})).toEqual({ total: 0, downPayment: 0, balance: 0 });
      expect(calculateAuthoritativePrice({}, null)).toEqual({ total: 0, downPayment: 0, balance: 0 });
    });

    it('returns zeros for zero nights', () => {
      const result = calculateAuthoritativePrice(inventory, {
        checkIn: '2025-06-10',
        checkOut: '2025-06-10',
        rooms: [{ roomId: 'deluxe', quantity: 1 }],
      });
      expect(result.total).toBe(0);
    });

    it('skips rooms not in inventory', () => {
      const result = calculateAuthoritativePrice(inventory, {
        checkIn: '2025-06-10',
        checkOut: '2025-06-11',
        rooms: [{ roomId: 'nonexistent', quantity: 1 }],
      });
      expect(result.total).toBe(0);
    });

    it('defaults down payment to 50% when not specified', () => {
      const inv = { rooms: { a: { priceCentavos: 100000 } } };
      const result = calculateAuthoritativePrice(inv, {
        checkIn: '2025-06-10',
        checkOut: '2025-06-11',
        rooms: [{ roomId: 'a', quantity: 1 }],
      });
      expect(result.downPayment).toBe(50000);
    });
  });
});

// ─── Booking Draft ───────────────────────────────────────────────────────────

describe('lib/domain/booking-draft', () => {
  describe('DRAFT_SCHEMA_VERSION', () => {
    it('is version 1', () => {
      expect(DRAFT_SCHEMA_VERSION).toBe(1);
    });
  });

  describe('round-trip serialization', () => {
    it('serialize then deserialize produces equivalent draft', () => {
      const draft = {
        checkIn: '2025-06-10',
        checkOut: '2025-06-13',
        rooms: [{ roomId: 'deluxe', quantity: 2 }],
        adults: 4,
        children: 2,
        seniors: 0,
        paymentMethod: 'gcash',
        isDayTour: false,
        notes: 'Late arrival',
      };

      const serialized = serializeBookingDraft(draft);
      const deserialized = deserializeBookingDraft(serialized);

      expect(deserialized.empty).toBeUndefined();
      expect(deserialized.checkIn).toBe('2025-06-10');
      expect(deserialized.checkOut).toBe('2025-06-13');
      expect(deserialized.rooms).toEqual([{ roomId: 'deluxe', quantity: 2 }]);
      expect(deserialized.adults).toBe(4);
      expect(deserialized.children).toBe(2);
      expect(deserialized.seniors).toBe(0);
      expect(deserialized.paymentMethod).toBe('gcash');
      expect(deserialized.isDayTour).toBe(false);
      expect(deserialized.notes).toBe('Late arrival');
    });

    it('normalizes room quantity defaults on round-trip', () => {
      const draft = { rooms: [{ roomId: 'a' }] };
      const result = deserializeBookingDraft(serializeBookingDraft(draft));
      expect(result.rooms[0].quantity).toBe(1);
    });

    it('preserves exclusive resort flag', () => {
      const draft = { isExclusiveResort: true, checkIn: '2025-06-10', checkOut: '2025-06-11' };
      const result = deserializeBookingDraft(serializeBookingDraft(draft));
      expect(result.isExclusiveResort).toBe(true);
    });
  });

  describe('serializeBookingDraft', () => {
    it('produces valid JSON with version marker', () => {
      const json = serializeBookingDraft({ checkIn: '2025-06-10' });
      const parsed = JSON.parse(json);
      expect(parsed.v).toBe(DRAFT_SCHEMA_VERSION);
      expect(parsed.data).toBeDefined();
    });

    it('throws for null input', () => {
      expect(() => serializeBookingDraft(null)).toThrow();
    });

    it('throws for non-object input', () => {
      expect(() => serializeBookingDraft('string')).toThrow();
    });
  });

  describe('deserializeBookingDraft — safe recovery', () => {
    it('returns empty draft for null', () => {
      const result = deserializeBookingDraft(null);
      expect(result.empty).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('returns empty draft for empty string', () => {
      const result = deserializeBookingDraft('');
      expect(result.empty).toBe(true);
    });

    it('returns empty draft for non-string', () => {
      const result = deserializeBookingDraft(123);
      expect(result.empty).toBe(true);
    });

    it('returns empty draft for invalid JSON', () => {
      const result = deserializeBookingDraft('{not valid json');
      expect(result.empty).toBe(true);
      expect(result.reason).toContain('JSON');
    });

    it('returns empty draft for non-object JSON', () => {
      const result = deserializeBookingDraft('"just a string"');
      expect(result.empty).toBe(true);
    });

    it('returns empty draft for array JSON', () => {
      const result = deserializeBookingDraft('[1,2,3]');
      expect(result.empty).toBe(true);
    });

    it('returns empty draft for missing version', () => {
      const result = deserializeBookingDraft(JSON.stringify({ data: {} }));
      expect(result.empty).toBe(true);
      expect(result.reason).toContain('version');
    });

    it('returns empty draft for unsupported future version', () => {
      const result = deserializeBookingDraft(JSON.stringify({ v: 999, data: {} }));
      expect(result.empty).toBe(true);
      expect(result.reason).toContain('Unsupported');
    });

    it('returns empty draft for invalid data payload', () => {
      const result = deserializeBookingDraft(JSON.stringify({ v: 1, data: 'not-object' }));
      expect(result.empty).toBe(true);
    });

    it('returns empty draft for null data', () => {
      const result = deserializeBookingDraft(JSON.stringify({ v: 1, data: null }));
      expect(result.empty).toBe(true);
    });
  });
});
