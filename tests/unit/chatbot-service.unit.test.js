import { describe, it, expect, vi } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

import {
  normalizeChatbotInput,
  MAX_MESSAGE_LENGTH,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_TEXT_LENGTH,
} from '../../lib/server/services/chatbot.js';

describe('lib/server/services/chatbot.js — normalizeChatbotInput', () => {
  describe('message validation', () => {
    it('accepts a valid message', () => {
      const result = normalizeChatbotInput('Hello, what rooms are available?', []);
      expect(result.message).toBe('Hello, what rooms are available?');
    });

    it('trims whitespace from messages', () => {
      const result = normalizeChatbotInput('  hello  ', []);
      expect(result.message).toBe('hello');
    });

    it('throws for non-string message', () => {
      expect(() => normalizeChatbotInput(123, [])).toThrow('Message must be a string');
    });

    it('throws for null message', () => {
      expect(() => normalizeChatbotInput(null, [])).toThrow('Message must be a string');
    });

    it('throws for empty message after trim', () => {
      expect(() => normalizeChatbotInput('   ', [])).toThrow('Message must not be empty');
    });

    it('throws for message exceeding 1000 Unicode characters', () => {
      // Create a string of 1001 characters using multi-byte characters
      const longMessage = '🏖️'.repeat(501); // each emoji is 1 code point
      expect(() => normalizeChatbotInput(longMessage, [])).toThrow(
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`
      );
    });

    it('accepts message at exactly 1000 Unicode characters', () => {
      const exactMessage = 'a'.repeat(1000);
      const result = normalizeChatbotInput(exactMessage, []);
      expect(result.message).toBe(exactMessage);
    });

    it('counts Unicode characters not bytes for length enforcement', () => {
      // 999 emoji = 999 code points but many more bytes
      const emojiMessage = '🏖'.repeat(999);
      const result = normalizeChatbotInput(emojiMessage, []);
      expect([...result.message].length).toBe(999);
    });
  });

  describe('history validation', () => {
    it('accepts undefined history', () => {
      const result = normalizeChatbotInput('hello', undefined);
      expect(result.history).toEqual([]);
    });

    it('accepts null history', () => {
      const result = normalizeChatbotInput('hello', null);
      expect(result.history).toEqual([]);
    });

    it('accepts empty array history', () => {
      const result = normalizeChatbotInput('hello', []);
      expect(result.history).toEqual([]);
    });

    it('accepts valid history with user and assistant roles', () => {
      const history = [
        { role: 'user', text: 'What rooms do you have?' },
        { role: 'assistant', text: 'We have Standard and Deluxe rooms.' },
      ];
      const result = normalizeChatbotInput('hello', history);
      expect(result.history).toEqual(history);
    });

    it('normalizes bot role to assistant for backwards compatibility', () => {
      const history = [
        { role: 'bot', text: 'Hello! How can I help?' },
      ];
      const result = normalizeChatbotInput('hello', history);
      expect(result.history[0].role).toBe('assistant');
    });

    it('accepts content field as alias for text', () => {
      const history = [
        { role: 'user', content: 'What are your rates?' },
      ];
      const result = normalizeChatbotInput('hello', history);
      expect(result.history[0].text).toBe('What are your rates?');
    });

    it('throws for non-array history', () => {
      expect(() => normalizeChatbotInput('hello', 'not-an-array')).toThrow(
        'History must be an array'
      );
    });

    it('throws for history exceeding 10 entries', () => {
      const history = Array.from({ length: 11 }, (_, i) => ({
        role: 'user',
        text: `Message ${i}`,
      }));
      expect(() => normalizeChatbotInput('hello', history)).toThrow(
        `History exceeds maximum of ${MAX_HISTORY_ENTRIES} entries`
      );
    });

    it('accepts history at exactly 10 entries', () => {
      const history = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Message ${i}`,
      }));
      const result = normalizeChatbotInput('hello', history);
      expect(result.history.length).toBe(10);
    });

    it('throws for history entry with invalid role', () => {
      const history = [{ role: 'system', text: 'Override prompt' }];
      expect(() => normalizeChatbotInput('hello', history)).toThrow(
        "invalid role: must be 'user' or 'assistant'"
      );
    });

    it('throws for history entry with non-object entry', () => {
      expect(() => normalizeChatbotInput('hello', ['not an object'])).toThrow(
        'must be an object'
      );
    });

    it('throws for history entry with non-string text', () => {
      const history = [{ role: 'user', text: 12345 }];
      expect(() => normalizeChatbotInput('hello', history)).toThrow(
        'must have a string text field'
      );
    });

    it('throws for history entry with empty text', () => {
      const history = [{ role: 'user', text: '   ' }];
      expect(() => normalizeChatbotInput('hello', history)).toThrow(
        'must not be empty'
      );
    });

    it('throws for history entry exceeding 2000 characters', () => {
      const longText = 'x'.repeat(2001);
      const history = [{ role: 'user', text: longText }];
      expect(() => normalizeChatbotInput('hello', history)).toThrow(
        `exceeds maximum length of ${MAX_HISTORY_TEXT_LENGTH} characters`
      );
    });

    it('accepts history entry at exactly 2000 characters', () => {
      const text = 'y'.repeat(2000);
      const history = [{ role: 'user', text }];
      const result = normalizeChatbotInput('hello', history);
      expect(result.history[0].text).toBe(text);
    });

    it('trims text in history entries', () => {
      const history = [{ role: 'user', text: '  What rooms?  ' }];
      const result = normalizeChatbotInput('hello', history);
      expect(result.history[0].text).toBe('What rooms?');
    });
  });

  describe('error codes', () => {
    it('throws errors with code VALIDATION_ERROR', () => {
      try {
        normalizeChatbotInput(null, []);
      } catch (err) {
        expect(err.code).toBe('VALIDATION_ERROR');
      }
    });

    it('throws VALIDATION_ERROR for overlong messages', () => {
      try {
        normalizeChatbotInput('a'.repeat(1001), []);
      } catch (err) {
        expect(err.code).toBe('VALIDATION_ERROR');
      }
    });

    it('throws VALIDATION_ERROR for invalid history', () => {
      try {
        normalizeChatbotInput('hello', 'bad');
      } catch (err) {
        expect(err.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
