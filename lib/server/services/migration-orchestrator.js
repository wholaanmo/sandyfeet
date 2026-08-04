// lib/server/services/migration-orchestrator.js
// Stage-aware migration and rollback orchestrator.
// Encodes ordered gates with preconditions, reversible configuration,
// schema-version checks, and immutable discrepancy output.
// Rollback restores compatible adapters or policy modes — never browser-authoritative
// roles, privileged client writes, or destructive reversal of committed canonical data.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { MIGRATION_SCHEMA_VERSION } from './migration.js';

/**
 * Firestore document path for persisted migration state.
 */
export const MIGRATION_STATE_DOC = 'systemConfig/migrationState';

/**
 * Ordered migration stages.
 * Each stage must complete before the next may begin.
 */
export const STAGES = [
  {
    id: 'server-path',
    label: 'Server path establishment',
    preconditions: ['unit-tests-pass', 'property-tests-pass', 'server-bootstrap-healthy'],
    reversible: true,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  },
  {
    id: 'dry-run-backfill',
    label: 'Dry-run and backfill execution',
    preconditions: ['server-path-complete', 'dry-run-zero-discrepancies'],
    reversible: true,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation verification',
    preconditions: ['backfill-complete', 'reconciliation-zero-discrepancies'],
    reversible: true,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  },
  {
    id: 'rules-restriction',
    label: 'Firestore Rules restriction',
    preconditions: ['reconciliation-passed', 'integration-tests-pass'],
    reversible: true,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  },
  {
    id: 'client-writer-removal',
    label: 'Client writer removal',
    preconditions: ['rules-restriction-active', 'server-transactions-verified'],
    reversible: false,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  },
  {
    id: 'csp-enforcement',
    label: 'CSP enforcement activation',
    preconditions: ['client-writers-removed', 'csp-report-only-clean'],
    reversible: true,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  },
  {
    id: 'adapter-removal',
    label: 'Compatibility adapter removal',
    preconditions: ['csp-enforced', 'all-surfaces-migrated', 'browser-tests-pass'],
    reversible: false,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
  },
];

/**
 * Retrieve the current migration status from Firestore.
 *
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<{
 *   currentStage: string | null,
 *   stageIndex: number,
 *   completedStages: string[],
 *   preconditionsMet: Record<string, boolean>,
 *   schemaVersion: number,
 *   lastAdvancedAt: string | null,
 *   lastRolledBackAt: string | null
 * }>}
 */
export async function getMigrationStatus({ db = firestore } = {}) {
  const doc = await db.doc(MIGRATION_STATE_DOC).get();

  if (!doc.exists) {
    return {
      currentStage: null,
      stageIndex: -1,
      completedStages: [],
      preconditionsMet: {},
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      lastAdvancedAt: null,
      lastRolledBackAt: null,
    };
  }

  const data = doc.data();
  return {
    currentStage: data.currentStage || null,
    stageIndex: data.stageIndex ?? -1,
    completedStages: data.completedStages || [],
    preconditionsMet: data.preconditionsMet || {},
    schemaVersion: data.schemaVersion || MIGRATION_SCHEMA_VERSION,
    lastAdvancedAt: data.lastAdvancedAt || null,
    lastRolledBackAt: data.lastRolledBackAt || null,
  };
}

/**
 * Validate preconditions for the next stage.
 *
 * @param {string[]} requiredPreconditions — list of precondition keys required
 * @param {Record<string, boolean>} metPreconditions — map of met precondition flags
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validatePreconditions(requiredPreconditions, metPreconditions) {
  const missing = requiredPreconditions.filter(p => !metPreconditions[p]);
  return { valid: missing.length === 0, missing };
}

/**
 * Advance the migration to the next stage.
 * Validates that preconditions are met before advancing.
 *
 * @param {string | null} currentStage — current stage ID (null if not started)
 * @param {Record<string, boolean>} preconditionsMet — map of verified preconditions
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<{
 *   success: boolean,
 *   previousStage: string | null,
 *   newStage: string,
 *   error?: string,
 *   missingPreconditions?: string[]
 * }>}
 */
