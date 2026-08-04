// lib/server/http/security-headers.test-helpers.js
// Test utility for verifying security headers emitted by buildSecurityHeaders.
// Used by unit, integration, and browser tests to assert header correctness.

/**
 * Parse a CSP header value into a directive map.
 * @param {string} cspValue - Raw Content-Security-Policy header value
 * @returns {Map<string, string[]>} directive name → source list
 */
export function parseCspDirectives(cspValue) {
  const directives = new Map();
  if (!cspValue) return directives;

  const parts = cspValue.split(';').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const [name, ...sources] = part.split(/\s+/);
    directives.set(name, sources);
  }
  return directives;
}

/**
 * Assert that a headers map (Map or Headers-like) contains the required
 * security headers with correct values.
 *
 * @param {Map<string, string> | Headers} headers - The headers to verify
 * @param {Object} [options]
 * @param {boolean} [options.enforceCSP=false] - Whether CSP is enforced
 * @param {boolean} [options.isProduction=false] - Whether production headers are expected
 * @param {string} [options.nonce] - Expected nonce value (if known)
 * @returns {{ passed: boolean, failures: string[] }}
 */
export function assertSecurityHeaders(headers, options = {}) {
  const { enforceCSP = false, isProduction = false, nonce } = options;
  const failures = [];

  // Helper to get header value regardless of Map or Headers
  const get = (name) => {
    if (headers instanceof Map) return headers.get(name) ?? null;
    if (typeof headers.get === 'function') return headers.get(name);
    return null;
  };

  // CSP header presence
  const expectedCspHeader = enforceCSP
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
  const unexpectedCspHeader = enforceCSP
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';

  const cspValue = get(expectedCspHeader);
  if (!cspValue) {
    failures.push(`Missing header: ${expectedCspHeader}`);
  } else {
    const directives = parseCspDirectives(cspValue);

    // Verify required directives exist
    const requiredDirectives = [
      'default-src', 'script-src', 'style-src', 'img-src',
      'font-src', 'connect-src', 'frame-src', 'frame-ancestors',
      'base-uri', 'form-action', 'object-src',
    ];
    for (const d of requiredDirectives) {
      if (!directives.has(d)) {
        failures.push(`CSP missing directive: ${d}`);
      }
    }

    // Verify nonce is in script-src
    if (nonce) {
      const scriptSrc = directives.get('script-src') || [];
      if (!scriptSrc.includes(`'nonce-${nonce}'`)) {
        failures.push(`CSP script-src missing nonce: 'nonce-${nonce}'`);
      }
    }

    // Verify frame-src and frame-ancestors deny framing
    const frameSrc = directives.get('frame-src') || [];
    if (!frameSrc.includes("'none'")) {
      failures.push("CSP frame-src should be 'none'");
    }
    const frameAncestors = directives.get('frame-ancestors') || [];
    if (!frameAncestors.includes("'none'")) {
      failures.push("CSP frame-ancestors should be 'none'");
    }
  }

  // No conflicting CSP header
  if (get(unexpectedCspHeader)) {
    failures.push(`Unexpected header present: ${unexpectedCspHeader}`);
  }

  // X-Content-Type-Options
  if (get('X-Content-Type-Options') !== 'nosniff') {
    failures.push('X-Content-Type-Options should be nosniff');
  }

  // Referrer-Policy
  if (get('Referrer-Policy') !== 'strict-origin-when-cross-origin') {
    failures.push('Referrer-Policy should be strict-origin-when-cross-origin');
  }

  // X-Frame-Options
  if (get('X-Frame-Options') !== 'DENY') {
    failures.push('X-Frame-Options should be DENY');
  }

  // Permissions-Policy
  const permPolicy = get('Permissions-Policy');
  if (!permPolicy || !permPolicy.includes('camera=()')) {
    failures.push('Permissions-Policy should disable camera');
  }
  if (!permPolicy || !permPolicy.includes('microphone=()')) {
    failures.push('Permissions-Policy should disable microphone');
  }
  if (!permPolicy || !permPolicy.includes('geolocation=()')) {
    failures.push('Permissions-Policy should disable geolocation');
  }

  // HSTS — only in production
  if (isProduction) {
    const hsts = get('Strict-Transport-Security');
    if (!hsts) {
      failures.push('Missing Strict-Transport-Security in production');
    } else {
      if (!hsts.includes('max-age=63072000')) {
        failures.push('HSTS max-age should be 63072000');
      }
      if (!hsts.includes('includeSubDomains')) {
        failures.push('HSTS should include includeSubDomains');
      }
      if (!hsts.includes('preload')) {
        failures.push('HSTS should include preload');
      }
    }
  }

  return { passed: failures.length === 0, failures };
}
