/**
 * Route system barrel export.
 */
export { ROUTE_MANIFEST, ROLE_LANDINGS, PUBLIC_LANDING } from './manifest.js';
export {
  matchRoute,
  matchRouteAnyMethod,
  landingFor,
  normalizeReturnPath,
  buildRoute,
  getRouteById,
} from './registry.js';
export { validateCoverage } from './coverage.js';
