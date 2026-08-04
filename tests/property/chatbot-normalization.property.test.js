// Property 9: Chatbot input normalization is bounded
// Validates: Requirements 2.8, 14.7

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('server-only', () => ({}));

import {
  normalizeChatbotInput,
  MAX_MESSAGE_LENGTH,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_TEXT_LENGTH,
} from '../../lib/server/services/chatbot.js';

describe('Property 9: Chatbot input normalization is bounded', () => {
  it('any message > 1000 Unicode code points always throws VALIDATION_ERROR', () => {
    // Generate strings with more than MAX_MESSAGE_LENGTH code points
    const oversizedMessageArb = fc
      .integer({ min: MAX_MESSAGE_LENGTH + 1, max: MAX_MESSAGE_LENGTH + 200 })
      .chain((len) =>
        fc.string({ minLength: len, maxLength: len }).filter((s) => [...s.trim()].length > MAX_MESSAGE_LENGTH),
      );

    fc.assert(
      fc.property(oversizedMessageArb, (message) => {
        try {
          normalizeChatbotInput(message, []);
          // Should not reach here
          expect.fail('Expected VALIDATION_ERROR to be thrown');
        } catch (err) {
          expect(err.code).toBe('VALIDATION_ERROR');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('any message ≤ 1000 Unicode code points (non-empty after trim) always succeeds', () => {
    const validMessageArb = fc
      .string({ minLength: 1, maxLength: MAX_MESSAGE_LENGTH })
      .filter((s) => s.trim().length > 0 && [...s.trim()].length <= MAX_MESSAGE_LENGTH);

    fc.assert(
      fc.property(validMessageArb, (message) => {
        const result = normalizeChatbotInput(message, []);
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('history');
      }),
      { numRuns: 100 },
    );
  });

  it('any history array with > 10 entries always throws VALIDATION_ERROR', () => {
    const validEntry = { role: 'user', text: 'hello' };
    const oversizedHistoryArb = fc
      .integer({ min: MAX_HISTORY_ENTRIES + 1, max: MAX_HISTORY_ENTRIES + 20 })
      .map((len) => Array.from({ length: len }, () => ({ ...validEntry })));

    fc.assert(
      fc.property(oversizedHistoryArb, (history) => {
        try {
          normalizeChatbotInput('valid message', history);
          expect.fail('Expected VALIDATION_ERROR to be thrown');
        } catch (err) {
          expect(err.code).toBe('VALIDATION_ERROR');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('valid history entries always come back with role user or assistant and trimmed non-empty text', () => {
    const roleArb = fc.constantFrom('user', 'assistant', 'bot');
    const textArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
    const historyEntryArb = fc.tuple(roleArb, textArb).map(([role, text]) => ({ role, text }));
    const historyArb = fc.array(historyEntryArb, { minLength: 1, maxLength: MAX_HISTORY_ENTRIES });

    fc.assert(
      fc.property(historyArb, (history) => {
        const result = normalizeChatbotInput('test message', history);

        for (const entry of result.history) {
          expect(['user', 'assistant']).toContain(entry.role);
          expect(entry.text.trim()).toBe(entry.text);
          expect(entry.text.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('normalized output message is always ≤ 1000 code points and non-empty', () => {
    const validMessageArb = fc
      .string({ minLength: 1, maxLength: MAX_MESSAGE_LENGTH })
      .filter((s) => s.trim().length > 0 && [...s.trim()].length <= MAX_MESSAGE_LENGTH);

    fc.assert(
      fc.property(validMessageArb, (message) => {
        const result = normalizeChatbotInput(message, []);
        const codePoints = [...result.message].length;

        expect(codePoints).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
        expect(codePoints).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('normalized history entries always have text ≤ 2000 code points', () => {
    const roleArb = fc.constantFrom('user', 'assistant');
    const textArb = fc
      .string({ minLength: 1, maxLength: MAX_HISTORY_TEXT_LENGTH })
      .filter((s) => s.trim().length > 0 && [...s.trim()].length <= MAX_HISTORY_TEXT_LENGTH);
    const historyEntryArb = fc.tuple(roleArb, textArb).map(([role, text]) => ({ role, text }));
    const historyArb = fc.array(historyEntryArb, { minLength: 1, maxLength: MAX_HISTORY_ENTRIES });

    fc.assert(
      fc.property(historyArb, (history) => {
        const result = normalizeChatbotInput('test message', history);

        for (const entry of result.history) {
          const codePoints = [...entry.text].length;
          expect(codePoints).toBeLessThanOrEqual(MAX_HISTORY_TEXT_LENGTH);
        }
      }),
      { numRuns: 100 },
    );
  });
});
