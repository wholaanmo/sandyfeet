import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock firebase-admin (pulled in by outbox.js → firebase-admin.js → env.js)
vi.mock('../../lib/server/firebase-admin.js', () => ({
  firestore: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ id: 'mock-id', set: vi.fn(), update: vi.fn() })),
    })),
  },
  auth: {},
}));

import { callProvider, isRetryableCategory } from '../../lib/server/integrations/provider-adapter.js';
import { createCircuitBreaker } from '../../lib/server/integrations/circuit-breaker.js';
import { processOutboxBatch, calculateBackoff } from '../../lib/server/services/outbox-worker.js';
import {
  getChatbotFallbackResponse,
  detectActionBoundary,
  shouldConfirmReset,
} from '../../lib/server/integrations/chatbot-fallback.js';

// ─────────────────────────────────────────────────────────────────────────────
// Provider Adapter Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/server/integrations/provider-adapter.js', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('callProvider — HTTPS enforcement', () => {
    it('rejects non-HTTPS URLs', async () => {
      const { execute } = callProvider({ url: 'http://example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('invalid_response');
      expect(result.error).toMatch(/HTTPS/);
    });

    it('rejects empty URL', async () => {
      const { execute } = callProvider({ url: '' });
      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('invalid_response');
    });

    it('allows HTTPS URLs', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '2' }),
        text: async () => '{}',
        body: null,
      });

      const { execute } = callProvider({ url: 'https://provider.example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(true);
    });
  });

  describe('callProvider — config output', () => {
    it('returns normalized config', () => {
      const { config } = callProvider({
        url: 'https://example.com/api',
        body: { text: 'hello' },
      });
      expect(config.url).toBe('https://example.com/api');
      expect(config.method).toBe('POST');
      expect(config.timeoutMs).toBe(10_000);
      expect(config.maxResponseSize).toBe(1_048_576);
    });
  });

  describe('callProvider — deadline enforcement (timeout)', () => {
    it('returns timeout category when request exceeds deadline', async () => {
      // Mock fetch that respects the abort signal
      fetch.mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          const onAbort = () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          };
          if (options?.signal?.aborted) {
            onAbort();
            return;
          }
          options?.signal?.addEventListener('abort', onAbort);
        });
      });

      const { execute } = callProvider({
        url: 'https://provider.example.com/api',
        timeoutMs: 50,
      });

      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('timeout');
      expect(result.error).toMatch(/timed out/);
    });
  });

  describe('callProvider — response size enforcement', () => {
    it('rejects response exceeding maxResponseSize via content-length header', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '2000000' }),
        text: async () => 'x'.repeat(2000000),
        body: null,
      });

      const { execute } = callProvider({
        url: 'https://provider.example.com/api',
        maxResponseSize: 1024,
      });

      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('invalid_response');
      expect(result.error).toMatch(/size/i);
    });

    it('rejects response exceeding maxResponseSize via body reading', async () => {
      const largeBody = 'x'.repeat(2048);
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}),
        text: async () => largeBody,
        body: null,
      });

      const { execute } = callProvider({
        url: 'https://provider.example.com/api',
        maxResponseSize: 1024,
      });

      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('invalid_response');
    });
  });

  describe('callProvider — HTTP error categorization', () => {
    it('categorizes 429 as rate_limited', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({}),
        text: async () => '{}',
        body: null,
      });

      const { execute } = callProvider({ url: 'https://provider.example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('rate_limited');
      expect(result.statusCode).toBe(429);
    });

    it('categorizes 500 as server_error', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({}),
        text: async () => '{}',
        body: null,
      });

      const { execute } = callProvider({ url: 'https://provider.example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('server_error');
    });

    it('categorizes 400 as invalid_response', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({}),
        text: async () => '{}',
        body: null,
      });

      const { execute } = callProvider({ url: 'https://provider.example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('invalid_response');
    });
  });

  describe('callProvider — invalid JSON response', () => {
    it('categorizes non-JSON response as invalid_response', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}),
        text: async () => 'not json at all',
        body: null,
      });

      const { execute } = callProvider({ url: 'https://provider.example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('invalid_response');
      expect(result.error).toMatch(/invalid JSON/);
    });
  });

  describe('callProvider — network errors', () => {
    it('categorizes fetch exceptions as network errors', async () => {
      fetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const { execute } = callProvider({ url: 'https://provider.example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(false);
      expect(result.category).toBe('network');
    });
  });

  describe('callProvider — successful response', () => {
    it('returns parsed JSON data on success', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}),
        text: async () => JSON.stringify({ reply: 'Hello!' }),
        body: null,
      });

      const { execute } = callProvider({ url: 'https://provider.example.com/api' });
      const result = await execute();
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ reply: 'Hello!' });
      expect(result.statusCode).toBe(200);
    });
  });

  describe('isRetryableCategory', () => {
    it('timeout is retryable', () => expect(isRetryableCategory('timeout')).toBe(true));
    it('network is retryable', () => expect(isRetryableCategory('network')).toBe(true));
    it('rate_limited is retryable', () => expect(isRetryableCategory('rate_limited')).toBe(true));
    it('server_error is retryable', () => expect(isRetryableCategory('server_error')).toBe(true));
    it('invalid_response is NOT retryable', () => expect(isRetryableCategory('invalid_response')).toBe(false));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/server/integrations/circuit-breaker.js', () => {
  describe('createCircuitBreaker — initial state', () => {
    it('starts in closed state', () => {
      const cb = createCircuitBreaker();
      expect(cb.getState()).toBe('closed');
    });
  });

  describe('createCircuitBreaker — closed state behavior', () => {
    it('allows calls through in closed state', async () => {
      const cb = createCircuitBreaker();
      const result = await cb.call(async () => 'success');
      expect(result).toBe('success');
    });

    it('remains closed after fewer failures than threshold', async () => {
      const cb = createCircuitBreaker({ failureThreshold: 3 });
      for (let i = 0; i < 2; i++) {
        await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(cb.getState()).toBe('closed');
    });
  });

  describe('createCircuitBreaker — open state behavior', () => {
    it('opens after reaching failure threshold', async () => {
      const cb = createCircuitBreaker({ failureThreshold: 3 });
      for (let i = 0; i < 3; i++) {
        await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(cb.getState()).toBe('open');
    });

    it('rejects calls immediately when open', async () => {
      const cb = createCircuitBreaker({ failureThreshold: 2 });
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});

      await expect(cb.call(async () => 'never')).rejects.toThrow(/Circuit breaker is open/);
    });

    it('rejected calls have CIRCUIT_OPEN code', async () => {
      const cb = createCircuitBreaker({ failureThreshold: 1 });
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});

      try {
        await cb.call(async () => 'never');
      } catch (err) {
        expect(err.code).toBe('CIRCUIT_OPEN');
      }
    });
  });

  describe('createCircuitBreaker — half-open and recovery', () => {
    it('transitions to half-open after cooldown expires', async () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 5000 });

      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      expect(cb.getState()).toBe('open');

      vi.advanceTimersByTime(5000);
      expect(cb.getState()).toBe('half-open');
      vi.useRealTimers();
    });

    it('closes on success during half-open', async () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 5000 });

      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});

      vi.advanceTimersByTime(5000);
      expect(cb.getState()).toBe('half-open');

      await cb.call(async () => 'recovered');
      expect(cb.getState()).toBe('closed');
      vi.useRealTimers();
    });

    it('reopens on failure during half-open', async () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 5000 });

      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});

      vi.advanceTimersByTime(5000);
      expect(cb.getState()).toBe('half-open');

      await cb.call(async () => { throw new Error('still broken'); }).catch(() => {});
      expect(cb.getState()).toBe('open');
      vi.useRealTimers();
    });
  });

  describe('createCircuitBreaker — reset', () => {
    it('reset returns to closed state', async () => {
      const cb = createCircuitBreaker({ failureThreshold: 1 });
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      expect(cb.getState()).toBe('open');

      cb.reset();
      expect(cb.getState()).toBe('closed');
    });

    it('calls succeed after reset', async () => {
      const cb = createCircuitBreaker({ failureThreshold: 1 });
      await cb.call(async () => { throw new Error('fail'); }).catch(() => {});
      cb.reset();

      const result = await cb.call(async () => 'works');
      expect(result).toBe('works');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Outbox Worker Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/server/services/outbox-worker.js', () => {
  describe('calculateBackoff', () => {
    it('applies exponential backoff', () => {
      expect(calculateBackoff(0)).toBe(1000);
      expect(calculateBackoff(1)).toBe(2000);
      expect(calculateBackoff(2)).toBe(4000);
      expect(calculateBackoff(3)).toBe(8000);
    });

    it('caps at maximum backoff', () => {
      expect(calculateBackoff(20)).toBe(300_000);
    });
  });

  describe('processOutboxBatch — validation', () => {
    it('throws if db is missing', async () => {
      await expect(
        processOutboxBatch({ sendNotification: vi.fn() })
      ).rejects.toThrow(/Firestore db instance/);
    });

    it('throws if sendNotification is missing', async () => {
      await expect(
        processOutboxBatch({ db: { collection: vi.fn() } })
      ).rejects.toThrow(/sendNotification function/);
    });
  });

  describe('processOutboxBatch — delivery flow', () => {
    function createMockDb(entries) {
      const docs = entries.map((entry, i) => ({
        id: `doc_${i}`,
        data: () => entry,
        exists: true,
      }));

      const querySnapshot = {
        forEach: (cb) => docs.forEach(cb),
      };

      const emptySnapshot = {
        forEach: () => {},
      };

      const docRefs = {};
      docs.forEach((doc) => {
        docRefs[doc.id] = {
          ...doc,
          data: () => entries[parseInt(doc.id.split('_')[1])],
        };
      });

      const collection = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn()
          .mockResolvedValueOnce(querySnapshot)
          .mockResolvedValueOnce(emptySnapshot),
        doc: vi.fn((id) => ({
          update: vi.fn().mockResolvedValue(undefined),
        })),
      };

      const db = {
        collection: vi.fn(() => collection),
        runTransaction: vi.fn(async (fn) => {
          const docIndex = db._txIndex || 0;
          db._txIndex = docIndex + 1;

          if (docIndex >= docs.length) return null;

          const tx = {
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ ...entries[docIndex], status: entries[docIndex].status }),
            })),
            update: vi.fn(),
          };
          return fn(tx);
        }),
        _txIndex: 0,
      };

      return db;
    }

    it('processes pending entries and marks delivered on success', async () => {
      const entries = [
        { status: 'pending', attempts: 0, type: 'reservation_created', bookingId: 'b1' },
      ];
      const db = createMockDb(entries);
      const sendNotification = vi.fn().mockResolvedValue({ ok: true });

      const result = await processOutboxBatch({ db, sendNotification, batchSize: 5 });

      expect(result.processed).toBe(1);
      expect(result.delivered).toBe(1);
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it('marks retryable on retryable failure with attempts remaining', async () => {
      const entries = [
        { status: 'pending', attempts: 1, type: 'payment_approved', bookingId: 'b2' },
      ];
      const db = createMockDb(entries);
      const sendNotification = vi.fn().mockResolvedValue({ ok: false, retryable: true, error: 'timeout' });

      const result = await processOutboxBatch({ db, sendNotification, batchSize: 5 });

      expect(result.processed).toBe(1);
      expect(result.retried).toBe(1);
    });

    it('marks terminal failed on non-retryable failure', async () => {
      const entries = [
        { status: 'pending', attempts: 0, type: 'refund_approved', bookingId: 'b3' },
      ];
      const db = createMockDb(entries);
      const sendNotification = vi.fn().mockResolvedValue({ ok: false, retryable: false, error: 'invalid config' });

      const result = await processOutboxBatch({ db, sendNotification, batchSize: 5 });

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('marks terminal failed when attempts exhausted', async () => {
      const entries = [
        { status: 'retryable_failed', attempts: 4, type: 'reservation_cancelled', bookingId: 'b4' },
      ];
      const db = createMockDb(entries);
      const sendNotification = vi.fn().mockResolvedValue({ ok: false, retryable: true, error: 'still failing' });

      const result = await processOutboxBatch({ db, sendNotification, batchSize: 5 });

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('handles exceptions from sendNotification gracefully', async () => {
      const entries = [
        { status: 'pending', attempts: 0, type: 'reservation_created', bookingId: 'b5' },
      ];
      const db = createMockDb(entries);
      const sendNotification = vi.fn().mockRejectedValue(new Error('Connection reset'));

      const result = await processOutboxBatch({ db, sendNotification, batchSize: 5 });

      expect(result.processed).toBe(1);
      expect(result.retried).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot Fallback Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/server/integrations/chatbot-fallback.js', () => {
  describe('getChatbotFallbackResponse', () => {
    it('returns a fallback response for empty input', () => {
      const result = getChatbotFallbackResponse('');
      expect(result.isFallback).toBe(true);
      expect(result.text).toBeTruthy();
    });

    it('returns a fallback response for null input', () => {
      const result = getChatbotFallbackResponse(null);
      expect(result.isFallback).toBe(true);
    });

    it('matches room-related questions to rooms knowledge', () => {
      const result = getChatbotFallbackResponse('What rooms do you have?');
      expect(result.isFallback).toBe(true);
      expect(result.text).toMatch(/room/i);
    });

    it('matches location questions', () => {
      const result = getChatbotFallbackResponse('Where is the resort located?');
      expect(result.isFallback).toBe(true);
      expect(result.text).toMatch(/location|Philippines/i);
    });

    it('returns generic fallback for unknown topics', () => {
      const result = getChatbotFallbackResponse('What is the meaning of life?');
      expect(result.isFallback).toBe(true);
      expect(result.text).toMatch(/general resort information/i);
    });

    it('matches greeting patterns', () => {
      const result = getChatbotFallbackResponse('Hello!');
      expect(result.isFallback).toBe(true);
      expect(result.text).toMatch(/Welcome/i);
    });
  });

  describe('detectActionBoundary — action redirection', () => {
    it('detects booking action keywords', () => {
      const result = detectActionBoundary('I want to book a room');
      expect(result.isAction).toBe(true);
      expect(result.action).toBe('booking');
      expect(result.redirectUrl).toBe('/rooms');
    });

    it('detects payment action keywords', () => {
      const result = detectActionBoundary('How do I make a payment?');
      expect(result.isAction).toBe(true);
      expect(result.action).toBe('payment');
      expect(result.redirectUrl).toBe('/my-bookings');
    });

    it('detects day-tour action keywords', () => {
      const result = detectActionBoundary('I want a day tour');
      expect(result.isAction).toBe(true);
      expect(result.action).toBe('dayTour');
      expect(result.redirectUrl).toBe('/day-tour');
    });

    it('detects account/password action keywords', () => {
      const result = detectActionBoundary('I need to change my password');
      expect(result.isAction).toBe(true);
      expect(result.action).toBe('account');
      expect(result.redirectUrl).toBe('/account');
    });

    it('detects sensitive data requests', () => {
      const result = detectActionBoundary('Show me the secret credentials');
      expect(result.isAction).toBe(true);
      expect(result.action).toBe('restricted');
      expect(result.redirectUrl).toBe(null);
    });

    it('does not flag generic questions as actions', () => {
      const result = detectActionBoundary('What are your amenities?');
      expect(result.isAction).toBe(false);
    });

    it('returns isAction false for empty input', () => {
      const result = detectActionBoundary('');
      expect(result.isAction).toBe(false);
    });

    it('returns isAction false for null input', () => {
      const result = detectActionBoundary(null);
      expect(result.isAction).toBe(false);
    });
  });

  describe('getChatbotFallbackResponse — action boundary integration', () => {
    it('redirects booking requests to /rooms', () => {
      const result = getChatbotFallbackResponse('I want to make a reservation');
      expect(result.isFallback).toBe(true);
      expect(result.redirectUrl).toBe('/rooms');
      expect(result.text).toMatch(/\/rooms/);
    });

    it('redirects payment requests to /my-bookings', () => {
      const result = getChatbotFallbackResponse('Process my refund please');
      expect(result.isFallback).toBe(true);
      expect(result.redirectUrl).toBe('/my-bookings');
    });
  });

  describe('shouldConfirmReset', () => {
    it('returns false for empty history', () => {
      expect(shouldConfirmReset([])).toBe(false);
    });

    it('returns false for null history', () => {
      expect(shouldConfirmReset(null)).toBe(false);
    });

    it('returns false for undefined history', () => {
      expect(shouldConfirmReset(undefined)).toBe(false);
    });

    it('returns true when history contains a user message', () => {
      const history = [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi there!' },
      ];
      expect(shouldConfirmReset(history)).toBe(true);
    });

    it('returns false when history only has assistant messages', () => {
      const history = [
        { role: 'assistant', text: 'Welcome to Sandy Feet Resort!' },
      ];
      expect(shouldConfirmReset(history)).toBe(false);
    });
  });
});
