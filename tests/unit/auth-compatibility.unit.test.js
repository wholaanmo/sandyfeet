// tests/unit/auth-compatibility.unit.test.js
// Unit tests for lib/server/auth/compatibility.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

describe('lib/server/auth/compatibility', () => {
  const originalEnv = process.env.AUTH_MODE;

  afterEach(() => {
    vi.resetModules();
    if (originalEnv === undefined) {
      delete process.env.AUTH_MODE;
    } else {
      process.env.AUTH_MODE = originalEnv;
    }
  });

  describe('AUTH_MODE constant', () => {
    it('defaults to "server" when AUTH_MODE env is not set', async () => {
      delete process.env.AUTH_MODE;
      const mod = await import('../../lib/server/auth/compatibility.js');
      expect(mod.AUTH_MODE).toBe('server');
    });

    it('returns "server" when AUTH_MODE env is an unrecognized value', async () => {
      process.env.AUTH_MODE = 'unknown';
      const mod = await import('../../lib/server/auth/compatibility.js');
      expect(mod.AUTH_MODE).toBe('server');
    });

    it('returns "legacy" when AUTH_MODE env is "legacy"', async () => {
      process.env.AUTH_MODE = 'legacy';
      const mod = await import('../../lib/server/auth/compatibility.js');
      expect(mod.AUTH_MODE).toBe('legacy');
    });
  });

  describe('isLegacyMode()', () => {
    it('returns false in server mode (default)', async () => {
      delete process.env.AUTH_MODE;
      const mod = await import('../../lib/server/auth/compatibility.js');
      expect(mod.isLegacyMode()).toBe(false);
    });

    it('returns true when AUTH_MODE is "legacy"', async () => {
      process.env.AUTH_MODE = 'legacy';
      const mod = await import('../../lib/server/auth/compatibility.js');
      expect(mod.isLegacyMode()).toBe(true);
    });
  });

  describe('detectObsoleteCredentials()', () => {
    let detectObsoleteCredentials;

    beforeEach(async () => {
      delete process.env.AUTH_MODE;
      vi.resetModules();
      const mod = await import('../../lib/server/auth/compatibility.js');
      detectObsoleteCredentials = mod.detectObsoleteCredentials;
    });

    it('returns detected:false when no cookies are present', () => {
      const request = new Request('http://localhost/test', {
        headers: {},
      });
      const result = detectObsoleteCredentials(request);
      expect(result.detected).toBe(false);
      expect(result.cookieNames).toEqual([]);
    });

    it('returns detected:false when only non-legacy cookies are present', () => {
      const request = new Request('http://localhost/test', {
        headers: { cookie: '__Host-sf_session=abc123; theme=dark' },
      });
      const result = detectObsoleteCredentials(request);
      expect(result.detected).toBe(false);
      expect(result.cookieNames).toEqual([]);
    });

    it('detects sessionToken cookie', () => {
      const request = new Request('http://localhost/test', {
        headers: { cookie: 'sessionToken=some-value; other=stuff' },
      });
      const result = detectObsoleteCredentials(request);
      expect(result.detected).toBe(true);
      expect(result.cookieNames).toContain('sessionToken');
    });

    it('detects userType cookie', () => {
      const request = new Request('http://localhost/test', {
        headers: { cookie: 'userType=admin' },
      });
      const result = detectObsoleteCredentials(request);
      expect(result.detected).toBe(true);
      expect(result.cookieNames).toContain('userType');
    });

    it('detects sessionExpiry cookie', () => {
      const request = new Request('http://localhost/test', {
        headers: { cookie: 'sessionExpiry=1700000000000' },
      });
      const result = detectObsoleteCredentials(request);
      expect(result.detected).toBe(true);
      expect(result.cookieNames).toContain('sessionExpiry');
    });

    it('detects multiple obsolete cookies at once', () => {
      const request = new Request('http://localhost/test', {
        headers: { cookie: 'sessionToken=x; userType=admin; sessionExpiry=123; __Host-sf_session=valid' },
      });
      const result = detectObsoleteCredentials(request);
      expect(result.detected).toBe(true);
      expect(result.cookieNames).toHaveLength(3);
      expect(result.cookieNames).toContain('sessionToken');
      expect(result.cookieNames).toContain('userType');
      expect(result.cookieNames).toContain('sessionExpiry');
    });

    it('logs telemetry-safe message (presence only, never values)', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const request = new Request('http://localhost/test', {
        headers: { cookie: 'sessionToken=SECRET_VALUE; userType=admin' },
      });
      detectObsoleteCredentials(request);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = consoleSpy.mock.calls[0].join(' ');
      expect(loggedMessage).toContain('[auth:compatibility]');
      expect(loggedMessage).toContain('<present>');
      expect(loggedMessage).not.toContain('SECRET_VALUE');
      consoleSpy.mockRestore();
    });
  });

  describe('OBSOLETE_LOCAL_STORAGE_KEYS export', () => {
    it('includes all known legacy localStorage keys', async () => {
      delete process.env.AUTH_MODE;
      vi.resetModules();
      const mod = await import('../../lib/server/auth/compatibility.js');
      expect(mod.OBSOLETE_LOCAL_STORAGE_KEYS).toContain('userType');
      expect(mod.OBSOLETE_LOCAL_STORAGE_KEYS).toContain('userEmail');
      expect(mod.OBSOLETE_LOCAL_STORAGE_KEYS).toContain('userName');
      expect(mod.OBSOLETE_LOCAL_STORAGE_KEYS).toContain('uid');
      expect(mod.OBSOLETE_LOCAL_STORAGE_KEYS).toContain('sessionToken');
      expect(mod.OBSOLETE_LOCAL_STORAGE_KEYS).toContain('sessionExpiry');
      expect(mod.OBSOLETE_LOCAL_STORAGE_KEYS).toContain('rememberMe');
    });
  });
});
