'use client';

/**
 * Accessible button primitive.
 *
 * - Renders a semantic <button> element (never div/span).
 * - Visible focus indicator via :focus-visible ring.
 * - Minimum 44×44px touch target (WCAG 2.5.8).
 * - Accessible name via children or aria-label.
 * - Loading state: aria-busy + disabled.
 * - Variants: primary, secondary, ghost, danger.
 *
 * Requirements: 9.1, 9.2, 9.4, 10.3, 11.2, 11.8
 */

import React from 'react';

const VARIANT_CLASSES = {
  primary: [
    'bg-[var(--action-primary)]',
    'text-[var(--text-on-primary)]',
    'hover:bg-[var(--action-primary-hover)]',
    'active:bg-[var(--action-primary-active)]',
  ].join(' '),
  secondary: [
    'bg-[var(--action-secondary)]',
    'text-[var(--text-primary)]',
    'border',
    'border-[var(--border-default)]',
    'hover:bg-[var(--action-secondary-hover)]',
  ].join(' '),
  ghost: [
    'bg-[var(--action-ghost)]',
    'text-[var(--text-primary)]',
    'hover:bg-[var(--action-ghost-hover)]',
  ].join(' '),
  danger: [
    'bg-[var(--action-danger)]',
    'text-[var(--text-on-primary)]',
    'hover:bg-[var(--action-danger-hover)]',
  ].join(' '),
};

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'} [props.variant='primary']
 * @param {boolean} [props.loading=false]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 * @param {string} [props['aria-label']]
 * @param {'button'|'submit'|'reset'} [props.type='button']
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const isDisabled = disabled || loading;

  const baseClasses = [
    // Touch target + sizing
    'min-h-[var(--control-min-size)]',
    'min-w-[var(--control-min-size)]',
    'px-[var(--space-lg)]',
    'py-[var(--space-sm)]',
    // Typography
    'font-[var(--font-body)]',
    'text-[var(--text-sm)]',
    'font-[var(--weight-medium)]',
    // Layout
    'inline-flex',
    'items-center',
    'justify-center',
    'gap-[var(--space-sm)]',
    // Shape
    'rounded-lg',
    // Transition
    'transition-colors',
    'duration-[var(--transition-normal)]',
    'ease-[var(--easing-default)]',
    // Focus indicator (3:1 contrast ring)
    'focus-visible:outline-none',
    'focus-visible:ring-[length:var(--focus-ring-width)]',
    'focus-visible:ring-[var(--focus-ring-color)]',
    'focus-visible:ring-offset-[length:var(--focus-ring-offset)]',
    // Cursor
    'cursor-pointer',
  ].join(' ');

  const disabledClasses = isDisabled
    ? 'opacity-60 cursor-not-allowed pointer-events-none'
    : '';

  const variantClasses = VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[baseClasses, variantClasses, disabledClasses, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading && (
        <span
          className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

export default Button;
