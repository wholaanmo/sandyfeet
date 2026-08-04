'use client';

/**
 * Accessible responsive table with labeled scrollable container.
 *
 * - Semantic <table> with <caption> for accessible name.
 * - Scrollable container with role="region" and aria-label for overflow.
 * - tabindex="0" on scroll container for keyboard scrolling.
 * - Proper <thead>/<tbody> structure with scope attributes.
 *
 * Requirements: 9.2, 10.8
 */

import React from 'react';

/**
 * @typedef {object} Column
 * @property {string} key - Data key for this column
 * @property {string} header - Column header text
 */

/**
 * @param {object} props
 * @param {string} props.caption - Table caption / accessible name
 * @param {Column[]} props.columns - Column definitions
 * @param {Array<Record<string, React.ReactNode>>} props.data - Row data objects
 * @param {string} [props['aria-label']] - Override label for scroll region
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children] - Optional custom table body (overrides data rendering)
 */
export function ResponsiveTable({
  caption,
  columns,
  data,
  'aria-label': ariaLabel,
  className = '',
  children,
  ...rest
}) {
  const scrollLabel = ariaLabel || `${caption}, scrollable`;

  return (
    <div
      role="region"
      aria-label={scrollLabel}
      tabIndex={0}
      className={[
        'overflow-x-auto',
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
      <table className="w-full border-collapse text-[var(--text-sm)]">
        <caption className="text-[var(--text-base)] font-[var(--weight-semibold)] text-[var(--text-primary)] text-left pb-[var(--space-sm)]">
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="text-left px-[var(--space-md)] py-[var(--space-sm)] font-[var(--weight-medium)] text-[var(--text-secondary)] border-b border-[var(--border-default)] whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children ||
            data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-[var(--space-md)] py-[var(--space-sm)] text-[var(--text-primary)] border-b border-[var(--border-default)]"
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default ResponsiveTable;
