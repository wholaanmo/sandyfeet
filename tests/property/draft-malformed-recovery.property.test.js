// Property 21: Invalid booking-draft storage always recovers
// Validates: Requirements 6.14, 15.7

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { deserializeBookingDraft, DRAFT_SCHEMA_VERSION } from '../../lib/domain/booking-draft.js';

/**
 * Asserts that a result is a valid empty recovery: { empty: true, reason: string }
 * and that the function NEVER throws.
 */
function assertEmptyRecovery(result) {
  expect(result).toHaveProperty('empty', true);
  expect(result).toHaveProperty('reason');
  expect(typeof result.reason).toBe('string');
  expect(result.reason.length).toBeGreaterThan(0);
}

describe('Property 21: Invalid booking-draft storage always recovers', () => {
  it('random strings always produce { empty: true, reason } and never throw', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        let result;
        expect(() => {
          result = deserializeBookingDraft(input);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('invalid JSON strings always recover safely', () => {
    const invalidJsonArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 200 }).filter((s) => {
        try {
          JSON.parse(s);
          return false;
        } catch {
          return true;
        }
      }),
      fc.constant('{invalid json}'),
      fc.constant('{"broken":'),
      fc.constant('[1,2,'),
      fc.constant('undefined'),
      fc.constant("{'single': 'quotes'}"),
    );

    fc.assert(
      fc.property(invalidJsonArb, (input) => {
        let result;
        expect(() => {
          result = deserializeBookingDraft(input);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('wrong version numbers always recover safely', () => {
    const wrongVersionArb = fc.oneof(
      // Versions above current
      fc.integer({ min: DRAFT_SCHEMA_VERSION + 1, max: 999 }),
      // Zero
      fc.constant(0),
      // Negative versions
      fc.integer({ min: -1000, max: -1 }),
      // Float versions
      fc.double({ min: 0.1, max: 0.99, noNaN: true }),
    );

    fc.assert(
      fc.property(wrongVersionArb, (version) => {
        const raw = JSON.stringify({ v: version, data: { checkIn: '2025-01-01' } });
        let result;
        expect(() => {
          result = deserializeBookingDraft(raw);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('arrays as top-level JSON always recover safely', () => {
    const arrayArb = fc.array(fc.anything(), { minLength: 0, maxLength: 10 });

    fc.assert(
      fc.property(arrayArb, (arr) => {
        const raw = JSON.stringify(arr);
        let result;
        expect(() => {
          result = deserializeBookingDraft(raw);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('numbers passed directly always recover safely', () => {
    const numberArb = fc.oneof(
      fc.integer(),
      fc.double({ noNaN: true }),
      fc.constant(0),
      fc.constant(-1),
      fc.constant(Infinity),
      fc.constant(-Infinity),
    );

    fc.assert(
      fc.property(numberArb, (input) => {
        let result;
        expect(() => {
          result = deserializeBookingDraft(input);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('null and undefined always recover safely', () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined), (input) => {
        let result;
        expect(() => {
          result = deserializeBookingDraft(input);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('corrupted envelope structures always recover safely', () => {
    const corruptedEnvelopeArb = fc.oneof(
      // Missing v field
      fc.record({ data: fc.anything() }).map((obj) => JSON.stringify(obj)),
      // v is not a number
      fc
        .record({
          v: fc.oneof(fc.string(), fc.boolean(), fc.constant(null), fc.array(fc.integer())),
          data: fc.anything(),
        })
        .map((obj) => JSON.stringify(obj)),
      // data is not an object
      fc
        .record({
          v: fc.constant(DRAFT_SCHEMA_VERSION),
          data: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.array(fc.anything()),
          ),
        })
        .map((obj) => JSON.stringify(obj)),
      // data is an array
      fc
        .record({
          v: fc.constant(DRAFT_SCHEMA_VERSION),
          data: fc.array(fc.anything(), { minLength: 0, maxLength: 5 }),
        })
        .map((obj) => JSON.stringify(obj)),
      // Empty object (no v, no data)
      fc.constant(JSON.stringify({})),
      // Null envelope
      fc.constant(JSON.stringify(null)),
    );

    fc.assert(
      fc.property(corruptedEnvelopeArb, (raw) => {
        let result;
        expect(() => {
          result = deserializeBookingDraft(raw);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('arbitrary non-string types always recover safely', () => {
    const nonStringArb = fc.oneof(
      fc.boolean(),
      fc.integer(),
      fc.double({ noNaN: true }),
      fc.object(),
      fc.array(fc.anything()),
      fc.constant(null),
      fc.constant(undefined),
      fc.func(fc.anything()),
      fc.constant(Symbol('test')),
      fc.bigInt(),
    );

    fc.assert(
      fc.property(nonStringArb, (input) => {
        let result;
        expect(() => {
          result = deserializeBookingDraft(input);
        }).not.toThrow();
        assertEmptyRecovery(result);
      }),
      { numRuns: 500 },
    );
  });

  it('fc.anything() (fully arbitrary inputs) always recover safely', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        let result;
        expect(() => {
          result = deserializeBookingDraft(input);
        }).not.toThrow();

        // If input happened to be a valid serialized draft, it should either be a valid
        // deserialized draft or an empty recovery. We only assert on malformed inputs.
        if (result && result.empty === true) {
          assertEmptyRecovery(result);
        }
        // Otherwise it was somehow valid — that's fine, not a failure
      }),
      { numRuns: 500 },
    );
  });
});
