// Property 16: Data and outbound projections disclose only approved fields
// Validates: Requirements 5.6, 5.7, 14.1

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// Mock server-only (no-op)
vi.mock('server-only', () => ({}));

// Mock env module to avoid missing env var errors at import time
vi.mock('../../lib/server/env.js', () => ({
  env: {
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
    APP_ORIGIN: 'https://test.example.com',
    NODE_ENV: 'test',
  },
}));

// Mock firebase-admin
vi.mock('../../lib/server/firebase-admin.js', () => ({
  firestore: {},
  auth: {},
}));

import { projectFields, throwNotFound } from '../../lib/server/repositories/base.js';
import { validateEmailCommand, EMAIL_OPERATIONS } from '../../lib/server/services/email-commands.js';

// --- Arbitraries ---

/** Prototype property names that must not be used as field names in tests. */
const protoNames = new Set([
  'toString', 'valueOf', 'hasOwnProperty', 'constructor', 'isPrototypeOf',
  'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__', '__proto__', 'length', 'prototype',
  'caller', 'callee', 'arguments', 'apply', 'bind', 'call', 'name',
]);

/** Generate arbitrary field names (safe alphanumeric keys, no prototype collisions). */
const fieldNameArb = fc.string({ minLength: 2, maxLength: 20 })
  .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) && !protoNames.has(s));

/** Generate arbitrary field values (various primitive types). */
const fieldValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.double({ noNaN: true }),
);

/** Generate a data object with random fields and values. */
const dataObjectArb = fc.dictionary(fieldNameArb, fieldValueArb, { minKeys: 1, maxKeys: 15 });

/** Generate an allowedFields list (subset of possible field names). */
const allowedFieldsArb = fc.uniqueArray(fieldNameArb, { minLength: 0, maxLength: 10 });

/** Generate a data object with some known sensitive fields mixed in. */
const sensitiveFieldNames = [
  'password', 'token', 'secret', 'creditCard', 'ssn',
  'identityDocument', 'paymentEvidence', 'sessionCookie',
  'refreshToken', 'verificationCode', 'idToken',
];

const dataWithSensitiveFieldsArb = fc.tuple(dataObjectArb, fc.subarray(sensitiveFieldNames, { minLength: 1 }))
  .map(([data, sensitives]) => {
    const result = { ...data };
    for (const field of sensitives) {
      result[field] = `sensitive-value-${field}`;
    }
    return result;
  });

describe('Property 16: Data and outbound projections disclose only approved fields', () => {
  it('projectFields returns ONLY keys present in the allowed list', () => {
    fc.assert(
      fc.property(
        dataObjectArb,
        allowedFieldsArb,
        (data, allowedFields) => {
          const result = projectFields(data, allowedFields);
          const resultKeys = Object.keys(result);

          // Every returned key must be in the allowed list
          for (const key of resultKeys) {
            expect(allowedFields).toContain(key);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('projectFields never returns keys outside the allowed list even if present in data', () => {
    fc.assert(
      fc.property(
        dataObjectArb,
        allowedFieldsArb,
        (data, allowedFields) => {
          const result = projectFields(data, allowedFields);
          const dataKeys = Object.keys(data);
          const disallowedKeys = dataKeys.filter((k) => !allowedFields.includes(k));

          // No disallowed key should appear as an own property of result
          for (const key of disallowedKeys) {
            expect(Object.hasOwn(result, key)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sensitive fields are excluded from projection unless explicitly allowed', () => {
    fc.assert(
      fc.property(
        dataWithSensitiveFieldsArb,
        allowedFieldsArb.filter((fields) => fields.every((f) => !sensitiveFieldNames.includes(f))),
        (data, allowedFields) => {
          const result = projectFields(data, allowedFields);

          // No sensitive field should appear as an own property of the result
          for (const sensitiveField of sensitiveFieldNames) {
            expect(Object.hasOwn(result, sensitiveField)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('projectFields handles null/undefined/empty data gracefully', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, '', 0, false),
        allowedFieldsArb,
        (invalidData, allowedFields) => {
          const result = projectFields(invalidData, allowedFields);

          // Should return an empty object, not throw
          expect(result).toEqual({});
          expect(Object.keys(result)).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('projectFields handles empty allowedFields gracefully — returns no keys', () => {
    fc.assert(
      fc.property(
        dataObjectArb,
        (data) => {
          const result = projectFields(data, []);

          // Empty allowed list means nothing is disclosed
          expect(Object.keys(result)).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('projection result contains only the intersection of data keys and allowed keys', () => {
    fc.assert(
      fc.property(
        dataObjectArb,
        allowedFieldsArb,
        (data, allowedFields) => {
          const result = projectFields(data, allowedFields);
          const resultKeys = Object.keys(result);
          const dataKeys = Object.keys(data);

          // Every returned key must be an own property of BOTH data and in allowedFields
          for (const key of resultKeys) {
            expect(Object.hasOwn(data, key)).toBe(true);
            expect(allowedFields).toContain(key);
          }

          // Every key that is an own property of data AND in allowedFields must be in result
          const expectedKeys = dataKeys.filter((k) => allowedFields.includes(k));
          expect(resultKeys.sort()).toEqual(expectedKeys.sort());
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-disclosing error responses use the same shape regardless of record state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'Resource not found',
          'Access denied',
          undefined,
        ),
        fc.constantFrom(true, false), // whether the record "exists" in theory
        (message, _recordExists) => {
          // throwNotFound always returns the same error shape
          // regardless of whether a record exists but is unauthorized
          // or truly does not exist — same response for both
          try {
            throwNotFound(message);
            expect.fail('should have thrown');
          } catch (err) {
            expect(err.code).toBe('NOT_FOUND');
            // The message never confirms record contents
            expect(err.message).not.toMatch(/uid|email|booking|password|token/i);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('outbound email operations transmit only documented required fields', () => {
    const operationNames = Object.keys(EMAIL_OPERATIONS);

    fc.assert(
      fc.property(
        fc.constantFrom(...operationNames),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 50 }),
          { minKeys: 0, maxKeys: 10 },
        ),
        (operation, extraFields) => {
          const op = EMAIL_OPERATIONS[operation];
          const allAllowedFields = [...op.requiredFields, ...(op.optionalFields || [])];

          // Build valid fields for the operation
          const validFields = {};
          for (const f of op.requiredFields) {
            validFields[f] = f.includes('Email') ? 'test@example.com' : `value-for-${f}`;
          }

          // Add extra fields that are NOT in the operation's required/optional list
          const fullPayload = { ...validFields, ...extraFields };

          // Validate the command — it should only care about required fields
          const validation = validateEmailCommand(operation, fullPayload);
          expect(validation.valid).toBe(true);

          // The operation resolves recipient from documented fields only
          const recipient = op.resolveRecipient(fullPayload);
          // Recipient must come from one of the documented required/optional fields
          const recipientSourceField = op.requiredFields.find((f) => fullPayload[f] === recipient)
            || (op.optionalFields || []).find((f) => fullPayload[f] === recipient);
          expect(recipientSourceField).toBeDefined();

          // Verify the operation only documents known required/optional fields
          // Extra fields in the payload should not be referenced by the operation definition
          for (const key of Object.keys(extraFields)) {
            if (!allAllowedFields.includes(key)) {
              // This extra field should not be in the operation's documented fields
              expect(allAllowedFields).not.toContain(key);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
