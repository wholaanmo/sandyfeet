// lib/domain/tokens.js
// Pure JS design token definitions and validation — mirrors tokens.css.
// No Firebase, no React, no server dependencies.
// Used for static validation that rejects invalid tokens and undocumented one-off values.

// ─── Typography ──────────────────────────────────────────────────────────────

/**
 * Valid typography family roles.
 * Corresponds to --font-body, --font-heading, --font-mono in tokens.css.
 */
export const VALID_TYPOGRAPHY_ROLES = Object.freeze([
  'body',
  'heading',
  'mono',
]);

/**
 * Valid text size tokens.
 * Corresponds to --text-xs through --text-3xl in tokens.css.
 */
export const VALID_TEXT_SIZES = Object.freeze([
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
]);

/**
 * Valid font weight tokens.
 * Corresponds to --weight-normal through --weight-bold in tokens.css.
 */
export const VALID_FONT_WEIGHTS = Object.freeze([
  'normal',
  'medium',
  'semibold',
  'bold',
]);

/**
 * Valid line height tokens.
 * Corresponds to --leading-tight through --leading-relaxed in tokens.css.
 */
export const VALID_LINE_HEIGHTS = Object.freeze([
  'tight',
  'normal',
  'relaxed',
]);

// ─── Colors ──────────────────────────────────────────────────────────────────

/**
 * Valid semantic color role names.
 * Corresponds to all color custom properties in tokens.css.
 */
export const VALID_COLOR_ROLES = Object.freeze([
  // Text colors
  'text-primary',
  'text-secondary',
  'text-on-primary',
  'text-disabled',
  'text-error',
  'text-success',

  // Action / interactive colors
  'action-primary',
  'action-primary-hover',
  'action-primary-active',
  'action-secondary',
  'action-secondary-hover',
  'action-ghost',
  'action-ghost-hover',
  'action-danger',
  'action-danger-hover',
  'action-disabled-bg',
  'action-disabled-text',

  // Borders
  'border-default',
  'border-error',
  'border-focus',

  // Surfaces
  'surface-primary',
  'surface-secondary',
  'surface-overlay',

  // Focus
  'focus-ring-color',
]);

// ─── Spacing ─────────────────────────────────────────────────────────────────

/**
 * Valid spacing scale tokens.
 * Corresponds to --space-xs through --space-3xl in tokens.css.
 */
export const VALID_SPACING_TOKENS = Object.freeze([
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  '3xl',
]);

// ─── Control sizes ───────────────────────────────────────────────────────────

/**
 * Valid control size tokens.
 * Corresponds to --control-min-size and --control-min-size-sm in tokens.css.
 */
export const VALID_CONTROL_SIZES = Object.freeze([
  'default',
  'sm',
]);

// ─── Motion / transitions ────────────────────────────────────────────────────

/**
 * Valid transition duration tokens.
 * Corresponds to --transition-fast/normal/slow in tokens.css.
 */
export const VALID_TRANSITION_DURATIONS = Object.freeze([
  'fast',
  'normal',
  'slow',
]);

/**
 * Valid easing tokens.
 * Corresponds to --easing-default/in/out in tokens.css.
 */
export const VALID_EASINGS = Object.freeze([
  'default',
  'in',
  'out',
]);

// ─── Token categories ────────────────────────────────────────────────────────

/**
 * Map of token category names to their valid values.
 */
export const TOKEN_CATEGORIES = Object.freeze({
  typography: VALID_TYPOGRAPHY_ROLES,
  textSize: VALID_TEXT_SIZES,
  fontWeight: VALID_FONT_WEIGHTS,
  lineHeight: VALID_LINE_HEIGHTS,
  color: VALID_COLOR_ROLES,
  spacing: VALID_SPACING_TOKENS,
  controlSize: VALID_CONTROL_SIZES,
  duration: VALID_TRANSITION_DURATIONS,
  easing: VALID_EASINGS,
});

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate that a token value belongs to a known category.
 * Rejects undocumented one-off values.
 *
 * @param {string} category — one of the TOKEN_CATEGORIES keys
 * @param {string} value — the token value to validate
 * @returns {boolean} — true if the value is a valid documented token
 */
export function validateToken(category, value) {
  if (!category || typeof category !== 'string') return false;
  if (!value || typeof value !== 'string') return false;

  const validValues = TOKEN_CATEGORIES[category];
  if (!Array.isArray(validValues)) return false;

  return validValues.includes(value);
}

/**
 * Validate that a color value is a documented semantic color role.
 * Convenience wrapper for color validation.
 *
 * @param {string} colorRole
 * @returns {boolean}
 */
export function isValidColorRole(colorRole) {
  return validateToken('color', colorRole);
}

/**
 * Validate that a typography value is a documented font family role.
 * Convenience wrapper for typography validation.
 *
 * @param {string} typographyRole
 * @returns {boolean}
 */
export function isValidTypographyRole(typographyRole) {
  return validateToken('typography', typographyRole);
}
