/**
 * Route Registry — match, build, landing, and return-path helpers.
 *
 * All internal links and redirects should use these helpers rather than
 * constructing URL strings directly.
 */

import { ROUTE_MANIFEST, ROLE_LANDINGS, PUBLIC_LANDING } from './manifest.js';

/**
 * Compile a manifest pattern like '/rooms/[slug]' into a RegExp and param names.
 */
function compilePattern(pattern) {
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((segment) => {
      const match = segment.match(/^\[(.+)\]$/);
      if (match) {
        paramNames.push(match[1]);
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

// Pre-compile all patterns at module load
// Sort so static routes come before dynamic routes at the same depth
// This ensures /rooms/multi-room-booking matches before /rooms/[slug]
const compiledRoutes = ROUTE_MANIFEST
  .map((route) => ({
    ...route,
    ...compilePattern(route.pattern),
  }))
  .sort((a, b) => {
    // Count dynamic segments: fewer dynamic segments = higher priority
    const aDynamic = (a.pattern.match(/\[/g) || []).length;
    const bDynamic = (b.pattern.match(/\[/g) || []).length;
    if (aDynamic !== bDynamic) return aDynamic - bDynamic;
    // For same dynamic count, longer patterns (more specific) come first
    return b.pattern.length - a.pattern.length;
  });

/**
 * Match a pathname against the route manifest.
 *
 * @param {string} pathname - The URL pathname to match (e.g. '/rooms/deluxe-suite')
 * @param {string} [method='GET'] - HTTP method
 * @returns {{ route: object, params: Record<string, string> } | null}
 */
export function matchRoute(pathname, method = 'GET') {
  const normalizedMethod = method.toUpperCase();

  for (const compiled of compiledRoutes) {
    const match = pathname.match(compiled.regex);
    if (match) {
      // Check method support
      if (!compiled.methods.includes(normalizedMethod)) {
        continue;
      }
      const params = {};
      compiled.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { route: getRouteRecord(compiled), params };
    }
  }
  return null;
}

/**
 * Find ALL routes matching a pathname (regardless of method) — useful for 405 detection.
 */
export function matchRouteAnyMethod(pathname) {
  const results = [];
  for (const compiled of compiledRoutes) {
    const match = pathname.match(compiled.regex);
    if (match) {
      const params = {};
      compiled.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      results.push({ route: getRouteRecord(compiled), params });
    }
  }
  return results;
}

/**
 * Get the role landing page for an authenticated actor.
 *
 * @param {{ role: string }} actor - The authenticated actor with a role property
 * @returns {string} The landing page path
 */
export function landingFor(actor) {
  if (!actor || !actor.role) {
    return PUBLIC_LANDING;
  }
  return ROLE_LANDINGS[actor.role] || PUBLIC_LANDING;
}

/**
 * Validate and normalize a return path.
 * Rejects absolute URLs, scheme prefixes, backslashes, control characters,
 * and paths not in the active manifest.
 *
 * @param {string} raw - The raw return path value
 * @param {{ role: string }|null} [actor=null] - Optional actor for fallback
 * @returns {string} A safe, normalized return path
 */
export function normalizeReturnPath(raw, actor = null) {
  const fallback = actor ? landingFor(actor) : PUBLIC_LANDING;

  if (!raw || typeof raw !== 'string') {
    return fallback;
  }

  // Reject scheme prefixes (http://, https://, javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+\-.]*:/i.test(raw)) {
    return fallback;
  }

  // Reject backslashes (URL confusion attacks)
  if (raw.includes('\\')) {
    return fallback;
  }

  // Reject control characters (U+0000–U+001F, U+007F)
  if (/[\x00-\x1f\x7f]/.test(raw)) {
    return fallback;
  }

  // Reject protocol-relative URLs
  if (raw.startsWith('//')) {
    return fallback;
  }

  // Must start with /
  if (!raw.startsWith('/')) {
    return fallback;
  }

  // Extract pathname (strip query and fragment)
  let pathname;
  try {
    const url = new URL(raw, 'http://localhost');
    pathname = url.pathname;
  } catch {
    return fallback;
  }

  // Normalize consecutive slashes
  pathname = pathname.replace(/\/+/g, '/');

  // Remove trailing slash (except for root)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Must match an active route in the manifest
  const matched = matchRoute(pathname);
  if (!matched) {
    return fallback;
  }

  // Reject legacy-redirect destinations as return paths
  if (matched.route.status === 'legacy-redirect') {
    return fallback;
  }

  return pathname;
}

/**
 * Build a URL path from a route ID, params, and optional query.
 *
 * @param {string} id - The route ID from the manifest
 * @param {Record<string, string>} [params={}] - Dynamic segment values
 * @param {Record<string, string>} [query={}] - Query string parameters
 * @returns {string} The constructed path with query string
 * @throws {Error} If the route ID is unknown or required params are missing
 */
export function buildRoute(id, params = {}, query = {}) {
  const route = ROUTE_MANIFEST.find((r) => r.id === id);
  if (!route) {
    throw new Error(`Unknown route ID: ${id}`);
  }

  let path = route.pattern;

  // Replace dynamic segments
  const dynamicSegments = path.match(/\[([^\]]+)\]/g) || [];
  for (const segment of dynamicSegments) {
    const paramName = segment.slice(1, -1);
    const value = params[paramName];
    if (!value) {
      throw new Error(`Missing required param "${paramName}" for route "${id}"`);
    }
    path = path.replace(segment, encodeURIComponent(value));
  }

  // Append query string
  const queryEntries = Object.entries(query).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (queryEntries.length > 0) {
    const qs = new URLSearchParams(queryEntries).toString();
    path = `${path}?${qs}`;
  }

  return path;
}

/**
 * Get the manifest record for a route by ID.
 */
export function getRouteById(id) {
  return ROUTE_MANIFEST.find((r) => r.id === id) || null;
}

// Strip compiled internals from a route record
function getRouteRecord(compiled) {
  const { regex, paramNames, ...route } = compiled;
  return route;
}
