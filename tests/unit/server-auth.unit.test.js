// tests/unit/server-auth.unit.test.js
// Unit tests for lib/server/auth/session.js and lib/server/auth/authorization.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only (it just throws in non-server contexts)
vi.mock('server-only', () => ({}));

// Mock Firebase Admin
const mockVerifyIdToken = vi.fn();
const mockVerifySessionCookie = vi.fn();
const mockCreateSessionCookie = vi.fn();
const mockRevokeRefreshTokens = vi.fn();
const mockFirestoreGet = vi.fn();

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {
    verifyIdToken: (...args) => mockVerifyIdToken(...args),
    verifySessionCookie: (...args) => mockVerifySessionCookie(...args),
    createSessionCookie: (...args) => mockCreateSessionCookie(...args),
    revokeRefreshTokens: (...args) => mockRevokeRefreshTokens(...args),
  },
  firestore: {
    collection: (name) => ({
      doc: (uid) => ({
        get: () => mockFirestoreGet(name, uid),
      }),
    }),
  },
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3000',
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
  },
}));

describe('lib/server/auth/session', () => {
  let createSession, resolveSession, revokeActorSessions, clearSessionCookie, buildSessionCookieHeader, SESSION_COOKIE_NAME;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/server/auth/session.js');
    createSession = mod.createSession;
    resolveSession = mod.resolveSession;
    revokeActorSessions = mod.revokeActorSessions;
    clearSessionCookie = mod.clearSessionCookie;
    buildSessionCookieHeader = mod.buildSessionCookieHeader;
    SESSION_COOKIE_NAME = mod.SESSION_COOKIE_NAME;
  });

  describe('SESSION_COOKIE_NAME', () => {
    it('uses the __Host- prefix for maximum security', () => {
      expect(SESSION_COOKIE_NAME).toBe('__Host-sf_session');
    });
  });

  describe('createSession', () => {
    const validToken = {
      uid: 'user-123',
      email: 'staff@sandyfeet.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
      iat: Math.floor(Date.now() / 1000) - 60,
    };

    it('rejects empty/null idToken', async () => {
      await expect(createSession(null)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(createSession('')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(createSession(123)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects invalid Firebase ID tokens', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));
      await expect(createSession('bad-token')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects tokens older than 5 minutes', async () => {
      const oldToken = { ...validToken, auth_time: Math.floor(Date.now() / 1000) - 600 };
      mockVerifyIdToken.mockResolvedValue(oldToken);
      await expect(createSession('some-token')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects when no account document exists', async () => {
      mockVerifyIdToken.mockResolvedValue(validToken);
      mockFirestoreGet.mockResolvedValue({ exists: false });
      await expect(createSession('valid-token')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects inactive accounts', async () => {
      mockVerifyIdToken.mockResolvedValue(validToken);
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: true, data: () => ({ role: 'staff', status: 'inactive', email: 'staff@sandyfeet.com' }) };
        }
        return { exists: false };
      });
      await expect(createSession('valid-token')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects unverified staff email', async () => {
      const unverifiedToken = { ...validToken, email_verified: false };
      mockVerifyIdToken.mockResolvedValue(unverifiedToken);
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: true, data: () => ({ role: 'staff', status: 'active', email: 'staff@sandyfeet.com' }) };
        }
        return { exists: false };
      });
      await expect(createSession('valid-token')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('creates a session for a valid staff user', async () => {
      mockVerifyIdToken.mockResolvedValue(validToken);
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: true, data: () => ({ role: 'admin', status: 'active', email: 'staff@sandyfeet.com', displayName: 'Admin User' }) };
        }
        return { exists: false };
      });
      mockCreateSessionCookie.mockResolvedValue('session-cookie-value');

      const result = await createSession('valid-token', false);

      expect(result.cookie).toBe('session-cookie-value');
      expect(result.actor.uid).toBe('user-123');
      expect(result.actor.role).toBe('admin');
      expect(result.actor.accountType).toBe('staff');
      expect(result.actor.status).toBe('active');
      // Default max age: 7 days
      expect(result.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('creates a session with remember-me extended lifetime', async () => {
      mockVerifyIdToken.mockResolvedValue(validToken);
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: true, data: () => ({ role: 'staff', status: 'active', email: 'staff@sandyfeet.com' }) };
        }
        return { exists: false };
      });
      mockCreateSessionCookie.mockResolvedValue('session-cookie-long');

      const result = await createSession('valid-token', true);

      expect(result.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('creates a session for a guest user (no email verification required)', async () => {
      const guestToken = { ...validToken, email_verified: false };
      mockVerifyIdToken.mockResolvedValue(guestToken);
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: false };
        }
        if (collection === 'guestProfiles') {
          return { exists: true, data: () => ({ status: 'active', email: 'guest@example.com', name: 'Guest User' }) };
        }
        return { exists: false };
      });
      mockCreateSessionCookie.mockResolvedValue('guest-session');

      const result = await createSession('guest-token');

      expect(result.actor.role).toBe('guest');
      expect(result.actor.accountType).toBe('guest');
      expect(result.actor.displayName).toBe('Guest User');
    });
  });

  describe('resolveSession', () => {
    it('rejects empty/null cookie', async () => {
      await expect(resolveSession(null)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(resolveSession('')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects invalid session cookies', async () => {
      mockVerifySessionCookie.mockRejectedValue(new Error('Invalid'));
      await expect(resolveSession('bad-cookie')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects when account document is missing', async () => {
      mockVerifySessionCookie.mockResolvedValue({ uid: 'gone-user', email_verified: true, iat: 1000 });
      mockFirestoreGet.mockResolvedValue({ exists: false });
      await expect(resolveSession('valid-cookie')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects inactive accounts on session resolution', async () => {
      mockVerifySessionCookie.mockResolvedValue({ uid: 'user-1', email_verified: true, iat: 1000 });
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: true, data: () => ({ role: 'staff', status: 'inactive' }) };
        }
        return { exists: false };
      });
      await expect(resolveSession('valid-cookie')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('resolves a valid session with authoritative account data', async () => {
      mockVerifySessionCookie.mockResolvedValue({
        uid: 'user-1',
        email: 'admin@sandyfeet.com',
        email_verified: true,
        iat: 1700000000,
      });
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: true, data: () => ({ role: 'admin', status: 'active', displayName: 'Admin' }) };
        }
        return { exists: false };
      });

      const actor = await resolveSession('valid-cookie');

      expect(actor.uid).toBe('user-1');
      expect(actor.role).toBe('admin');
      expect(actor.status).toBe('active');
      expect(actor.sessionIssuedAt).toBe(1700000000);
    });
  });

  describe('revokeActorSessions', () => {
    it('calls revokeRefreshTokens for the given UID', async () => {
      mockRevokeRefreshTokens.mockResolvedValue(undefined);
      await revokeActorSessions('user-abc');
      expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user-abc');
    });
  });

  describe('clearSessionCookie', () => {
    it('appends a Set-Cookie header that clears the session', () => {
      const headers = new Headers();
      clearSessionCookie(headers);
      const cookie = headers.get('Set-Cookie');
      expect(cookie).toContain('__Host-sf_session=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('SameSite=Lax');
    });
  });

  describe('buildSessionCookieHeader', () => {
    it('builds a proper Set-Cookie header value', () => {
      const header = buildSessionCookieHeader('my-cookie-value', 7 * 24 * 60 * 60 * 1000);
      expect(header).toContain('__Host-sf_session=my-cookie-value');
      expect(header).toContain('Path=/');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Max-Age=604800');
    });
  });
});

