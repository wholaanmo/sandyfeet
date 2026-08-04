import { describe, expect, it } from 'vitest';
import {
  matchRoute,
  matchRouteAnyMethod,
  landingFor,
  normalizeReturnPath,
  buildRoute,
  getRouteById,
} from '../../lib/routes/registry.js';
import { ROUTE_MANIFEST, ROLE_LANDINGS } from '../../lib/routes/manifest.js';

describe('lib/routes/registry.js — matchRoute', () => {
  it('matches a static public page', () => {
    const result = matchRoute('/login');
    expect(result).not.toBeNull();
    expect(result.route.id).toBe('login');
    expect(result.route.audience).toBe('public');
    expect(result.params).toEqual({});
  });

  it('matches a dynamic segment route', () => {
    const result = matchRoute('/rooms/deluxe-ocean');
    expect(result).not.toBeNull();
    expect(result.route.id).toBe('rooms-detail');
    expect(result.params).toEqual({ slug: 'deluxe-ocean' });
  });

  it('matches the legacy redirect route with slug param', () => {
    const result = matchRoute('/room/old-room-name');
    expect(result).not.toBeNull();
    expect(result.route.id).toBe('room-slug-legacy');
    expect(result.route.status).toBe('legacy-redirect');
    expect(result.route.redirectTo).toBe('/rooms/[slug]');
    expect(result.params).toEqual({ slug: 'old-room-name' });
  });

  it('matches API routes with correct method', () => {
    const result = matchRoute('/api/chatbot', 'POST');
    expect(result).not.toBeNull();
    expect(result.route.id).toBe('api-chatbot');
  });

  it('returns null for API routes with wrong method', () => {
    const result = matchRoute('/api/chatbot', 'GET');
    expect(result).toBeNull();
  });

  it('returns null for unknown paths', () => {
    const result = matchRoute('/nonexistent/path');
    expect(result).toBeNull();
  });

  it('matches dashboard admin pages', () => {
    const result = matchRoute('/dashboard/admin/overview');
    expect(result).not.toBeNull();
    expect(result.route.audience).toBe('admin');
    expect(result.route.landingForRole).toBe('admin');
  });

  it('matches dashboard staff pages', () => {
    const result = matchRoute('/dashboard/staff/overview');
    expect(result).not.toBeNull();
    expect(result.route.audience).toBe('staff');
    expect(result.route.landingForRole).toBe('staff');
  });
});

describe('lib/routes/registry.js — matchRouteAnyMethod', () => {
  it('returns all method-matching routes for a path', () => {
    const results = matchRouteAnyMethod('/api/chatbot');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].route.id).toBe('api-chatbot');
  });

  it('returns empty array for unknown paths', () => {
    const results = matchRouteAnyMethod('/unknown/route');
    expect(results).toEqual([]);
  });
});

describe('lib/routes/registry.js — landingFor', () => {
  it('returns admin landing for admin actor', () => {
    expect(landingFor({ role: 'admin' })).toBe('/dashboard/admin/overview');
  });

  it('returns staff landing for staff actor', () => {
    expect(landingFor({ role: 'staff' })).toBe('/dashboard/staff/overview');
  });

  it('returns public landing for null actor', () => {
    expect(landingFor(null)).toBe('/');
  });

  it('returns public landing for unknown role', () => {
    expect(landingFor({ role: 'guest' })).toBe('/');
  });
});

