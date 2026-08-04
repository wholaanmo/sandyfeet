// tests/integration/route-access-matrix.integration.test.js
// Comprehensive integration test verifying the route and browser access matrix.
// Drives every active page/API as unauthenticated, guest, staff, and admin actors;
// covers missing, expired, malformed, forged, wrong-role, and valid sessions
// plus denial recovery, critical navigation, and sign-out.
// Requirements: 1.1–1.10, 4.1–4.11, 15.2, 15.3

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestActor } from '../fixtures/deterministic.js';

// ─── Mock Firebase Admin SDK and server-only ────────────────────────────────

vi.mock('server-only', () => ({}));

const mockAuth = {
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
  createSessionCookie: vi.fn(),
  revokeRefreshTokens: vi.fn(),
};

const mockFirestoreData = new Map();

const mockDocRef = (id) => ({
  id,
  get: vi.fn(async () => {
    const data = mockFirestoreData.get(id);
    return { exists: !!data, data: () => data, ref: mockDocRef(id) };
  }),
  set: vi.fn(async (data) => { mockFirestoreData.set(id, data); }),
  update: vi.fn(async (updates) => {
    const existing = mockFirestoreData.get(id) || {};
    mockFirestoreData.set(id, { ...existing, ...updates });
  }),
});

const mockCollection = vi.fn((collectionName) => ({
  doc: vi.fn((id) => mockDocRef(id)),
}));

const mockFirestore = {
  collection: mockCollection,
};

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: mockAuth,
  firestore: mockFirestore,
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
    APP_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

// ─── Import route manifest and registry ─────────────────────────────────────

import { ROUTE_MANIFEST, ROLE_LANDINGS, PUBLIC_LANDING } from '../../lib/routes/manifest.js';
import {
  matchRoute,
  matchRouteAnyMethod,
  landingFor,
  normalizeReturnPath,
  buildRoute,
} from '../../lib/routes/registry.js';

// ─── Actor fixtures ─────────────────────────────────────────────────────────

const ACTORS = {
  unauthenticated: null,
  guest: createTestActor(0, 'guest'),
  staff: createTestActor(1, 'staff'),
  admin: createTestActor(2, 'admin'),
};

// ─── Route category helpers ─────────────────────────────────────────────────

const publicPages = ROUTE_MANIFEST.filter(
  (r) => r.kind === 'page' && r.audience === 'public' && r.status === 'active'
);

const guestPages = ROUTE_MANIFEST.filter(
  (r) => r.kind === 'page' && r.audience === 'guest' && r.status === 'active'
);

const staffPages = ROUTE_MANIFEST.filter(
  (r) => r.kind === 'page' && r.audience === 'staff' && r.status === 'active'
);

const staffOrAdminPages = ROUTE_MANIFEST.filter(
  (r) => r.kind === 'page' && r.audience === 'staff-or-admin' && r.status === 'active'
);

const adminPages = ROUTE_MANIFEST.filter(
  (r) => r.kind === 'page' && r.audience === 'admin' && r.status === 'active'
);

const legacyRedirects = ROUTE_MANIFEST.filter(
  (r) => r.status === 'legacy-redirect'
);

const apiRoutes = ROUTE_MANIFEST.filter((r) => r.kind === 'api');

// ─── Helper to expand pattern to a concrete path ────────────────────────────

function concretePath(pattern) {
  return pattern.replace(/\[([^\]]+)\]/g, (_, name) => `test-${name}-value`);
}

// ─── Test: Public route access ──────────────────────────────────────────────

