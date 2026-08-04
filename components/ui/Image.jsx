'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * Accessible image contract.
 *
 * - Informative images: require alt text describing the content.
 * - Decorative images: hidden from AT (aria-hidden="true", alt="").
 * - Explicit width/height for layout stability (prevents CLS).
 *
 * Requirements: 9.13, 9.14, 10.9
 */

import React from   'react';

/**
 * @param {object} props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Alt text (empty string for decorative)
 * @param {number} props.width - Explicit width for layout stability
 * @param {number} props.height - Explicit height for layout stability
 * @param {boolean} [props.decorative=false] - Mark as decorative (hidden from AT)
 * @param {'lazy'|'eager'} [props.loading='lazy'] - Loading strategy
 * @param {string} [props.sizes] - Responsive size hints
 * @param {string} [props.srcSet] - Responsive source set
 * @param {string} [props.className]
 */
export function Image({
  src,
  alt,
  width,
  height,
  decorative = false,
  loading = 'lazy',
  sizes,
  srcSet,
  className = '',
  ...rest
}) {
  if (decorative) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        loading={loading}
        sizes={sizes}
        srcSet={srcSet}
        className={className}
        {...rest}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      sizes={sizes}
      srcSet={srcSet}
      className={className}
      {...rest}
    />
  );
}

export default Image;
