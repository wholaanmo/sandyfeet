// lib/domain/password-policy.js
// Shared canonical password policy — pure, no server/browser dependencies.
// Validates passwords against the documented policy for both client and server use.

/**
 * Allowed special characters for the password policy.
 */
const SPECIAL_CHARS = '!@#$%^&*(),.?":{}|<>';

/**
 * Human-readable description of the password policy for UI display.
 */
export const PASSWORD_POLICY_DESCRIPTION =
  'Password must be 6–128 characters and include at least one uppercase letter (A–Z), ' +
  'one lowercase letter (a–z), one digit (0–9), and one special character (' +
  SPECIAL_CHARS +
  '). Control characters are not allowed.';

/**
 * Validate a password against the canonical password policy.
 *
 * Policy rules:
 * - 6 to 128 Unicode code points (no trimming applied)
 * - At least 1 uppercase ASCII letter (A–Z)
 * - At least 1 lowercase ASCII letter (a–z)
 * - At least 1 digit (0–9)
 * - At least 1 character from the special set: !@#$%^&*(),.?":{}|<>
 * - No NUL (U+0000) or control characters (U+0001–U+001F, U+007F, U+0080–U+009F)
 * - No trimming: leading/trailing whitespace is preserved and counted
 *
 * @param {string} password - The password to validate (not trimmed)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePassword(password) {
  const errors = [];

  if (typeof password !== 'string') {
    return { valid: false, errors: ['Password must be a string'] };
  }

  // Count Unicode code points (not UTF-16 code units)
  const codePoints = [...password];
  const length = codePoints.length;

  if (length < 6) {
    errors.push('Password must be at least 6 characters');
  }

  if (length > 128) {
    errors.push('Password must be at most 128 characters');
  }

  // Check for control characters (NUL, U+0001–U+001F, U+007F, U+0080–U+009F)
  const hasControlChars = codePoints.some((cp) => {
    const code = cp.codePointAt(0);
    return (
      code === 0x00 || // NUL
      (code >= 0x01 && code <= 0x1f) || // C0 controls
      code === 0x7f || // DEL
      (code >= 0x80 && code <= 0x9f) // C1 controls
    );
  });

  if (hasControlChars) {
    errors.push('Password must not contain control characters');
  }

  // Check character class requirements
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A–Z)');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a–z)');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit (0–9)');
  }

  // Check for at least one special character from the allowed set
  const specialCharsRegex = /[!@#$%^&*()\,.\?":{}|<>]/;
  if (!specialCharsRegex.test(password)) {
    errors.push(`Password must contain at least one special character (${SPECIAL_CHARS})`);
  }

  return { valid: errors.length === 0, errors };
}
