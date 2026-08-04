// lib/server/services/chatbot.js
// Chatbot input normalization and validation.
// Enforces bounded message length, validated history, and sanitized entries.
import 'server-only';

/** Maximum message length in Unicode characters */
export const MAX_MESSAGE_LENGTH = 1000;

/** Maximum number of history entries */
export const MAX_HISTORY_ENTRIES = 10;

/** Maximum text length per history entry */
export const MAX_HISTORY_TEXT_LENGTH = 2000;

/** Valid roles for history entries */
const VALID_ROLES = new Set(['user', 'assistant']);

/**
 * Normalize and validate a single history entry.
 * @param {unknown} entry
 * @param {number} index
 * @returns {{ role: 'user' | 'assistant', text: string }}
 * @throws {Error} If the entry is invalid
 */
function normalizeHistoryEntry(entry, index) {
  if (!entry || typeof entry !== 'object') {
    const err = new Error(`History entry at index ${index} must be an object`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const { role, text, content } = entry;

  // Normalize role - accept 'bot' as alias for 'assistant' for backwards compatibility
  let normalizedRole = role;
  if (role === 'bot') {
    normalizedRole = 'assistant';
  }

  if (!VALID_ROLES.has(normalizedRole)) {
    const err = new Error(`History entry at index ${index} has invalid role: must be 'user' or 'assistant'`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Accept 'text' or 'content' field for backwards compatibility
  const rawText = text !== undefined ? text : content;

  if (typeof rawText !== 'string') {
    const err = new Error(`History entry at index ${index} must have a string text field`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const trimmedText = rawText.trim();

  if (trimmedText.length === 0) {
    const err = new Error(`History entry at index ${index} must not be empty`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if ([...trimmedText].length > MAX_HISTORY_TEXT_LENGTH) {
    const err = new Error(`History entry at index ${index} exceeds maximum length of ${MAX_HISTORY_TEXT_LENGTH} characters`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  return { role: normalizedRole, text: trimmedText };
}

/**
 * Normalize chatbot input: validate message length and history entries.
 *
 * @param {unknown} message - The user message
 * @param {unknown} history - Optional conversation history
 * @returns {{ message: string, history: Array<{ role: 'user' | 'assistant', text: string }> }}
 * @throws {Error} With code 'VALIDATION_ERROR' if input is invalid
 */
export function normalizeChatbotInput(message, history) {
  // Validate message
  if (typeof message !== 'string') {
    const err = new Error('Message must be a string');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    const err = new Error('Message must not be empty');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Use Unicode-aware character count (spread to get code points)
  if ([...trimmedMessage].length > MAX_MESSAGE_LENGTH) {
    const err = new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Validate history
  let normalizedHistory = [];

  if (history !== undefined && history !== null) {
    if (!Array.isArray(history)) {
      const err = new Error('History must be an array');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (history.length > MAX_HISTORY_ENTRIES) {
      const err = new Error(`History exceeds maximum of ${MAX_HISTORY_ENTRIES} entries`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    normalizedHistory = history.map((entry, index) => normalizeHistoryEntry(entry, index));
  }

  return { message: trimmedMessage, history: normalizedHistory };
}
