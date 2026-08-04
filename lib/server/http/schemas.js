// lib/server/http/schemas.js
// Reusable Zod schemas and composition helpers for API validation.

import { z } from 'zod';

/**
 * A trimmed non-empty string.
 */
export const trimmedString = z.string().trim().min(1, 'Must not be empty');

/**
 * A bounded string with configurable min/max length (trimmed).
 * @param {number} min - Minimum length after trimming
 * @param {number} max - Maximum length after trimming
 * @returns {z.ZodString}
 */
export function boundedString(min, max) {
  return z.string().trim().min(min, `Must be at least ${min} characters`).max(max, `Must be at most ${max} characters`);
}

/**
 * An email address schema — trimmed, lowercased, validated format.
 */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')
  .max(254, 'Email must be at most 254 characters');

/**
 * A positive integer (> 0, finite).
 */
export const positiveInt = z.number().int().positive().finite();

/**
 * A non-negative integer (>= 0, finite).
 */
export const nonNegativeInt = z.number().int().min(0).finite();

/**
 * An ISO 8601 date string (YYYY-MM-DD format).
 */
export const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format');

/**
 * An ISO 8601 datetime string.
 */
export const isoDateTime = z.string().trim().datetime({ message: 'Must be a valid ISO datetime' });

/**
 * A safe URL — must be HTTPS (or HTTP in test/dev for localhost).
 */
export const safeUrl = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .refine(
    (val) => {
      try {
        const url = new URL(val);
        return url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:');
      } catch {
        return false;
      }
    },
    { message: 'URL must use HTTPS' }
  );

/**
 * A Firebase UID — alphanumeric string of bounded length.
 */
export const uid = z.string().trim().min(1).max(128).regex(/^[\w-]+$/, 'Must be a valid identifier');

/**
 * A booking ID — alphanumeric/dash string.
 */
export const bookingId = z.string().trim().min(1).max(128).regex(/^[\w-]+$/, 'Must be a valid booking ID');

/**
 * Schema for chatbot history entries — strict shape.
 */
export const chatbotHistoryEntry = z.object({
  role: z.enum(['user', 'assistant']),
  text: boundedString(1, 2000),
}).strict();

/**
 * Compose a strict object schema from a shape (no unknown keys allowed).
 * @param {Record<string, z.ZodTypeAny>} shape
 * @returns {z.ZodObject}
 */
export function strictObject(shape) {
  return z.object(shape).strict();
}

/**
 * Create an optional field that defaults to a value.
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {T} defaultValue
 * @returns {z.ZodDefault<z.ZodOptional<z.ZodType<T>>>}
 */
export function optionalWithDefault(schema, defaultValue) {
  return schema.optional().default(defaultValue);
}

/**
 * Format Zod validation errors into a stable field-error structure.
 * @param {import('zod').ZodError} zodError
 * @returns {{ field: string, message: string }[]}
 */
export function formatFieldErrors(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
  }));
}
