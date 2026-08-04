// Feature: application-hardening-ux-modernization, Property 2: Authentication and authorization recovery is safe
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { normalizeReturnPath, landingFor, matchRoute } from '../../lib/routes/registry.js';
import { ROUTE_MANIFEST, ROLE_LANDINGS, PUBLIC_LANDING } from '../../lib/routes/manifest.js';

/**
 * Property 2: Authentication and authorization recovery is safe
 *
 * For all protected routes and failed authentication or authorization outcomes,
 * the response shall be an allowed unauthenticated/forbidden result or an
 * active role-appropriate destination, and any attached return path shall be
 * a safe same-origin manifest path.
 *
 * **Validates: Requirements 1.5, 1.6, 4.5**
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_ROUTES = ROUTE_MANIFEST.filter((r) => r.status === 'active');
const ACTIVE_PAGE_PATTERNS = ACTIVE_ROUTES
  .filter((r) => r.kind === 'page')
  .map((r) => r.pattern);

const PUBLIC_ACTIVE_PAGE_PATTERNS = ACTIVE_ROUTES
  .filter((r) => r.kind === 'page' && r.audience === 'public')
  .map((r) => r.pattern);

const VALID_ROLE_LANDINGS = Object.values(ROLE_LANDINGS);
const ALL_SAFE_RECOVERY_TARGETS = [
  ...PUBLIC_ACTIVE_PAGE_PATTERNS,
  ...VALID_ROLE_LANDINGS,
  PUBLIC_LANDING,
];

/** Checks if a path is an active route in the manifest */
function isActiveManifestRoute(path) {
  const matched = matchRoute(path);
  return matched !== null && matched.route.status === 'active';
}

/** Checks if a path looks like an external URL */
function isExternalUrl(path) {
  return /^[a-z][a-z0-9+\-.]*:/i.test(path) || path.startsWith('//');
}

/** Checks if a path is a legacy-redirect target */
function isLegacyRedirectTarget(path) {
  const matched = matchRoute(path);
  return matched !== null && matched.route.status === 'legacy-redirect';
}

/** Sensitive patterns that should never appear in recovery URLs */
const SENSITIVE_PATTERNS = [
  /token=/i,
  /password=/i,
  /secret=/i,
  /apikey=/i,
  /api_key=/i,
  /access_token=/i,
  /refresh_token=/i,
  /session_id=/i,
  /credential=/i,
  /auth_code=/i,
];

// ── Generators ───────────────────────────────────────────────────────────────

/** Generate actors with valid roles */
const actorArb = fc.oneof(
  fc.record({ role: fc.constantFrom('admin', 'staff', 'guest') }),
  fc.constant(null)
);

/** Generate roles that exist in the system */
const roleArb = fc.constantFrom('admin', 'staff', 'guest');

