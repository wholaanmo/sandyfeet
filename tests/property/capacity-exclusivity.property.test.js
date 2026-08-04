// Property 18: Capacity aggregation preserves category totals and exclusivity
// Validates: Requirements 6.3, 6.4, 15.5

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  calculateRoomDemand,
  calculateDayTourDemand,
  isExclusiveResortReservation,
} from '../../lib/domain/capacity.js';

/**
 * Arbitrary for generating a valid roomId (non-empty alphanumeric identifier).
 */
const roomIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{1,20}$/).filter((s) => s.length >= 2);

/**
 * Arbitrary for generating a room selection entry with roomId and optional quantity.
 */
const roomSelectionArb = fc.record({
  roomId: roomIdArb,
  quantity: fc.oneof(
    fc.nat({ max: 10 }).map((n) => n + 1), // 1..11
    fc.constant(undefined),
  ),
});

/**
 * Arbitrary for generating a rooms array with 1-10 selections (may repeat roomIds).
 */
const roomsArrayArb = fc.array(roomSelectionArb, { minLength: 1, maxLength: 10 });

/**
 * Arbitrary for generating a reservation command with room selections.
 */
const roomCommandArb = roomsArrayArb.map((rooms) => ({ rooms }));

/**
 * Arbitrary for generating non-negative integer guest counts.
 */
const guestCountArb = fc.nat({ max: 200 });

/**
 * Arbitrary for generating a day-tour command with adults, children, seniors.
 */
const dayTourCommandArb = fc.record({
  adults: guestCountArb,
  children: guestCountArb,
  seniors: guestCountArb,
});

/**
 * Arbitrary for generating various isExclusiveResort field values.
 */
const exclusiveFieldArb = fc.oneof(
  fc.constant(true),
  fc.constant(false),
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(0),
  fc.constant(1),
  fc.constant('true'),
  fc.constant('yes'),
  fc.constant(''),
  fc.integer(),
  fc.string(),
);

describe('Property 18: Capacity aggregation preserves category totals and exclusivity', () => {
  it('calculateRoomDemand aggregates correctly for any room selection', () => {
    fc.assert(
      fc.property(roomCommandArb, (command) => {
        const demand = calculateRoomDemand(command);

        // The demand map must be a Map
        expect(demand).toBeInstanceOf(Map);

        // Compute expected totals by manually summing
        const expected = new Map();
        for (const room of command.rooms) {
          if (!room || !room.roomId) continue;
          const quantity = Math.max(1, Math.floor(Number(room.quantity) || 1));
          const current = expected.get(room.roomId) || 0;
          expected.set(room.roomId, current + quantity);
        }

        // The demand map must match expected totals exactly
        expect(demand.size).toBe(expected.size);
        for (const [roomId, units] of expected) {
          expect(demand.get(roomId)).toBe(units);
        }

        // Every value in demand must be positive
        for (const units of demand.values()) {
          expect(units).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('calculateDayTourDemand total equals adults + children + seniors', () => {
    fc.assert(
      fc.property(dayTourCommandArb, (command) => {
        const result = calculateDayTourDemand(command);

        // total must equal the sum of the three categories
        expect(result.total).toBe(result.adults + result.children + result.seniors);

        // Each category must be a non-negative integer
        expect(Number.isInteger(result.adults)).toBe(true);
        expect(Number.isInteger(result.children)).toBe(true);
        expect(Number.isInteger(result.seniors)).toBe(true);
        expect(Number.isInteger(result.total)).toBe(true);

        expect(result.adults).toBeGreaterThanOrEqual(0);
        expect(result.children).toBeGreaterThanOrEqual(0);
        expect(result.seniors).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeGreaterThanOrEqual(0);

        // Values must be clamped floors of input
        expect(result.adults).toBe(Math.max(0, Math.floor(Number(command.adults) || 0)));
        expect(result.children).toBe(Math.max(0, Math.floor(Number(command.children) || 0)));
        expect(result.seniors).toBe(Math.max(0, Math.floor(Number(command.seniors) || 0)));
      }),
      { numRuns: 100 },
    );
  });

  it('isExclusiveResortReservation only returns true for strict boolean true', () => {
    fc.assert(
      fc.property(exclusiveFieldArb, (fieldValue) => {
        const command = { isExclusiveResort: fieldValue };
        const result = isExclusiveResortReservation(command);

        if (fieldValue === true) {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('total demand is always non-negative for any input', () => {
    // Generate arbitrary objects including edge cases
    const arbitraryCommandArb = fc.oneof(
      // Valid room commands
      roomCommandArb,
      // Valid day-tour commands
      dayTourCommandArb,
      // Empty/null rooms
      fc.constant({ rooms: [] }),
      fc.constant({ rooms: null }),
      fc.constant({}),
      fc.constant(null),
      // Commands with invalid room entries
      fc.constant({ rooms: [null, undefined, { roomId: '' }, { roomId: null }] }),
      // Commands with negative/float guest counts
      fc.record({
        adults: fc.oneof(fc.integer({ min: -100, max: 200 }), fc.double()),
        children: fc.oneof(fc.integer({ min: -100, max: 200 }), fc.double()),
        seniors: fc.oneof(fc.integer({ min: -100, max: 200 }), fc.double()),
      }),
    );

    fc.assert(
      fc.property(arbitraryCommandArb, (command) => {
        // Room demand values are always non-negative
        const roomDemand = calculateRoomDemand(command);
        for (const units of roomDemand.values()) {
          expect(units).toBeGreaterThanOrEqual(0);
        }

        // Day-tour demand total is always non-negative
        const dayTourDemand = calculateDayTourDemand(command);
        expect(dayTourDemand.total).toBeGreaterThanOrEqual(0);
        expect(dayTourDemand.adults).toBeGreaterThanOrEqual(0);
        expect(dayTourDemand.children).toBeGreaterThanOrEqual(0);
        expect(dayTourDemand.seniors).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});
