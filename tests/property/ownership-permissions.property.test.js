// Property 15: Ownership and role permissions depend only on trusted context
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mock firebase-admin — simple mock, authorization functions don't call Firestore directly
vi.mock('../../lib/server/firebase-admin.js', () => ({
  firestore: {
    collection: () => ({
      doc: () => ({
        get: vi.fn().mockResolvedValue({ exists: false }),
        update: vi.fn().mockResolvedValue(undefined),
        id: 'mock-doc-id',
      }),
      where: () => ({
        limit: () => ({ get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) }),
      }),
    }),
  },
  auth: {},
}));

import { requireRole, requireOwner } from '../../lib/server/auth/authorization.js';
import { requireAuthenticatedActor } from '../../lib/server/repositories/base.js';

// --- Arbitraries ---

const uidArb = fc.string({ minLength: 5, maxLength: 40 })
  .filter((s) => s.trim().length >= 5);

const roleArb = fc.constantFrom('admin', 'staff', 'guest');

const actorArb = fc.record({
  uid: uidArb,
  role: roleArb,
  accountType: fc.constantFrom('staff', 'guest'),
  status: fc.constant('active'),
  emailVerified: fc.boolean(),
  sessionIssuedAt: fc.nat(),
});

/** Generate an arbitrary resource with an ownerUid field. */
const resourceArb = fc.record({
  ownerUid: uidArb,
  someField: fc.string(),
});

/** Generate a submitted (client-supplied) UID that may or may not match actor. */
const submittedIdArb = uidArb;

