'use client';

/**
 * Accessible navigation component.
 *
 * - Semantic <nav> element with aria-label.
 * - aria-current="page" on the active link.
 * - Logical focus order following DOM order.
 * - Visible focus indicators on links.
 *
 * Requirements: 9.2, 9.3, 9.11
 */

import React from 'react';

/**
 * @typedef {object} NavLink
 * @property {string} href - Link destination
 * @property {string} label - Link text
 * @property {boolean} [active] - Whether this link is the current page
 */

/**
 * @param {object} props
 * @param {NavLink[]} props.links - Navigation links
 * @param {string} [props['aria-label']='Main navigation'] - Nav region label
 * @param {string} [props.className]
 * @param {string} [props.linkClassName]
 * @param {string} [props.activeLinkClassName]
 */
export function Navigation({
  links,
  'aria-label': ariaLabel = 'Main navigation',
  className = '',
  linkClassName = '',
  activeLinkClassName = '',
  ...rest
}) {
  return (
    <nav aria-label={ariaLabel} className={className} {...rest}>
      <ul className="list-none m-0 p-0 flex gap-[var(--space-sm)]" role="list">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              aria-current={link.active ? 'page' : undefined}
              className={[
                'inline-flex items-center',
                'min-h-[var(--control-min-size)]',
                'px-[var(--space-md)] py-[var(--space-sm)]',
                'text-[var(--text-sm)]',
                'rounded-lg',
                'no-underline',
                'transition-colors',
                'duration-[var(--transition-normal)]',
                'focus-visible:outline-none',
                'focus-visible:ring-[length:var(--focus-ring-width)]',
                'focus-visible:ring-[var(--focus-ring-color)]',
                'focus-visible:ring-offset-[length:var(--focus-ring-offset)]',
                link.active
                  ? `font-[var(--weight-semibold)] text-[var(--action-primary)] ${activeLinkClassName}`
                  : `font-[var(--weight-normal)] text-[var(--text-primary)] hover:bg-[var(--action-ghost-hover)] ${linkClassName}`,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Navigation;
