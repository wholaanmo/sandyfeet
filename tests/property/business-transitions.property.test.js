/**
 * Property 23: Business state machines permit only declared transitions
 *
 * For every machine (PAYMENT_REQUEST, RESERVATION_PAYMENT, REFUND, CHECK_IN,
 * RESERVATION_STATUS), isValidTransition returns true ONLY for transitions
 * declared in the adjacency map, and false for all other state pairs.
 *
 * **Validates: Requirements 7.1, 7.2, 7.6, 7.8**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  PAYMENT_REQUEST_MACHINE,
  RESERVATION_PAYMENT_MACHINE,
  REFUND_MACHINE,
  CHECK_IN_MACHINE,
  RESERVATION_STATUS_MACHINE,
  isValidTransition,
  getAllStates,
} from '../../lib/domain/state-machines.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All machines under test with their names. */
const MACHINES = [
  { name: 'PAYMENT_REQUEST', machine: PAYMENT_REQUEST_MACHINE },
  { name: 'RESERVATION_PAYMENT', machine: RESERVATION_PAYMENT_MACHINE },
  { name: 'REFUND', machine: REFUND_MACHINE },
  { name: 'CHECK_IN', machine: CHECK_IN_MACHINE },
  { name: 'RESERVATION_STATUS', machine: RESERVATION_STATUS_MACHINE },
];

/**
 * Determine if a transition is declared in the adjacency map.
 *
 * @param {Record<string, string[]>} machine - Adjacency map
 * @param {string} from - Source state
 * @param {string} to - Target state
 * @returns {boolean}
 */
function isDeclaredTransition(machine, from, to) {
  const allowed = machine[from];
  if (!Array.isArray(allowed)) return false;
  return allowed.includes(to);
}

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generate a machine entry from the list. */
const machineArb = fc.constantFrom(...MACHINES);

/**
 * Generate arbitrary state pairs (from, to) for a given machine.
 * Includes both valid states from the machine and arbitrary strings
 * to cover undeclared/unknown state inputs.
 */
function statePairArb(machine) {
  const states = getAllStates(machine);
  const knownStateArb = fc.constantFrom(...states);
  // Mix known states with occasional arbitrary strings
  const stateArb = fc.oneof(
    { weight: 4, arbitrary: knownStateArb },
    { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 20 }) }
  );
  return fc.tuple(stateArb, stateArb);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 23: Business state machines permit only declared transitions', () => {
  it('isValidTransition returns true only for declared transitions across all machines', () => {
    fc.assert(
      fc.property(machineArb, (entry) => {
        const { machine } = entry;
        const states = getAllStates(machine);
        const knownStateArb = fc.constantFrom(...states);
        const stateArb = fc.oneof(
          { weight: 4, arbitrary: knownStateArb },
          { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 20 }) }
        );

        // Inner assertion: for every pair, isValidTransition matches adjacency
        fc.assert(
          fc.property(stateArb, stateArb, (from, to) => {
            const result = isValidTransition(machine, from, to);
            const declared = isDeclaredTransition(machine, from, to);
            expect(result).toBe(declared);
          }),
          { numRuns: 100 }
        );
      }),
      { numRuns: 100 }
    );
  });

  it('declared transitions are accepted for PAYMENT_REQUEST machine', () => {
    const machine = PAYMENT_REQUEST_MACHINE;
    const states = getAllStates(machine);

    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        fc.constantFrom(...states),
        (from, to) => {
          const result = isValidTransition(machine, from, to);
          const declared = isDeclaredTransition(machine, from, to);
          expect(result).toBe(declared);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('declared transitions are accepted for RESERVATION_PAYMENT machine', () => {
    const machine = RESERVATION_PAYMENT_MACHINE;
    const states = getAllStates(machine);

    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        fc.constantFrom(...states),
        (from, to) => {
          const result = isValidTransition(machine, from, to);
          const declared = isDeclaredTransition(machine, from, to);
          expect(result).toBe(declared);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('declared transitions are accepted for REFUND machine', () => {
    const machine = REFUND_MACHINE;
    const states = getAllStates(machine);

    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        fc.constantFrom(...states),
        (from, to) => {
          const result = isValidTransition(machine, from, to);
          const declared = isDeclaredTransition(machine, from, to);
          expect(result).toBe(declared);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('declared transitions are accepted for CHECK_IN machine', () => {
    const machine = CHECK_IN_MACHINE;
    const states = getAllStates(machine);

    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        fc.constantFrom(...states),
        (from, to) => {
          const result = isValidTransition(machine, from, to);
          const declared = isDeclaredTransition(machine, from, to);
          expect(result).toBe(declared);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('declared transitions are accepted for RESERVATION_STATUS machine', () => {
    const machine = RESERVATION_STATUS_MACHINE;
    const states = getAllStates(machine);

    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        fc.constantFrom(...states),
        (from, to) => {
          const result = isValidTransition(machine, from, to);
          const declared = isDeclaredTransition(machine, from, to);
          expect(result).toBe(declared);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('undeclared state pairs are always rejected', () => {
    fc.assert(
      fc.property(machineArb, (entry) => {
        const { machine } = entry;
        const states = getAllStates(machine);

        // Generate a pair where from is NOT a valid state key
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !states.includes(s)),
            fc.constantFrom(...states),
            (from, to) => {
              expect(isValidTransition(machine, from, to)).toBe(false);
            }
          ),
          { numRuns: 20 }
        );
      }),
      { numRuns: 100 }
    );
  });
});
