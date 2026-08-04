import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('lib/server/http/security-headers.js — nonce-based browser security policy', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateNonce', () => {
    it('produces a base64-encoded 16-byte nonce', async () => {
      const { generateNonce } = await import('../../lib/server/http/security-headers.js');
      const nonce = generateNonce();
      // 16 bytes in base64 = 24 chars (with padding)
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
      const decoded = Buffer.from(nonce, 'base64');
      expect(decoded.length).toBe(16);
    });

    it('produces unique nonces on each call', async () => {
      const { generateNonce } = await import('../../lib/server/http/security-headers.js');
      const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
      expect(nonces.size).toBe(100);
    });
  });

  describe('CSP_ENFORCEMENT_MODE', () => {
    it('defaults to report-only when CSP_MODE is not set', async () => {
      delete process.env.CSP_MODE;
      const { CSP_ENFORCEMENT_MODE } = await import('../../lib/server/http/security-headers.js');
      expect(CSP_ENFORCEMENT_MODE).toBe('report-only');
    });

    it('is report-only when CSP_MODE is anything other than enforce', async () => {
      process.env.CSP_MODE = 'report-only';
      const { CSP_ENFORCEMENT_MODE } = await import('../../lib/server/http/security-headers.js');
      expect(CSP_ENFORCEMENT_MODE).toBe('report-only');
    });

    it('is enforce when CSP_MODE=enforce', async () => {
      process.env.CSP_MODE = 'enforce';
      const { CSP_ENFORCEMENT_MODE } = await import('../../lib/server/http/security-headers.js');
      expect(CSP_ENFORCEMENT_MODE).toBe('enforce');
    });
  });

  describe('buildSecurityHeaders — CSP directives', () => {
    it('emits Content-Security-Policy-Report-Only when enforceCSP=false', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const nonce = generateNonce();
      const headers = buildSecurityHeaders(nonce, { enforceCSP: false });
      expect(headers.has('Content-Security-Policy-Report-Only')).toBe(true);
      expect(headers.has('Content-Security-Policy')).toBe(false);
    });

    it('emits Content-Security-Policy when enforceCSP=true', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const nonce = generateNonce();
      const headers = buildSecurityHeaders(nonce, { enforceCSP: true });
      expect(headers.has('Content-Security-Policy')).toBe(true);
      expect(headers.has('Content-Security-Policy-Report-Only')).toBe(false);
    });

    it('includes the nonce in script-src directive', async () => {
      const { buildSecurityHeaders } = await import('../../lib/server/http/security-headers.js');
      const nonce = 'dGVzdG5vbmNlMTIzNA==';
      const headers = buildSecurityHeaders(nonce, { enforceCSP: false });
      const csp = headers.get('Content-Security-Policy-Report-Only');
      expect(csp).toContain(`'nonce-${nonce}'`);
    });

    it('contains all documented CSP directives', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const nonce = generateNonce();
      const headers = buildSecurityHeaders(nonce, { enforceCSP: true });
      const csp = headers.get('Content-Security-Policy');

      const requiredDirectives = [
        'default-src', 'script-src', 'style-src', 'img-src',
        'font-src', 'connect-src', 'frame-src', 'frame-ancestors',
        'base-uri', 'form-action', 'object-src',
      ];
      for (const directive of requiredDirectives) {
        expect(csp).toContain(directive);
      }
    });

    it('restricts default-src to self', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce(), { enforceCSP: true });
      const csp = headers.get('Content-Security-Policy');
      expect(csp).toMatch(/default-src 'self'/);
    });

    it('restricts frame-src and frame-ancestors to none', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce(), { enforceCSP: true });
      const csp = headers.get('Content-Security-Policy');
      expect(csp).toMatch(/frame-src 'none'/);
      expect(csp).toMatch(/frame-ancestors 'none'/);
    });

    it('allows Cloudinary and Google image hosts in img-src', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce(), { enforceCSP: true });
      const csp = headers.get('Content-Security-Policy');
      expect(csp).toContain('https://res.cloudinary.com');
      expect(csp).toContain('https://*.googleusercontent.com');
    });

    it('allows Firebase endpoints in connect-src', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce(), { enforceCSP: true });
      const csp = headers.get('Content-Security-Policy');
      expect(csp).toContain('https://*.googleapis.com');
      expect(csp).toContain('https://*.firebaseio.com');
    });

    it('restricts object-src to none', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce(), { enforceCSP: true });
      const csp = headers.get('Content-Security-Policy');
      expect(csp).toMatch(/object-src 'none'/);
    });
  });

  describe('buildSecurityHeaders — non-CSP headers', () => {
    it('always emits X-Content-Type-Options: nosniff', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce());
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('always emits Referrer-Policy: strict-origin-when-cross-origin', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce());
      expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('always emits X-Frame-Options: DENY', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce());
      expect(headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('always emits restrictive Permissions-Policy', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce());
      const pp = headers.get('Permissions-Policy');
      expect(pp).toContain('camera=()');
      expect(pp).toContain('microphone=()');
      expect(pp).toContain('geolocation=()');
    });
  });

  describe('buildSecurityHeaders — HSTS production behavior', () => {
    it('emits Strict-Transport-Security in production', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce(), { isProduction: true });
      const hsts = headers.get('Strict-Transport-Security');
      expect(hsts).toBe('max-age=63072000; includeSubDomains; preload');
    });

    it('does not emit HSTS in non-production by default', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce(), { isProduction: false });
      expect(headers.has('Strict-Transport-Security')).toBe(false);
    });

    it('detects production from NODE_ENV when isProduction not specified', async () => {
      process.env.NODE_ENV = 'production';
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce());
      expect(headers.has('Strict-Transport-Security')).toBe(true);
    });
  });

  describe('buildSecurityHeaders — staged enforcement rollback', () => {
    it('can switch from enforced to report-only without removing other headers', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const nonce = generateNonce();

      // First: enforced mode
      const enforced = buildSecurityHeaders(nonce, { enforceCSP: true });
      expect(enforced.has('Content-Security-Policy')).toBe(true);
      expect(enforced.get('X-Content-Type-Options')).toBe('nosniff');
      expect(enforced.get('X-Frame-Options')).toBe('DENY');
      expect(enforced.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(enforced.get('Permissions-Policy')).toContain('camera=()');

      // Rollback: report-only mode
      const reportOnly = buildSecurityHeaders(nonce, { enforceCSP: false });
      expect(reportOnly.has('Content-Security-Policy-Report-Only')).toBe(true);
      expect(reportOnly.has('Content-Security-Policy')).toBe(false);
      // All other security headers preserved
      expect(reportOnly.get('X-Content-Type-Options')).toBe('nosniff');
      expect(reportOnly.get('X-Frame-Options')).toBe('DENY');
      expect(reportOnly.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(reportOnly.get('Permissions-Policy')).toContain('camera=()');
    });

    it('rollback scope is limited to CSP enforcement mode only', async () => {
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const nonce = generateNonce();

      const enforced = buildSecurityHeaders(nonce, { enforceCSP: true, isProduction: true });
      const rolledBack = buildSecurityHeaders(nonce, { enforceCSP: false, isProduction: true });

      // HSTS remains in both
      expect(enforced.has('Strict-Transport-Security')).toBe(true);
      expect(rolledBack.has('Strict-Transport-Security')).toBe(true);

      // Header counts differ only in CSP header name
      const enforcedKeys = [...enforced.keys()].sort();
      const rolledBackKeys = [...rolledBack.keys()].sort();
      expect(enforcedKeys.length).toBe(rolledBackKeys.length);
    });
  });

  describe('buildSecurityHeaders — cache policy for sensitive data', () => {
    it('does not add cache headers (response.js handles sensitive cache)', async () => {
      // Security headers module handles browser policy headers.
      // Sensitive response cache policy is already in response.js (Requirement 8.9).
      // Verify no conflict or duplication.
      const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
      const headers = buildSecurityHeaders(generateNonce());
      // Cache-Control is NOT set by security-headers — it is set by response.js per-response
      expect(headers.has('Cache-Control')).toBe(false);
    });
  });
});

