'use client';

/**
 * Accessible form field primitive.
 *
 * - Persistent programmatic label (htmlFor + id binding).
 * - Error/help text association via aria-describedby.
 * - Error announcement to assistive technology (role="alert").
 * - Required indicator.
 *
 * Requirements: 9.5, 9.6
 */

import React, { useId } from 'react';

/**
 * @param {object} props
 * @param {string} props.label - Visible, persistent label text
 * @param {string} [props.helpText] - Descriptive help text for the input
 * @param {string} [props.error] - Error message to display and announce
 * @param {boolean} [props.required=false] - Marks the field as required
 * @param {React.ReactNode} props.children - The input element(s)
 * @param {string} [props.className]
 * @param {string} [props.id] - Override the auto-generated id
 */
export function FormField({
  label,
  helpText,
  error,
  required = false,
  children,
  className = '',
  id: externalId,
}) {
  const generatedId = useId();
  const fieldId = externalId || generatedId;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;

  // Build aria-describedby from present descriptors
  const describedBy = [
    helpText ? helpId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-[var(--space-xs)] ${className}`}>
      <label
        htmlFor={fieldId}
        className="text-[var(--text-sm)] font-[var(--weight-medium)] text-[var(--text-primary)]"
      >
        {label}
        {required && (
          <span
            className="text-[var(--text-error)] ml-1"
            aria-hidden="true"
          >
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>

      {/* Clone input child to inject accessibility attributes */}
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, {
          id: fieldId,
          'aria-describedby': describedBy,
          'aria-invalid': error ? 'true' : undefined,
          'aria-required': required || undefined,
        });
      })}

      {helpText && !error && (
        <p
          id={helpId}
          className="text-[var(--text-xs)] text-[var(--text-secondary)] m-0"
        >
          {helpText}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-[var(--text-xs)] text-[var(--text-error)] m-0"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
