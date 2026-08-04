// Property 20: Equivalent booking drafts round trip
// Validates: Requirements 6.13, 15.6

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { serializeBookingDraft, deserializeBookingDraft } from '../../lib/domain/booking-draft.js';

/**
 * Arbitrary for generating valid date strings (YYYY-MM-DD format).
 */
const dateStringArb = fc
  .tuple(
    fc.integer({ min: 2024, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/**
 * Arbitrary for generating valid room selection objects.
 */
const roomSelectionArb = fc.record({
  roomId: fc.string({ minLength: 1, maxLength: 30 }),
  quantity: fc.integer({ min: 1, max: 10 }),
});

/**
 * Arbitrary for generating valid payment method strings.
 */
const paymentMethodArb = fc.constantFrom('gcash', 'bank_transfer', 'cash', 'credit_card', 'maya');

/**
 * Arbitrary for generating valid booking draft objects.
 */
const validBookingDraftArb = fc
  .record({
    checkIn: dateStringArb,
    checkOut: dateStringArb,
    rooms: fc.array(roomSelectionArb, { minLength: 1, maxLength: 5 }),
    adults: fc.integer({ min: 1, max: 50 }),
    children: fc.integer({ min: 0, max: 20 }),
    paymentMethod: paymentMethodArb,
  })
  .map((draft) => {
    // Ensure checkOut is after checkIn
    if (draft.checkIn >= draft.checkOut) {
      const [y, m, d] = draft.checkIn.split('-').map(Number);
      const nextDay = new Date(y, m - 1, d + 1);
      draft.checkOut = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    }
    return draft;
  });

describe('Property 20: Equivalent booking drafts round trip', () => {
  it('serialize → deserialize produces an equivalent normalized draft', () => {
    fc.assert(
      fc.property(validBookingDraftArb, (draft) => {
        const serialized = serializeBookingDraft(draft);
        const deserialized = deserializeBookingDraft(serialized);

        // The output must not have an .empty property (it should be a valid draft, not an empty recovery)
        expect(deserialized).not.toHaveProperty('empty');

        // Dates are preserved as strings
        expect(deserialized.checkIn).toBe(String(draft.checkIn));
        expect(deserialized.checkOut).toBe(String(draft.checkOut));

        // Room selections are preserved
        expect(deserialized.rooms).toHaveLength(draft.rooms.length);
        for (let i = 0; i < draft.rooms.length; i++) {
          expect(deserialized.rooms[i].roomId).toBe(String(draft.rooms[i].roomId));
          expect(deserialized.rooms[i].quantity).toBe(
            Math.max(1, Math.floor(Number(draft.rooms[i].quantity))),
          );
        }

        // Guest counts are preserved as integers
        expect(deserialized.adults).toBe(Math.max(0, Math.floor(Number(draft.adults))));
        expect(deserialized.children).toBe(Math.max(0, Math.floor(Number(draft.children))));
        expect(Number.isInteger(deserialized.adults)).toBe(true);
        expect(Number.isInteger(deserialized.children)).toBe(true);

        // Payment method is preserved
        expect(deserialized.paymentMethod).toBe(String(draft.paymentMethod));
      }),
      { numRuns: 500 },
    );
  });

  it('round trip preserves optional fields when present', () => {
    const draftWithOptionalsArb = fc.record({
      checkIn: dateStringArb,
      checkOut: dateStringArb,
      rooms: fc.array(roomSelectionArb, { minLength: 1, maxLength: 3 }),
      adults: fc.integer({ min: 1, max: 30 }),
      children: fc.integer({ min: 0, max: 15 }),
      seniors: fc.integer({ min: 0, max: 10 }),
      paymentMethod: paymentMethodArb,
      selectedDate: dateStringArb,
      isDayTour: fc.boolean(),
      isExclusiveResort: fc.boolean(),
      notes: fc.string({ minLength: 1, maxLength: 100 }),
      guestName: fc.string({ minLength: 1, maxLength: 50 }),
      email: fc.emailAddress(),
      phone: fc.stringMatching(/^\+?[0-9]{7,15}$/),
    });

    fc.assert(
      fc.property(draftWithOptionalsArb, (draft) => {
        const serialized = serializeBookingDraft(draft);
        const deserialized = deserializeBookingDraft(serialized);

        // No empty recovery marker
        expect(deserialized).not.toHaveProperty('empty');

        // Optional string fields preserved
        expect(deserialized.selectedDate).toBe(String(draft.selectedDate));
        expect(deserialized.notes).toBe(String(draft.notes));
        expect(deserialized.guestName).toBe(String(draft.guestName));
        expect(deserialized.email).toBe(String(draft.email));
        expect(deserialized.phone).toBe(String(draft.phone));

        // Optional boolean fields preserved
        expect(deserialized.isDayTour).toBe(Boolean(draft.isDayTour));
        expect(deserialized.isExclusiveResort).toBe(Boolean(draft.isExclusiveResort));

        // Seniors count preserved as integer
        expect(deserialized.seniors).toBe(Math.max(0, Math.floor(Number(draft.seniors))));
        expect(Number.isInteger(deserialized.seniors)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('normalized output is stable across double round trips', () => {
    fc.assert(
      fc.property(validBookingDraftArb, (draft) => {
        // First round trip
        const serialized1 = serializeBookingDraft(draft);
        const deserialized1 = deserializeBookingDraft(serialized1);

        // Second round trip from the deserialized result
        const serialized2 = serializeBookingDraft(deserialized1);
        const deserialized2 = deserializeBookingDraft(serialized2);

        // Double round trip produces the same result as single
        expect(deserialized2).toEqual(deserialized1);
      }),
      { numRuns: 500 },
    );
  });

  it('numeric-like string values for counts normalize to integers', () => {
    const numericStringDraftArb = fc
      .record({
        checkIn: dateStringArb,
        checkOut: dateStringArb,
        rooms: fc.array(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 20 }),
            quantity: fc.oneof(
              fc.integer({ min: 1, max: 10 }),
              fc.float({ min: Math.fround(1.1), max: Math.fround(9.9), noNaN: true }),
            ),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        adults: fc.oneof(
          fc.integer({ min: 1, max: 50 }),
          fc.float({ min: Math.fround(0.1), max: Math.fround(49.9), noNaN: true }),
        ),
        children: fc.oneof(
          fc.integer({ min: 0, max: 20 }),
          fc.float({ min: Math.fround(0.1), max: Math.fround(19.9), noNaN: true }),
        ),
        paymentMethod: paymentMethodArb,
      })
      .map((draft) => {
        if (draft.checkIn >= draft.checkOut) {
          const [y, m, d] = draft.checkIn.split('-').map(Number);
          const nextDay = new Date(y, m - 1, d + 1);
          draft.checkOut = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
        }
        return draft;
      });

    fc.assert(
      fc.property(numericStringDraftArb, (draft) => {
        const serialized = serializeBookingDraft(draft);
        const deserialized = deserializeBookingDraft(serialized);

        // No empty recovery
        expect(deserialized).not.toHaveProperty('empty');

        // All guest counts are integers
        expect(Number.isInteger(deserialized.adults)).toBe(true);
        expect(Number.isInteger(deserialized.children)).toBe(true);

        // Room quantities are integers
        for (const room of deserialized.rooms) {
          expect(Number.isInteger(room.quantity)).toBe(true);
          expect(room.quantity).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 500 },
    );
  });
});