describe('lib/routes/registry.js — normalizeReturnPath', () => {
  it('accepts a valid same-origin active route', () => {
    expect(normalizeReturnPath('/login')).toBe('/login');
  });

  it('accepts a dynamic route path', () => {
    expect(normalizeReturnPath('/rooms/ocean-view')).toBe('/rooms/ocean-view');
  });

  it('rejects absolute URLs with scheme', () => {
    expect(normalizeReturnPath('https://evil.com/steal')).toBe('/');
  });

  it('rejects javascript: protocol', () => {
    expect(normalizeReturnPath('javascript:alert(1)')).toBe('/');
  });

  it('rejects backslashes', () => {
    expect(normalizeReturnPath('/login\\evil')).toBe('/');
  });

  it('rejects control characters', () => {
    expect(normalizeReturnPath('/login\x00')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    expect(normalizeReturnPath('//evil.com/path')).toBe('/');
  });

  it('rejects paths not starting with /', () => {
    expect(normalizeReturnPath('relative/path')).toBe('/');
  });

  it('rejects legacy-redirect destinations', () => {
    expect(normalizeReturnPath('/room/some-slug')).toBe('/');
  });

  it('returns actor landing as fallback when path is invalid', () => {
    expect(normalizeReturnPath('bad', { role: 'admin' })).toBe(
      '/dashboard/admin/overview'
    );
  });

  it('normalizes consecutive slashes', () => {
    expect(normalizeReturnPath('///login')).toBe('/');
  });

  it('returns fallback for empty string', () => {
    expect(normalizeReturnPath('')).toBe('/');
  });

  it('returns fallback for null', () => {
    expect(normalizeReturnPath(null)).toBe('/');
  });
});

describe('lib/routes/registry.js — buildRoute', () => {
  it('builds a static route', () => {
    expect(buildRoute('login')).toBe('/login');
  });

  it('builds a dynamic route with params', () => {
    expect(buildRoute('rooms-detail', { slug: 'ocean-suite' })).toBe(
      '/rooms/ocean-suite'
    );
  });

  it('encodes dynamic params', () => {
    const result = buildRoute('rooms-detail', { slug: 'room with spaces' });
    expect(result).toBe('/rooms/room%20with%20spaces');
  });

  it('appends query parameters', () => {
    const result = buildRoute('login', {}, { redirect: '/dashboard' });
    expect(result).toBe('/login?redirect=%2Fdashboard');
  });

  it('throws for unknown route ID', () => {
    expect(() => buildRoute('nonexistent')).toThrow('Unknown route ID');
  });

  it('throws for missing required param', () => {
    expect(() => buildRoute('rooms-detail')).toThrow('Missing required param');
  });
});

describe('lib/routes/registry.js — getRouteById', () => {
  it('finds a route by ID', () => {
    const route = getRouteById('login');
    expect(route).not.toBeNull();
    expect(route.pattern).toBe('/login');
  });

  it('returns null for unknown ID', () => {
    expect(getRouteById('nonexistent')).toBeNull();
  });
});

describe('lib/routes/registry.js — /dashboard staff-or-admin matching', () => {
  it('matches /dashboard with staff-or-admin audience', () => {
    const result = matchRoute('/dashboard');
    expect(result).not.toBeNull();
    expect(result.route.id).toBe('dashboard');
    expect(result.route.audience).toBe('staff-or-admin');
    expect(result.route.status).toBe('active');
  });
});

describe('lib/routes/registry.js — public active route matching', () => {
  it('matches /calendar as a public active route', () => {
    const result = matchRoute('/calendar');
    expect(result).not.toBeNull();
    expect(result.route.id).toBe('calendar');
    expect(result.route.audience).toBe('public');
    expect(result.route.status).toBe('active');
  });

  it('matches /check-in as a public active route', () => {
    const result = matchRoute('/check-in');
    expect(result).not.toBeNull();
    expect(result.route.id).toBe('check-in');
    expect(result.route.audience).toBe('public');
    expect(result.route.status).toBe('active');
  });
});

describe('lib/routes/registry.js — legacy redirect slug preservation', () => {
  it('/room/[slug] preserves slug and maps to /rooms/[slug]', () => {
    const result = matchRoute('/room/beachfront-villa');
    expect(result).not.toBeNull();
    expect(result.route.status).toBe('legacy-redirect');
    expect(result.route.redirectTo).toBe('/rooms/[slug]');
    expect(result.params.slug).toBe('beachfront-villa');

    // Verify the target can be built using the same slug param
    const resolvedTarget = buildRoute('rooms-detail', { slug: result.params.slug });
    expect(resolvedTarget).toBe('/rooms/beachfront-villa');
  });

  it('/room/[slug] redirect target is an active route', () => {
    const result = matchRoute('/room/any-slug');
    const targetRoute = ROUTE_MANIFEST.find(
      (r) => r.pattern === result.route.redirectTo
    );
    expect(targetRoute).toBeDefined();
    expect(targetRoute.status).toBe('active');
  });
});

describe('lib/routes/registry.js — API method enforcement (405 detection)', () => {
  it('matchRoute returns null for POST-only API called with GET', () => {
    const result = matchRoute('/api/chatbot', 'GET');
    expect(result).toBeNull();
  });

  it('matchRouteAnyMethod finds the route regardless of method', () => {
    const results = matchRouteAnyMethod('/api/chatbot');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].route.methods).toContain('POST');
    expect(results[0].route.methods).not.toContain('GET');
  });

  it('405 scenario: route exists but method not allowed', () => {
    // Simulate 405 detection: matchRoute fails but matchRouteAnyMethod succeeds
    const getResult = matchRoute('/api/admin/create-user', 'GET');
    expect(getResult).toBeNull();

    const anyMethodResults = matchRouteAnyMethod('/api/admin/create-user');
    expect(anyMethodResults.length).toBeGreaterThanOrEqual(1);
    expect(anyMethodResults[0].route.methods).toEqual(['POST']);
  });

  it('true 404: neither matchRoute nor matchRouteAnyMethod finds a path', () => {
    const getResult = matchRoute('/api/nonexistent', 'GET');
    expect(getResult).toBeNull();

    const anyMethodResults = matchRouteAnyMethod('/api/nonexistent');
    expect(anyMethodResults).toEqual([]);
  });
});

