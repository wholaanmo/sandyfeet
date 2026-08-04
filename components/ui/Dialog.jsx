'use client';

/**
 * Accessible modal dialog with focus management.
 *
 * - Focus trap: focus stays inside while open.
 * - Focus moves to first focusable element on open.
 * - Escape key closes the topmost dialog.
 * - Focus restored to trigger element on close.
 * - Background content is inert (aria-hidden on siblings).
 * - Accessible name via aria-labelledby or aria-label.
 * - role="dialog", aria-modal="true".
 *
 * Requirements: 9.2, 9.3, 9.7, 9.8, 10.4
 */

import React, { useEffect, useRef, useCallback, useId } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is visible
 * @param {function} props.onClose - Callback when dialog should close
 * @param {string} [props.title] - Dialog title (creates aria-labelledby binding)
 * @param {string} [props['aria-label']] - Alternative accessible name
 * @param {React.ReactNode} props.children - Dialog content
 * @param {string} [props.className]
 */
export function Dialog({
  open,
  onClose,
  title,
  'aria-label': ariaLabel,
  children,
  className = '',
  ...rest
}) {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const titleId = useId();

  // Capture the trigger element before opening
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    }
  }, [open]);

  // Focus management: move focus into dialog on open, restore on close
  useEffect(() => {
    if (!open || !dialogRef.current) return;

    const focusables = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
    const firstFocusable = focusables[0] || dialogRef.current;
    firstFocusable.focus();

    return () => {
      // Restore focus to trigger on close
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, [open]);

  // Background inertness: set aria-hidden on siblings
  useEffect(() => {
    if (!open || !dialogRef.current) return;

    const dialogRoot = dialogRef.current.closest('[data-dialog-root]') || dialogRef.current.parentElement;
    if (!dialogRoot || !dialogRoot.parentElement) return;

    const siblings = Array.from(dialogRoot.parentElement.children).filter(
      (el) => el !== dialogRoot && !el.hasAttribute('data-dialog-root')
    );

    siblings.forEach((el) => el.setAttribute('aria-hidden', 'true'));

    return () => {
      siblings.forEach((el) => el.removeAttribute('aria-hidden'));
    };
  }, [open]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusables = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  if (!open) return null;

  const labelProps = title
    ? { 'aria-labelledby': titleId }
    : ariaLabel
      ? { 'aria-label': ariaLabel }
      : {};

  return (
    <div data-dialog-root="">
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        {...labelProps}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={[
          'fixed z-50',
          'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'max-h-[90vh] max-w-[90vw] overflow-auto',
          'bg-[var(--surface-overlay)]',
          'rounded-lg shadow-lg',
          'p-[var(--space-xl)]',
          'focus-visible:outline-none',
          'focus-visible:ring-[length:var(--focus-ring-width)]',
          'focus-visible:ring-[var(--focus-ring-color)]',
          'focus-visible:ring-offset-[length:var(--focus-ring-offset)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {title && (
          <h2
            id={titleId}
            className="text-[var(--text-lg)] font-[var(--weight-semibold)] text-[var(--text-primary)] m-0 mb-[var(--space-lg)]"
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

export default Dialog;
