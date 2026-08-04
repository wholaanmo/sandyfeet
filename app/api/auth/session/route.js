// app/api/auth/session/route.js
// POST: Exchange ID token for a server session cookie.
// DELETE: Sign out — clear cookie and revoke refresh tokens.
import { getCorrelationId } from '../../../../lib/server/http/correlation.js';
import { success, error } from '../../../../lib/server/http/response.js';
import {
  createSession,
  clearSessionCookie,
  buildSessionCookieHeader,
  revokeActorSessions,
} from '../../../../lib/server/auth/session.js';
import { requireActor } from '../../../../lib/server/auth/authorization.js';

/**
 * POST /api/auth/session
 * Receives { idToken, rememberMe } from the client after Firebase Auth sign-in.
 * Returns a session cookie and minimal actor info.
 */
export async function POST(request) {
  const correlationId = getCorrelationId(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('INVALID_REQUEST', 'Invalid request body', correlationId, 400);
  }

  const { idToken, rememberMe } = body || {};

  if (!idToken || typeof idToken !== 'string') {
    return error('INVALID_REQUEST', 'idToken is required', correlationId, 400);
  }

  try {
    const { cookie, maxAge, actor } = await createSession(
      idToken,
      Boolean(rememberMe)
    );

    const response = success(
      { uid: actor.uid, role: actor.role },
      correlationId
    );

    // Set the session cookie
    response.headers.append(
      'Set-Cookie',
      buildSessionCookieHeader(cookie, maxAge)
    );

    return response;
  } catch (err) {
    if (err.code === 'UNAUTHENTICATED') {
      return error('UNAUTHENTICATED', 'Authentication failed', correlationId, 401);
    }
    return error('INTERNAL_ERROR', 'An unexpected error occurred', correlationId, 500);
  }
}

/**
 * DELETE /api/auth/session
 * Signs out the current user — clears the session cookie and revokes refresh tokens.
 */
export async function DELETE(request) {
  const correlationId = getCorrelationId(request);

  try {
    const actor = await requireActor(request);

    // Revoke refresh tokens so existing session cookies fail revocation check
    await revokeActorSessions(actor.uid);

    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
    });

    // Clear the session cookie
    clearSessionCookie(headers);

    const responseBody = JSON.stringify({
      ok: true,
      data: { signedOut: true },
      correlationId,
    });

    return new Response(responseBody, { status: 200, headers });
  } catch (err) {
    if (err.code === 'UNAUTHENTICATED') {
      // Already not authenticated, still clear cookie
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, private',
      });
      clearSessionCookie(headers);

      const responseBody = JSON.stringify({
        ok: true,
        data: { signedOut: true },
        correlationId,
      });
      return new Response(responseBody, { status: 200, headers });
    }
    return error('INTERNAL_ERROR', 'An unexpected error occurred', correlationId, 500);
  }
}
