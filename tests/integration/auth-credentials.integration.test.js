// tests/integration/auth-credentials.integration.test.js
// Integration tests for auth sessions, authorization, API boundary, and credential lifecycle.
// Mocks Firebase Admin SDK calls so tests can run without emulators.
// Requirements: 1.1–1.10, 2.1–2.8, 3.1–3.11, 15.3, 15.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestActor } from '../fixtures/deterministic.js';

// ─── Mock Firebase Admin SDK and server-only ────────────────────────────────

vi.mock('server-only', () => ({}));

// Shared mock state for Firebase Admin auth
const mockAuth = {
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
  createSessionCookie: vi.fn(),
  revokeRefreshTokens: vi.fn(),
};

// Shared mock state for Firestore
const mockFirestoreData = new Map();
let mockTransactionFn = null;

const mockDocRef = (id) => ({
  id: id || `mock-doc-${Date.now()}`,
  get: vi.fn(async () => {
    const data = mockFirestoreData.get(id);
    return { exists: !!data, data: () => data, ref: mockDocRef(id) };
  }),
  set: vi.fn(async (data) => { mockFirestoreData.set(id, data); }),
  update: vi.fn(async (updates) => {
    const existing = mockFirestoreData.get(id) || {};
    mockFirestoreData.set(id, { ...existing, ...updates });
  }),
});

const mockQuerySnapshot = (docs) => ({
  empty: docs.length === 0,
  docs: docs.map((d) => ({ id: d.id, data: () => d.data, ref: mockDocRef(d.id) })),
});

const mockCollection = vi.fn(() => ({
  doc: vi.fn((id) => {
    const docId = id || `auto-${Math.random().toString(36).slice(2, 10)}`;
    return mockDocRef(docId);
  }),
  where: vi.fn(() => ({
    where: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => {
            // Find matching credential in store
            const allDocs = [];
            for (const [key, val] of mockFirestoreData.entries()) {
              if (key.startsWith('cred-')) {
                allDocs.push({ id: key, data: val });
              }
            }
            return mockQuerySnapshot(allDocs.slice(0, 1));
          }),
        })),
      })),
    })),
  })),
}));

const mockFirestore = {
  collection: mockCollection,
  runTransaction: vi.fn(async (fn) => {
    const transaction = {
      get: vi.fn(async (ref) => {
        const data = mockFirestoreData.get(ref.id);
        return { exists: !!data, data: () => data };
      }),
      update: vi.fn((ref, updates) => {
        const existing = mockFirestoreData.get(ref.id) || {};
        mockFirestoreData.set(ref.id, { ...existing, ...updates });
      }),
    };
    return fn(transaction);
  }),
};

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: mockAuth,
  firestore: mockFirestore,
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
    APP_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(method = 'POST', opts = {}) {
  const {
    headers = {},
    body = null,
    url = 'http://localhost:3000/api/test',
  } = opts;

  const init = { method, headers: new Headers(headers) };
  if (body !== null && ['POST', 'PUT', 'PATCH'].includes(method)) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    init.body = bodyStr;
    if (!headers['content-type']) {
      init.headers.set('content-type', 'application/json');
    }
    init.headers.set('content-length', String(
      typeof body === 'string' ? body.length : JSON.stringify(body).length
    ));
  }

  return new Request(url, init);
}

function makeCookieRequest(cookieValue, method = 'GET') {
  return makeRequest(method, {
    headers: { cookie: `__Host-sf_session=${cookieValue}` },
  });
}

async function parseResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ─── 1. Session Creation Tests ──────────────────────────────────────────────

