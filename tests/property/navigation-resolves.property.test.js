// Property 4: Generated navigation always resolves
// Validates: Requirements 4.6, 4.7, 4.8

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildRoute, matchRoute, getRouteById, landingFor } from '../../lib/routes/registry.js';
import { ROUTE_MANIFEST } from '../../lib/routes/manifest.js';

/**
 * Arbitrary for generating valid URL-safe parameter values:
 * alphanumeric characters and hyphens, 1-50 length.
 */
const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-';
const validParamArb = fc
  .array(fc.constantFrom(...VALID_CHARS.split('')), { minLength: 1, maxLength: 50 })
  .map((chars) => chars.join(''));

/**
 * All active routes in the manifest.
 */
const activeRoutes = ROUTE_MANIFEST.filter((r) => r.status === 'active');

/**
 * Routes with dynamic segments (contain [param]).
 */
const dynamicRoutes = activeRoutes.filter((r) => /\[.+\]/.test(r.pattern));

/**
 * Routes without dynamic segments.
 */
const staticRoutes = activeRoutes.filter((r) => !/\[.+\]/.test(r.pattern));

/**
 * Valid roles that have landing pages.
 */
const validRoles = ['admin', 'staff'];

describe('Property 4: Generated navigation always resolves', () => {
  it('dynamic routes: buildRoute produces a path that matchRoute resolves back to the same route ID', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...dynamicRoutes),
        validParamArb,
        (route, paramValue) => {
          // Extract param names from the pattern
          const paramNames = (route.pattern.match(/\[([^\]]+)\]/g) || []).map(
            (s) => s.slice(1, -1),
          );

          // Build params object with the generated value for each param
          const params = Object.fromEntries(paramNames.map((name) => [name, paramValue]));

          // Build the path
          const path = buildRoute(route.id, params);

          // The path must resolve back to the same route
          const matched = matchRoute(path, route.methods[0]);
          expect(matched).not.toBeNull();
          expect(matched.route.id).toBe(route.id);

          // The resolved params must match the original params
          for (const name of paramNames) {
            expect(matched.params[name]).toBe(paramValue);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('static routes: buildRoute produces a path that matchRoute resolves to that route', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...staticRoutes),
        (route) => {
          const path = buildRoute(route.id);

          // Must resolve back to the same route
          const matched = matchRoute(path, route.methods[0]);
          expect(matched).not.toBeNull();
          expect(matched.route.id).toBe(route.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('check-in URL generated via buildRoute targets an active route in the manifest', () => {
    const path = buildRoute('check-in');

    // The generated path must match an active route
    const matched = matchRoute(path);
    expect(matched).not.toBeNull();
    expect(matched.route.status).toBe('active');
    expect(matched.route.id).toBe('check-in');
  });

  it('buildRoute output is always a string starting with "/" (valid relative path)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...activeRoutes),
        validParamArb,
        (route, paramValue) => {
          // Build params for dynamic routes
          const paramNames = (route.pattern.match(/\[([^\]]+)\]/g) || []).map(
            (s) => s.slice(1, -1),
          );
          const params = Object.fromEntries(paramNames.map((name) => [name, paramValue]));

          const path = buildRoute(route.id, params);

          // Must be a string starting with /
          expect(typeof path).toBe('string');
          expect(path.startsWith('/')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('landingFor any valid role produces a path that matchRoute resolves to an active route', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validRoles),
        (role) => {
          const path = landingFor({ role });

          // Must be a valid path
          expect(typeof path).toBe('string');
          expect(path.startsWith('/')).toBe(true);

          // Must resolve to an active route
          const matched = matchRoute(path);
          expect(matched).not.toBeNull();
          expect(matched.route.status).toBe('active');
        },
      ),
      { numRuns: 100 },
    );
  });
});
