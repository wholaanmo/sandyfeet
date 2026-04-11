'use client';

import Image from 'next/image';

const SRC = '/assets/sandy-feet-logo.png';

/**
 * Circular mark: source files are often a square canvas with black corners;
 * we clip to a circle and slightly scale so only the round badge shows.
 */
export default function SandyFeetLogoMark({
  className = 'h-11 w-11 md:h-12 md:w-12',
  ringClassName = 'ring-1 ring-slate-200/70',
  sizes = '48px',
  priority = false,
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-white ${ringClassName} ${className}`}
    >
      <Image
        src={SRC}
        alt="Sandy Feet"
        fill
        priority={priority}
        className="object-cover object-center scale-[1.16]"
        sizes={sizes}
      />
    </div>
  );
}
