// tests/unit/verification-links.unit.test.js
// Unit tests for lib/server/services/verification-links.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    APP_ORIGIN: 'https://sandyfeet.com',
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
  },
}));

describe('lib/server/services/verification-links', () => {
  let buildVerificationLink, ALLOWED_PURPOSES, PURPOSE_ROUTES;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/server/services/verification-links.js');
    buildVerificationLink = mod.buildVerificationLink;
    ALLOWED_PURPOSES = mod.ALLOWED_PURPOSES;
    PURPOSE_ROUTES = mod.PURPOSE_ROUTES;
  });

  describe('ALLOWED_PURPOSES', () => {
    it('contains all required verification purposes', () => {
      expect(ALLOWED_PURPOSES.has('email-verify')).toBe(true);
      expect(ALLOWED_PURPOSES.has('password-reset')).toBe(true);
      expect(ALLOWED_PURPOSES.has('guest-password-reset')).toBe(true);
      expect(ALLOWED_PURPOSES.has('device-verify')).toBe(true);
      expect(ALLOWED_PURPOSES.has('staff-verify')).toBe(true);
    });
  });

  describe('PURPOSE_ROUTES', () => {
    it('maps each purpose to a valid route path', () => {
      expect(PURPOSE_ROUTES['email-verify']).toBe('/verify-staff');
      expect(PURPOSE_ROUTES['password-reset']).toBe('/reset-password');
      expect(PURPOSE_ROUTES['guest-password-reset']).toBe('/guest-reset-password');
      expect(PURPOSE_ROUTES['device-verify']).toBe('/api/auth/verify-device');
      expect(PURPOSE_ROUTES['staff-verify']).toBe('/verify-staff');
    });
  });

  describe('buildVerificationLink', () => {
    it('uses the configured APP_ORIGIN as the trusted base', () => {
      const link = buildVerificationLink('password-reset', 'test-token-123');
      expect(link.startsWith('https://sandyfeet.com')).toBe(true);
    });

    it('uses the correct route for each purpose', () => {
      const link = buildVerificationLink('password-reset', 'tok');
      const url = new URL(link);
      expect(url.pathname).toBe('/reset-password');
    });

    it('includes the token as a query parameter', () => {
      const link = buildVerificationLink('email-verify', 'my-secret-token');
      const url = new URL(link);
      expect(url.searchParams.get('token')).toBe('my-secret-token');
    });

    it('appends additional params as query parameters', () => {
      const link = buildVerificationLink('staff-verify', 'tok-abc', {
        email: 'staff@sandyfeet.com',
      });
      const url = new URL(link);
      expect(url.searchParams.get('email')).toBe('staff@sandyfeet.com');
      expect(url.searchParams.get('token')).toBe('tok-abc');
    });

    it('does not allow overriding the token param via additional params', () => {
      const link = buildVerificationLink('password-reset', 'real-token', {
        token: 'fake-token',
      });
      const url = new URL(link);
      expect(url.searchParams.get('token')).toBe('real-token');
    });

    it('ignores null/undefined additional params', () => {
      const link = buildVerificationLink('password-reset', 'tok', {
        email: null,
        name: undefined,
      });
      const url = new URL(link);
      expect(url.searchParams.has('email')).toBe(false);
      expect(url.searchParams.has('name')).toBe(false);
    });

    it('throws for non-allowlisted purposes', () => {
      expect(() => buildVerificationLink('malicious-purpose', 'tok')).toThrow(
        'not allowlisted'
      );
    });

    it('throws for empty/missing token', () => {
      expect(() => buildVerificationLink('password-reset', '')).toThrow(
        'Token is required'
      );
      expect(() => buildVerificationLink('password-reset', null)).toThrow(
        'Token is required'
      );
    });

    it('properly encodes special characters in token', () => {
      const token = 'abc+def/ghi=jkl';
      const link = buildVerificationLink('password-reset', token);
      const url = new URL(link);
      expect(url.searchParams.get('token')).toBe(token);
    });

    it('generates a guest-password-reset link correctly', () => {
      const link = buildVerificationLink('guest-password-reset', 'guest-tok');
      const url = new URL(link);
      expect(url.origin).toBe('https://sandyfeet.com');
      expect(url.pathname).toBe('/guest-reset-password');
      expect(url.searchParams.get('token')).toBe('guest-tok');
    });
  });
});