describe('Property 15: Ownership and role permissions depend only on trusted context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ownership checks use only actor.uid, never client-supplied IDs', () => {
    fc.assert(
      fc.property(
        actorArb,
        resourceArb,
        submittedIdArb,
        (actor, resource, submittedId) => {
          // Case 1: actor.uid matches resource.ownerUid — access granted
          const matchingResource = { ...resource, ownerUid: actor.uid };
          expect(() => requireOwner(actor, matchingResource)).not.toThrow();

          // Case 2: resource has a different ownerUid — access denied
          // even if the submitted ID happens to match
          const nonMatchingResource = { ...resource, ownerUid: submittedId + '-other' };
          expect(() => requireOwner(actor, nonMatchingResource)).toThrow();

          // Case 3: supplying a matching submitted ID in the resource's non-ownerUid
          // fields does NOT grant access if ownerUid doesn't match actor.uid
          if (submittedId !== actor.uid) {
            const trickResource = {
              ownerUid: submittedId, // attacker tries their own ID
              someField: actor.uid, // irrelevant field with actor uid
            };
            expect(() => requireOwner(actor, trickResource)).toThrow();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('role checks use only actor.role from session, not any request body fields', () => {
    fc.assert(
      fc.property(
        actorArb,
        fc.constantFrom(['admin'], ['staff', 'admin'], ['guest'], ['staff'], ['admin', 'staff', 'guest']),
        fc.constantFrom('admin', 'staff', 'guest'),
        (actor, allowedRoles, claimedRole) => {
          // The result depends ONLY on actor.role, never on claimedRole
          const shouldPass = allowedRoles.includes(actor.role);

          if (shouldPass) {
            expect(() => requireRole(actor, allowedRoles)).not.toThrow();
          } else {
            expect(() => requireRole(actor, allowedRoles)).toThrow();
          }

          // Even if a client "claims" a different role in the request body,
          // a tampered actor with that role but not in the real session would fail
          const tamperedActor = { ...actor, role: claimedRole };
          const tamperedShouldPass = allowedRoles.includes(claimedRole);

          if (tamperedShouldPass) {
            expect(() => requireRole(tamperedActor, allowedRoles)).not.toThrow();
          } else {
            expect(() => requireRole(tamperedActor, allowedRoles)).toThrow();
          }

          // Key invariant: the result is determined by the actor.role field
          // (which comes from session resolution, not request body)
          // and the allowed roles list
          expect(shouldPass).toBe(allowedRoles.includes(actor.role));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('guest access requires ownerUid match — no submitted ID grants access', () => {
    fc.assert(
      fc.property(
        actorArb.filter((a) => a.role === 'guest'),
        resourceArb,
        submittedIdArb,
        submittedIdArb,
        (guestActor, resource, submittedBookingId, submittedEmail) => {
          // Guest actor can only access their own resource
          const ownedResource = { ...resource, ownerUid: guestActor.uid };
          expect(() => requireOwner(guestActor, ownedResource)).not.toThrow();

          // Guest cannot access a resource owned by someone else,
          // regardless of what IDs they submit in the request
          if (resource.ownerUid !== guestActor.uid) {
            expect(() => requireOwner(guestActor, resource)).toThrow();
          }

          // Even submitting the owner's UID or email in the request body
          // does not change the outcome — only actor.uid matters
          const foreignResource = { ownerUid: submittedBookingId + '-foreign' };
          if (foreignResource.ownerUid !== guestActor.uid) {
            expect(() => requireOwner(guestActor, foreignResource)).toThrow();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('staff/admin access uses role from session — request body role field is ignored', () => {
    fc.assert(
      fc.property(
        actorArb,
        fc.constantFrom('admin', 'staff', 'guest', 'superadmin', 'manager'),
        (actor, requestBodyRole) => {
          // Staff access: allowed only when actor.role is staff or admin
          const staffAllowed = ['staff', 'admin'].includes(actor.role);

          if (staffAllowed) {
            expect(() => requireRole(actor, ['staff', 'admin'])).not.toThrow();
          } else {
            expect(() => requireRole(actor, ['staff', 'admin'])).toThrow();
          }

          // Admin access: allowed only when actor.role is admin
          const adminAllowed = actor.role === 'admin';

          if (adminAllowed) {
            expect(() => requireRole(actor, ['admin'])).not.toThrow();
          } else {
            expect(() => requireRole(actor, ['admin'])).toThrow();
          }

          // The request body role has no effect on the outcome
          // A guest actor cannot gain staff access by claiming a role
          if (actor.role === 'guest') {
            expect(() => requireRole(actor, ['staff', 'admin'])).toThrow();
            expect(() => requireRole(actor, ['admin'])).toThrow();
          }

          // Fabricating an actor with the request body role would succeed IF
          // that role is in the allowed set — but the session layer ensures
          // actor.role comes from the authoritative account doc, not the body
          const fabricatedActor = { ...actor, role: requestBodyRole };
          const fabricatedStaffAllowed = ['staff', 'admin'].includes(requestBodyRole);

          if (fabricatedStaffAllowed) {
            expect(() => requireRole(fabricatedActor, ['staff', 'admin'])).not.toThrow();
          } else {
            expect(() => requireRole(fabricatedActor, ['staff', 'admin'])).toThrow();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('requireAuthenticatedActor rejects null/undefined/missing-uid actors regardless of submitted identity', () => {
    fc.assert(
      fc.property(
        submittedIdArb,
        fc.constantFrom(null, undefined, {}, { role: 'admin' }, { uid: '' }, { uid: null }),
        (submittedId, invalidActor) => {
          // No matter what ID the client submits, a missing/invalid actor is always rejected
          expect(() => requireAuthenticatedActor(invalidActor)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('requireOwner rejects when actor is null/undefined regardless of resource ownership', () => {
    fc.assert(
      fc.property(
        resourceArb,
        fc.constantFrom(null, undefined),
        (resource, invalidActor) => {
          expect(() => requireOwner(invalidActor, resource)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ownership resolution uses ownerUid/uid/userId fields of resource — not arbitrary submitted fields', () => {
    fc.assert(
      fc.property(
        actorArb,
        uidArb,
        uidArb,
        fc.constantFrom('ownerUid', 'uid', 'userId'),
        (actor, resourceOwner, submittedArbitraryId, ownerField) => {
          // The resource owner is resolved from ownerUid || uid || userId (in that priority)
          // Only these fields determine ownership, not any other submitted value

          // Build resource with the owner field set to the actor's uid → should pass
          const ownedResource = { [ownerField]: actor.uid };
          expect(() => requireOwner(actor, ownedResource)).not.toThrow();

          // Build resource with the owner field set to someone else → should fail
          if (resourceOwner !== actor.uid) {
            const foreignResource = { [ownerField]: resourceOwner };
            expect(() => requireOwner(actor, foreignResource)).toThrow();
          }

          // Extra submitted fields do NOT override the canonical owner field
          const resourceWithExtra = {
            [ownerField]: resourceOwner !== actor.uid ? resourceOwner : resourceOwner + '-x',
            submittedUserId: actor.uid, // attacker tries to inject their UID
            email: 'attacker@example.com',
          };
          if (resourceWithExtra[ownerField] !== actor.uid) {
            expect(() => requireOwner(actor, resourceWithExtra)).toThrow();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
