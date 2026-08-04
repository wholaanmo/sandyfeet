// Property 14: Sensitive values never survive log redaction
// Validates: Requirements 3.10, 8.10

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { redactForLog } from '../../lib/server/http/redact.js';

/**
 * Sensitive keys that must always be redacted.
 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'cookie',
  'authorization',
  'secret',
  'credential',
  'code',
  'private_key',
  'evidence',
  'document_url',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'pin',
  'bank_account',
  'routing_number',
  'id_number',
  'passport',
  'driver_license',
];

/**
 * Safe metadata keys that must be preserved unchanged.
 */
const SAFE_KEYS = [
  'correlationId',
  'eventType',
  'actorUid',
  'timestamp',
  'action',
  'method',
  'path',
  'status',
];

/**
 * Recursively collect all values associated with a given key in a plain object tree.
 */
function collectValuesForKey(obj, targetKey) {
  const values = [];
  if (obj === null || obj === undefined || typeof obj !== 'object') return values;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      values.push(...collectValuesForKey(item, targetKey));
    }
    return values;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === targetKey) {
      values.push(value);
    }
    if (value !== null && typeof value === 'object') {
      values.push(...collectValuesForKey(value, targetKey));
    }
  }
  return values;
}

describe('Property 14: Sensitive values never survive log redaction', () => {
  // Arbitrary for generating non-empty string values to place under sensitive keys
  const sensitiveValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.emailAddress(),
    fc.uuid(),
    fc.stringMatching(/^[0-9a-f]{8,32}$/),
  );

  // Arbitrary for safe metadata values (primitives that should survive redaction)
  const safeValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 30 }),
    fc.nat(),
    fc.boolean(),
  );

  /**
   * Generates a nested object that contains at least one sensitive key
   * and at least one safe metadata key, optionally nested several levels deep.
   */
  const nestedSensitiveObjectArb = fc
    .tuple(
      fc.constantFrom(...SENSITIVE_KEYS),
      sensitiveValueArb,
      fc.constantFrom(...SAFE_KEYS),
      safeValueArb,
      fc.nat({ max: 5 }), // nesting depth
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }).filter(
          (k) => !SENSITIVE_KEYS.includes(k.toLowerCase()) && !SAFE_KEYS.includes(k),
        ),
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        { minKeys: 0, maxKeys: 4 },
      ),
    )
    .map(([sensitiveKey, sensitiveValue, safeKey, safeValue, depth, extraFields]) => {
      // Build a nested structure with sensitive and safe keys
      let inner = { ...extraFields, [sensitiveKey]: sensitiveValue, [safeKey]: safeValue };
      for (let i = 0; i < depth; i++) {
        inner = { [`level_${i}`]: inner };
      }
      return inner;
    });

  it('redacts all sensitive key values in arbitrarily nested objects', () => {
    fc.assert(
      fc.property(nestedSensitiveObjectArb, (obj) => {
        const redacted = redactForLog(obj);

        // Every sensitive key in the output must have value '[REDACTED]'
        for (const key of SENSITIVE_KEYS) {
          const values = collectValuesForKey(redacted, key);
          for (const val of values) {
            expect(val).toBe('[REDACTED]');
          }
        }

        // Verify sensitive values do not appear as values in the redacted structure
        // (checking the parsed structure rather than raw serialization to avoid
        // false positives with short strings matching JSON syntax characters)
        for (const key of SENSITIVE_KEYS) {
          const redactedValues = collectValuesForKey(redacted, key);
          const originalValues = collectValuesForKey(obj, key);
          for (const origVal of originalValues) {
            // The redacted output must never contain the original value
            expect(redactedValues).not.toContain(origVal);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it('preserves safe metadata keys unchanged', () => {
    fc.assert(
      fc.property(nestedSensitiveObjectArb, (obj) => {
        const redacted = redactForLog(obj);

        // Safe keys at any level must retain their original values
        for (const key of SAFE_KEYS) {
          const originalValues = collectValuesForKey(obj, key);
          const redactedValues = collectValuesForKey(redacted, key);
          expect(redactedValues).toEqual(originalValues);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('handles deeply nested sensitive keys', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SENSITIVE_KEYS),
        sensitiveValueArb,
        fc.nat({ max: 15 }),
        (sensitiveKey, sensitiveValue, depth) => {
          // Build a deeply nested object with a sensitive key at the bottom
          let obj = { [sensitiveKey]: sensitiveValue };
          for (let i = 0; i < depth; i++) {
            obj = { [`nested_${i}`]: obj };
          }

          const redacted = redactForLog(obj);
          const allSensitiveValues = collectValuesForKey(redacted, sensitiveKey);

          for (const val of allSensitiveValues) {
            expect(val).toBe('[REDACTED]');
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('handles objects with arrays containing sensitive data', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SENSITIVE_KEYS),
        fc.array(sensitiveValueArb, { minLength: 1, maxLength: 5 }),
        fc.constantFrom(...SAFE_KEYS),
        safeValueArb,
        (sensitiveKey, sensitiveValues, safeKey, safeValue) => {
          // Array of objects each containing a sensitive key
          const items = sensitiveValues.map((val) => ({
            [sensitiveKey]: val,
            [safeKey]: safeValue,
          }));
          const obj = { records: items, [safeKey]: safeValue };

          const redacted = redactForLog(obj);
          const allSensitiveVals = collectValuesForKey(redacted, sensitiveKey);

          for (const val of allSensitiveVals) {
            expect(val).toBe('[REDACTED]');
          }

          // Safe metadata preserved at top level
          expect(redacted[safeKey]).toEqual(safeValue);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('handles circular references gracefully without throwing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SENSITIVE_KEYS),
        sensitiveValueArb,
        fc.constantFrom(...SAFE_KEYS),
        safeValueArb,
        (sensitiveKey, sensitiveValue, safeKey, safeValue) => {
          // Create an object with a circular reference
          const obj = {
            [sensitiveKey]: sensitiveValue,
            [safeKey]: safeValue,
            nested: {},
          };
          obj.nested.circular = obj;

          // Should not throw
          const redacted = redactForLog(obj);

          // Sensitive key at root is still redacted
          expect(redacted[sensitiveKey]).toBe('[REDACTED]');
          // Safe key at root is preserved
          expect(redacted[safeKey]).toEqual(safeValue);
          // Circular reference is replaced with marker
          expect(redacted.nested.circular).toBe('[Circular]');
        },
      ),
      { numRuns: 500 },
    );
  });
});
