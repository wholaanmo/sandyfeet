import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock server-only so it doesn't throw in test environment
vi.mock('server-only', () => ({}));

// Mock the Firebase Admin module
vi.mock('../../lib/server/firebase-admin.js', () => ({
  firestore: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ exists: false })),
        set: vi.fn(),
        update: vi.fn(),
      })),
    })),
    runTransaction: vi.fn((fn) => fn({
      get: vi.fn(() => Promise.resolve({ exists: false })),
      set: vi.fn(),
      update: vi.fn(),
    })),
  },
}));

// Mock session resolution for auth
vi.mock('../../lib/server/auth/session.js', () => ({
  resolveSession: vi.fn(() => Promise.resolve(null)),
  SESSION_COOKIE_NAME: '__Host-sf_session',
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest({
  method = 'POST',
  url = 'http://localhost:3000/api/test',
  headers = {},
  body = null,
} = {}) {
  const defaultHeaders = {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
    ...headers,
  };
  const headerMap = new Map(
    Object.entries(defaultHeaders).map(([k, v]) => [k.toLowerCase(), v])
  );
  const textBody = body !== null ? JSON.stringify(body) : '';
  return {
    method,
    url,
    headers: {
      get(name) { return headerMap.get(name.toLowerCase()) ?? null; },
      has(name) { return headerMap.has(name.toLowerCase()); },
    },
    text: () => Promise.resolve(textBody),
  };
}

async function parseResponse(response) {
  const text = await response.text();
  return JSON.parse(text);
}

// ─── Route Policy Tests ──────────────────────────────────────────────────────

describe('Privileged API route policies', () => {

  describe('POST /api/reservations/create', () => {
    let POST;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../../app/api/reservations/create/route.js');
      POST = mod.POST;
    });

    it('exports a POST handler wrapped by withApiBoundary', () => {
      expect(POST).toBeDefined();
      expect(typeof POST).toBe('function');
    });

    it('rejects GET method with 405', async () => {
      const req = makeRequest({ method: 'GET', url: 'http://localhost:3000/api/reservations/create' });
      const res = await POST(req);
      expect(res.status).toBe(405);
      const data = await parseResponse(res);
      expect(data.ok).toBe(false);
      expect(data.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const req = makeRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/reservations/create',
        body: { idempotencyKey: 'test-key', checkIn: '2025-06-01', checkOut: '2025-06-03', rooms: [{ roomId: 'rm-1' }] },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await parseResponse(res);
      expect(data.ok).toBe(false);
      expect(data.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects malformed JSON with 400', async () => {
      const headerMap = new Map([
        ['content-type', 'application/json'],
        ['origin', 'http://localhost:3000'],
      ]);
      const req = {
        method: 'POST',
        url: 'http://localhost:3000/api/reservations/create',
        headers: {
          get(name) { return headerMap.get(name.toLowerCase()) ?? null; },
          has(name) { return headerMap.has(name.toLowerCase()); },
        },
        text: () => Promise.resolve('{invalid json}'),
      };
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await parseResponse(res);
      expect(data.error.code).toBe('MALFORMED_BODY');
    });
  });

  describe('POST /api/reservations/[id]/edit', () => {
    let POST;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../../app/api/reservations/[id]/edit/route.js');
      POST = mod.POST;
    });

    it('exports a POST handler wrapped by withApiBoundary', () => {
      expect(POST).toBeDefined();
      expect(typeof POST).toBe('function');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const req = makeRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/reservations/BK-123/edit',
        body: { idempotencyKey: 'key1', checkIn: '2025-06-01', checkOut: '2025-06-03', rooms: [{ roomId: 'rm-1' }] },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/reservations/[id]/cancel', () => {
    let POST;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../../app/api/reservations/[id]/cancel/route.js');
      POST = mod.POST;
    });

    it('exports a POST handler wrapped by withApiBoundary', () => {
      expect(POST).toBeDefined();
      expect(typeof POST).toBe('function');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const req = makeRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/reservations/BK-123/cancel',
        body: { idempotencyKey: 'key1' },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/payments/[id]/transition', () => {
    let POST;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../../app/api/payments/[id]/transition/route.js');
      POST = mod.POST;
    });

    it('exports a POST handler wrapped by withApiBoundary', () => {
      expect(POST).toBeDefined();
      expect(typeof POST).toBe('function');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const req = makeRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/payments/BK-123/transition',
        body: { idempotencyKey: 'key1', transition: 'approved' },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/payments/[id]/refund', () => {
    let POST;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../../app/api/payments/[id]/refund/route.js');
      POST = mod.POST;
    });

    it('exports a POST handler wrapped by withApiBoundary', () => {
      expect(POST).toBeDefined();
      expect(typeof POST).toBe('function');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const req = makeRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/payments/BK-123/refund',
        body: { idempotencyKey: 'key1', transition: 'requested' },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('GET/PATCH /api/guest/profile', () => {
    let GET, PATCH;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../../app/api/guest/profile/route.js');
      GET = mod.GET;
      PATCH = mod.PATCH;
    });

    it('exports GET and PATCH handlers', () => {
      expect(GET).toBeDefined();
      expect(typeof GET).toBe('function');
      expect(PATCH).toBeDefined();
      expect(typeof PATCH).toBe('function');
    });

    it('GET rejects unauthenticated requests with 401', async () => {
      const req = makeRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/guest/profile',
        headers: {},
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('PATCH rejects unauthenticated requests with 401', async () => {
      const req = makeRequest({
        method: 'PATCH',
        url: 'http://localhost:3000/api/guest/profile',
        body: { displayName: 'New Name' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it('PATCH rejects non-JSON content type with 415', async () => {
      const headerMap = new Map([
        ['content-type', 'text/plain'],
        ['origin', 'http://localhost:3000'],
      ]);
      const req = {
        method: 'PATCH',
        url: 'http://localhost:3000/api/guest/profile',
        headers: {
          get(name) { return headerMap.get(name.toLowerCase()) ?? null; },
          has(name) { return headerMap.has(name.toLowerCase()); },
        },
        text: () => Promise.resolve('{}'),
      };
      const res = await PATCH(req);
      expect(res.status).toBe(415);
    });
  });
});

// ─── Route Manifest Registration Tests ───────────────────────────────────────

describe('Route manifest includes privileged write API routes', () => {
  let ROUTE_MANIFEST;

  beforeEach(async () => {
    const mod = await import('../../lib/routes/manifest.js');
    ROUTE_MANIFEST = mod.ROUTE_MANIFEST;
  });

  const expectedRoutes = [
    { id: 'api-reservations-create', pattern: '/api/reservations/create', methods: ['POST'], csrf: true },
    { id: 'api-reservations-edit', pattern: '/api/reservations/[id]/edit', methods: ['POST'], csrf: true },
    { id: 'api-reservations-cancel', pattern: '/api/reservations/[id]/cancel', methods: ['POST'], csrf: true },
    { id: 'api-payments-transition', pattern: '/api/payments/[id]/transition', methods: ['POST'], csrf: true },
    { id: 'api-payments-refund', pattern: '/api/payments/[id]/refund', methods: ['POST'], csrf: true },
    { id: 'api-guest-profile', pattern: '/api/guest/profile', methods: ['GET', 'PATCH'], csrf: true },
  ];

  for (const expected of expectedRoutes) {
    it(`registers ${expected.id} in the manifest`, () => {
      const entry = ROUTE_MANIFEST.find((r) => r.id === expected.id);
      expect(entry).toBeDefined();
      expect(entry.pattern).toBe(expected.pattern);
      expect(entry.methods).toEqual(expected.methods);
      expect(entry.csrf).toBe(expected.csrf);
      expect(entry.kind).toBe('api');
      expect(entry.status).toBe('active');
    });
  }

  it('all privileged write routes require authentication (non-public audience)', () => {
    const privilegedIds = expectedRoutes.map((r) => r.id);
    for (const id of privilegedIds) {
      const entry = ROUTE_MANIFEST.find((r) => r.id === id);
      expect(entry.audience).not.toBe('public');
    }
  });

  it('all privileged write routes have sensitiveResponse=true', () => {
    const privilegedIds = expectedRoutes.map((r) => r.id);
    for (const id of privilegedIds) {
      const entry = ROUTE_MANIFEST.find((r) => r.id === id);
      expect(entry.sensitiveResponse).toBe(true);
    }
  });
});