describe('Session Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('creates a session cookie from a valid ID token', async () => {
    const { createSession } = await import('../../lib/server/auth/session.js');
    const actor = createTestActor(0, 'staff');
    const now = Math.floor(Date.now() / 1000);

    mockAuth.verifyIdToken.mockResolvedValue({
      uid: actor.uid,
      auth_time: now,
      email: actor.email,
      email_verified: true,
    });

    // Setup account document
    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((uid) => ({
        id: uid,
        get: vi.fn(async () => {
          if (collectionName === 'users') {
            return { exists: true, data: () => ({ role: 'staff', status: 'active', displayName: 'Test User' }) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    mockAuth.createSessionCookie.mockResolvedValue('mock-session-cookie-value');

    const result = await createSession('valid-id-token', false);

    expect(result.cookie).toBe('mock-session-cookie-value');
    expect(result.actor.uid).toBe(actor.uid);
    expect(result.actor.role).toBe('staff');
    expect(result.maxAge).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
  });

  it('rejects an expired/invalid ID token', async () => {
    const { createSession } = await import('../../lib/server/auth/session.js');

    mockAuth.verifyIdToken.mockRejectedValue(new Error('Token expired'));

    await expect(createSession('expired-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an inactive account during session creation', async () => {
    const { createSession } = await import('../../lib/server/auth/session.js');
    const now = Math.floor(Date.now() / 1000);

    mockAuth.verifyIdToken.mockResolvedValue({
      uid: 'inactive-user-uid',
      auth_time: now,
      email: 'inactive@example.test',
      email_verified: true,
    });

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((uid) => ({
        id: uid,
        get: vi.fn(async () => {
          if (collectionName === 'users') {
            return { exists: true, data: () => ({ role: 'staff', status: 'inactive', displayName: 'Inactive' }) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    await expect(createSession('valid-token-inactive-user')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an unverified staff account', async () => {
    const { createSession } = await import('../../lib/server/auth/session.js');
    const now = Math.floor(Date.now() / 1000);

    mockAuth.verifyIdToken.mockResolvedValue({
      uid: 'unverified-uid',
      auth_time: now,
      email: 'unverified@example.test',
      email_verified: false,
    });

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((uid) => ({
        id: uid,
        get: vi.fn(async () => {
          if (collectionName === 'users') {
            return { exists: true, data: () => ({ role: 'staff', status: 'active' }) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    await expect(createSession('token-unverified')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});

// ─── 2. Session Resolution Tests ────────────────────────────────────────────

describe('Session Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('resolves a valid session cookie to an actor', async () => {
    const { resolveSession } = await import('../../lib/server/auth/session.js');

    mockAuth.verifySessionCookie.mockResolvedValue({
      uid: 'valid-uid',
      email: 'user@example.test',
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
    });

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((uid) => ({
        id: uid,
        get: vi.fn(async () => {
          if (collectionName === 'users') {
            return { exists: true, data: () => ({ role: 'admin', status: 'active', displayName: 'Admin User' }) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    const actor = await resolveSession('valid-session-cookie');

    expect(actor.uid).toBe('valid-uid');
    expect(actor.role).toBe('admin');
    expect(actor.status).toBe('active');
  });

  it('rejects a revoked session cookie', async () => {
    const { resolveSession } = await import('../../lib/server/auth/session.js');

    mockAuth.verifySessionCookie.mockRejectedValue(new Error('Session revoked'));

    await expect(resolveSession('revoked-cookie')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a session for an inactive account', async () => {
    const { resolveSession } = await import('../../lib/server/auth/session.js');

    mockAuth.verifySessionCookie.mockResolvedValue({
      uid: 'inactive-uid',
      email: 'inactive@example.test',
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
    });

    mockCollection.mockImplementation((collectionName) => ({
      doc: vi.fn((uid) => ({
        id: uid,
        get: vi.fn(async () => {
          if (collectionName === 'users') {
            return { exists: true, data: () => ({ role: 'staff', status: 'inactive' }) };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }));

    await expect(resolveSession('inactive-account-cookie')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});

// ─── 3. Authorization Tests ─────────────────────────────────────────────────

describe('Authorization Guards', () => {
  it('requireRole passes with a correct role', async () => {
    const { requireRole } = await import('../../lib/server/auth/authorization.js');
    const actor = { uid: 'uid-1', role: 'admin' };

    // Should not throw
    expect(() => requireRole(actor, ['admin', 'staff'])).not.toThrow();
  });

  it('requireRole rejects with a wrong role', async () => {
    const { requireRole } = await import('../../lib/server/auth/authorization.js');
    const actor = { uid: 'uid-1', role: 'guest' };

    expect(() => requireRole(actor, ['admin', 'staff'])).toThrow();
    try {
      requireRole(actor, ['admin', 'staff']);
    } catch (err) {
      expect(err.code).toBe('FORBIDDEN');
    }
  });

  it('requireOwner passes when actor UID matches resource owner', async () => {
    const { requireOwner } = await import('../../lib/server/auth/authorization.js');
    const actor = { uid: 'uid-owner', role: 'guest' };
    const resource = { ownerUid: 'uid-owner' };

    expect(() => requireOwner(actor, resource)).not.toThrow();
  });

  it('requireOwner rejects when actor UID does not match', async () => {
    const { requireOwner } = await import('../../lib/server/auth/authorization.js');
    const actor = { uid: 'uid-actor', role: 'guest' };
    const resource = { ownerUid: 'uid-different' };

    expect(() => requireOwner(actor, resource)).toThrow();
    try {
      requireOwner(actor, resource);
    } catch (err) {
      expect(err.code).toBe('FORBIDDEN');
    }
  });

  it('requireOwner supports userId field on resource', async () => {
    const { requireOwner } = await import('../../lib/server/auth/authorization.js');
    const actor = { uid: 'uid-match', role: 'staff' };
    const resource = { userId: 'uid-match' };

    expect(() => requireOwner(actor, resource)).not.toThrow();
  });
});

// ─── 4. API Boundary Tests ──────────────────────────────────────────────────

describe('API Boundary Enforcement', () => {
  let withApiBoundary;
  let resetRateLimitStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
    const boundary = await import('../../lib/server/http/boundary.js');
    withApiBoundary = boundary.withApiBoundary;
    const rateLimit = await import('../../lib/server/http/rate-limit.js');
    resetRateLimitStore = rateLimit.resetRateLimitStore;
    resetRateLimitStore();
  });

  afterEach(() => {
    resetRateLimitStore?.();
  });

  const testHandler = async ({ input }) => ({ data: { received: input }, status: 200 });

  const testPolicy = {
    methods: ['POST'],
    auth: 'none',
    bodySchema: null,
    csrf: false,
    rateLimit: null,
  };

  it('rejects wrong HTTP method with 405 and Allow header', async () => {
    const handler = withApiBoundary(testPolicy, testHandler);
    const request = makeRequest('GET');

    const response = await handler(request);

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    const body = await parseResponse(response);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('rejects wrong content-type with 415', async () => {
    const handler = withApiBoundary(testPolicy, testHandler);
    const request = makeRequest('POST', {
      headers: { 'content-type': 'text/plain', 'content-length': '5' },
      body: 'hello',
    });

    const response = await handler(request);

    expect(response.status).toBe(415);
    const body = await parseResponse(response);
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects oversized body with 413', async () => {
    const smallPolicy = { ...testPolicy, maxBodySize: 50 };
    const handler = withApiBoundary(smallPolicy, testHandler);
    const request = makeRequest('POST', {
      headers: { 'content-type': 'application/json', 'content-length': '100' },
      body: JSON.stringify({ data: 'x'.repeat(80) }),
    });

    const response = await handler(request);

    expect(response.status).toBe(413);
    const body = await parseResponse(response);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects malformed JSON body with 400', async () => {
    const handler = withApiBoundary(testPolicy, testHandler);
    const request = makeRequest('POST', {
      headers: { 'content-type': 'application/json', 'content-length': '12' },
      body: '{not valid json',
    });

    const response = await handler(request);

    expect(response.status).toBe(400);
    const body = await parseResponse(response);
    expect(body.error.code).toBe('MALFORMED_BODY');
  });

  it('exhausts rate limit and returns 429 with Retry-After', async () => {
    const rateLimitedPolicy = { ...testPolicy, rateLimit: 'auth-attempt' };
    const handler = withApiBoundary(rateLimitedPolicy, testHandler);

    // auth-attempt allows 5 requests per 15 minutes
    for (let i = 0; i < 5; i++) {
      const req = makeRequest('POST', {
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.100',
          'content-length': '2',
        },
        body: '{}',
      });
      const res = await handler(req);
      expect(res.status).toBe(200);
    }

    // 6th request should be rate limited
    const req = makeRequest('POST', {
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.100',
        'content-length': '2',
      },
      body: '{}',
    });
    const response = await handler(req);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    const body = await parseResponse(response);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('rejects schema validation failure with 422', async () => {
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1), age: z.number().positive() }).strict();
    const schemaPolicy = { ...testPolicy, bodySchema: schema };
    const handler = withApiBoundary(schemaPolicy, testHandler);

    const request = makeRequest('POST', {
      headers: { 'content-type': 'application/json' },
      body: { name: '', age: -5 },
    });

    const response = await handler(request);

    expect(response.status).toBe(422);
    const body = await parseResponse(response);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects CSRF violation with 403', async () => {
    const csrfPolicy = {
      methods: ['POST'],
      auth: 'required',
      csrf: true,
      rateLimit: null,
    };

    const handler = withApiBoundary(csrfPolicy, testHandler);

    // The boundary's resolveActor falls back to x-actor-uid/x-actor-role headers
    // when session module is not fully wired. Provide a valid actor via headers
    // and an evil origin to trigger CSRF violation.
    const request = makeRequest('POST', {
      headers: {
        'content-type': 'application/json',
        'content-length': '2',
        'x-actor-uid': 'csrf-test-uid',
        'x-actor-role': 'staff',
        origin: 'https://evil.example.com',
      },
      body: '{}',
    });

    const response = await handler(request);

    expect(response.status).toBe(403);
    const body = await parseResponse(response);
    expect(body.error.code).toBe('CSRF_VIOLATION');
  });
});

// ─── 5. Credential Lifecycle Tests ──────────────────────────────────────────

describe('Credential Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('issues, validates, and consumes a credential successfully', async () => {
    const { issueCredential, validateCredential, consumeWithMutation } =
      await import('../../lib/server/services/credential.js');

    // Mock Firestore for credential issuance
    const credId = 'cred-test-issue-1';
    mockCollection.mockImplementation(() => ({
      doc: vi.fn((id) => {
        const docId = id || credId;
        return {
          id: docId,
          get: vi.fn(async () => {
            const data = mockFirestoreData.get(docId);
            return { exists: !!data, data: () => data, ref: { id: docId, update: vi.fn() } };
          }),
          set: vi.fn(async (data) => { mockFirestoreData.set(docId, data); }),
          update: vi.fn(async (updates) => {
            const existing = mockFirestoreData.get(docId) || {};
            mockFirestoreData.set(docId, { ...existing, ...updates });
          }),
        };
      }),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => {
                const data = mockFirestoreData.get(credId);
                if (data) {
                  return {
                    empty: false,
                    docs: [{
                      id: credId,
                      data: () => data,
                      ref: {
                        id: credId,
                        update: vi.fn(async (updates) => {
                          const existing = mockFirestoreData.get(credId) || {};
                          mockFirestoreData.set(credId, { ...existing, ...updates });
                        }),
                      },
                    }],
                  };
                }
                return { empty: true, docs: [] };
              }),
            })),
          })),
        })),
      })),
    }));

    // Issue
    const issued = await issueCredential({
      purpose: 'email-verify',
      actorUid: 'user-123',
      subject: 'user@example.com',
    });

    expect(issued.token).toBeTruthy();
    expect(issued.credentialId).toBe(credId);
    expect(issued.expiresAt).toBeInstanceOf(Date);

    // Validate
    const validated = await validateCredential({
      purpose: 'email-verify',
      token: issued.token,
      actorUid: 'user-123',
      subject: 'user@example.com',
    });

    expect(validated.id).toBe(credId);
    expect(validated.record.consumed).toBe(false);

    // Consume
    mockFirestore.runTransaction.mockImplementation(async (fn) => {
      const transaction = {
        get: vi.fn(async () => {
          const data = mockFirestoreData.get(credId);
          return { exists: !!data, data: () => data };
        }),
        update: vi.fn((ref, updates) => {
          const existing = mockFirestoreData.get(credId) || {};
          mockFirestoreData.set(credId, { ...existing, ...updates });
        }),
      };
      return fn(transaction);
    });

    const mutationResult = await consumeWithMutation(credId, async (txn) => {
      return { success: true };
    });

    expect(mutationResult.success).toBe(true);
    // Verify marked consumed
    const storedData = mockFirestoreData.get(credId);
    expect(storedData.consumed).toBe(true);
  });

  it('rejects a consumed credential on second use', async () => {
    const { consumeWithMutation } = await import('../../lib/server/services/credential.js');

    const credId = 'cred-consumed-test';
    mockFirestoreData.set(credId, {
      purpose: 'password-reset',
      actorUid: 'user-abc',
      consumed: true,
      consumedAt: new Date().toISOString(),
    });

    mockFirestore.runTransaction.mockImplementation(async (fn) => {
      const transaction = {
        get: vi.fn(async () => ({
          exists: true,
          data: () => mockFirestoreData.get(credId),
        })),
        update: vi.fn(),
      };
      return fn(transaction);
    });

    await expect(
      consumeWithMutation(credId, async () => ({ done: true }))
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
  });

  it('rejects an expired credential', async () => {
    const { validateCredential } = await import('../../lib/server/services/credential.js');
    const crypto = await import('node:crypto');

    const credId = 'cred-expired-test';
    const token = 'test-token-expired';
    // Compute the same digest the module would
    const secret = process.env.CREDENTIAL_HMAC_SECRET || 'dev-credential-hmac-secret-do-not-use-in-production';
    const digest = crypto.createHmac('sha256', secret).update(token).digest('hex');

    mockFirestoreData.set(credId, {
      purpose: 'password-reset',
      actorUid: 'user-expired',
      digest,
      keyId: 'key-v1',
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // Expired 1 min ago
      maxAttempts: 5,
      failedAttempts: 0,
      consumed: false,
    });

    mockCollection.mockImplementation(() => ({
      doc: vi.fn((id) => mockDocRef(id || credId)),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({
                empty: false,
                docs: [{
                  id: credId,
                  data: () => mockFirestoreData.get(credId),
                  ref: mockDocRef(credId),
                }],
              })),
            })),
          })),
        })),
      })),
    }));

    await expect(
      validateCredential({ purpose: 'password-reset', token, actorUid: 'user-expired' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
  });

  it('rejects a credential with wrong actor binding', async () => {
    const { validateCredential } = await import('../../lib/server/services/credential.js');
    const crypto = await import('node:crypto');

    const credId = 'cred-wrong-binding';
    const token = 'test-token-wrong-binding';
    const secret = process.env.CREDENTIAL_HMAC_SECRET || 'dev-credential-hmac-secret-do-not-use-in-production';
    const digest = crypto.createHmac('sha256', secret).update(token).digest('hex');

    mockFirestoreData.set(credId, {
      purpose: 'email-verify',
      actorUid: 'correct-user',
      digest,
      keyId: 'key-v1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxAttempts: 5,
      failedAttempts: 0,
      consumed: false,
    });

    const mockDocRefLocal = {
      id: credId,
      update: vi.fn(async (updates) => {
        const existing = mockFirestoreData.get(credId) || {};
        mockFirestoreData.set(credId, { ...existing, ...updates });
      }),
    };

    mockCollection.mockImplementation(() => ({
      doc: vi.fn(() => mockDocRefLocal),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({
                empty: false,
                docs: [{
                  id: credId,
                  data: () => mockFirestoreData.get(credId),
                  ref: mockDocRefLocal,
                }],
              })),
            })),
          })),
        })),
      })),
    }));

    await expect(
      validateCredential({ purpose: 'email-verify', token, actorUid: 'wrong-user' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });

    // Verify failed attempt was incremented
    const stored = mockFirestoreData.get(credId);
    expect(stored.failedAttempts).toBe(1);
  });

  it('rejects after attempt exhaustion', async () => {
    const { validateCredential } = await import('../../lib/server/services/credential.js');
    const crypto = await import('node:crypto');

    const credId = 'cred-exhausted';
    const token = 'test-token-exhausted';
    const secret = process.env.CREDENTIAL_HMAC_SECRET || 'dev-credential-hmac-secret-do-not-use-in-production';
    const digest = crypto.createHmac('sha256', secret).update(token).digest('hex');

    mockFirestoreData.set(credId, {
      purpose: 'device-verify',
      actorUid: 'user-exhausted',
      digest,
      keyId: 'key-v1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxAttempts: 5,
      failedAttempts: 5, // Already exhausted
      consumed: false,
    });

    mockCollection.mockImplementation(() => ({
      doc: vi.fn(() => mockDocRef(credId)),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({
                empty: false,
                docs: [{
                  id: credId,
                  data: () => mockFirestoreData.get(credId),
                  ref: mockDocRef(credId),
                }],
              })),
            })),
          })),
        })),
      })),
    }));

    await expect(
      validateCredential({ purpose: 'device-verify', token, actorUid: 'user-exhausted' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
  });
});

