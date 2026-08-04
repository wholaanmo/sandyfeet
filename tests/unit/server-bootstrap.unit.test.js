import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('lib/server/env.js — strict environment parsing', () => {
  const VALID_ENV = {
    FIREBASE_SERVICE_ACCOUNT_KEY: JSON.stringify({
      project_id: 'test-project',
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
    }),
    APP_ORIGIN: 'https://sandyfeet.example.com',
    NODE_ENV: 'test',
  };

  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clear module cache so env.js re-evaluates
    vi.resetModules();
  });

  it('parses valid environment without throwing', async () => {
    process.env = { ...process.env, ...VALID_ENV };
    const { env } = await import('../../lib/server/env.js');
    expect(env.NODE_ENV).toBe('test');
    expect(env.APP_ORIGIN).toBe('https://sandyfeet.example.com');
    expect(env.FIREBASE_SERVICE_ACCOUNT_KEY).toBeTruthy();
  });

  it('fails fast when FIREBASE_SERVICE_ACCOUNT_KEY is missing', async () => {
    process.env = { ...process.env, ...VALID_ENV };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    await expect(import('../../lib/server/env.js')).rejects.toThrow('Missing required environment variables');
  });

  it('fails fast when APP_ORIGIN is missing', async () => {
    process.env = { ...process.env, ...VALID_ENV };
    delete process.env.APP_ORIGIN;
    await expect(import('../../lib/server/env.js')).rejects.toThrow('Missing required environment variables');
  });

  it('fails fast when NODE_ENV is invalid', async () => {
    process.env = { ...process.env, ...VALID_ENV, NODE_ENV: 'staging' };
    await expect(import('../../lib/server/env.js')).rejects.toThrow('NODE_ENV must be one of');
  });

  it('fails fast when APP_ORIGIN is not a valid URL', async () => {
    process.env = { ...process.env, ...VALID_ENV, APP_ORIGIN: 'not-a-url' };
    await expect(import('../../lib/server/env.js')).rejects.toThrow('APP_ORIGIN is not a valid URL');
  });

  it('fails fast when FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON', async () => {
    process.env = { ...process.env, ...VALID_ENV, FIREBASE_SERVICE_ACCOUNT_KEY: '{invalid' };
    await expect(import('../../lib/server/env.js')).rejects.toThrow('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON');
  });

  it('never includes secret values in error messages', async () => {
    process.env = { ...process.env, ...VALID_ENV };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    try {
      await import('../../lib/server/env.js');
    } catch (err) {
      expect(err.message).not.toContain('private_key');
      expect(err.message).not.toContain('BEGIN RSA');
    }
  });
});

describe('lib/server/http/correlation.js — correlation ID propagation', () => {
  it('generates a UUID when no header is present', async () => {
    const { getCorrelationId } = await import('../../lib/server/http/correlation.js');
    const request = { headers: { get: () => null } };
    const id = getCorrelationId(request);
    // UUID v4 format
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('accepts a valid existing correlation ID from the request header', async () => {
    const { getCorrelationId } = await import('../../lib/server/http/correlation.js');
    const request = { headers: { get: (name) => (name === 'x-correlation-id' ? 'abc-123-def' : null) } };
    expect(getCorrelationId(request)).toBe('abc-123-def');
  });

  it('rejects overly long correlation IDs and generates a new one', async () => {
    const { getCorrelationId } = await import('../../lib/server/http/correlation.js');
    const longId = 'a'.repeat(200);
    const request = { headers: { get: () => longId } };
    const id = getCorrelationId(request);
    expect(id).not.toBe(longId);
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });

  it('rejects invalid characters in correlation ID', async () => {
    const { getCorrelationId } = await import('../../lib/server/http/correlation.js');
    const request = { headers: { get: () => 'abc<script>alert(1)</script>' } };
    const id = getCorrelationId(request);
    expect(id).not.toContain('<script>');
  });
});

describe('lib/server/http/response.js — stable response envelopes', () => {
  it('creates a success envelope with correct structure', async () => {
    const { success } = await import('../../lib/server/http/response.js');
    const res = success({ name: 'test' }, 'corr-123');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: { name: 'test' },
      correlationId: 'corr-123',
    });
  });

  it('creates an error envelope with correct structure', async () => {
    const { error } = await import('../../lib/server/http/response.js');
    const res = error('VALIDATION_ERROR', 'Invalid input', 'corr-456', 422);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
      correlationId: 'corr-456',
    });
  });

  it('applies no-store private cache policy to success responses', async () => {
    const { success } = await import('../../lib/server/http/response.js');
    const res = success({}, 'corr-789');
    expect(res.headers.get('Cache-Control')).toBe('no-store, private');
  });

  it('applies no-store private cache policy to error responses', async () => {
    const { error } = await import('../../lib/server/http/response.js');
    const res = error('ERROR', 'msg', 'corr-999', 500);
    expect(res.headers.get('Cache-Control')).toBe('no-store, private');
  });
});

