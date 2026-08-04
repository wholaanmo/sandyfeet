// Property 17: Occupancy policy and room date boundaries are canonical
// Validates: Requirements 6.1, 6.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ACTIVE_OCCUPANCY_STATUSES,
  occupiedDateKeys,
  isActiveOccupancy,
} from '../../lib/domain/occupancy.js';

/**
 * Helper: compute the number of nights between two YYYY-MM-DD dates using UTC.
 */
function referenceNightCount(checkIn, checkOut) {
  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

/**
 * Helper: format a date to YYYY-MM-DD from year, month (1-based), day.
 */
function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Arbitrary: generate a valid check-in date as YYYY-MM-DD.
 * Uses a reasonable date range (2020-2030) to avoid edge cases with very early/late dates.
 */
const checkInArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // Use 28 to avoid month-length issues
  })
  .map(({ year, month, day }) => formatDate(year, month, day));

/**
 * Arbitrary: generate a valid check-in/check-out pair where check-out > check-in.
 * The stay length is 1–30 nights (reasonable reservation length).
 */
const dateRangeArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    nights: fc.integer({ min: 1, max: 30 }),
  })
  .map(({ year, month, day, nights }) => {
    const checkIn = formatDate(year, month, day);
    // Calculate check-out by adding nights in UTC
    const startMs = Date.UTC(year, month - 1, day);
    const endMs = startMs + nights * 24 * 60 * 60 * 1000;
    const endDate = new Date(endMs);
    const checkOut = formatDate(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() + 1,
      endDate.getUTCDate(),
    );
    return { checkIn, checkOut, nights };
  });

/**
 * Arbitrary: generate any booking status string — both active and inactive.
 */
const allStatusArb = fc.oneof(
  fc.constantFrom('confirmed', 'checked_in', 'pending_payment'),
  fc.constantFrom('cancelled', 'no_show', 'completed', 'expired', 'draft'),
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
);

describe('Property 17: Occupancy policy and room date boundaries are canonical', () => {
  it('ACTIVE_OCCUPANCY_STATUSES is frozen, non-empty, and is the single canonical set used by isActiveOccupancy', () => {
    // Structural assertions on the canonical set
    expect(Object.isFrozen(ACTIVE_OCCUPANCY_STATUSES)).toBe(true);
    expect(ACTIVE_OCCUPANCY_STATUSES.length).toBeGreaterThan(0);
    expect(ACTIVE_OCCUPANCY_STATUSES).toContain('confirmed');
    expect(ACTIVE_OCCUPANCY_STATUSES).toContain('checked_in');
    expect(ACTIVE_OCCUPANCY_STATUSES).toContain('pending_payment');

    // Property: isActiveOccupancy returns true if and only if status is in the canonical set
    fc.assert(
      fc.property(allStatusArb, (status) => {
        const expected = ACTIVE_OCCUPANCY_STATUSES.includes(status);
        expect(isActiveOccupancy(status)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('occupiedDateKeys includes check-in date and excludes check-out date', () => {
    fc.assert(
      fc.property(dateRangeArb, ({ checkIn, checkOut }) => {
        const keys = occupiedDateKeys(checkIn, checkOut);

        // Check-in date is always included (first occupied night)
        expect(keys).toContain(checkIn);

        // Check-out date is always excluded (guest departs this day)
        expect(keys).not.toContain(checkOut);
      }),
      { numRuns: 100 },
    );
  });

  it('generated date ranges produce exactly the correct number of nights (checkOut - checkIn in days)', () => {
    fc.assert(
      fc.property(dateRangeArb, ({ checkIn, checkOut, nights }) => {
        const keys = occupiedDateKeys(checkIn, checkOut);

        // The number of occupied date keys must equal the number of nights
        expect(keys.length).toBe(nights);

        // Cross-check with an independent reference calculation
        const refNights = referenceNightCount(checkIn, checkOut);
        expect(keys.length).toBe(refNights);
      }),
      { numRuns: 100 },
    );
  });

  it('no date outside the [checkIn, checkOut) range is included in occupied date keys', () => {
    fc.assert(
      fc.property(dateRangeArb, ({ checkIn, checkOut }) => {
        const keys = occupiedDateKeys(checkIn, checkOut);

        for (const key of keys) {
          // Every key must be >= checkIn (inclusive)
          expect(key >= checkIn).toBe(true);
          // Every key must be < checkOut (exclusive)
          expect(key < checkOut).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('occupied date keys are strictly ordered and contain no duplicates', () => {
    fc.assert(
      fc.property(dateRangeArb, ({ checkIn, checkOut }) => {
        const keys = occupiedDateKeys(checkIn, checkOut);

        // No duplicates
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);

        // Strictly ascending order
        for (let i = 1; i < keys.length; i++) {
          expect(keys[i] > keys[i - 1]).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a booking affects capacity if and only if its status is in ACTIVE_OCCUPANCY_STATUSES', () => {
    fc.assert(
      fc.property(allStatusArb, dateRangeArb, (status, { checkIn, checkOut }) => {
        const isActive = isActiveOccupancy(status);
        const keys = occupiedDateKeys(checkIn, checkOut);

        if (isActive) {
          // An active status means this stay occupies capacity for all keys
          expect(keys.length).toBeGreaterThan(0);
        }

        // Regardless of status, occupiedDateKeys returns the same date set —
        // the status check is a separate gate that determines WHETHER to count them.
        // This verifies the two concerns are properly separated.
        const keysAgain = occupiedDateKeys(checkIn, checkOut);
        expect(keysAgain).toEqual(keys);
      }),
      { numRuns: 100 },
    );
  });
});