describe('lib/routes/manifest.js — redirect cycle detection', () => {
  it('no legacy-redirect targets another legacy-redirect (no cycles)', () => {
    const redirectRoutes = ROUTE_MANIFEST.filter(
      (r) => r.status === 'legacy-redirect'
    );
    for (const route of redirectRoutes) {
      // The redirectTo pattern must resolve to an active route, not another redirect
      const target = ROUTE_MANIFEST.find(
        (r) => r.pattern === route.redirectTo
      );
      expect(target).toBeDefined();
      expect(target.status).toBe('active');
    }
  });

  it('no active route redirectTo points back to itself', () => {
    const redirectRoutes = ROUTE_MANIFEST.filter(
      (r) => r.status === 'legacy-redirect'
    );
    for (const route of redirectRoutes) {
      expect(route.redirectTo).not.toBe(route.pattern);
    }
  });
});

describe('lib/routes/registry.js — recovery link destinations are valid', () => {
  it('not-found recovery links (/, /login) are active manifest routes', () => {
    // The not-found page links to PUBLIC_LANDING (/) and /login
    const recoveryPaths = ['/', '/login'];
    for (const path of recoveryPaths) {
      const result = matchRoute(path);
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('active');
    }
  });

  it('error page recovery links (/, /login) are active manifest routes', () => {
    // The error page links to / and /login
    const recoveryPaths = ['/', '/login'];
    for (const path of recoveryPaths) {
      const result = matchRoute(path);
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('active');
    }
  });

  it('ROLE_LANDINGS recovery links are active manifest routes', () => {
    for (const [, path] of Object.entries(ROLE_LANDINGS)) {
      const result = matchRoute(path);
      expect(result).not.toBeNull();
      expect(result.route.status).toBe('active');
    }
  });
});

describe('lib/routes/registry.js — buildRoute for check-in URL', () => {
  it('builds check-in route path', () => {
    const path = buildRoute('check-in');
    expect(path).toBe('/check-in');
  });

  it('check-in route is an active public page', () => {
    const route = getRouteById('check-in');
    expect(route).not.toBeNull();
    expect(route.status).toBe('active');
    expect(route.audience).toBe('public');
    expect(route.kind).toBe('page');
  });

  it('check-in URL with query token builds correctly', () => {
    const path = buildRoute('check-in', {}, { token: 'abc123' });
    expect(path).toBe('/check-in?token=abc123');
  });
});

describe('lib/routes/manifest.js — structural integrity', () => {
  it('has no duplicate IDs', () => {
    const ids = ROUTE_MANIFEST.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('every route has required fields', () => {
    for (const route of ROUTE_MANIFEST) {
      expect(route).toHaveProperty('id');
      expect(route).toHaveProperty('kind');
      expect(route).toHaveProperty('pattern');
      expect(route).toHaveProperty('methods');
      expect(route).toHaveProperty('audience');
      expect(route).toHaveProperty('status');
      expect(['page', 'api']).toContain(route.kind);
      expect(['active', 'legacy-redirect']).toContain(route.status);
      expect(['public', 'guest', 'staff', 'admin', 'staff-or-admin']).toContain(
        route.audience
      );
    }
  });

  it('legacy-redirect entries have a redirectTo target', () => {
    const redirects = ROUTE_MANIFEST.filter(
      (r) => r.status === 'legacy-redirect'
    );
    for (const route of redirects) {
      expect(route.redirectTo).toBeTruthy();
    }
  });

  it('ROLE_LANDINGS targets exist as active routes', () => {
    for (const [role, path] of Object.entries(ROLE_LANDINGS)) {
      const exists = ROUTE_MANIFEST.some(
        (r) => r.pattern === path && r.status === 'active'
      );
      expect(exists).toBe(true);
    }
  });
});
