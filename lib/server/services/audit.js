// lib/server/services/audit.js
// Immutable server-derived audit event construction and persistence.
// NEVER trusts client actor/event fields — all context is server-derived.
// Audit records are immutable: no update or delete operations exist.
import 'server-only';

import { firestore } from '../firebase-admin.js';

/**
 * The Firestore collection for audit events.
 */
const AUDIT_COLLECTION = 'auditEvents';

/**
 * Current audit record schema version.
 */
const AUDIT_SCHEMA_VERSION = 1;

/**
 * Build an immutable audit event object from server-derived context.
 * This function is pure — it only constructs the event shape without persistence.
 * NEVER trusts client-supplied actor, timestamp, or event fields.
 *
 * @param {object} actor - Server-verified actor { uid, role }
 * @param {string} action - The action performed (e.g., 'reservation.create', 'payment.approve')
 * @param {object} target - The target of the action { type, id }
 * @param {object} [options] - Additional audit context
 * @param {object} [options.before] - State before the action (null for creates)
 * @param {object} [options.after] - State after the action
 * @param {string} [options.correlationId] - Correlation identifier for the operation
 * @param {string} [options.idempotencyKey] - Idempotency key for retry correlation
 * @param {string} [options.reason] - Business reason for the action (required for some privileged actions)
 * @returns {object} Immutable audit event object
 * @throws {Error} If required fields are missing
 */
export function buildAuditEvent(actor, action, target, options = {}) {
  // Validate required server-derived fields
  if (!actor || !actor.uid || typeof actor.uid !== 'string') {
    throw new Error('Audit event requires a verified actor with uid');
  }
  if (!actor.role || typeof actor.role !== 'string') {
    throw new Error('Audit event requires a verified actor role');
  }
  if (!action || typeof action !== 'string') {
    throw new Error('Audit event requires an action');
  }
  if (!target || !target.type || typeof target.type !== 'string') {
    throw new Error('Audit event requires a target type');
  }
  if (!target.id || typeof target.id !== 'string') {
    throw new Error('Audit event requires a target id');
  }

  const {
    before = null,
    after = null,
    correlationId,
    idempotencyKey,
    reason,
  } = options;

  // Validate correlationId is present (required for traceability)
  if (!correlationId || typeof correlationId !== 'string') {
    throw new Error('Audit event requires a correlationId');
  }

  const event = {
    actorUid: actor.uid,
    actorRole: actor.role,
    action,
    targetType: target.type,
    targetId: target.id,
    correlationId,
    occurredAt: new Date().toISOString(),
    before,
    after,
    schemaVersion: AUDIT_SCHEMA_VERSION,
  };

  // Optional fields — only included when present
  if (idempotencyKey && typeof idempotencyKey === 'string') {
    event.idempotencyKey = idempotencyKey;
  }
  if (reason && typeof reason === 'string') {
    event.reason = reason;
  }

  return Object.freeze(event);
}

/**
 * Write an audit event within a Firestore transaction.
 * Audit records are immutable — this service provides no update or delete operations.
 *
 * @param {FirebaseFirestore.Transaction} transaction - Active Firestore transaction
 * @param {object} event - The audit event object (from buildAuditEvent)
 * @throws {Error} If event is invalid or transaction is not provided
 */
export function writeAuditEvent(transaction, event) {
  if (!transaction || typeof transaction.set !== 'function') {
    throw new Error('writeAuditEvent requires an active Firestore transaction');
  }
  if (!event || !event.actorUid || !event.action || !event.targetType || !event.targetId) {
    throw new Error('writeAuditEvent requires a valid audit event');
  }
  if (!event.occurredAt || !event.correlationId) {
    throw new Error('writeAuditEvent requires occurredAt and correlationId');
  }

  const auditRef = firestore.collection(AUDIT_COLLECTION).doc();
  transaction.set(auditRef, event);
}

export { AUDIT_COLLECTION, AUDIT_SCHEMA_VERSION };
