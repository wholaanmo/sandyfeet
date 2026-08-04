// lib/server/auth/compatibility.js
// Reversible compatibility gate for the authentication migration.
// Allows rollback to legacy navigation behavior without restoring
// client-authoritative access.
import 'server-only';

/**
 * AUTH_MODE: 'server' (new) or 'legacy' (rollback).
 * Read from the AUTH_MODE environment variable with a default of 'server'.
 * In 'legacy' mode, only navigation compatibility is restored —
 * authorization still uses server sessions, never client-supplied values.
 */
export const AUTH_MODE = process.env.AUTH_MODE === 'legacy' ? 'legacy' : 'server';

/**
 * Check if the application is running in legacy compatibility mode.
 * Legacy mode restores navigation behavior (redirects, landing pages)
 * but does NOT restore client-authoritative access.
 *
 * @returns {boolean}
 */
export function isLegacyMode() {
  return AUTH_MODE === 'legacy';
}

/**
 * Known legacy credential cookie names that the old system wrote
 * as script-readable cookies.
 */
const OBSOLETE_COOKIE_NAMES = ['sessionToken', 'userType', 'sessionExpiry'];

/**
 * Known legacy credential localStorage keys.
 */
export const OBSOLETE_LOCAL_STORAGE_KEYS = [
  'userType',
  'userEmail',
  'userName',
  'uid',
  'sessionToken',
  'sessionExpiry',
  'rememberMe',
];

/**
 * Detect the presence of obsolete browser credentials in a request.
 * Logs a telemetry-safe note (presence detection only, never values).
 * This helps identify clients still carrying legacy credentials that
 * should be cleaned up.
 *
 * @param {Request} request - The incoming HTTP request
 * @returns {{ detected: boolean, cookieNames: string[] }}
 */
export function detectObsoleteCredentials(request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return { detected: false, cookieNames: [] };
  }

  const presentCookies = cookieHeader
    .split(';')
    .map((c) => c.trim().split('=')[0].trim())
    .filter((name) => OBSOLETE_COOKIE_NAMES.includes(name));

  const detected = presentCookies.length > 0;

  if (detected) {
    // Telemetry-safe: log only presence, never values
    console.info(
      '[auth:compatibility] Obsolete credentials detected:',
      presentCookies.map((name) => `${name}=<present>`).join(', ')
    );
  }

  return { detected, cookieNames: presentCookies };
}
