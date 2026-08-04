// tests/integration/browser-policy-provider.integration.test.js
// Integration tests for browser security policy, content-safety escaping,
// chatbot rich-text parsing, external URL validation, provider adapter resilience,
// circuit breaker, and outbox worker correctness.
// Requirements: 8.1–8.10, 14.1–14.11, 15.10, 15.15

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock server-only ───────────────────────────────────────────────────────
vi.mock('server-only', () => ({}));

// ─── Mock firebase-admin for outbox module ──────────────────────────────────
const mockFirestoreData = new Map();
let mockDocIdCounter = 0;

const makeMockDocRef = (id) => ({
  id,
  get: vi.fn(async () => {
    const data = mockFirestoreData.get(id);
    return { exists: !!data, data: () => data, ref: makeMockDocRef(id) };
  }),
  update: vi.fn(async (updates) => {
    const existing = mockFirestoreData.get(id) || {};
    mockFirestoreData.set(id, { ...existing, ...updates });
  }),
});

const mockCollection = vi.fn((name) => ({
  doc: vi.fn((id) => {
    const docId = id || `auto-${name}-${++mockDocIdCounter}`;
    return makeMockDocRef(docId);
  }),
  where: vi.fn((...args) => buildQueryMock(args)),
}));

function buildQueryMock(filters = []) {
  const chain = {
    where: vi.fn((...args) => buildQueryMock([...filters, args])),
    limit: vi.fn(() => chain),
    get: vi.fn(async () => {
      const results = [];
      for (const [id, data] of mockFirestoreData.entries()) {
        if (!data || typeof data !== 'object') continue;
        results.push({ id, data: () => data, ref: makeMockDocRef(id) });
      }
      return { empty: results.length === 0, docs: results, forEach: (fn) => results.forEach(fn) };
    }),
  };
  return chain;
}

