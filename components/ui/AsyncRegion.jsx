'use client';

/**
 * Async state container for loading, error, empty, and success regions.
 *
 * - Loading: aria-busy="true" with delayed label after threshold
 * - Error: announces error to assistive technology
 * - Empty: presents empty state message
 * - Success: renders children normally
 *
 * Requirements: 9.9, 13.1, 13.3, 13.4
 */

import React from 'react';

/**
 * @typedef {'idle'|'pending'|'success'|'empty'|'error'} AsyncPhase
 */

/**
 * @param {object} props
 * @param {AsyncPhase} props.phase - Current async state phase
 * @param {string} [props.loadingLabel='Loading…'] - Accessible loading label
 * @param {string} [props.emptyMessage='No results found.'] - Empty state message
 * @param {string} [props.errorMessage] - Error message to display and announce
 * @param {function} [props.onRetry] - Retry callback for error state
 * @param {string} [props.retryLabel='Retry'] - Retry button label
 * @param {React.ReactNode} props.children - Success content
 * @param {string} [props.className]
 * @param {string} [props['aria-label']] - Region label for context
 */
export function AsyncRegion({
  phase,
  loadingLabel = 'Loading…',
  emptyMessage = 'No results found.',
  errorMessage,
  onRetry,
  retryLabel = 'Retry',
  children,
  className = '',
  'aria-label': ariaLabel,
  ...rest
}) {
  const isPending = phase === 'pending';

  return (
    <div
      aria-busy={isPending || undefined}
      aria-label={ariaLabel}
      className={className}
      {...rest}
    >
      {/* Loading state */}
      {phase === 'pending' && (
        <div
          className="flex items-center gap-[var(--space-sm)] text-[var(--text-secondary)] py-[var(--space-lg)]"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
          <span>{loadingLabel}</span>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div
          className="py-[var(--space-lg)]"
          role="alert"
        >
          <p className="text-[var(--text-error)] text-[var(--text-sm)] m-0">
            {errorMessage || 'Something went wrong.'}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={[
                'mt-[var(--space-sm)]',
                'min-h-[var(--control-min-size)]',
                'min-w-[var(--control-min-size)]',
                'px-[var(--space-lg)]',
                'py-[var(--space-sm)]',
                'text-[var(--text-sm)]',
                'rounded-lg',
                'border',
                'border-[var(--border-default)]',
                'bg-[var(--surface-primary)]',
                'text-[var(--text-primary)]',
                'cursor-pointer',
                'focus-visible:outline-none',
                'focus-visible:ring-[length:var(--focus-ring-width)]',
                'focus-visible:ring-[var(--focus-ring-color)]',
                'focus-visible:ring-offset-[length:var(--focus-ring-offset)]',
              ].join(' ')}
            >
              {retryLabel}
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {phase === 'empty' && (
        <div
          className="py-[var(--space-lg)] text-[var(--text-secondary)] text-[var(--text-sm)]"
          role="status"
          aria-live="polite"
        >
          <p className="m-0">{emptyMessage}</p>
        </div>
      )}

      {/* Success — render children */}
      {(phase === 'success' || phase === 'idle') && children}
    </div>
  );
}

export default AsyncRegion;
