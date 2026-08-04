import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Helper: Build a minimal Request-like object ─────────────────────────────
function makeRequest({
  method = 'POST',
  url = 'http://localhost:3000/api/test',
  headers = {},
  body = null,
} = {}) {
  const headerMap = new Map(Object.entries(headers));
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

// ─── origin.js ───────────────────────────────────────────────────────────────
describe('lib/server/http/origin.js — same-origin validation', () => {
  let validateOrigin;

  beforeEach(async () => {
    const mod = await import('../../lib/server/http/origin.js');
    validateOrigin = mod.validateOrigin;
  });

  it('returns true when Origin matches APP_ORIGIN', () => {
    const request = makeRequest({ headers: { origin: 'https://sandyfeet.com' } });
    expect(validateOrigin(request, 'https://sandyfeet.com')).toBe(true);
  });

  it('returns true when Origin matches with different paths ignored', () => {
    const request = makeRequest({ headers: { origin: 'https://sandyfeet.com' } });
    expect(validateOrigin(request, 'https://sandyfeet.com/some/path')).toBe(true);
  });

  it('returns false when Origin is different host', () => {
    const request = makeRequest({ headers: { origin: 'https://evil.com' } });
    expect(validateOrigin(request, 'https://sandyfeet.com')).toBe(false);
  });

  it('returns false when Origin header is missing', () => {
    const request = makeRequest({ headers: {} });
    expect(validateOrigin(request, 'https://sandyfeet.com')).toBe(false);
  });

  it('returns false for malformed Origin header', () => {
    const request = makeRequest({ headers: { origin: 'not-a-valid-url' } });
    expect(validateOrigin(request, 'https://sandyfeet.com')).toBe(false);
  });

  it('returns false when schemes differ (http vs https)', () => {
    const request = makeRequest({ headers: { origin: 'http://sandyfeet.com' } });
    expect(validateOrigin(request, 'https://sandyfeet.com')).toBe(false);
  });

  it('returns false when ports differ', () => {
    const request = makeRequest({ headers: { origin: 'https://sandyfeet.com:8080' } });
    expect(validateOrigin(request, 'https://sandyfeet.com')).toBe(false);
  });
});

// ─── rate-limit.js ───────────────────────────────────────────────────────────
describe('lib/server/http/rate-limit.js — in-memory rate limiter', () => {
  let checkRateLimit, resetRateLimitStore, getRateLimitPolicy;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/server/http/rate-limit.js');
    checkRateLimit = mod.checkRateLimit;
    resetRateLimitStore = mod.resetRateLimitStore;
    getRateLimitPolicy = mod.getRateLimitPolicy;
    resetRateLimitStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows requests under the limit', () => {
    const result = checkRateLimit('auth-attempt', 'user-1');
    expect(result.allowed).toBe(true);
  });

  it('allows up to maxRequests within a window', () => {
    const policy = getRateLimitPolicy('auth-attempt');
    for (let i = 0; i < policy.maxRequests; i++) {
      const result = checkRateLimit('auth-attempt', 'user-2');
      expect(result.allowed).toBe(true);
    }
  });

  it('rejects requests exceeding the limit', () => {
    const policy = getRateLimitPolicy('auth-attempt');
    for (let i = 0; i < policy.maxRequests; i++) {
      checkRateLimit('auth-attempt', 'user-3');
    }
    const result = checkRateLimit('auth-attempt', 'user-3');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('different clients have independent limits', () => {
    const policy = getRateLimitPolicy('auth-attempt');
    for (let i = 0; i < policy.maxRequests; i++) {
      checkRateLimit('auth-attempt', 'user-A');
    }
    // User A is exhausted
    expect(checkRateLimit('auth-attempt', 'user-A').allowed).toBe(false);
    // User B still has capacity
    expect(checkRateLimit('auth-attempt', 'user-B').allowed).toBe(true);
  });

  it('different operations have independent limits', () => {
    const policy = getRateLimitPolicy('auth-attempt');
    for (let i = 0; i < policy.maxRequests; i++) {
      checkRateLimit('auth-attempt', 'user-X');
    }
    // auth-attempt exhausted for user-X
    expect(checkRateLimit('auth-attempt', 'user-X').allowed).toBe(false);
    // chatbot still works for same user
    expect(checkRateLimit('chatbot', 'user-X').allowed).toBe(true);
  });

  it('allows requests for unknown operation (fail-open)', () => {
    const result = checkRateLimit('unknown-policy', 'user-1');
    expect(result.allowed).toBe(true);
  });

  it('returns retryAfter in seconds when rate limited', () => {
    const policy = getRateLimitPolicy('auth-attempt');
    for (let i = 0; i < policy.maxRequests; i++) {
      checkRateLimit('auth-attempt', 'user-retry');
    }
    const result = checkRateLimit('auth-attempt', 'user-retry');
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(policy.windowMs / 1000);
  });
});

// ─── schemas.js ──────────────────────────────────────────────────────────────
describe('lib/server/http/schemas.js — reusable Zod schemas', () => {
  let schemas;

  beforeEach(async () => {
    schemas = await import('../../lib/server/http/schemas.js');
  });

  describe('trimmedString', () => {
    it('accepts non-empty strings and trims them', () => {
      expect(schemas.trimmedString.parse('  hello  ')).toBe('hello');
    });

    it('rejects empty strings', () => {
      expect(() => schemas.trimmedString.parse('')).toThrow();
    });

    it('rejects whitespace-only strings', () => {
      expect(() => schemas.trimmedString.parse('   ')).toThrow();
    });
  });

  describe('boundedString', () => {
    it('accepts strings within bounds', () => {
      const schema = schemas.boundedString(2, 10);
      expect(schema.parse('  hello  ')).toBe('hello');
    });

    it('rejects strings shorter than min', () => {
      const schema = schemas.boundedString(3, 10);
      expect(() => schema.parse('ab')).toThrow();
    });

    it('rejects strings longer than max', () => {
      const schema = schemas.boundedString(1, 5);
      expect(() => schema.parse('toolongstring')).toThrow();
    });
  });

  describe('email', () => {
    it('accepts valid emails and lowercases them', () => {
      expect(schemas.email.parse('  User@Example.COM  ')).toBe('user@example.com');
    });

    it('rejects invalid email format', () => {
      expect(() => schemas.email.parse('not-an-email')).toThrow();
    });
  });

  describe('positiveInt', () => {
    it('accepts positive integers', () => {
      expect(schemas.positiveInt.parse(1)).toBe(1);
      expect(schemas.positiveInt.parse(100)).toBe(100);
    });

    it('rejects zero', () => {
      expect(() => schemas.positiveInt.parse(0)).toThrow();
    });

    it('rejects negative numbers', () => {
      expect(() => schemas.positiveInt.parse(-1)).toThrow();
    });

    it('rejects non-integers', () => {
      expect(() => schemas.positiveInt.parse(1.5)).toThrow();
    });
  });

  describe('isoDate', () => {
    it('accepts valid YYYY-MM-DD dates', () => {
      expect(schemas.isoDate.parse('2025-01-15')).toBe('2025-01-15');
    });

    it('rejects invalid date formats', () => {
      expect(() => schemas.isoDate.parse('15-01-2025')).toThrow();
      expect(() => schemas.isoDate.parse('2025/01/15')).toThrow();
    });
  });

  describe('formatFieldErrors', () => {
    it('formats Zod errors into field/message pairs', async () => {
      const { z } = await import('zod');
      const schema = z.object({ name: z.string(), age: z.number() }).strict();
      const result = schema.safeParse({ name: 123, age: 'old' });
      const errors = schemas.formatFieldErrors(result.error);
      expect(errors).toBeInstanceOf(Array);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toHaveProperty('field');
      expect(errors[0]).toHaveProperty('message');
    });
  });

  describe('strictObject', () => {
    it('rejects unknown keys', () => {
      const schema = schemas.strictObject({ name: schemas.trimmedString });
      expect(() => schema.parse({ name: 'ok', extra: 'bad' })).toThrow();
    });

    it('accepts valid objects', () => {
      const schema = schemas.strictObject({ name: schemas.trimmedString });
      expect(schema.parse({ name: 'hello' })).toEqual({ name: 'hello' });
    });
  });
});

// ─── boundary.js — withApiBoundary pipeline ──────────────────────────────────
describe('lib/server/http/boundary.js — withApiBoundary pipeline', () => {
  let withApiBoundary, resetRateLimitStore;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    process.env.APP_ORIGIN = 'https://sandyfeet.com';
    process.env.RATE_LIMIT_SECRET = 'test-secret';

    const boundary = await import('../../lib/server/http/boundary.js');
    withApiBoundary = boundary.withApiBoundary;

    const rateLimitMod = await import('../../lib/server/http/rate-limit.js');
    resetRateLimitStore = rateLimitMod.resetRateLimitStore;
    resetRateLimitStore();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const simpleHandler = async ({ input, correlationId }) => ({
    data: { received: input, correlationId },
  });

  const simplePolicy = {
    methods: ['POST'],
    auth: 'none',
  };

  describe('method enforcement', () => {
    it('rejects unsupported methods with 405 and Allow header', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({ method: 'GET' });
      const res = await handler(request);
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST');
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('accepts supported methods', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
    });
  });

  describe('media type enforcement', () => {
    it('rejects non-JSON content-type with 415', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
      });
      const res = await handler(request);
      expect(res.status).toBe(415);
      const body = await res.json();
      expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('accepts application/json content-type', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
    });

    it('accepts application/json with charset', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
    });
  });

  describe('body size enforcement', () => {
    it('rejects bodies exceeding content-length with 413', async () => {
      const policy = { ...simplePolicy, maxBodySize: 50 };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '100' },
        body: { data: 'x'.repeat(100) },
      });
      const res = await handler(request);
      expect(res.status).toBe(413);
    });

    it('rejects bodies exceeding maxBodySize after reading', async () => {
      const policy = { ...simplePolicy, maxBodySize: 10 };
      const handler = withApiBoundary(policy, simpleHandler);
      // No content-length header, but body is too large
      const largeBody = { data: 'x'.repeat(100) };
      const headerMap = new Map([['content-type', 'application/json']]);
      const rawText = JSON.stringify(largeBody);
      const request = {
        method: 'POST',
        headers: {
          get(name) { return headerMap.get(name.toLowerCase()) ?? null; },
        },
        text: () => Promise.resolve(rawText),
      };
      const res = await handler(request);
      expect(res.status).toBe(413);
    });
  });

  describe('malformed body handling', () => {
    it('rejects invalid JSON with 400 and generic message', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const headerMap = new Map([['content-type', 'application/json']]);
      const request = {
        method: 'POST',
        headers: {
          get(name) { return headerMap.get(name.toLowerCase()) ?? null; },
        },
        text: () => Promise.resolve('{invalid json!!!'),
      };
      const res = await handler(request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('MALFORMED_BODY');
      // Must not expose parsing details
      expect(body.error.message).not.toContain('SyntaxError');
      expect(body.error.message).not.toContain('stack');
    });
  });

  describe('authentication enforcement', () => {
    it('rejects unauthenticated requests when auth is required', async () => {
      const policy = { ...simplePolicy, auth: 'required' };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(401);
    });

    it('accepts requests with valid actor headers when auth is required', async () => {
      const policy = { ...simplePolicy, auth: 'required' };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-uid': 'user-123',
          'x-actor-role': 'admin',
        },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
    });

    it('allows unauthenticated requests when auth is optional', async () => {
      const policy = { ...simplePolicy, auth: 'optional' };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
    });
  });

  describe('role enforcement', () => {
    it('rejects actors with insufficient role', async () => {
      const policy = { ...simplePolicy, auth: 'required', roles: ['admin'] };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-uid': 'user-456',
          'x-actor-role': 'guest',
        },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('accepts actors with matching role', async () => {
      const policy = { ...simplePolicy, auth: 'required', roles: ['admin', 'staff'] };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-uid': 'user-789',
          'x-actor-role': 'staff',
        },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
    });
  });

  describe('CSRF / same-origin enforcement', () => {
    it('rejects authenticated mutations without matching origin', async () => {
      const policy = { ...simplePolicy, auth: 'required', csrf: true };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-uid': 'user-1',
          'x-actor-role': 'admin',
          origin: 'https://evil.com',
        },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('CSRF_VIOLATION');
    });

    it('accepts authenticated mutations with matching origin', async () => {
      const policy = { ...simplePolicy, auth: 'required', csrf: true };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-uid': 'user-1',
          'x-actor-role': 'admin',
          origin: 'https://sandyfeet.com',
        },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
    });
  });

  describe('rate limiting', () => {
    it('rejects requests exceeding the rate limit with 429', async () => {
      const policy = { ...simplePolicy, rateLimit: 'auth-attempt' };
      const handler = withApiBoundary(policy, simpleHandler);

      // Exhaust the limit (5 for auth-attempt)
      for (let i = 0; i < 5; i++) {
        const req = makeRequest({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '192.168.1.100',
          },
          body: {},
        });
        const res = await handler(req);
        expect(res.status).toBe(200);
      }

      // 6th request should be rate limited
      const req = makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.100',
        },
        body: {},
      });
      const res = await handler(req);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });
  });

  describe('schema validation', () => {
    it('rejects invalid body against schema with 422', async () => {
      const { z } = await import('zod');
      const policy = {
        ...simplePolicy,
        bodySchema: z.object({ name: z.string(), age: z.number() }).strict(),
      };
      const handler = withApiBoundary(policy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { name: 123, extra: 'field' },
      });
      const res = await handler(request);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts valid body and passes parsed data to handler', async () => {
      const { z } = await import('zod');
      const schema = z.object({ name: z.string().trim(), age: z.number() }).strict();
      const policy = { ...simplePolicy, bodySchema: schema };
      const capturedInput = [];
      const handler = withApiBoundary(policy, async ({ input }) => {
        capturedInput.push(input);
        return { data: input };
      });
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { name: '  Alice  ', age: 30 },
      });
      const res = await handler(request);
      expect(res.status).toBe(200);
      expect(capturedInput[0]).toEqual({ name: 'Alice', age: 30 });
    });

    it('rejects missing body when schema is specified', async () => {
      const { z } = await import('zod');
      const policy = {
        ...simplePolicy,
        bodySchema: z.object({ name: z.string() }).strict(),
      };
      const handler = withApiBoundary(policy, simpleHandler);
      const headerMap = new Map([['content-type', 'application/json']]);
      const request = {
        method: 'POST',
        headers: { get(name) { return headerMap.get(name.toLowerCase()) ?? null; } },
        text: () => Promise.resolve(''),
      };
      const res = await handler(request);
      expect(res.status).toBe(422);
    });
  });

  describe('correlation ID propagation', () => {
    it('includes correlationId in all responses', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      const body = await res.json();
      expect(body.correlationId).toBeTruthy();
    });

    it('accepts and propagates existing correlation ID', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'my-trace-123',
        },
        body: {},
      });
      const res = await handler(request);
      const body = await res.json();
      expect(body.correlationId).toBe('my-trace-123');
    });

    it('includes correlationId in error responses', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({ method: 'GET' });
      const res = await handler(request);
      const body = await res.json();
      expect(body.correlationId).toBeTruthy();
      expect(body.ok).toBe(false);
    });
  });

  describe('error handling and redaction', () => {
    it('catches handler errors and returns stable error envelope', async () => {
      const policy = { ...simplePolicy };
      const failHandler = async () => { throw new Error('Database connection failed'); };
      const handler = withApiBoundary(policy, failHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      // Must not expose internal error details
      expect(body.error.message).not.toContain('Database');
      expect(body.error.message).not.toContain('connection');
    });

    it('maps typed errors to appropriate status codes', async () => {
      const policy = { ...simplePolicy };
      const notFoundHandler = async () => {
        const err = new Error('Not found');
        err.code = 'NOT_FOUND';
        throw err;
      };
      const handler = withApiBoundary(policy, notFoundHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('deadline enforcement', () => {
    it('rejects handlers that exceed the timeout', async () => {
      const policy = { ...simplePolicy, timeout: 50 };
      const slowHandler = async () => {
        await new Promise((r) => setTimeout(r, 200));
        return { data: 'should not reach' };
      };
      const handler = withApiBoundary(policy, slowHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.status).toBe(504);
      const body = await res.json();
      expect(body.error.code).toBe('DEADLINE_EXCEEDED');
    });
  });

  describe('no-store cache policy', () => {
    it('applies Cache-Control: no-store to all API responses', async () => {
      const handler = withApiBoundary(simplePolicy, simpleHandler);
      const request = makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      });
      const res = await handler(request);
      expect(res.headers.get('Cache-Control')).toBe('no-store, private');
    });
  });
});
