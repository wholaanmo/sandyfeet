'use client';

// components/auth/SignOutButton.js
// Client component that signs out via DELETE /api/auth/session,
// clears any remaining legacy client storage, and redirects to /login.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy credential cookie names that need to be cleared on sign-out.
 */
const OBSOLETE_COOKIE_NAMES = ['sessionToken', 'userType', 'sessionExpiry'];

/**
 * Legacy localStorage keys that need to be cleared on sign-out.
 */
const OBSOLETE_LOCAL_STORAGE_KEYS = [
  'userType',
  'userEmail',
  'userName',
  'uid',
  'sessionToken',
  'sessionExpiry',
  'rememberMe',
];

/**
 * Remove all obsolete client credentials (cookies and localStorage).
 */
function clearObsoleteCredentials() {
  // Clear legacy cookies
  for (const name of OBSOLETE_COOKIE_NAMES) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
  }

  // Clear legacy localStorage
  for (const key of OBSOLETE_LOCAL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage may be unavailable (private mode, etc.)
    }
  }
}

/**
 * SignOutButton — calls DELETE /api/auth/session then cleans up legacy
 * credentials and redirects to /login.
 *
 * @param {{ className?: string, children?: React.ReactNode }} props
 */
export function SignOutButton({ className, children }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (pending) return;
    setPending(true);

    try {
      await fetch('/api/auth/session', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      // Even if the request fails, proceed with local cleanup
    }

    // Always clear obsolete credentials regardless of server response
    clearObsoleteCredentials();

    // Redirect to login
    router.replace('/login');
  }, [pending, router]);

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className={className}
      aria-label="Sign out"
    >
      {children || (pending ? 'Signing out…' : 'Sign Out')}
    </button>
  );
}
