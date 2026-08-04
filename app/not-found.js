/**
 * Global Not Found Page
 *
 * Role-aware recovery links:
 * - Always shows link to public landing (/)
 * - Always shows link to /login
 * - If the user has a cookie hinting a role, shows the role landing link
 *
 * Does not expose diagnostic information or sensitive data.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { ROLE_LANDINGS, PUBLIC_LANDING } from '@/lib/routes/manifest.js';

export const metadata = {
  title: 'Page Not Found — Sandyfeet Resort',
};

export default async function NotFound() {
  // Attempt to read role from cookies for recovery link hints.
  // This is NOT authorization — it's a UX convenience for recovery navigation.
  let roleLanding = null;
  try {
    const cookieStore = await cookies();
    const userType = cookieStore.get('userType')?.value;
    if (userType && ROLE_LANDINGS[userType]) {
      roleLanding = { role: userType, href: ROLE_LANDINGS[userType] };
    }
  } catch {
    // Cookie reading may fail in edge cases; ignore and show public links only
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FCFF] px-4">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-6xl font-bold text-gray-300">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          The page you are looking for does not exist or has been moved.
        </p>
        <nav aria-label="Recovery links" className="mt-8 space-y-3">
          <Link
            href={PUBLIC_LANDING}
            className="block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to Home
          </Link>
          <Link
            href="/login"
            className="block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go to Login
          </Link>
          {roleLanding && (
            <Link
              href={roleLanding.href}
              className="block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Go to {roleLanding.role === 'admin' ? 'Admin' : 'Staff'} Dashboard
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}
