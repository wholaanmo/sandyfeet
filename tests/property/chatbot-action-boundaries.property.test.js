// Property 31: Chatbot action boundaries cannot trigger business mutations
// Validates: Requirements 14.9

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('server-only', () => ({}));

import {
  detectActionBoundary,
  getChatbotFallbackResponse,
} from '../../lib/server/integrations/chatbot-fallback.js';

/**
 * The approved set of redirect URLs that chatbot action boundaries may return.
 * Any redirectUrl MUST be one of these or null.
 */
const APPROVED_REDIRECT_URLS = new Set(['/rooms', '/day-tour', '/my-bookings', '/account', null]);

/**
 * Patterns that indicate executable or dangerous content in responses.
 */
const EXECUTABLE_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:\s*text\/html/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<form[\s>]/i,
];

describe('Property 31: Chatbot action boundaries cannot trigger business mutations', () => {
  it('detectActionBoundary never returns a redirectUrl outside the approved set', () => {
    const messageArb = fc.string({ minLength: 0, maxLength: 500 });

    fc.assert(
      fc.property(messageArb, (message) => {
        const result = detectActionBoundary(message);

        if (result.isAction && result.redirectUrl !== undefined) {
          expect(APPROVED_REDIRECT_URLS.has(result.redirectUrl)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('getChatbotFallbackResponse never contains executable content', () => {
    const messageArb = fc.string({ minLength: 0, maxLength: 500 });

    fc.assert(
      fc.property(messageArb, (message) => {
        const response = getChatbotFallbackResponse(message);

        for (const pattern of EXECUTABLE_PATTERNS) {
          expect(response.text).not.toMatch(pattern);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('getChatbotFallbackResponse never includes unapproved URLs in redirectUrl', () => {
    const messageArb = fc.string({ minLength: 0, maxLength: 500 });

    fc.assert(
      fc.property(messageArb, (message) => {
        const response = getChatbotFallbackResponse(message);

        if (response.redirectUrl !== undefined) {
          expect(APPROVED_REDIRECT_URLS.has(response.redirectUrl)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('action-keyword messages always produce guidance text and approved redirect', () => {
    // Generate messages that contain action keywords to ensure boundary detection works
    const actionPrefixArb = fc.constantFrom(
      'book', 'reserve', 'reservation', 'pay', 'payment', 'deposit',
      'refund', 'cancel', 'cancellation', 'check-in', 'checkin',
      'day-tour', 'day tour', 'password', 'login', 'sign-in', 'account',
      'profile', 'sensitive', 'private', 'secret', 'credential', 'token',
    );
    const suffixArb = fc.string({ minLength: 0, maxLength: 200 });

    const actionMessageArb = fc.tuple(actionPrefixArb, suffixArb).map(
      ([keyword, suffix]) => `I want to ${keyword} ${suffix}`,
    );

    fc.assert(
      fc.property(actionMessageArb, (message) => {
        const boundary = detectActionBoundary(message);

        // Action keywords should be detected
        expect(boundary.isAction).toBe(true);

        // Redirect must be in approved set or null
        expect(APPROVED_REDIRECT_URLS.has(boundary.redirectUrl)).toBe(true);

        // Guidance text must be present and non-empty
        expect(boundary.guidance).toBeTruthy();
        expect(typeof boundary.guidance).toBe('string');
        expect(boundary.guidance.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('fallback response text never contains external or unapproved URLs', () => {
    const messageArb = fc.string({ minLength: 0, maxLength: 500 });

    // Pattern to detect URLs that are NOT the approved internal paths
    const externalUrlPattern = /https?:\/\/[^\s]+/i;

    fc.assert(
      fc.property(messageArb, (message) => {
        const response = getChatbotFallbackResponse(message);

        // Response text should not contain any absolute external URLs
        expect(response.text).not.toMatch(externalUrlPattern);
      }),
      { numRuns: 100 },
    );
  });
});
