'use client';

/**
 * Responsive layout wrapper.
 *
 * Ensures content fits viewport without two-axis scroll, applies
 * scroll-margin for virtual keyboard reachability, and provides
 * CSS class utilities for responsive behavior.
 *
 * Requirements: 10.1, 10.2, 10.6, 10.7
 */

import React from 'react';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {'layout'|'content'|'form'} [props.variant='layout'] - Layout behavior variant
 * @param {boolean} [props.keyboardReachable=false] - Apply scroll-margin for virtual keyboard
 * @param {boolean} [props.reflowSafe=false] - Enable flex-wrap reflow for high zoom
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.as='div'] - Element type to render
 */
export function ResponsiveContainer({
  children,
  variant = 'layout',
  keyboardReachable = false,
  reflowSafe = false,
  className = '',
  as: Component = 'div',
  ...rest
}) {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.layout;

  const classes = [
    variantClass,
    keyboardReachable && 'keyboard-reachable',
    reflowSafe && 'reflow-safe',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}

const VARIANT_CLASSES = {
  layout: 'responsive-layout',
  content: 'responsive-content',
  form: 'responsive-content resize-stable-form',
};

export default ResponsiveContainer;
