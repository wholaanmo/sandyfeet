// Property 24: Audit events derive complete trusted context
// Validates: Requirements 7.9, 7.11

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock server-only (no-op)
vi.mock('server-only', () => ({}));

// Mock firebase-admin — audit service imports firestore for writeAuditEvent
vi.mock('../../lib/server/firebase-admin.js', () => ({
  firestore: {
    collection: () => ({
      doc: () => ({ id: 'mock-audit-doc-id', set: vi.fn() }),
    }),
  },
  auth: {},
}));

import { buildAuditEvent } from '../../lib/server/services/audit.js';

// --- Arbitraries ---

const uidArb = fc.string({ minLength: 3, maxLength: 40 }).filter((s) => s.trim().length > 0);
const roleArb = fc.constantFrom('admin', 'staff', 'guest');
const actionArb = fc
  .string({ minLength: 3, maxLength: 60 })
  .filter((s) => s.trim().length > 0);
const targetTypeArb = fc
  .string({ minLength: 2, maxLength: 30 })
  .filter((s) => s.trim().length > 0);
const targetIdArb = fc
  .string({ minLength: 3, maxLength: 40 })
  .filter((s) => s.trim().length > 0);
const correlationIdArb = fc
  .string({ minLength: 5, maxLength: 60 })
  .filter((s) => s.trim().length > 0);

const actorArb = fc.record({
  uid: uidArb,
  role: roleArb,
});

const targetArb = fc.record({
  type: targetTypeArb,
  id: targetIdArb,
});

const optionsArb = fc.record({
  correlationId: correlationIdArb,
  before: fc.constantFrom(null, { status: 'old' }, { amount: 100 }),
  after: fc.constantFrom(null, { status: 'new' }, { amount: 200 }),
  idempotencyKey: fc.option(fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0), { nil: undefined }),
  reason: fc.option(fc.string({ minLength: 3, maxLength: 100 }).filter((s) => s.trim().length > 0), { nil: undefined }),
});

describe('Property 24: Audit events derive complete trusted context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildAuditEvent always produces a frozen/immutable object', () => {
    fc.assert(
      fc.property(actorArb, actionArb, targetArb, optionsArb, (actor, action, target, options) => {
        const event = buildAuditEvent(actor, action, target, options);
        expect(Object.isFrozen(event)).toBe(true);

        // Attempting to mutate should silently fail (strict mode throws)
        expect(() => {
          event.actorUid = 'hacked';
        }).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('actorUid and actorRole always come from the actor param, never from client input', () => {
    fc.assert(
      fc.property(actorArb, actionArb, targetArb, optionsArb, (actor, action, target, options) => {
        const event = buildAuditEvent(actor, action, target, options);

        // actorUid must match actor.uid exactly
        expect(event.actorUid).toBe(actor.uid);
        // actorRole must match actor.role exactly
        expect(event.actorRole).toBe(actor.role);
      }),
      { numRuns: 100 },
    );
  });

  it('occurredAt is always a valid ISO 8601 date string', () => {
    fc.assert(
      fc.property(actorArb, actionArb, targetArb, optionsArb, (actor, action, target, options) => {
        const event = buildAuditEvent(actor, action, target, options);

        expect(typeof event.occurredAt).toBe('string');
        // Must parse to a valid Date
        const parsed = new Date(event.occurredAt);
        expect(parsed.toString()).not.toBe('Invalid Date');
        // Must be ISO format (contains T and Z or offset)
        expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }),
      { numRuns: 100 },
    );
  });

  it('correlationId is always present in the event', () => {
    fc.assert(
      fc.property(actorArb, actionArb, targetArb, optionsArb, (actor, action, target, options) => {
        const event = buildAuditEvent(actor, action, target, options);

        expect(typeof event.correlationId).toBe('string');
        expect(event.correlationId.length).toBeGreaterThan(0);
        expect(event.correlationId).toBe(options.correlationId);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects missing required fields', () => {
    fc.assert(
      fc.property(
        actorArb,
        actionArb,
        targetArb,
        correlationIdArb,
        fc.constantFrom('no-actor', 'no-uid', 'no-role', 'no-action', 'no-target-type', 'no-target-id', 'no-correlationId'),
        (actor, action, target, correlationId, missingField) => {
          const options = { correlationId };

          switch (missingField) {
            case 'no-actor':
              expect(() => buildAuditEvent(null, action, target, options)).toThrow();
              break;
            case 'no-uid':
              expect(() => buildAuditEvent({ role: actor.role }, action, target, options)).toThrow();
              break;
            case 'no-role':
              expect(() => buildAuditEvent({ uid: actor.uid }, action, target, options)).toThrow();
              break;
            case 'no-action':
              expect(() => buildAuditEvent(actor, '', target, options)).toThrow();
              break;
            case 'no-target-type':
              expect(() => buildAuditEvent(actor, action, { id: target.id }, options)).toThrow();
              break;
            case 'no-target-id':
              expect(() => buildAuditEvent(actor, action, { type: target.type }, options)).toThrow();
              break;
            case 'no-correlationId':
              expect(() => buildAuditEvent(actor, action, target, {})).toThrow();
              break;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('never includes client-supplied actor overrides in the output', () => {
    // Even if client tries to supply actorUid/actorRole in options, they must not appear
    const clientOverrideArb = fc.record({
      correlationId: correlationIdArb,
      actorUid: fc.constant('client-injected-uid'),
      actorRole: fc.constant('client-injected-role'),
      before: fc.constant(null),
      after: fc.constant(null),
    });

    fc.assert(
      fc.property(actorArb, actionArb, targetArb, clientOverrideArb, (actor, action, target, maliciousOptions) => {
        // Even if malicious fields are in options, buildAuditEvent derives from actor param
        const event = buildAuditEvent(actor, action, target, maliciousOptions);

        // The event MUST use the actor param values, not any client-supplied overrides
        expect(event.actorUid).toBe(actor.uid);
        expect(event.actorRole).toBe(actor.role);

        // Should NEVER be 'client-injected-uid' or 'client-injected-role'
        expect(event.actorUid).not.toBe('client-injected-uid');
        expect(event.actorRole).not.toBe('client-injected-role');
      }),
      { numRuns: 100 },
    );
  });
});
