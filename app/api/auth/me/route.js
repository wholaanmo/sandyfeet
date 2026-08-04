// app/api/auth/me/route.js
// GET: Return display-only actor information from the current session.
// Never includes sensitive fields; used for client display purposes only.
import { getCorrelationId } from '../../../../lib/server/http/correlation.js';
import { success, error } from '../../../../lib/server/http/response.js';
import { requireActor } from '../../../../lib/server/auth/authorization.js';

/**
 * GET /api/auth/me
 * Resolves the current session and returns safe display-only actor data.
 * Not used for authorization — display only.
 */
export async function GET(request) {
  const correlationId = getCorrelationId(request);

  try {
    const actor = await requireActor(request);

    // Return only display-safe fields — never tokens, session internals, or sensitive data
    return success(
      {
        uid: actor.uid,
        role: actor.role,
        email: actor.email || null,
        displayName: actor.displayName || null,
      },
      correlationId
    );
  } catch (err) {
    if (err.code === 'UNAUTHENTICATED') {
      return error('UNAUTHENTICATED', 'Not authenticated', correlationId, 401);
    }
    return error('INTERNAL_ERROR', 'An unexpected error occurred', correlationId, 500);
  }
}