// ─── 6. Atomic Consumption (One-Winner) Tests ───────────────────────────────

describe('Atomic Credential Consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('concurrent consume attempts — only one wins', async () => {
    const { consumeWithMutation } = await import('../../lib/server/services/credential.js');

    const credId = 'cred-concurrent';
    mockFirestoreData.set(credId, {
      purpose: 'password-reset',
      actorUid: 'user-concurrent',
      consumed: false,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    let firstCallResolved = false;

    // Simulate transaction contention: first call succeeds, subsequent fail
    mockFirestore.runTransaction.mockImplementation(async (fn) => {
      const currentData = mockFirestoreData.get(credId);

      if (currentData.consumed) {
        // Already consumed by prior call — throw like a real transaction would
        const err = new Error('invalid_or_expired');
        err.code = 'INVALID_CREDENTIAL';
        err.name = 'CredentialInvalidError';
        throw err;
      }

      const transaction = {
        get: vi.fn(async () => ({
          exists: true,
          data: () => mockFirestoreData.get(credId),
        })),
        update: vi.fn((ref, updates) => {
          const existing = mockFirestoreData.get(credId) || {};
          mockFirestoreData.set(credId, { ...existing, ...updates });
        }),
      };

      const result = await fn(transaction);
      firstCallResolved = true;
      return result;
    });

    // Launch concurrent consume attempts
    const results = await Promise.allSettled([
      consumeWithMutation(credId, async () => ({ winner: 1 })),
      consumeWithMutation(credId, async () => ({ winner: 2 })),
      consumeWithMutation(credId, async () => ({ winner: 3 })),
    ]);

    // Exactly one should succeed
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);

    // The winners's mutation ran
    expect(fulfilled[0].value).toMatchObject({ winner: expect.any(Number) });

    // Rejected attempts got the credential-invalid error
    for (const rej of rejected) {
      expect(rej.reason.code).toBe('INVALID_CREDENTIAL');
    }

    // Verify the credential is marked as consumed
    const finalData = mockFirestoreData.get(credId);
    expect(finalData.consumed).toBe(true);
  });
});