describe('lib/server/auth/authorization', () => {
  let requireActor, requireRole, requireOwner, assertTransition;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/server/auth/authorization.js');
    requireActor = mod.requireActor;
    requireRole = mod.requireRole;
    requireOwner = mod.requireOwner;
    assertTransition = mod.assertTransition;
  });

  describe('requireActor', () => {
    it('rejects requests without a cookie header', async () => {
      const request = new Request('http://localhost/api/test', {
        headers: {},
      });
      await expect(requireActor(request)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects requests with a cookie header but no session cookie', async () => {
      const request = new Request('http://localhost/api/test', {
        headers: { cookie: 'other=value' },
      });
      await expect(requireActor(request)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('calls resolveSession with the session cookie value', async () => {
      mockVerifySessionCookie.mockResolvedValue({
        uid: 'actor-1',
        email: 'test@test.com',
        email_verified: true,
        iat: 1700000000,
      });
      mockFirestoreGet.mockImplementation((collection) => {
        if (collection === 'users') {
          return { exists: true, data: () => ({ role: 'staff', status: 'active' }) };
        }
        return { exists: false };
      });

      const request = new Request('http://localhost/api/test', {
        headers: { cookie: '__Host-sf_session=valid-session-cookie; other=foo' },
      });
      const actor = await requireActor(request);
      expect(actor.uid).toBe('actor-1');
      expect(actor.role).toBe('staff');
    });
  });

  describe('requireRole', () => {
    it('passes when actor role is in allowed list', () => {
      const actor = { uid: 'u1', role: 'admin' };
      expect(() => requireRole(actor, ['admin', 'staff'])).not.toThrow();
    });

    it('throws FORBIDDEN when actor role is not in allowed list', () => {
      const actor = { uid: 'u1', role: 'guest' };
      expect(() => requireRole(actor, ['admin', 'staff'])).toThrow();
      try {
        requireRole(actor, ['admin']);
      } catch (e) {
        expect(e.code).toBe('FORBIDDEN');
      }
    });

    it('throws FORBIDDEN for null/undefined actor', () => {
      expect(() => requireRole(null, ['admin'])).toThrow();
      expect(() => requireRole(undefined, ['admin'])).toThrow();
    });
  });

  describe('requireOwner', () => {
    it('passes when actor uid matches resource ownerUid', () => {
      const actor = { uid: 'user-1' };
      expect(() => requireOwner(actor, { ownerUid: 'user-1' })).not.toThrow();
    });

    it('passes when actor uid matches resource uid', () => {
      const actor = { uid: 'user-1' };
      expect(() => requireOwner(actor, { uid: 'user-1' })).not.toThrow();
    });

    it('passes when actor uid matches resource userId', () => {
      const actor = { uid: 'user-1' };
      expect(() => requireOwner(actor, { userId: 'user-1' })).not.toThrow();
    });

    it('throws FORBIDDEN when actor uid does not match', () => {
      const actor = { uid: 'user-1' };
      try {
        requireOwner(actor, { ownerUid: 'user-2' });
      } catch (e) {
        expect(e.code).toBe('FORBIDDEN');
      }
    });

    it('throws FORBIDDEN for null actor', () => {
      expect(() => requireOwner(null, { ownerUid: 'user-1' })).toThrow();
    });
  });

  describe('assertTransition', () => {
    const machine = {
      pending: ['approved', 'rejected'],
      approved: ['completed'],
      rejected: [],
    };

    it('passes for valid transitions', () => {
      expect(() => assertTransition(machine, 'pending', 'approved', { uid: 'u1' })).not.toThrow();
      expect(() => assertTransition(machine, 'pending', 'rejected', { uid: 'u1' })).not.toThrow();
      expect(() => assertTransition(machine, 'approved', 'completed', { uid: 'u1' })).not.toThrow();
    });

    it('throws CONFLICT for invalid transitions', () => {
      try {
        assertTransition(machine, 'pending', 'completed', { uid: 'u1' });
      } catch (e) {
        expect(e.code).toBe('CONFLICT');
      }
    });

    it('throws CONFLICT for unknown source states', () => {
      try {
        assertTransition(machine, 'unknown', 'approved', { uid: 'u1' });
      } catch (e) {
        expect(e.code).toBe('CONFLICT');
      }
    });

    it('throws CONFLICT for terminal states with no outgoing edges', () => {
      try {
        assertTransition(machine, 'rejected', 'pending', { uid: 'u1' });
      } catch (e) {
        expect(e.code).toBe('CONFLICT');
      }
    });
  });
});