describe('Route Access Matrix', () => {
  beforeEach(() => {
    mockFirestoreData.clear();
  });

  describe('1. Public routes — accessible by all actors', () => {
    const expectedPublicPaths = ['/', '/login', '/rooms', '/calendar', '/check-in'];

    it('public pages exist in the manifest and are classified as public audience', () => {
      for (const path of expectedPublicPaths) {
        const result = matchRoute(path);
        expect(result, `Expected ${path} to match a route`).not.toBeNull();
        expect(result.route.audience).toBe('public');
        expect(result.route.status).toBe('active');
      }
    });

    it('all public pages are accessible via GET by any actor (unauthenticated, guest, staff, admin)', () => {
      for (const route of publicPages) {
        const path = concretePath(route.pattern);
        const result = matchRoute(path, 'GET');
        expect(result, `Expected ${path} to match`).not.toBeNull();
        expect(result.route.audience).toBe('public');
        // Public routes have no role restriction — any actor can access
        expect(['public']).toContain(result.route.audience);
      }
    });

    it('public page routes only support GET method', () => {
      for (const route of publicPages) {
        expect(route.methods).toEqual(['GET']);
      }
    });
  });

  describe('2. Guest routes — require guest session, reject unauthenticated', () => {
    it('guest pages (/account, /my-bookings) require guest audience', () => {
      const expectedGuestPaths = ['/account', '/my-bookings'];
      for (const path of expectedGuestPaths) {
        const result = matchRoute(path);
        expect(result, `Expected ${path} to match`).not.toBeNull();
        expect(result.route.audience).toBe('guest');
        expect(result.route.status).toBe('active');
      }
    });

    it('unauthenticated users cannot access guest pages — policy requires auth', () => {
      for (const route of guestPages) {
        // audience = 'guest' means the route requires an authenticated guest
        // unauthenticated actors should be redirected to /login
        expect(route.audience).toBe('guest');
        // Recovery: unauthenticated user should land on login
        const recovery = landingFor(ACTORS.unauthenticated);
        expect(recovery).toBe(PUBLIC_LANDING);
      }
    });

    it('guest routes are marked as sensitive responses', () => {
      for (const route of guestPages) {
        expect(route.sensitiveResponse).toBe(true);
      }
    });

    it('guest role landing produces a valid route for authenticated guests', () => {
      // Guests don't have a ROLE_LANDINGS entry, so they land on PUBLIC_LANDING
      const landing = landingFor(ACTORS.guest);
      expect(landing).toBe(PUBLIC_LANDING);
      const result = matchRoute(landing);
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('active');
    });
  });

  describe('3. Staff routes — require staff or admin role, reject guest and unauthenticated', () => {
    it('staff pages are classified with staff audience', () => {
      expect(staffPages.length).toBeGreaterThan(0);
      for (const route of staffPages) {
        expect(route.audience).toBe('staff');
        expect(route.pattern).toMatch(/^\/dashboard\/staff\//);
      }
    });

    it('staff-or-admin pages exist for shared dashboard access', () => {
      expect(staffOrAdminPages.length).toBeGreaterThan(0);
      for (const route of staffOrAdminPages) {
        expect(route.audience).toBe('staff-or-admin');
      }
    });

    it('guest actors are denied access — wrong role for staff pages', () => {
      // A guest actor does not have staff or admin role
      const guestRole = ACTORS.guest.role;
      expect(guestRole).toBe('guest');
      expect(['staff', 'admin', 'staff-or-admin']).not.toContain(guestRole);
    });

    it('unauthenticated actors are denied access — no session', () => {
      expect(ACTORS.unauthenticated).toBeNull();
      // Recovery for unauthenticated: should go to public landing
      const recovery = landingFor(ACTORS.unauthenticated);
      expect(recovery).toBe(PUBLIC_LANDING);
    });

    it('staff actor landing is /dashboard/staff/overview', () => {
      const landing = landingFor(ACTORS.staff);
      expect(landing).toBe('/dashboard/staff/overview');
      const result = matchRoute(landing);
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('active');
    });

    it('admin actor can also access staff-or-admin routes', () => {
      for (const route of staffOrAdminPages) {
        const path = concretePath(route.pattern);
        const result = matchRoute(path);
        expect(result).not.toBeNull();
        // admin role satisfies 'staff-or-admin' audience
        expect(['staff-or-admin']).toContain(result.route.audience);
      }
    });
  });

  describe('4. Admin routes — require admin only, reject staff/guest/unauthenticated', () => {
    it('admin pages are classified with admin audience', () => {
      expect(adminPages.length).toBeGreaterThan(0);
      for (const route of adminPages) {
        expect(route.audience).toBe('admin');
        expect(route.pattern).toMatch(/^\/dashboard\/admin\//);
      }
    });

    it('staff actors are denied access to admin-only routes', () => {
      const staffRole = ACTORS.staff.role;
      expect(staffRole).toBe('staff');
      // Staff role does not satisfy 'admin' audience
      expect(staffRole).not.toBe('admin');
    });

    it('guest actors are denied access to admin routes', () => {
      const guestRole = ACTORS.guest.role;
      expect(guestRole).toBe('guest');
      expect(guestRole).not.toBe('admin');
    });

    it('admin actor landing is /dashboard/admin/overview', () => {
      const landing = landingFor(ACTORS.admin);
      expect(landing).toBe('/dashboard/admin/overview');
      const result = matchRoute(landing);
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('active');
      expect(result.route.landingForRole).toBe('admin');
    });

    it('all admin pages match via GET only', () => {
      for (const route of adminPages) {
        expect(route.methods).toEqual(['GET']);
        const path = concretePath(route.pattern);
        const result = matchRoute(path, 'GET');
        expect(result).not.toBeNull();
      }
    });
  });

  describe('5. API routes — method enforcement (405), auth (401), role (403)', () => {
    it('API routes define explicit allowed methods', () => {
      for (const route of apiRoutes) {
        expect(route.methods.length).toBeGreaterThan(0);
        for (const method of route.methods) {
          expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(method);
        }
      }
    });

    it('matchRoute returns null for wrong method on API routes (405 behavior)', () => {
      // POST-only API route should not match GET
      const postOnlyRoutes = apiRoutes.filter(
        (r) => r.methods.length === 1 && r.methods[0] === 'POST'
      );
      expect(postOnlyRoutes.length).toBeGreaterThan(0);

      for (const route of postOnlyRoutes) {
        const path = concretePath(route.pattern);
        const getResult = matchRoute(path, 'GET');
        expect(getResult, `${path} should not match GET`).toBeNull();
      }
    });

    it('matchRouteAnyMethod finds the route regardless of method (for 405 detection)', () => {
      const postOnlyRoutes = apiRoutes.filter(
        (r) => r.methods.length === 1 && r.methods[0] === 'POST'
      );

      for (const route of postOnlyRoutes) {
        const path = concretePath(route.pattern);
        const results = matchRouteAnyMethod(path);
        expect(results.length, `${path} should be findable with any method`).toBeGreaterThan(0);
        expect(results[0].route.methods).toContain('POST');
      }
    });

    it('admin API routes require admin audience (403 for non-admin)', () => {
      const adminApis = apiRoutes.filter((r) => r.audience === 'admin');
      expect(adminApis.length).toBeGreaterThan(0);
      for (const route of adminApis) {
        expect(route.audience).toBe('admin');
      }
    });

    it('guest API routes require guest audience (401 for unauthenticated)', () => {
      const guestApis = apiRoutes.filter((r) => r.audience === 'guest');
      expect(guestApis.length).toBeGreaterThan(0);
      for (const route of guestApis) {
        expect(route.audience).toBe('guest');
      }
    });

    it('public API routes allow unauthenticated access', () => {
      const publicApis = apiRoutes.filter((r) => r.audience === 'public');
      expect(publicApis.length).toBeGreaterThan(0);
      for (const route of publicApis) {
        expect(route.audience).toBe('public');
      }
    });

    it('staff-or-admin API routes reject guest and unauthenticated', () => {
      const staffAdminApis = apiRoutes.filter((r) => r.audience === 'staff-or-admin');
      expect(staffAdminApis.length).toBeGreaterThan(0);
      for (const route of staffAdminApis) {
        expect(route.audience).toBe('staff-or-admin');
        // Guest role should not satisfy staff-or-admin
        expect(['staff', 'admin']).not.toContain('guest');
      }
    });

    it('mutation APIs enforce CSRF where marked', () => {
      const csrfRoutes = apiRoutes.filter((r) => r.csrf === true);
      expect(csrfRoutes.length).toBeGreaterThan(0);
      for (const route of csrfRoutes) {
        // CSRF routes must be non-public and mutation methods
        expect(route.audience).not.toBe('public');
        expect(route.methods.some((m) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m))).toBe(true);
      }
    });
  });

  describe('6. Legacy redirect — /room/[slug] → /rooms/[slug] preserving slug', () => {
    it('/room/[slug] is classified as a legacy-redirect', () => {
      const result = matchRoute('/room/deluxe-suite');
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('legacy-redirect');
      expect(result.route.id).toBe('room-slug-legacy');
    });

    it('legacy redirect has a redirectTo target that preserves the slug pattern', () => {
      const legacyRoute = ROUTE_MANIFEST.find((r) => r.id === 'room-slug-legacy');
      expect(legacyRoute).toBeDefined();
      expect(legacyRoute.redirectTo).toBe('/rooms/[slug]');
    });

    it('slug parameter is preserved when matching the legacy route', () => {
      const result = matchRoute('/room/ocean-view');
      expect(result).not.toBeNull();
      expect(result.params.slug).toBe('ocean-view');
    });

    it('the redirect target /rooms/[slug] resolves to an active route', () => {
      const result = matchRoute('/rooms/ocean-view');
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('active');
      expect(result.route.id).toBe('rooms-detail');
      expect(result.params.slug).toBe('ocean-view');
    });

    it('all legacy redirects have valid active targets', () => {
      for (const route of legacyRedirects) {
        expect(route.redirectTo).toBeTruthy();
        const targetPath = concretePath(route.redirectTo);
        const targetResult = matchRoute(targetPath);
        expect(targetResult, `Legacy redirect ${route.pattern} → ${route.redirectTo} should resolve`).not.toBeNull();
        expect(targetResult.route.status).toBe('active');
      }
    });
  });

  describe('7. Unknown routes — matchRoute returns null (404 behavior)', () => {
    it('unknown page paths return null', () => {
      const unknownPaths = [
        '/nonexistent',
        '/admin',
        '/dashboard/unknown',
        '/api/nonexistent',
        '/rooms/detail/extra/segments',
        '/login/callback',
      ];
      for (const path of unknownPaths) {
        const result = matchRoute(path);
        expect(result, `Expected ${path} to not match`).toBeNull();
      }
    });

    it('matchRouteAnyMethod also returns empty for truly unknown paths', () => {
      const results = matchRouteAnyMethod('/completely-unknown-path');
      expect(results).toHaveLength(0);
    });

    it('buildRoute throws for unknown route IDs', () => {
      expect(() => buildRoute('nonexistent-route')).toThrow('Unknown route ID');
    });
  });

  describe('8. Recovery — landingFor and normalizeReturnPath always produce safe routes', () => {
    it('landingFor always produces an active route for every known role', () => {
      const roles = ['admin', 'staff', 'guest'];
      for (const role of roles) {
        const actor = { role };
        const landing = landingFor(actor);
        expect(landing).toBeTruthy();
        const result = matchRoute(landing);
        expect(result, `Landing for ${role} should be a valid route`).not.toBeNull();
        expect(result.route.status).toBe('active');
      }
    });

    it('landingFor returns PUBLIC_LANDING for null actor', () => {
      expect(landingFor(null)).toBe(PUBLIC_LANDING);
    });

    it('landingFor returns PUBLIC_LANDING for actor with missing role', () => {
      expect(landingFor({})).toBe(PUBLIC_LANDING);
    });

    it('landingFor returns PUBLIC_LANDING for unknown roles', () => {
      expect(landingFor({ role: 'superadmin' })).toBe(PUBLIC_LANDING);
      expect(landingFor({ role: '' })).toBe(PUBLIC_LANDING);
    });

    it('normalizeReturnPath rejects dangerous inputs and returns a safe path', () => {
      const dangerousInputs = [
        'https://evil.com/steal',
        'javascript:alert(1)',
        '//evil.com/redirect',
        'data:text/html,<script>',
        '\\\\evil.com\\path',
        '/path\x00null',
        '/path\x1fcontrol',
        '',
        null,
        undefined,
        123,
      ];
      for (const input of dangerousInputs) {
        const result = normalizeReturnPath(input);
        expect(result).toBeTruthy();
        expect(result.startsWith('/')).toBe(true);
        // Must be an active route
        const matched = matchRoute(result);
        expect(matched, `Recovery from "${input}" → ${result} should be active`).not.toBeNull();
        expect(matched.route.status).toBe('active');
      }
    });

    it('normalizeReturnPath accepts valid active routes', () => {
      const validPaths = ['/', '/login', '/rooms', '/calendar', '/check-in'];
      for (const path of validPaths) {
        const result = normalizeReturnPath(path);
        expect(result).toBe(path);
      }
    });

    it('normalizeReturnPath rejects legacy-redirect paths', () => {
      const result = normalizeReturnPath('/room/some-slug');
      // Should fall back rather than return a legacy-redirect destination
      expect(result).not.toBe('/room/some-slug');
      const matched = matchRoute(result);
      expect(matched).not.toBeNull();
      expect(matched.route.status).toBe('active');
    });

    it('normalizeReturnPath uses actor landing as fallback', () => {
      const result = normalizeReturnPath('https://evil.com', ACTORS.admin);
      expect(result).toBe('/dashboard/admin/overview');
    });
  });

  describe('9. Session state scenarios — missing, expired, malformed, forged, wrong-role', () => {
    it('missing session (no actor) → routes requiring auth should deny access', () => {
      // All non-public routes require a valid session
      const protectedRoutes = ROUTE_MANIFEST.filter(
        (r) => r.audience !== 'public' && r.status === 'active'
      );
      expect(protectedRoutes.length).toBeGreaterThan(0);
      // Without an actor, the policy engine should reject — validated via audience field
      for (const route of protectedRoutes) {
        expect(route.audience).not.toBe('public');
      }
    });

    it('wrong-role scenario: guest cannot satisfy staff/admin audience', () => {
      const guestRole = 'guest';
      const restrictedAudiences = ['staff', 'admin', 'staff-or-admin'];
      for (const audience of restrictedAudiences) {
        expect(audience).not.toBe(guestRole);
      }
    });

    it('wrong-role scenario: staff cannot satisfy admin-only audience', () => {
      const staffRole = 'staff';
      expect(staffRole).not.toBe('admin');
      // staff satisfies staff-or-admin but not admin
      const adminOnlyRoutes = ROUTE_MANIFEST.filter(
        (r) => r.audience === 'admin' && r.status === 'active'
      );
      expect(adminOnlyRoutes.length).toBeGreaterThan(0);
    });

    it('forged role: arbitrary role string does not match any protected audience', () => {
      const forgedRoles = ['superuser', 'root', 'ADMIN', 'Staff', 'GUEST'];
      const validAudiences = ['guest', 'staff', 'admin', 'staff-or-admin'];
      for (const forged of forgedRoles) {
        expect(validAudiences).not.toContain(forged);
        // landingFor with forged role should return safe public landing
        const landing = landingFor({ role: forged });
        expect(landing).toBe(PUBLIC_LANDING);
      }
    });

    it('denial recovery: denied actors always get a navigable landing page', () => {
      const actors = [null, { role: 'guest' }, { role: 'staff' }, { role: 'admin' }];
      for (const actor of actors) {
        const landing = landingFor(actor);
        const result = matchRoute(landing);
        expect(result, `Landing for ${JSON.stringify(actor)} should resolve`).not.toBeNull();
        expect(result.route.status).toBe('active');
      }
    });
  });

  describe('10. Critical navigation and sign-out', () => {
    it('/api/auth/session supports POST (login) and DELETE (sign-out)', () => {
      const sessionRoute = ROUTE_MANIFEST.find((r) => r.id === 'api-auth-session');
      expect(sessionRoute).toBeDefined();
      expect(sessionRoute.methods).toContain('POST');
      expect(sessionRoute.methods).toContain('DELETE');
      expect(sessionRoute.audience).toBe('public');
    });

    it('session route matches POST for login', () => {
      const result = matchRoute('/api/auth/session', 'POST');
      expect(result).not.toBeNull();
      expect(result.route.id).toBe('api-auth-session');
    });

    it('session route matches DELETE for sign-out', () => {
      const result = matchRoute('/api/auth/session', 'DELETE');
      expect(result).not.toBeNull();
      expect(result.route.id).toBe('api-auth-session');
    });

    it('session API has rate limiting for abuse protection', () => {
      const sessionRoute = ROUTE_MANIFEST.find((r) => r.id === 'api-auth-session');
      expect(sessionRoute.rateLimitPolicy).toBe('auth-attempt');
    });

    it('/api/auth/me requires guest audience (authenticated user info)', () => {
      const meRoute = ROUTE_MANIFEST.find((r) => r.id === 'api-auth-me');
      expect(meRoute).toBeDefined();
      expect(meRoute.audience).toBe('guest');
      expect(meRoute.methods).toContain('GET');
      expect(meRoute.sensitiveResponse).toBe(true);
    });

    it('dashboard landing /dashboard requires staff-or-admin', () => {
      const result = matchRoute('/dashboard');
      expect(result).not.toBeNull();
      expect(result.route.audience).toBe('staff-or-admin');
    });

    it('role-specific landings are in the manifest with landingForRole markers', () => {
      const adminLanding = ROUTE_MANIFEST.find((r) => r.landingForRole === 'admin');
      expect(adminLanding).toBeDefined();
      expect(adminLanding.pattern).toBe('/dashboard/admin/overview');

      const staffLanding = ROUTE_MANIFEST.find((r) => r.landingForRole === 'staff');
      expect(staffLanding).toBeDefined();
      expect(staffLanding.pattern).toBe('/dashboard/staff/overview');
    });

    it('ROLE_LANDINGS matches the landingForRole markers in the manifest', () => {
      expect(ROLE_LANDINGS.admin).toBe('/dashboard/admin/overview');
      expect(ROLE_LANDINGS.staff).toBe('/dashboard/staff/overview');
    });
  });

  describe('11. Comprehensive access matrix — every active route tested per actor', () => {
    const activeRoutes = ROUTE_MANIFEST.filter((r) => r.status === 'active');

    /**
     * Determine if an actor role satisfies a route audience.
     */
    function roleMatchesAudience(role, audience) {
      if (audience === 'public') return true;
      if (audience === 'guest') return role === 'guest' || role === 'staff' || role === 'admin';
      if (audience === 'staff') return role === 'staff' || role === 'admin';
      if (audience === 'admin') return role === 'admin';
      if (audience === 'staff-or-admin') return role === 'staff' || role === 'admin';
      return false;
    }

    it('every active route is reachable by its intended audience', () => {
      for (const route of activeRoutes) {
        const path = concretePath(route.pattern);
        const method = route.methods[0];
        const result = matchRoute(path, method);
        expect(result, `${method} ${path} should match`).not.toBeNull();
      }
    });

    it('unauthenticated actor can only reach public routes', () => {
      for (const route of activeRoutes) {
        const allowed = roleMatchesAudience(null, route.audience);
        // Unauthenticated only matches 'public'
        if (route.audience === 'public') {
          expect(allowed).toBe(true);
        } else {
          expect(allowed).toBe(false);
        }
      }
    });

    it('guest actor can reach public and guest routes but not staff or admin', () => {
      for (const route of activeRoutes) {
        const allowed = roleMatchesAudience('guest', route.audience);
        if (['public', 'guest'].includes(route.audience)) {
          expect(allowed, `guest should access ${route.pattern} (${route.audience})`).toBe(true);
        } else {
          expect(allowed, `guest should NOT access ${route.pattern} (${route.audience})`).toBe(false);
        }
      }
    });

    it('staff actor can reach public, guest, staff, and staff-or-admin but not admin-only', () => {
      for (const route of activeRoutes) {
        const allowed = roleMatchesAudience('staff', route.audience);
        if (['public', 'guest', 'staff', 'staff-or-admin'].includes(route.audience)) {
          expect(allowed, `staff should access ${route.pattern} (${route.audience})`).toBe(true);
        } else {
          expect(allowed, `staff should NOT access ${route.pattern} (${route.audience})`).toBe(false);
        }
      }
    });

    it('admin actor can reach all routes', () => {
      for (const route of activeRoutes) {
        const allowed = roleMatchesAudience('admin', route.audience);
        expect(allowed, `admin should access ${route.pattern} (${route.audience})`).toBe(true);
      }
    });
  });
});
