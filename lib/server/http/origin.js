// lib/server/http/origin.js
// Same-origin validation for authenticated mutations.
// Compares the Origin header to the configured APP_ORIGIN.

/**
 * Validate that the request's Origin header matches the application origin.
 * Used to enforce same-origin checks for authenticated mutations (CSRF defense).
 *
 * @param {Request | { headers: { get(name: string): string | null } }} request
 * @param {string} appOrigin - The configured APP_ORIGIN (e.g. "https://sandyfeet.com")
 * @returns {boolean} True if the Origin header matches the app origin, false otherwise.
 */
export function validateOrigin(request, appOrigin) {
  const origin = request?.headers?.get?.('origin');

  // No Origin header present — reject for mutation safety.
  if (!origin) {
    return false;
  }

  try {
    const requestOrigin = new URL(origin).origin;
    const configuredOrigin = new URL(appOrigin).origin;
    return requestOrigin === configuredOrigin;
  } catch {
    // Malformed Origin header or app origin — reject.
    return false;
  }
}
