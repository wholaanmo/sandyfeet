'use client';

/**
 * ARIA live region for dynamic content updates.
 *
 * - role="status" (polite) — announces content after current speech finishes
 * - role="alert" (assertive) — interrupts current speech immediately
 * - Exposes dynamic changes to assistive technology without page navigation
 *
 * Requirements: 9.9
 */

import React from 'react';

/**
 * @param {object} props
 * @param {'polite'|'assertive'} [props.politeness='polite']
 * @param {boolean} [props.atomic=true] - Announce the entire region on change
 * @param {boolean} [props.visuallyHidden=false] - Visually hide but keep accessible
 * @param {React.ReactNode} props.children - Content to announce
 * @param {string} [props.className]
 */
export function LiveRegion({
  politeness = 'polite',
  atomic = true,
  visuallyHidden = false,
  children,
  className = '',
  ...rest
}) {
  const role = politeness === 'assertive' ? 'alert' : 'status';

  const hiddenClasses = visuallyHidden
    ? 'sr-only'
    : '';

  return (
    <div
      role={role}
      aria-live={politeness}
      aria-atomic={atomic}
      className={`${hiddenClasses} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

export default LiveRegion;
