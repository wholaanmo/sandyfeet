'use client';

/**
 * Global Error Boundary
 *
 * Presents a recoverable error state without exposing:
 * - Stack traces
 * - Internal paths
 * - Provider details
 * - Sensitive data
 *
 * Offers a retry action and links to safe destinations.
 */

import Link from 'next/link';

export default function GlobalError({ error, reset }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FCFF] px-4">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-4xl font-bold text-gray-300">Error</h1>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          We encountered an unexpected error. Please try again or navigate to a
          safe page.
        </p>
        <div className="mt-8 space-y-3">
          <button
            onClick={() => reset()}
            className="block w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go to Home
          </Link>
          <Link
            href="/login"
            className="block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
