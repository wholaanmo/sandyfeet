// lib/server/auth/authorization.js
// Server-authoritative authorization guards.
// Extracts session from cookies, enforces role and ownership requirements.
import 'server-only';

import { resolveSession, SESSION_COOKIE_NAME } from './session.js';

/**
 * Extract the session cookie value from a Request object.
 *
 * @param {Request} request - The incoming request
 * @returns {string | null} The cookie value or null
 */
function extractSessionCookie(request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  // Parse cookies manually to find our session cookie
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const eqIndex = cookie.indexOf('=');
    if (eqIndex === -1) continue;
    const name = cookie.slice(0, eqIndex).trim();
    const value = cookie.slice(eqIndex + 1).trim();
    if (name === SESSION_COOKIE_NAME) {
      return value || null;
    }
  }
  return null;
}

/**
 * Require a valid authenticated actor from the request.
 * Extracts the session cookie, verifies it with revocation check,
 * and resolves the authoritative account.
 *
 * @param {Request} request - The incoming request
 * @returns {Promise<import('./session.js').Actor>}
 * @throws {Error} With code 'UNAUTHENTICATED' if no valid session
 */
export async function requireActor(request) {
  const cookie = extractSessionCookie(request);
  if (!cookie) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  return resolveSession(cookie);
}

/**
 * Require the actor to have one of the allowed roles.
 *
 * @param {import('./session.js').Actor} actor - The authenticated actor
 * @param {string[]} allowedRoles - Array of allowed role values (e.g. ['admin', 'staff'])
 * @throws {Error} With code 'FORBIDDEN' if the actor's role is not in the allowed set
 */
export function requireRole(actor, allowedRoles) {
  if (!actor || !allowedRoles.includes(actor.role)) {
    const err = new Error('Insufficient permissions');
    err.code = 'FORBIDDEN';
    throw err;
  }
}

/**
 * Require the actor to own a resource (actor.uid matches resource owner).
 *
 * @param {import('./session.js').Actor} actor - The authenticated actor
 * @param {{ uid?: string, ownerUid?: string, userId?: string }} resource - The resource to check
 * @throws {Error} With code 'FORBIDDEN' if ownership check fails
 */
export function requireOwner(actor, resource) {
  const ownerUid = resource.ownerUid || resource.uid || resource.userId;
  if (!actor || !ownerUid || actor.uid !== ownerUid) {
    const err = new Error('Access denied');
    err.code = 'FORBIDDEN';
    throw err;
  }
}

/**
 * Assert a valid state transition using a state machine definition.
 *
 * @param {Record<string, string[]>} machine - Adjacency map of allowed transitions
 * @param {string} from - Current state
 * @param {string} to - Desired state
 * @param {import('./session.js').Actor} actor - The authenticated actor (for logging context)
 * @param {object} [context] - Additional context for error reporting
 * @throws {Error} With code 'CONFLICT' if the transition is not permitted
 */
export function assertTransition(machine, from, to, actor, context = {}) {
  const allowed = machine[from];
  if (!allowed || !allowed.includes(to)) {
    const err = new Error(
      `Transition from '${from}' to '${to}' is not permitted`
    );
    err.code = 'CONFLICT';
    throw err;
  }
}
