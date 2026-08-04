// lib/server/auth/layout-guard.js
// Server layout guard for protected pages.
// Resolves the session from cookies and redirects if unauthorized.
import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveSession, SESSION_COOKIE_NAME } from './session.js';
import { ROLE_LANDINGS } from '../../routes/manifest.js';

/**
 * Resolve the current actor from the Next.js cookies store.
 * Returns the actor if authenticated, or null if not.
 *
 * @returns {Promise<import('./session.js').Actor | null>}
 */
async function resolveActorFromCookies() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  try {
    return await resolveSession(sessionCookie.value);
  } catch {
    return null;
  }
}

/**
 * Protect a server layout by requiring authentication and specific roles.
 * If the user is not authenticated, redirects to /login.
 * If the user lacks the required role, redirects to their role landing page.
 *
 * Use this in server layouts (not client components).
 *
 * @param {string[]} allowedRoles - Array of roles that can access this layout (e.g. ['admin'])
 * @returns {Promise<import('./session.js').Actor>} The authenticated actor
 * @throws Redirects via Next.js redirect() — never returns normally on failure
 *
 * @example
 * // In app/dashboard/admin/layout.js (server component):
 * import { withProtectedLayout } from '@/lib/server/auth/layout-guard';
 *
 * export default async function AdminLayout({ children }) {
 *   const actor = await withProtectedLayout(['admin']);
 *   // actor is guaranteed to be an authenticated admin here
 *   return <>{children}</>;
 * }
 */
export async function withProtectedLayout(allowedRoles) {
  const actor = await resolveActorFromCookies();

  if (!actor) {
    // Unauthenticated — redirect to login
    redirect('/login');
  }

  if (!allowedRoles.includes(actor.role)) {
    // Authenticated but wrong role — redirect to their landing page
    const landing = ROLE_LANDINGS[actor.role] || '/';
    redirect(landing);
  }

  return actor;
}
