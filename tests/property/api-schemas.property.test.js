// Property 5: API schemas form the request boundary
// Validates: Requirements 2.1, 15.4

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import {
  trimmedString,
  boundedString,
  email,
  positiveInt,
  strictObject,
} from '../../lib/server/http/schemas.js';

describe('Property 5: API schemas form the request boundary', () => {
  describe('trimmedString rejects whitespace-only strings', () => {
    it('rejects any string that is empty after trimming', () => {
      // Generate whitespace-only strings using array of whitespace chars joined together
      const whitespaceChars = [' ', '\t', '\n', '\r', '\f', '\v'];
      const whitespaceOnlyArb = fc
        .array(fc.constantFrom(...whitespaceChars), { minLength: 0, maxLength: 50 })
        .map((chars) => chars.join(''));

      fc.assert(
        fc.property(whitespaceOnlyArb, (input) => {
          const result = trimmedString.safeParse(input);
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('boundedString(min, max) rejects strings outside bounds after trim', () => {
    it('rejects strings shorter than min after trimming', () => {
      fc.assert(
        fc.property(
          // min between 2 and 10, max between min and 50
          fc.integer({ min: 2, max: 10 }),
          fc.integer({ min: 11, max: 50 }),
          // Generate strings that after trim are shorter than min
          fc.nat({ max: 20 }),
          (min, max, paddingLen) => {
            // Create a string of length < min (0 to min-1 non-whitespace chars)
            const contentLen = fc.sample(fc.nat({ max: min - 1 }), 1)[0];
            const content = 'a'.repeat(contentLen);
            const padding = ' '.repeat(paddingLen);
            const input = padding + content + padding;

            const schema = boundedString(min, max);
            const result = schema.safeParse(input);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects strings longer than max after trimming', () => {
      fc.assert(
        fc.property(
          // min between 1 and 5, max between 5 and 20
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 5, max: 20 }),
          // extra chars beyond max
          fc.integer({ min: 1, max: 30 }),
          (min, max, extra) => {
            // Create a string of length > max
            const content = 'b'.repeat(max + extra);
            const schema = boundedString(min, max);
            const result = schema.safeParse(content);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('accepts strings within bounds after trimming', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 10, max: 30 }),
          (min, max) => {
            // Generate a string with length between min and max
            const len = min + Math.floor(Math.random() * (max - min + 1));
            const content = 'c'.repeat(len);
            const schema = boundedString(min, max);
            const result = schema.safeParse('  ' + content + '  ');
            expect(result.success).toBe(true);
            expect(result.data).toBe(content);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('email rejects non-email strings', () => {
    it('parsing arbitrary strings yields either valid email or ZodError', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 300 }), (input) => {
          const result = email.safeParse(input);
          if (result.success) {
            // If accepted, the output must be a trimmed, lowercased valid-looking email
            expect(result.data).toBe(result.data.trim().toLowerCase());
            expect(result.data).toMatch(/.+@.+\..+/);
          } else {
            // Must be a ZodError
            expect(result.error).toBeInstanceOf(z.ZodError);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('rejects strings without @ sign', () => {
      const noAtArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@'));

      fc.assert(
        fc.property(noAtArb, (input) => {
          const result = email.safeParse(input);
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('positiveInt rejects zero, negatives, and non-integers', () => {
    it('rejects zero', () => {
      const result = positiveInt.safeParse(0);
      expect(result.success).toBe(false);
    });

    it('rejects negative numbers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1_000_000, max: -1 }),
          (n) => {
            const result = positiveInt.safeParse(n);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects non-integer numbers (floats)', () => {
      // Generate numbers that are not integers
      const nonIntArb = fc.double({ min: 0.01, max: 1_000_000, noNaN: true })
        .filter((n) => !Number.isInteger(n));

      fc.assert(
        fc.property(nonIntArb, (n) => {
          const result = positiveInt.safeParse(n);
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('rejects Infinity and NaN', () => {
      expect(positiveInt.safeParse(Infinity).success).toBe(false);
      expect(positiveInt.safeParse(-Infinity).success).toBe(false);
      expect(positiveInt.safeParse(NaN).success).toBe(false);
    });

    it('accepts positive integers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
          (n) => {
            const result = positiveInt.safeParse(n);
            expect(result.success).toBe(true);
            expect(result.data).toBe(n);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('strictObject rejects objects with unknown keys', () => {
    it('rejects objects with extra keys beyond the defined shape', () => {
      // Define a simple strict schema
      const schema = strictObject({
        name: trimmedString,
        age: positiveInt,
      });

      // Generate valid base data with random extra keys
      const extraKeysArb = fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (k) => k !== 'name' && k !== 'age',
        ),
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        { minKeys: 1, maxKeys: 5 },
      );

      fc.assert(
        fc.property(extraKeysArb, (extraFields) => {
          const input = { name: 'valid', age: 1, ...extraFields };
          const result = schema.safeParse(input);
          expect(result.success).toBe(false);
          expect(result.error).toBeInstanceOf(z.ZodError);
        }),
        { numRuns: 100 },
      );
    });

    it('accepts objects matching the exact shape', () => {
      const schema = strictObject({
        title: trimmedString,
        count: positiveInt,
      });

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          fc.integer({ min: 1, max: 10000 }),
          (title, count) => {
            const result = schema.safeParse({ title, count });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('schema fuzzing: parsing never throws unhandled exceptions', () => {
    const schemas = [
      { name: 'trimmedString', schema: trimmedString },
      { name: 'boundedString(1, 100)', schema: boundedString(1, 100) },
      { name: 'email', schema: email },
      { name: 'positiveInt', schema: positiveInt },
      { name: 'strictObject({name: trimmedString})', schema: strictObject({ name: trimmedString }) },
    ];

    for (const { name, schema } of schemas) {
      it(`${name}.safeParse never throws (always returns success or ZodError)`, () => {
        fc.assert(
          fc.property(fc.anything(), (input) => {
            const result = schema.safeParse(input);
            // safeParse must always return a result object, never throw
            expect(result).toHaveProperty('success');
            if (!result.success) {
              expect(result.error).toBeInstanceOf(z.ZodError);
            }
          }),
          { numRuns: 500 },
        );
      });
    }
  });
});
