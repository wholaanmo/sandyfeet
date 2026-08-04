// lib/server/services/evidence.js
// Structured runtime evidence recording.
// Records verification evidence with pass/fail/unverified results,
// enforces required fields for unverified items, and redacts secrets.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { randomUUID } from 'node:crypto';

/**
 * Evidence collection name.
 */
export const EVIDENCE_COLLECTION = 'verificationEvidence';

/**
 * Valid evidence result values.
 */
export const VALID_RESULTS = ['passed', 'failed', 'unverified'];

/**
 * Valid evidence categories aligned with accessibility,
 * performance, and behavioral verification domains.
 */
export const VALID_CATEGORIES = [
  'keyboard',
  'screen-reader',
  'contrast',
  'reflow',
  'touch',
  'reduced-motion',
  'route-load',
  'interaction',
  'image',
  'layout-stability',
  'animation',
];

/**
 * Patterns that indicate secret/sensitive values to redact.
 */
const SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /credential/i,
  /authorization/i,
  /bearer/i,
  /session[_-]?id/i,
  /cookie/i,
];

/**
 * Values that look like secrets (long base64, hex strings, JWTs).
 */
const SECRET_VALUE_PATTERNS = [
  /^[A-Za-z0-9+/=]{32,}$/, // base64-like ≥32 chars
  /^[a-f0-9]{32,}$/i, // hex ≥32 chars
  /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, // JWT-like
];

/**
 * Redact secrets from an object recursively.
 * Replaces values that match secret key patterns or look like credentials.
 *
 * @param {any} value — input value to redact
 * @param {string} [key] — the current key name (for pattern matching)
 * @returns {any} — redacted copy
 */
export function redactSecrets(value, key = '') {
  if (value === null || value === undefined) return value;

  // Check if the key itself suggests a secret
  if (key && SECRET_PATTERNS.some(p => p.test(key))) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    // Check if the value looks like a secret
    if (SECRET_VALUE_PATTERNS.some(p => p.test(value))) {
      return '[REDACTED]';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => redactSecrets(item, String(i)));
  }

  if (typeof value === 'object') {
    const redacted = {};
    for (const [k, v] of Object.entries(value)) {
      redacted[k] = redactSecrets(v, k);
    }
    return redacted;
  }

  return value;
}

/**
 * Validate evidence record input.
 *
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEvidence(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Evidence must be an object'] };
  }

  const { category, result, environment, tool, metadata } = input;

  // Category validation
  if (!category || !VALID_CATEGORIES.includes(category)) {
    errors.push(`Invalid category '${category}'. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  // Result validation
  if (!result || !VALID_RESULTS.includes(result)) {
    errors.push(`Invalid result '${result}'. Must be one of: ${VALID_RESULTS.join(', ')}`);
  }

  // Environment validation
  if (!environment || typeof environment !== 'string') {
    errors.push('Environment is required and must be a string');
  }

  // Tool validation
  if (!tool || typeof tool !== 'string') {
    errors.push('Tool is required and must be a string');
  }

  // Unverified requires additional fields
  if (result === 'unverified') {
    const requiredUnverifiedFields = ['blocker', 'dependency', 'owner', 'followUp'];
    const missingFields = requiredUnverifiedFields.filter(f => !input[f] && !(metadata && metadata[f]));
    if (missingFields.length > 0) {
      errors.push(`Unverified evidence requires: ${missingFields.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Record a verification evidence entry.
 *
 * @param {object} input
 * @param {string} input.category — evidence category (see VALID_CATEGORIES)
 * @param {'passed' | 'failed' | 'unverified'} input.result — verification result
 * @param {string} input.environment — environment identifier (e.g., 'ci', 'staging', 'local')
 * @param {string} input.tool — tool/method used for verification
 * @param {object} [input.metadata] — additional metadata (will be redacted)
 * @param {string} [input.blocker] — required for 'unverified': what's blocking
 * @param {string} [input.dependency] — required for 'unverified': external dependency
 * @param {string} [input.owner] — required for 'unverified': responsible owner
 * @param {string} [input.followUp] — required for 'unverified': follow-up action
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<{
 *   success: boolean,
 *   id: string | null,
 *   errors?: string[],
 *   record?: object
 * }>}
 */
export async function recordEvidence(input, { db = firestore } = {}) {
  const validation = validateEvidence(input);
  if (!validation.valid) {
    return { success: false, id: null, errors: validation.errors };
  }

  const { category, result, environment, tool, metadata, blocker, dependency, owner, followUp } = input;

  // Build the evidence record with redacted metadata
  const evidenceRecord = {
    id: randomUUID(),
    category,
    result,
    environment,
    tool,
    metadata: metadata ? redactSecrets(metadata) : {},
    recordedAt: new Date().toISOString(),
    schemaVersion: 1,
  };

  // Include unverified-required fields if present
  if (result === 'unverified') {
    evidenceRecord.blocker = blocker || (metadata && metadata.blocker) || '';
    evidenceRecord.dependency = dependency || (metadata && metadata.dependency) || '';
    evidenceRecord.owner = owner || (metadata && metadata.owner) || '';
    evidenceRecord.followUp = followUp || (metadata && metadata.followUp) || '';
  }

  // Persist to Firestore
  await db.collection(EVIDENCE_COLLECTION).doc(evidenceRecord.id).set(evidenceRecord);

  return {
    success: true,
    id: evidenceRecord.id,
    record: evidenceRecord,
  };
}

/**
 * Retrieve evidence records for a given category.
 *
 * @param {string} category — evidence category
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @param {number} [options.limit] — max records to return
 * @returns {Promise<object[]>}
 */
export async function getEvidenceByCategory(category, { db = firestore, limit = 100 } = {}) {
  if (!VALID_CATEGORIES.includes(category)) return [];

  const snapshot = await db
    .collection(EVIDENCE_COLLECTION)
    .where('category', '==', category)
    .orderBy('recordedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data());
}

/**
 * Retrieve evidence summary grouped by category.
 *
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<Record<string, { passed: number, failed: number, unverified: number }>>}
 */
export async function getEvidenceSummary({ db = firestore } = {}) {
  const snapshot = await db.collection(EVIDENCE_COLLECTION).get();

  const summary = {};
  for (const cat of VALID_CATEGORIES) {
    summary[cat] = { passed: 0, failed: 0, unverified: 0 };
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (summary[data.category] && VALID_RESULTS.includes(data.result)) {
      summary[data.category][data.result]++;
    }
  }

  return summary;
}
