// tests/unit/password-policy.unit.test.js
// Unit tests for lib/domain/password-policy.js
import { describe, it, expect } from 'vitest';
import { validatePassword, PASSWORD_POLICY_DESCRIPTION } from '../../lib/domain/password-policy.js';

describe('lib/domain/password-policy', () => {
  describe('PASSWORD_POLICY_DESCRIPTION', () => {
    it('is a non-empty string describing the policy', () => {
      expect(typeof PASSWORD_POLICY_DESCRIPTION).toBe('string');
      expect(PASSWORD_POLICY_DESCRIPTION.length).toBeGreaterThan(0);
      // Should mention key requirements
      expect(PASSWORD_POLICY_DESCRIPTION).toContain('6');
      expect(PASSWORD_POLICY_DESCRIPTION).toContain('128');
      expect(PASSWORD_POLICY_DESCRIPTION).toContain('uppercase');
      expect(PASSWORD_POLICY_DESCRIPTION).toContain('lowercase');
      expect(PASSWORD_POLICY_DESCRIPTION).toContain('digit');
      expect(PASSWORD_POLICY_DESCRIPTION).toContain('special character');
    });
  });

  describe('validatePassword', () => {
    describe('valid passwords', () => {
      it('accepts a password meeting all requirements', () => {
        const result = validatePassword('Abc123!x');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts a password with exactly 6 characters', () => {
        const result = validatePassword('Ab1!xy');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts a password with 128 characters', () => {
        // 124 filler + 4 required chars
        const filler = 'a'.repeat(124);
        const result = validatePassword(filler + 'A1!x');
        // Actually this has lowercase (a), uppercase (A), digit (1), special (!)
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts passwords with various special characters', () => {
        const specials = '!@#$%^&*(),.?":{}|<>';
        for (const ch of specials) {
          const pwd = `Abc12${ch}`;
          const result = validatePassword(pwd);
          expect(result.valid).toBe(true, `Failed for special char: ${ch}`);
        }
      });

      it('accepts passwords with Unicode characters beyond ASCII', () => {
        // Unicode characters are allowed as filler, requirements are ASCII-specific
        const result = validatePassword('Abc1!日本語テスト');
        expect(result.valid).toBe(true);
      });

      it('preserves leading/trailing spaces (no trimming)', () => {
        // Spaces count toward length but aren't trimmed
        const result = validatePassword(' Ab1! x');
        expect(result.valid).toBe(true);
      });

      it('accepts passwords with emoji (multi-code-point)', () => {
        const result = validatePassword('Ab1!😀x');
        expect(result.valid).toBe(true);
      });
    });

    describe('invalid passwords', () => {
      it('rejects non-string input', () => {
        expect(validatePassword(null).valid).toBe(false);
        expect(validatePassword(undefined).valid).toBe(false);
        expect(validatePassword(123).valid).toBe(false);
        expect(validatePassword({}).valid).toBe(false);
      });

      it('rejects passwords shorter than 6 characters', () => {
        const result = validatePassword('Ab1!x');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must be at least 6 characters');
      });

      it('rejects empty string', () => {
        const result = validatePassword('');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must be at least 6 characters');
      });

      it('rejects passwords longer than 128 code points', () => {
        const longPwd = 'A'.repeat(125) + 'a1!x' + 'b'; // 130 chars
        const result = validatePassword(longPwd);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must be at most 128 characters');
      });

      it('rejects passwords without uppercase letter', () => {
        const result = validatePassword('abc123!x');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('uppercase'))).toBe(true);
      });

      it('rejects passwords without lowercase letter', () => {
        const result = validatePassword('ABC123!X');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('lowercase'))).toBe(true);
      });

      it('rejects passwords without a digit', () => {
        const result = validatePassword('Abcdef!x');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('digit'))).toBe(true);
      });

      it('rejects passwords without a special character', () => {
        const result = validatePassword('Abc123xy');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('special character'))).toBe(true);
      });

      it('rejects passwords with NUL character', () => {
        const result = validatePassword('Abc1!\x00x');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('control characters'))).toBe(true);
      });

      it('rejects passwords with C0 control characters', () => {
        const result = validatePassword('Abc1!\x01x');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('control characters'))).toBe(true);
      });

      it('rejects passwords with DEL character (U+007F)', () => {
        const result = validatePassword('Abc1!\x7Fx');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('control characters'))).toBe(true);
      });

      it('rejects passwords with C1 control characters (U+0080–U+009F)', () => {
        const result = validatePassword('Abc1!\x80x');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('control characters'))).toBe(true);
      });

      it('collects multiple errors for passwords failing multiple requirements', () => {
        const result = validatePassword('a');
        expect(result.valid).toBe(false);
        // Should have errors for: length, uppercase, digit, special
        expect(result.errors.length).toBeGreaterThanOrEqual(4);
      });
    });

    describe('length counting', () => {
      it('counts Unicode code points not UTF-16 code units', () => {
        // Emoji like 😀 is 1 code point but 2 UTF-16 code units
        // So 5 ASCII chars + 1 emoji = 6 code points
        const result = validatePassword('Ab1!x😀');
        // Should not fail length validation (6 code points)
        expect(result.errors).not.toContain('Password must be at least 6 characters');
      });

      it('handles surrogate pairs correctly for length boundary', () => {
        // 5 code points is too short
        const result = validatePassword('Ab1!😀');
        expect(result.errors).toContain('Password must be at least 6 characters');
      });
    });
  });
});
