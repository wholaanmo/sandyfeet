// Property 19: Reservation values are derived from authoritative inputs
// Validates: Requirements 6.5, 6.12, 15.5

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateAuthoritativePrice, calculateNights } from '../../lib/domain/pricing.js';

/**
 * Arbitrary: valid room ID (alphanumeric string).
 */
const roomIdArb = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary: positive integer centavo price (1–10,000,000 centavos = up to 100,000 PHP).
 */
const priceCentavosArb = fc.integer({ min: 1, max: 10_000_000 });

/**
 * Arbitrary: room quantity (1–10).
 */
const quantityArb = fc.integer({ min: 1, max: 10 });

/**
 * Arbitrary: down payment percent (0–100 integer).
 */
const downPaymentPercentArb = fc.integer({ min: 0, max: 100 });

/**
 * Arbitrary: valid check-in/check-out date pair producing at least 1 night.
 * Generates dates within a reasonable range (2024–2030).
 */
const validDatePairArb = fc
  .tuple(
    fc.integer({ min: 2024, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }), // Use 28 to avoid month-length issues
    fc.integer({ min: 1, max: 30 }), // Nights to add (1–30)
  )
  .map(([year, month, day, nightsToAdd]) => {
    const checkIn = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Calculate checkout by adding nights
    const startDate = new Date(Date.UTC(year, month - 1, day));
    const endDate = new Date(startDate.getTime() + nightsToAdd * 24 * 60 * 60 * 1000);
    const checkOut = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`;
    return { checkIn, checkOut, expectedNights: nightsToAdd };
  });

/**
 * Arbitrary: a single room selection with its inventory entry.
 */
const roomSelectionWithInventoryArb = fc
  .tuple(roomIdArb, priceCentavosArb, quantityArb)
  .map(([roomId, priceCentavos, quantity]) => ({
    selection: { roomId, quantity },
    inventoryEntry: { priceCentavos },
  }));

/**
 * Arbitrary: a complete valid reservation command with inventory.
 * Generates 1–5 room selections with matching inventory.
 */
const validReservationArb = fc
  .tuple(
    validDatePairArb,
    fc.array(roomSelectionWithInventoryArb, { minLength: 1, maxLength: 5 }),
    downPaymentPercentArb,
  )
  .map(([dates, roomsWithInventory, downPaymentPercent]) => {
    // Ensure unique room IDs by appending index
    const rooms = {};
    const selections = roomsWithInventory.map((r, i) => {
      const uniqueId = `${r.selection.roomId}-${i}`;
      rooms[uniqueId] = r.inventoryEntry;
      return { roomId: uniqueId, quantity: r.selection.quantity };
    });

    return {
      inventory: { rooms, downPaymentPercent },
      command: { checkIn: dates.checkIn, checkOut: dates.checkOut, rooms: selections },
      expectedNights: dates.expectedNights,
    };
  });

/**
 * Arbitrary: negative price centavos.
 */
const negativePriceArb = fc.integer({ min: -10_000_000, max: -1 });

describe('Property 19: Reservation values are derived from authoritative inputs', () => {
  it('calculateAuthoritativePrice uses integer centavo arithmetic — all results are integers', () => {
    fc.assert(
      fc.property(validReservationArb, ({ inventory, command }) => {
        const result = calculateAuthoritativePrice(inventory, command);

        // All values must be integers (no floating-point residue)
        expect(Number.isInteger(result.total)).toBe(true);
        expect(Number.isInteger(result.downPayment)).toBe(true);
        expect(Number.isInteger(result.balance)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('total equals sum of (price × quantity × nights) for each room selection', () => {
    fc.assert(
      fc.property(validReservationArb, ({ inventory, command, expectedNights }) => {
        const result = calculateAuthoritativePrice(inventory, command);

        // Compute expected total manually
        const nights = calculateNights(command.checkIn, command.checkOut);
        expect(nights).toBe(expectedNights);

        let expectedTotal = 0;
        for (const selection of command.rooms) {
          const roomInfo = inventory.rooms[selection.roomId];
          if (roomInfo && typeof roomInfo.priceCentavos === 'number' && roomInfo.priceCentavos >= 0) {
            const price = Math.floor(roomInfo.priceCentavos);
            const qty = Math.max(1, Math.floor(selection.quantity || 1));
            expectedTotal += price * qty * nights;
          }
        }

        expect(result.total).toBe(expectedTotal);
      }),
      { numRuns: 500 },
    );
  });

  it('downPayment + balance always equals total', () => {
    fc.assert(
      fc.property(validReservationArb, ({ inventory, command }) => {
        const result = calculateAuthoritativePrice(inventory, command);

        expect(result.downPayment + result.balance).toBe(result.total);
      }),
      { numRuns: 500 },
    );
  });

  it('values never have floating-point residue — no fractional centavos', () => {
    fc.assert(
      fc.property(validReservationArb, ({ inventory, command }) => {
        const result = calculateAuthoritativePrice(inventory, command);

        // Verify no floating-point residue: value === Math.floor(value)
        expect(result.total).toBe(Math.floor(result.total));
        expect(result.downPayment).toBe(Math.floor(result.downPayment));
        expect(result.balance).toBe(Math.floor(result.balance));

        // Additional check: values are safe integers
        expect(Number.isSafeInteger(result.total)).toBe(true);
        expect(Number.isSafeInteger(result.downPayment)).toBe(true);
        expect(Number.isSafeInteger(result.balance)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('negative prices produce 0 total', () => {
    fc.assert(
      fc.property(
        validDatePairArb,
        fc.array(
          fc.tuple(roomIdArb, negativePriceArb, quantityArb),
          { minLength: 1, maxLength: 5 },
        ),
        downPaymentPercentArb,
        (dates, negativeRooms, downPaymentPercent) => {
          // Build inventory with only negative prices
          const rooms = {};
          const selections = negativeRooms.map(([id, price, qty], i) => {
            const uniqueId = `${id}-${i}`;
            rooms[uniqueId] = { priceCentavos: price };
            return { roomId: uniqueId, quantity: qty };
          });

          const inventory = { rooms, downPaymentPercent };
          const command = { checkIn: dates.checkIn, checkOut: dates.checkOut, rooms: selections };

          const result = calculateAuthoritativePrice(inventory, command);

          // With all negative prices, total must be 0
          expect(result.total).toBe(0);
          expect(result.downPayment).toBe(0);
          expect(result.balance).toBe(0);
        },
      ),
      { numRuns: 500 },
    );
  });
});