export async function advanceStage(currentStage, preconditionsMet, { db = firestore } = {}) {
  const currentIndex = currentStage
    ? STAGES.findIndex(s => s.id === currentStage)
    : -1;

  if (currentStage && currentIndex === -1) {
    return { success: false, previousStage: currentStage, newStage: '', error: `Unknown stage: ${currentStage}` };
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= STAGES.length) {
    return { success: false, previousStage: currentStage, newStage: '', error: 'Migration already at final stage' };
  }

  const nextStage = STAGES[nextIndex];
  const { valid, missing } = validatePreconditions(nextStage.preconditions, preconditionsMet);

  if (!valid) {
    return {
      success: false,
      previousStage: currentStage,
      newStage: nextStage.id,
      error: 'Preconditions not met',
      missingPreconditions: missing,
    };
  }

  // Check schema version compatibility
  if (nextStage.schemaVersion !== MIGRATION_SCHEMA_VERSION) {
    return {
      success: false,
      previousStage: currentStage,
      newStage: nextStage.id,
      error: `Schema version mismatch: expected ${MIGRATION_SCHEMA_VERSION}, stage requires ${nextStage.schemaVersion}`,
    };
  }

  const completedStages = currentStage
    ? [...(await getCompletedStages(db)), currentStage]
    : [];

  const stateUpdate = {
    currentStage: nextStage.id,
    stageIndex: nextIndex,
    completedStages,
    preconditionsMet,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    lastAdvancedAt: new Date().toISOString(),
    lastRolledBackAt: null,
  };

  await db.doc(MIGRATION_STATE_DOC).set(stateUpdate, { merge: true });

  return {
    success: true,
    previousStage: currentStage,
    newStage: nextStage.id,
  };
}

/**
 * Roll back one stage. Never performs unsafe reversal of committed canonical data.
 * Only stages marked as reversible can be rolled back.
 *
 * @param {string} currentStage — current stage ID to roll back from
 * @param {object} [options]
 * @param {object} [options.db] — Firestore instance (for testing)
 * @returns {Promise<{
 *   success: boolean,
 *   previousStage: string,
 *   newStage: string | null,
 *   error?: string
 * }>}
 */
export async function rollbackStage(currentStage, { db = firestore } = {}) {
  if (!currentStage) {
    return { success: false, previousStage: '', newStage: null, error: 'No stage to roll back from' };
  }

  const currentIndex = STAGES.findIndex(s => s.id === currentStage);
  if (currentIndex === -1) {
    return { success: false, previousStage: currentStage, newStage: null, error: `Unknown stage: ${currentStage}` };
  }

  const stage = STAGES[currentIndex];
  if (!stage.reversible) {
    return {
      success: false,
      previousStage: currentStage,
      newStage: null,
      error: `Stage '${currentStage}' is not reversible. Committed canonical data cannot be safely rolled back.`,
    };
  }

  const previousIndex = currentIndex - 1;
  const newStage = previousIndex >= 0 ? STAGES[previousIndex].id : null;

  const completedStages = await getCompletedStages(db);
  // Remove the current stage from completed if present
  const updatedCompleted = completedStages.filter(s => s !== currentStage);

  const stateUpdate = {
    currentStage: newStage,
    stageIndex: previousIndex,
    completedStages: updatedCompleted,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    lastRolledBackAt: new Date().toISOString(),
  };

  await db.doc(MIGRATION_STATE_DOC).set(stateUpdate, { merge: true });

  return {
    success: true,
    previousStage: currentStage,
    newStage,
  };
}

/**
 * Get the list of completed stages from persisted state.
 * @param {object} db — Firestore instance
 * @returns {Promise<string[]>}
 */
async function getCompletedStages(db) {
  const doc = await db.doc(MIGRATION_STATE_DOC).get();
  if (!doc.exists) return [];
  return doc.data().completedStages || [];
}

/**
 * Get stage definition by ID.
 * @param {string} stageId
 * @returns {typeof STAGES[number] | undefined}
 */
export function getStageDefinition(stageId) {
  return STAGES.find(s => s.id === stageId);
}

/**
 * Get the next stage definition after the given stage.
 * @param {string | null} currentStageId
 * @returns {typeof STAGES[number] | null}
 */
export function getNextStage(currentStageId) {
  const currentIndex = currentStageId
    ? STAGES.findIndex(s => s.id === currentStageId)
    : -1;
  const nextIndex = currentIndex + 1;
  return nextIndex < STAGES.length ? STAGES[nextIndex] : null;
}
