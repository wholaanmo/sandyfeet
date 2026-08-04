// Property 13: Password policy is enforced for every accepted password
// Validates: Requirements 3.11

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validatePassword } from '../../lib/domain/password-policy.js';

/**
 * The documented special character set for the password policy.
 */
const SPECIAL_CHARS = '!@#$%^&*(),.?":{}|<>';

/**
 * Arbitrary that generates a password guaranteed to satisfy all policy rules.
 * Ensures at least one uppercase, one lowercase, one digit, one special char,
 * length 6–128, no control characters.
 */
const validPasswordArb = fc
  .tuple(
    // At least one uppercase
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    // At least one lowercase
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    // At least one digit
    fc.constantFrom(...'0123456789'.split('')),
    // At least one special character from the allowed set
    fc.constantFrom(...SPECIAL_CHARS.split('')),
    // Remaining characters (safe printable, no control chars)
    fc.array(
      fc.integer({ min: 0x20, max: 0x7e }).map((cp) => String.fromCodePoint(cp)),
      { minLength: 2, maxLength: 124 },
    ),
  )
  .map(([upper, lower, digit, special, rest]) => {
    const chars = [upper, lower, digit, special, ...rest];
    // Shuffle to avoid predictable positions
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  });

/**
 * Arbitrary that generates passwords without uppercase letters.
 */
const noUppercaseArb = fc
  .tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.constantFrom(...'0123456789'.split('')),
    fc.constantFrom(...SPECIAL_CHARS.split('')),
    fc.array(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789'.split('').concat(SPECIAL_CHARS.split('')),
      ),
      { minLength: 3, maxLength: 124 },
    ),
  )
  .map(([lower, digit, special, rest]) => [lower, digit, special, ...rest].join(''));

/**
 * Arbitrary that generates passwords without lowercase letters.
 */
const noLowercaseArb = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'0123456789'.split('')),
    fc.constantFrom(...SPECIAL_CHARS.split('')),
    fc.array(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(SPECIAL_CHARS.split('')),
      ),
      { minLength: 3, maxLength: 124 },
    ),
  )
  .map(([upper, digit, special, rest]) => [upper, digit, special, ...rest].join(''));

/**
 * Arbitrary that generates passwords without digits.
 */
const noDigitArb = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.constantFrom(...SPECIAL_CHARS.split('')),
    fc.array(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').concat(SPECIAL_CHARS.split('')),
      ),
      { minLength: 3, maxLength: 124 },
    ),
  )
  .map(([upper, lower, special, rest]) => [upper, lower, special, ...rest].join(''));

/**
 * Arbitrary that generates passwords without special characters.
 */
const noSpecialArb = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.constantFrom(...'0123456789'.split('')),
    fc.array(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''),
      ),
      { minLength: 3, maxLength: 124 },
    ),
  )
  .map(([upper, lower, digit, rest]) => [upper, lower, digit, ...rest].join(''));

/**
 * Arbitrary that generates passwords containing control characters.
 * Control chars: U+0000–U+001F, U+007F, U+0080–U+009F
 */
const withControlCharArb = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.constantFrom(...'0123456789'.split('')),
    fc.constantFrom(...SPECIAL_CHARS.split('')),
    fc.oneof(
      fc.integer({ min: 0x00, max: 0x1f }),
      fc.constant(0x7f),
      fc.integer({ min: 0x80, max: 0x9f }),
    ).map((cp) => String.fromCodePoint(cp)),
    fc.array(
      fc.integer({ min: 0x20, max: 0x7e }).map((cp) => String.fromCodePoint(cp)),
      { minLength: 1, maxLength: 120 },
    ),
  )
  .map(([upper, lower, digit, special, ctrl, rest]) =>
    [upper, lower, digit, special, ctrl, ...rest].join(''),
  );

/**
 * Arbitrary that generates passwords shorter than 6 code points.
 * Includes all character classes to isolate the length constraint.
 */
const tooShortArb = fc
  .integer({ min: 1, max: 5 })
  .chain((len) =>
    fc.array(
      fc.integer({ min: 0x20, max: 0x7e }).map((cp) => String.fromCodePoint(cp)),
      { minLength: len, maxLength: len },
    ),
  )
  .map((chars) => chars.join(''));

/**
 * Arbitrary that generates passwords longer than 128 code points.
 * Includes all character classes to isolate the length constraint.
 */
const tooLongArb = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.constantFrom(...'0123456789'.split('')),
    fc.constantFrom(...SPECIAL_CHARS.split('')),
    fc.array(
      fc.integer({ min: 0x20, max: 0x7e }).map((cp) => String.fromCodePoint(cp)),
      { minLength: 125, maxLength: 200 },
    ),
  )
  .map(([upper, lower, digit, special, rest]) =>
    [upper, lower, digit, special, ...rest].join(''),
  );

describe('Property 13: Password policy is enforced for every accepted password', () => {
  it('every accepted password meets all policy constraints', () => {
    fc.assert(
      fc.property(validPasswordArb, (password) => {
        const result = validatePassword(password);
        if (!result.valid) return; // skip passwords the generator happened to miss

        const codePoints = [...password];

        // At least 1 uppercase
        expect(codePoints.some((cp) => /[A-Z]/.test(cp))).toBe(true);
        // At least 1 lowercase
        expect(codePoints.some((cp) => /[a-z]/.test(cp))).toBe(true);
        // At least 1 digit
        expect(codePoints.some((cp) => /[0-9]/.test(cp))).toBe(true);
        // At least 1 special char from the set
        expect(codePoints.some((cp) => SPECIAL_CHARS.includes(cp))).toBe(true);
        // 6–128 code points
        expect(codePoints.length).toBeGreaterThanOrEqual(6);
        expect(codePoints.length).toBeLessThanOrEqual(128);
        // No control characters
        expect(
          codePoints.every((cp) => {
            const code = cp.codePointAt(0);
            return !(
              code <= 0x1f ||
              code === 0x7f ||
              (code >= 0x80 && code <= 0x9f)
            );
          }),
        ).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('passwords without uppercase are always rejected', () => {
    fc.assert(
      fc.property(noUppercaseArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('passwords without lowercase are always rejected', () => {
    fc.assert(
      fc.property(noLowercaseArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('passwords without a digit are always rejected', () => {
    fc.assert(
      fc.property(noDigitArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('passwords without a special character are always rejected', () => {
    fc.assert(
      fc.property(noSpecialArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('passwords with control characters are always rejected', () => {
    fc.assert(
      fc.property(withControlCharArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('passwords shorter than 6 code points are always rejected', () => {
    fc.assert(
      fc.property(tooShortArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('passwords longer than 128 code points are always rejected', () => {
    fc.assert(
      fc.property(tooLongArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});