describe('lib/server/http/redact.js — recursive redacted logging', () => {
  let redactForLog;

  beforeEach(async () => {
    const mod = await import('../../lib/server/http/redact.js');
    redactForLog = mod.redactForLog;
  });

  it('redacts sensitive keys at the top level', () => {
    const input = {
      password: 'secret123',
      token: 'abc-token',
      username: 'justin',
    };
    const result = redactForLog(input);
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.username).toBe('justin');
  });

  it('redacts nested sensitive keys', () => {
    const input = {
      user: {
        authorization: 'Bearer xyz',
        name: 'Alice',
        nested: {
          private_key: '-----BEGIN-----',
          data: 42,
        },
      },
    };
    const result = redactForLog(input);
    expect(result.user.authorization).toBe('[REDACTED]');
    expect(result.user.name).toBe('Alice');
    expect(result.user.nested.private_key).toBe('[REDACTED]');
    expect(result.user.nested.data).toBe(42);
  });

  it('redacts compound key names containing sensitive patterns', () => {
    const input = {
      accessToken: 'secret',
      authCookie: 'value',
      refreshSecret: 'hidden',
    };
    const result = redactForLog(input);
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.authCookie).toBe('[REDACTED]');
    expect(result.refreshSecret).toBe('[REDACTED]');
  });

  it('preserves safe metadata keys', () => {
    const input = {
      correlationId: 'abc-123',
      eventType: 'login',
      actorUid: 'uid-456',
      password: 'secret',
    };
    const result = redactForLog(input);
    expect(result.correlationId).toBe('abc-123');
    expect(result.eventType).toBe('login');
    expect(result.actorUid).toBe('uid-456');
    expect(result.password).toBe('[REDACTED]');
  });

  it('handles arrays with sensitive content', () => {
    const input = [
      { token: 'x', name: 'a' },
      { credential: 'y', action: 'login' },
    ];
    const result = redactForLog(input);
    expect(result[0].token).toBe('[REDACTED]');
    expect(result[0].name).toBe('a');
    expect(result[1].credential).toBe('[REDACTED]');
    expect(result[1].action).toBe('login');
  });

  it('handles null and primitives gracefully', () => {
    expect(redactForLog(null)).toBeNull();
    expect(redactForLog(undefined)).toBeUndefined();
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog('hello')).toBe('hello');
  });

  it('handles circular references without throwing', () => {
    const obj = { a: 1 };
    obj.self = obj;
    const result = redactForLog(obj);
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular]');
  });

  it('handles deeply nested objects without throwing', () => {
    let deep = { value: 'leaf' };
    for (let i = 0; i < 25; i++) {
      deep = { child: deep };
    }
    const result = redactForLog(deep);
    // Should not throw; deep nesting gets truncated
    expect(result).toBeDefined();
  });

  it('redacts PII patterns like document_url and evidence', () => {
    const input = {
      document_url: 'https://example.com/id.jpg',
      evidence: 'payment-proof.pdf',
      correlationId: 'safe-id',
    };
    const result = redactForLog(input);
    expect(result.document_url).toBe('[REDACTED]');
    expect(result.evidence).toBe('[REDACTED]');
    expect(result.correlationId).toBe('safe-id');
  });
});