const mockFirestore = {
  collection: mockCollection,
  runTransaction: vi.fn(async (fn) => {
    const transaction = {
      get: vi.fn(async (ref) => {
        if (ref && typeof ref.get === 'function' && !ref.id) return ref.get();
        const data = mockFirestoreData.get(ref.id);
        return { exists: !!data, data: () => data, ref };
      }),
      set: vi.fn((ref, data) => { mockFirestoreData.set(ref.id, data); }),
      update: vi.fn((ref, updates) => {
        const existing = mockFirestoreData.get(ref.id) || {};
        mockFirestoreData.set(ref.id, { ...existing, ...updates });
      }),
    };
    return fn(transaction);
  }),
};

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {},
  firestore: mockFirestore,
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    APP_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 1. buildSecurityHeaders: produces all required headers (Req 8.1–8.6)
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildSecurityHeaders — report-only and enforced modes', () => {
  it('produces all required security headers in report-only mode', async () => {
    const { buildSecurityHeaders } = await import(
      '../../lib/server/http/security-headers.js'
    );
    const nonce = 'dGVzdC1ub25jZQ==';
    const headers = buildSecurityHeaders(nonce, { enforceCSP: false, isProduction: false });

    // CSP in report-only mode
    expect(headers.has('Content-Security-Policy-Report-Only')).toBe(true);
    expect(headers.has('Content-Security-Policy')).toBe(false);

    const csp = headers.get('Content-Security-Policy-Report-Only');
    // Verify required directives (Req 8.1)
    expect(csp).toContain('default-src');
    expect(csp).toContain('script-src');
    expect(csp).toContain('style-src');
    expect(csp).toContain('img-src');
    expect(csp).toContain('font-src');
    expect(csp).toContain('connect-src');
    expect(csp).toContain('frame-src');
    expect(csp).toContain('frame-ancestors');
    expect(csp).toContain('base-uri');
    expect(csp).toContain('form-action');
    expect(csp).toContain('object-src');
    // Nonce present in script-src
    expect(csp).toContain(`'nonce-${nonce}'`);

    // X-Content-Type-Options (Req 8.4)
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    // Referrer-Policy (Req 8.5)
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    // X-Frame-Options (Req 8.3)
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    // Permissions-Policy (Req 8.6)
    expect(headers.get('Permissions-Policy')).toContain('camera=()');

    // No HSTS in non-production (Req 8.2)
    expect(headers.has('Strict-Transport-Security')).toBe(false);
  });

  it('produces enforced CSP and HSTS in production mode', async () => {
    const { buildSecurityHeaders } = await import(
      '../../lib/server/http/security-headers.js'
    );
    const nonce = 'cHJvZC1ub25jZQ==';
    const headers = buildSecurityHeaders(nonce, { enforceCSP: true, isProduction: true });

    // Enforced CSP header
    expect(headers.has('Content-Security-Policy')).toBe(true);
    expect(headers.has('Content-Security-Policy-Report-Only')).toBe(false);

    // HSTS present in production (Req 8.2)
    expect(headers.has('Strict-Transport-Security')).toBe(true);
    const hsts = headers.get('Strict-Transport-Security');
    expect(hsts).toContain('max-age=');
    expect(hsts).toContain('includeSubDomains');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Content-safety escaping round-trips (Req 8.7, 8.9)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Content-safety escaping — preserves meaning, removes danger', () => {
  it('escapeHtml encodes dangerous characters and round-trips safely', async () => {
    const { escapeHtml } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const dangerous = '<script>alert("xss")</script> & "quotes" \'apos\'';
    const escaped = escapeHtml(dangerous);

    // No raw angle brackets or unescaped ampersands
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&quot;');
    // Original meaning recoverable (contains the key words)
    expect(escaped).toContain('script');
    expect(escaped).toContain('alert');
  });

  it('escapeJsString neutralizes script context injection', async () => {
    const { escapeJsString } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const payload = '</script><script>evil()</script>';
    const escaped = escapeJsString(payload);

    // No raw < or > in JS context
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).toContain('\\u003C');
    expect(escaped).toContain('\\u003E');
  });

  it('escapeAttribute handles all dangerous attribute characters', async () => {
    const { escapeAttribute } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const input = '" onmouseover="alert(1)" data-x="';
    const escaped = escapeAttribute(input);

    expect(escaped).not.toContain('"');
    expect(escaped).toContain('&quot;');
  });

  it('non-string values return empty string', async () => {
    const { escapeHtml, escapeAttribute, escapeJsString } = await import(
      '../../lib/server/http/content-safety.js'
    );
    expect(escapeHtml(null)).toBe('');
    expect(escapeAttribute(undefined)).toBe('');
    expect(escapeJsString(42)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. parseChatbotRichText — strips raw HTML from arbitrary inputs (Req 8.7, 14.8)
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseChatbotRichText — strips raw HTML', () => {
  it('strips script tags and returns plain text', async () => {
    const { parseChatbotRichText } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const malicious = '<script>alert("xss")</script>Hello world';
    const ast = parseChatbotRichText(malicious);

    // Should produce inert AST with no HTML
    expect(ast).toBeInstanceOf(Array);
    expect(ast.length).toBeGreaterThan(0);
    const allText = JSON.stringify(ast);
    expect(allText).not.toContain('<script');
    expect(allText).not.toContain('</script');
    expect(allText).toContain('Hello world');
  });

  it('strips iframe and event handler injections', async () => {
    const { parseChatbotRichText } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const iframe = '<iframe src="evil.com"></iframe>Safe content';
    const ast = parseChatbotRichText(iframe);
    const allText = JSON.stringify(ast);
    expect(allText).not.toContain('<iframe');
    expect(allText).toContain('Safe content');
  });

  it('preserves safe markdown formatting', async () => {
    const { parseChatbotRichText } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const safe = '**bold text** and *italic text*';
    const ast = parseChatbotRichText(safe);
    const allText = JSON.stringify(ast);
    expect(allText).toContain('"type":"strong"');
    expect(allText).toContain('"type":"emphasis"');
    expect(allText).toContain('bold text');
    expect(allText).toContain('italic text');
  });

  it('returns empty paragraph for null/empty input', async () => {
    const { parseChatbotRichText } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const ast = parseChatbotRichText('');
    expect(ast).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: '' }] }]);
  });

  it('renders inert output — no dangerouslySetInnerHTML or raw HTML nodes', async () => {
    const { parseChatbotRichText } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const input = 'Normal paragraph\n\nAnother paragraph with **bold**';
    const ast = parseChatbotRichText(input);
    // Every node type must be one of: paragraph, text, strong, emphasis, link, line-break
    const allowedTypes = ['paragraph', 'text', 'strong', 'emphasis', 'link', 'line-break'];
    function walkAst(nodes) {
      for (const node of nodes) {
        expect(allowedTypes).toContain(node.type);
        if (node.children) walkAst(node.children);
      }
    }
    walkAst(ast);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. validateExternalUrl — gates provider hostnames (Req 8.8)
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateExternalUrl — hostname gating', () => {
  it('accepts approved HTTPS image hosts', async () => {
    const { validateExternalUrl } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const result = validateExternalUrl('https://res.cloudinary.com/demo/image.jpg', 'images');
    expect(result.valid).toBe(true);
    expect(result.parsed).toBeTruthy();
  });

  it('rejects unapproved hostnames', async () => {
    const { validateExternalUrl } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const result = validateExternalUrl('https://evil.com/payload.jpg', 'images');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not approved');
  });

  it('rejects HTTP URLs (requires HTTPS)', async () => {
    const { validateExternalUrl } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const result = validateExternalUrl('http://res.cloudinary.com/image.jpg', 'images');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('HTTPS');
  });

  it('rejects URLs with embedded credentials', async () => {
    const { validateExternalUrl } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const result = validateExternalUrl('https://user:pass@res.cloudinary.com/img.jpg', 'images');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('credentials');
  });

  it('rejects unknown purpose', async () => {
    const { validateExternalUrl } = await import(
      '../../lib/server/http/content-safety.js'
    );
    const result = validateExternalUrl('https://example.com', 'unknown');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown purpose');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Provider adapter — timeout, size, HTTPS enforcement (Req 14.1–14.5, 15.10)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider adapter — resilience controls', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects non-HTTPS provider URLs immediately', async () => {
    const { callProvider } = await import(
      '../../lib/server/integrations/provider-adapter.js'
    );
    const { execute } = callProvider({ url: 'http://insecure.example.com/api' });
    const result = await execute();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('HTTPS');
    expect(result.category).toBe('invalid_response');
  });

  it('returns timeout category when provider exceeds deadline', async () => {
    const { callProvider } = await import(
      '../../lib/server/integrations/provider-adapter.js'
    );

    // Mock fetch that never resolves (until aborted)
    globalThis.fetch = vi.fn(() => new Promise((_, reject) => {
      const abortHandler = () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      // Simulate immediate abort for testing with very short timeout
      setTimeout(abortHandler, 5);
    }));

    const { execute } = callProvider({
      url: 'https://slow-provider.example.com/api',
      timeoutMs: 1, // 1ms deadline to trigger timeout
    });
    const result = await execute();

    expect(result.ok).toBe(false);
    expect(result.category).toBe('timeout');
    expect(result.error).toContain('timed out');
  });

  it('rejects oversized responses via content-length header', async () => {
    const { callProvider } = await import(
      '../../lib/server/integrations/provider-adapter.js'
    );

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '999999999' }),
      body: null,
      text: async () => '{}',
    }));

    const { execute } = callProvider({
      url: 'https://provider.example.com/api',
      maxResponseSize: 1024,
    });
    const result = await execute();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('size');
    expect(result.category).toBe('invalid_response');
  });

  it('returns invalid_response category for malformed JSON', async () => {
    const { callProvider } = await import(
      '../../lib/server/integrations/provider-adapter.js'
    );

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({}),
      body: { getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('not json{{{') })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
        cancel: vi.fn(),
      })},
      text: async () => 'not json{{{',
    }));

    const { execute } = callProvider({
      url: 'https://provider.example.com/api',
    });
    const result = await execute();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid JSON');
    expect(result.category).toBe('invalid_response');
  });

  it('returns network category for connection failures', async () => {
    const { callProvider } = await import(
      '../../lib/server/integrations/provider-adapter.js'
    );

    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    const { execute } = callProvider({
      url: 'https://down.example.com/api',
    });
    const result = await execute();

    expect(result.ok).toBe(false);
    expect(result.category).toBe('network');
  });

  it('returns rate_limited category for HTTP 429', async () => {
    const { callProvider } = await import(
      '../../lib/server/integrations/provider-adapter.js'
    );

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({}),
      body: { getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('rate limited') })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
        cancel: vi.fn(),
      })},
      text: async () => 'rate limited',
    }));

    const { execute } = callProvider({
      url: 'https://provider.example.com/api',
    });
    const result = await execute();

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(429);
    expect(result.category).toBe('rate_limited');
  });

  it('returns server_error category for HTTP 500+', async () => {
    const { callProvider } = await import(
      '../../lib/server/integrations/provider-adapter.js'
    );

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      headers: new Headers({}),
      body: { getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('service unavailable') })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
        cancel: vi.fn(),
      })},
      text: async () => 'service unavailable',
    }));

    const { execute } = callProvider({
      url: 'https://provider.example.com/api',
    });
    const result = await execute();

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.category).toBe('server_error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Circuit breaker — opens after threshold failures (Req 14.4, 14.6)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker — opens after threshold', () => {
  it('stays closed until failure threshold is reached', async () => {
    const { createCircuitBreaker } = await import(
      '../../lib/server/integrations/circuit-breaker.js'
    );
    const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });

    expect(breaker.getState()).toBe('closed');

    // Two failures — still closed
    for (let i = 0; i < 2; i++) {
      await expect(breaker.call(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('closed');

    // Third failure — opens
    await expect(breaker.call(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(breaker.getState()).toBe('open');
  });

  it('rejects immediately when open without calling provider', async () => {
    const { createCircuitBreaker } = await import(
      '../../lib/server/integrations/circuit-breaker.js'
    );
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });

    // Open the breaker
    for (let i = 0; i < 2; i++) {
      await expect(breaker.call(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('open');

    // Next call is rejected without executing the function
    const providerFn = vi.fn(() => Promise.resolve('ok'));
    await expect(breaker.call(providerFn)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(providerFn).not.toHaveBeenCalled();
  });

  it('resets to closed after a successful call in half-open state', async () => {
    const { createCircuitBreaker } = await import(
      '../../lib/server/integrations/circuit-breaker.js'
    );
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1 });

    // Open the breaker
    for (let i = 0; i < 2; i++) {
      await expect(breaker.call(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    // Wait for cooldown (1ms)
    await new Promise((r) => setTimeout(r, 5));
    expect(breaker.getState()).toBe('half-open');

    // Successful call closes the breaker
    const result = await breaker.call(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('closed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Outbox worker — lease, delivery, retry, terminal failure (Req 14.11, 15.15)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Outbox worker — marks entries correctly', () => {
  beforeEach(() => {
    mockFirestoreData.clear();
    mockDocIdCounter = 0;
  });

  it('marks entry as delivered on successful send', async () => {
    const { processOutboxBatch } = await import(
      '../../lib/server/services/outbox-worker.js'
    );

    // Seed a pending outbox entry
    mockFirestoreData.set('outbox-1', {
      type: 'reservation_created',
      bookingId: 'bk-123',
      actorUid: 'uid-1',
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAfter: null,
      leasedUntil: null,
      createdAt: new Date().toISOString(),
    });

    const sendNotification = vi.fn(async () => ({ ok: true }));

    const stats = await processOutboxBatch({
      db: mockFirestore,
      sendNotification,
      batchSize: 10,
    });

    expect(stats.delivered).toBeGreaterThanOrEqual(1);
    expect(sendNotification).toHaveBeenCalled();
    // Entry should be marked delivered
    const entry = mockFirestoreData.get('outbox-1');
    expect(entry.status).toBe('delivered');
    expect(entry.deliveredAt).toBeTruthy();
  });

  it('marks entry as retryable_failed with backoff on transient failure', async () => {
    const { processOutboxBatch } = await import(
      '../../lib/server/services/outbox-worker.js'
    );

    mockFirestoreData.set('outbox-retry', {
      type: 'payment_approved',
      bookingId: 'bk-456',
      actorUid: 'uid-2',
      status: 'pending',
      attempts: 1, // already failed once
      maxAttempts: 5,
      nextAttemptAfter: null,
      leasedUntil: null,
      createdAt: new Date().toISOString(),
    });

    const sendNotification = vi.fn(async () => ({
      ok: false,
      error: 'Service temporarily unavailable',
      retryable: true,
    }));

    const stats = await processOutboxBatch({
      db: mockFirestore,
      sendNotification,
      batchSize: 10,
    });

    expect(stats.retried).toBeGreaterThanOrEqual(1);
    const entry = mockFirestoreData.get('outbox-retry');
    expect(entry.status).toBe('retryable_failed');
    expect(entry.attempts).toBe(2);
    expect(entry.nextAttemptAfter).toBeTruthy();
  });

  it('marks entry as terminal_failed after max attempts', async () => {
    const { processOutboxBatch } = await import(
      '../../lib/server/services/outbox-worker.js'
    );

    mockFirestoreData.set('outbox-terminal', {
      type: 'refund_approved',
      bookingId: 'bk-789',
      actorUid: 'uid-3',
      status: 'pending',
      attempts: 4, // At max - 1 threshold
      maxAttempts: 5,
      nextAttemptAfter: null,
      leasedUntil: null,
      createdAt: new Date().toISOString(),
    });

    const sendNotification = vi.fn(async () => ({
      ok: false,
      error: 'Permanent provider failure',
      retryable: true,
    }));

    const stats = await processOutboxBatch({
      db: mockFirestore,
      sendNotification,
      batchSize: 10,
    });

    expect(stats.failed).toBeGreaterThanOrEqual(1);
    const entry = mockFirestoreData.get('outbox-terminal');
    expect(entry.status).toBe('terminal_failed');
    expect(entry.failureReason).toBeTruthy();
  });

  it('marks non-retryable failure as terminal immediately', async () => {
    const { processOutboxBatch } = await import(
      '../../lib/server/services/outbox-worker.js'
    );

    mockFirestoreData.set('outbox-nonretry', {
      type: 'check_in_completed',
      bookingId: 'bk-000',
      actorUid: 'uid-4',
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAfter: null,
      leasedUntil: null,
      createdAt: new Date().toISOString(),
    });

    const sendNotification = vi.fn(async () => ({
      ok: false,
      error: 'Invalid recipient — non-retryable',
      retryable: false,
    }));

    const stats = await processOutboxBatch({
      db: mockFirestore,
      sendNotification,
      batchSize: 10,
    });

    expect(stats.failed).toBeGreaterThanOrEqual(1);
    const entry = mockFirestoreData.get('outbox-nonretry');
    expect(entry.status).toBe('terminal_failed');
  });

  it('calculates exponential backoff correctly', async () => {
    const { calculateBackoff } = await import(
      '../../lib/server/services/outbox-worker.js'
    );

    expect(calculateBackoff(0)).toBe(1000); // BASE_BACKOFF_MS * 2^0
    expect(calculateBackoff(1)).toBe(2000); // BASE_BACKOFF_MS * 2^1
    expect(calculateBackoff(2)).toBe(4000); // BASE_BACKOFF_MS * 2^2
    expect(calculateBackoff(3)).toBe(8000); // BASE_BACKOFF_MS * 2^3
    // Should cap at MAX_BACKOFF_MS (300_000)
    expect(calculateBackoff(20)).toBe(300_000);
  });

  it('skips entries leased by another worker', async () => {
    const { processOutboxBatch } = await import(
      '../../lib/server/services/outbox-worker.js'
    );

    // Entry with future lease (claimed by another worker)
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    mockFirestoreData.set('outbox-leased', {
      type: 'reservation_created',
      bookingId: 'bk-leased',
      actorUid: 'uid-5',
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAfter: null,
      leasedUntil: futureDate,
      createdAt: new Date().toISOString(),
    });

    const sendNotification = vi.fn(async () => ({ ok: true }));

    const stats = await processOutboxBatch({
      db: mockFirestore,
      sendNotification,
      batchSize: 10,
    });

    // Should not process the leased entry
    expect(stats.processed).toBe(0);
  });
});