/** Generate arbitrary strings that could be return paths */
const arbitraryPathArb = fc.oneof(
  // Valid-looking internal paths built from safe chars
  fc.array(fc.constantFrom('/', 'a', 'b', 'c', '-', '_', '1', '0'), { minLength: 1, maxLength: 60 })
    .map((chars) => chars.join('')),
  // Paths with special characters
  fc.string({ minLength: 0, maxLength: 100 }),
  // External URL attempts
  fc.constantFrom(
    'https://evil.com',
    'http://attacker.org/steal',
    'javascript:alert(1)',
    '//evil.com/path',
    'data:text/html,<script>alert(1)</script>',
    '\\\\evil.com\\path',
    '\x00/dashboard',
    'ftp://files.evil.com'
  ),
  // Paths with encoded characters
  fc.string({ minLength: 1, maxLength: 40 }).map((s) => `/${encodeURIComponent(s)}`),
  // Paths attempting to include credentials/tokens
  fc.constantFrom(
    '/login?token=abc123',
    '/dashboard?password=secret',
    '/rooms?access_token=xyz',
    '/home?secret=mykey&other=val'
  ),
  // Real manifest paths (should pass through)
  fc.constantFrom(...ACTIVE_PAGE_PATTERNS),
  // Legacy redirect paths (should be rejected)
  ...ROUTE_MANIFEST.filter((r) => r.status === 'legacy-redirect').map((r) => fc.constant(r.pattern))
);

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 2: Authentication and authorization recovery is safe', () => {
  it('2a) When authentication fails (actor = null), normalizeReturnPath fallback is always a valid active public route or /login', () => {
    fc.assert(
      fc.property(arbitraryPathArb, (rawPath) => {
        // When authentication fails, actor is null
        const result = normalizeReturnPath(rawPath, null);

        // The result must be a valid active route in the manifest
        expect(isActiveManifestRoute(result)).toBe(true);

        // It must not be an external URL
        expect(isExternalUrl(result)).toBe(false);

        // It must not be a legacy-redirect target
        expect(isLegacyRedirectTarget(result)).toBe(false);

        // The fallback for null actor should be the PUBLIC_LANDING
        // or a valid active public route if the input was valid
        const matched = matchRoute(result);
        expect(matched).not.toBeNull();
        expect(matched.route.status).toBe('active');
      }),
      { numRuns: 100 }
    );
  });

  it('2b) When authorization fails (wrong role), landingFor(actor) always resolves to an active route in the manifest', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const actor = { role };
        const landing = landingFor(actor);

        // The landing must always be a valid active route
        expect(isActiveManifestRoute(landing)).toBe(true);

        // It must not be a legacy-redirect
        expect(isLegacyRedirectTarget(landing)).toBe(false);

        // It must not be external
        expect(isExternalUrl(landing)).toBe(false);

        // For known roles, it should be the role-specific landing or PUBLIC_LANDING
        if (ROLE_LANDINGS[role]) {
          expect(landing).toBe(ROLE_LANDINGS[role]);
        } else {
          expect(landing).toBe(PUBLIC_LANDING);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('2c) Arbitrary string inputs to normalizeReturnPath always produce a valid active manifest route or public landing — never an external URL, never a legacy-redirect target', () => {
    fc.assert(
      fc.property(arbitraryPathArb, actorArb, (rawPath, actor) => {
        const result = normalizeReturnPath(rawPath, actor);

        // MUST be an active manifest route
        expect(isActiveManifestRoute(result)).toBe(true);

        // MUST NOT be external
        expect(isExternalUrl(result)).toBe(false);

        // MUST NOT be a legacy-redirect target
        expect(isLegacyRedirectTarget(result)).toBe(false);

        // Result must start with /
        expect(result.startsWith('/')).toBe(true);

        // Result must not contain protocol-like patterns
        expect(result).not.toMatch(/^[a-z][a-z0-9+\-.]*:/i);

        // Result must not contain backslashes
        expect(result).not.toContain('\\');

        // Result must not contain control characters
        expect(result).not.toMatch(/[\x00-\x1f\x7f]/);
      }),
      { numRuns: 100 }
    );
  });

  it('2d) Recovery paths never expose sensitive data in the URL (no tokens, passwords, etc. in generated paths)', () => {
    fc.assert(
      fc.property(arbitraryPathArb, actorArb, (rawPath, actor) => {
        const result = normalizeReturnPath(rawPath, actor);

        // The normalized result must not contain sensitive query parameters
        for (const pattern of SENSITIVE_PATTERNS) {
          expect(result).not.toMatch(pattern);
        }

        // Verify the result has no query string at all (normalizeReturnPath strips them)
        expect(result).not.toContain('?');
        expect(result).not.toContain('#');
      }),
      { numRuns: 100 }
    );
  });

  it('2e) landingFor with null/undefined/missing role always returns PUBLIC_LANDING which is an active route', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant({}),
          fc.constant({ role: null }),
          fc.constant({ role: undefined }),
          fc.constant({ role: '' }),
          fc.record({ role: fc.string({ minLength: 1, maxLength: 20 }) })
        ),
        (actor) => {
          const landing = landingFor(actor);

          // Must always be a valid active manifest route
          expect(isActiveManifestRoute(landing)).toBe(true);

          // Must not be external
          expect(isExternalUrl(landing)).toBe(false);

          // For actors without a recognized role, fallback is PUBLIC_LANDING
          if (!actor || !actor.role || !ROLE_LANDINGS[actor.role]) {
            expect(landing).toBe(PUBLIC_LANDING);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