describe('lib/server/http/security-headers.test-helpers.js — test utilities', () => {
  it('parseCspDirectives parses a valid CSP string', async () => {
    const { parseCspDirectives } = await import('../../lib/server/http/security-headers.test-helpers.js');
    const csp = "default-src 'self'; script-src 'self' 'nonce-abc'; frame-src 'none'";
    const directives = parseCspDirectives(csp);
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('script-src')).toEqual(["'self'", "'nonce-abc'"]);
    expect(directives.get('frame-src')).toEqual(["'none'"]);
  });

  it('parseCspDirectives handles empty input', async () => {
    const { parseCspDirectives } = await import('../../lib/server/http/security-headers.test-helpers.js');
    expect(parseCspDirectives('')).toEqual(new Map());
    expect(parseCspDirectives(null)).toEqual(new Map());
  });

  it('assertSecurityHeaders passes for correct report-only headers', async () => {
    const { assertSecurityHeaders } = await import('../../lib/server/http/security-headers.test-helpers.js');
    const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
    const nonce = generateNonce();
    const headers = buildSecurityHeaders(nonce, { enforceCSP: false, isProduction: false });
    const result = assertSecurityHeaders(headers, { enforceCSP: false, isProduction: false, nonce });
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('assertSecurityHeaders passes for correct enforced production headers', async () => {
    const { assertSecurityHeaders } = await import('../../lib/server/http/security-headers.test-helpers.js');
    const { buildSecurityHeaders, generateNonce } = await import('../../lib/server/http/security-headers.js');
    const nonce = generateNonce();
    const headers = buildSecurityHeaders(nonce, { enforceCSP: true, isProduction: true });
    const result = assertSecurityHeaders(headers, { enforceCSP: true, isProduction: true, nonce });
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('assertSecurityHeaders reports missing headers', async () => {
    const { assertSecurityHeaders } = await import('../../lib/server/http/security-headers.test-helpers.js');
    const headers = new Map();
    headers.set('X-Content-Type-Options', 'nosniff');
    const result = assertSecurityHeaders(headers, { enforceCSP: false });
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });
});
