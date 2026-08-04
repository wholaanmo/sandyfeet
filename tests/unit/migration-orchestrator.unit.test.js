// tests/unit/migration-orchestrator.unit.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Use vi.hoisted so the mock object is available before vi.mock hoists
const { mockDocs, mockFirestore } = vi.hoisted(() => {
  const mockDocs = new Map();
  const mockFirestore = {
    doc: (path) => ({
      get: async () => {
        const data = mockDocs.get(path);
        return {
          exists: !!data,
          data: () => data || {},
        };
      },
      set: async (value, options) => {
        const existing = mockDocs.get(path) || {};
        if (options?.merge) {
          mockDocs.set(path, { ...existing, ...value });
        } else {
          mockDocs.set(path, value);
        }
      },
    }),
    collection: () => ({}),
  };
  return { mockDocs, mockFirestore };
});

vi.mock('../../lib/server/firebase-admin.js', () => ({
  firestore: mockFirestore,
}));

// Mock the migration module to avoid its server-only import chain
vi.mock('../../lib/server/services/migration.js', () => ({
  MIGRATION_SCHEMA_VERSION: 1,
}));

import {
  STAGES,
  MIGRATION_STATE_DOC,
  getMigrationStatus,
  advanceStage,
  rollbackStage,
  validatePreconditions,
  getStageDefinition,
  getNextStage,
} from '../../lib/server/services/migration-orchestrator.js';

describe('Migration Orchestrator', () => {
  beforeEach(() => {
    mockDocs.clear();
  });

  describe('STAGES definition', () => {
    it('defines 7 ordered stages', () => {
      expect(STAGES).toHaveLength(7);
    });

    it('has unique stage IDs', () => {
      const ids = STAGES.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('defines the correct ordered gate sequence', () => {
      const ids = STAGES.map(s => s.id);
      expect(ids).toEqual([
        'server-path',
        'dry-run-backfill',
        'reconciliation',
        'rules-restriction',
        'client-writer-removal',
        'csp-enforcement',
        'adapter-removal',
      ]);
    });

    it('each stage has required fields', () => {
      for (const stage of STAGES) {
        expect(stage).toHaveProperty('id');
        expect(stage).toHaveProperty('label');
        expect(stage).toHaveProperty('preconditions');
        expect(stage).toHaveProperty('reversible');
        expect(stage).toHaveProperty('schemaVersion');
        expect(Array.isArray(stage.preconditions)).toBe(true);
        expect(typeof stage.reversible).toBe('boolean');
      }
    });

    it('client-writer-removal and adapter-removal are irreversible', () => {
      const clientWriter = STAGES.find(s => s.id === 'client-writer-removal');
      const adapterRemoval = STAGES.find(s => s.id === 'adapter-removal');
      expect(clientWriter.reversible).toBe(false);
      expect(adapterRemoval.reversible).toBe(false);
    });

    it('other stages are reversible', () => {
      const reversibleStages = STAGES.filter(
        s => s.id !== 'client-writer-removal' && s.id !== 'adapter-removal'
      );
      for (const stage of reversibleStages) {
        expect(stage.reversible).toBe(true);
      }
    });
  });

  describe('getMigrationStatus', () => {
    it('returns initial state when no document exists', async () => {
      const status = await getMigrationStatus({ db: mockFirestore });
      expect(status.currentStage).toBeNull();
      expect(status.stageIndex).toBe(-1);
      expect(status.completedStages).toEqual([]);
      expect(status.preconditionsMet).toEqual({});
      expect(status.lastAdvancedAt).toBeNull();
      expect(status.lastRolledBackAt).toBeNull();
    });

    it('returns persisted state from Firestore', async () => {
      mockDocs.set(MIGRATION_STATE_DOC, {
        currentStage: 'dry-run-backfill',
        stageIndex: 1,
        completedStages: ['server-path'],
        preconditionsMet: { 'server-path-complete': true },
        schemaVersion: 1,
        lastAdvancedAt: '2025-01-01T00:00:00.000Z',
        lastRolledBackAt: null,
      });

      const status = await getMigrationStatus({ db: mockFirestore });
      expect(status.currentStage).toBe('dry-run-backfill');
      expect(status.stageIndex).toBe(1);
      expect(status.completedStages).toEqual(['server-path']);
      expect(status.lastAdvancedAt).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('validatePreconditions', () => {
    it('returns valid when all preconditions met', () => {
      const result = validatePreconditions(
        ['a', 'b', 'c'],
        { a: true, b: true, c: true }
      );
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns invalid with missing preconditions', () => {
      const result = validatePreconditions(
        ['a', 'b', 'c'],
        { a: true, c: true }
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['b']);
    });

    it('handles empty preconditions', () => {
      const result = validatePreconditions([], {});
      expect(result.valid).toBe(true);
    });
  });

  describe('advanceStage', () => {
    it('advances from null to first stage when preconditions met', async () => {
      const preconditions = {
        'unit-tests-pass': true,
        'property-tests-pass': true,
        'server-bootstrap-healthy': true,
      };

      const result = await advanceStage(null, preconditions, { db: mockFirestore });
      expect(result.success).toBe(true);
      expect(result.previousStage).toBeNull();
      expect(result.newStage).toBe('server-path');
    });

    it('advances from one stage to the next', async () => {
      mockDocs.set(MIGRATION_STATE_DOC, {
        completedStages: [],
      });

      const preconditions = {
        'server-path-complete': true,
        'dry-run-zero-discrepancies': true,
      };

      const result = await advanceStage('server-path', preconditions, { db: mockFirestore });
      expect(result.success).toBe(true);
      expect(result.previousStage).toBe('server-path');
      expect(result.newStage).toBe('dry-run-backfill');
    });

    it('fails when preconditions not met', async () => {
      const preconditions = {
        'unit-tests-pass': true,
        // Missing property-tests-pass and server-bootstrap-healthy
      };

      const result = await advanceStage(null, preconditions, { db: mockFirestore });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Preconditions not met');
      expect(result.missingPreconditions).toContain('property-tests-pass');
      expect(result.missingPreconditions).toContain('server-bootstrap-healthy');
    });

    it('fails for unknown stage', async () => {
      const result = await advanceStage('nonexistent', {}, { db: mockFirestore });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown stage');
    });

    it('fails when already at final stage', async () => {
      mockDocs.set(MIGRATION_STATE_DOC, { completedStages: [] });

      const result = await advanceStage('adapter-removal', {}, { db: mockFirestore });
      expect(result.success).toBe(false);
      expect(result.error).toContain('final stage');
    });

    it('persists state to Firestore on success', async () => {
      const preconditions = {
        'unit-tests-pass': true,
        'property-tests-pass': true,
        'server-bootstrap-healthy': true,
      };

      await advanceStage(null, preconditions, { db: mockFirestore });

      const persisted = mockDocs.get(MIGRATION_STATE_DOC);
      expect(persisted.currentStage).toBe('server-path');
      expect(persisted.stageIndex).toBe(0);
      expect(persisted.lastAdvancedAt).toBeTruthy();
    });
  });

  describe('rollbackStage', () => {
    it('rolls back a reversible stage', async () => {
      mockDocs.set(MIGRATION_STATE_DOC, {
        currentStage: 'dry-run-backfill',
        stageIndex: 1,
        completedStages: ['server-path'],
      });

      const result = await rollbackStage('dry-run-backfill', { db: mockFirestore });
      expect(result.success).toBe(true);
      expect(result.previousStage).toBe('dry-run-backfill');
      expect(result.newStage).toBe('server-path');
    });

    it('rolls back the first stage to null', async () => {
      mockDocs.set(MIGRATION_STATE_DOC, {
        currentStage: 'server-path',
        stageIndex: 0,
        completedStages: [],
      });

      const result = await rollbackStage('server-path', { db: mockFirestore });
      expect(result.success).toBe(true);
      expect(result.newStage).toBeNull();
    });

    it('refuses to roll back irreversible stages', async () => {
      const result = await rollbackStage('client-writer-removal', { db: mockFirestore });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not reversible');
      expect(result.error).toContain('canonical data');
    });

    it('refuses to roll back adapter-removal', async () => {
      const result = await rollbackStage('adapter-removal', { db: mockFirestore });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not reversible');
    });

    it('fails for null stage', async () => {
      const result = await rollbackStage(null, { db: mockFirestore });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No stage to roll back');
    });

    it('fails for unknown stage', async () => {
      const result = await rollbackStage('fake-stage', { db: mockFirestore });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown stage');
    });

    it('persists rollback state to Firestore', async () => {
      mockDocs.set(MIGRATION_STATE_DOC, {
        currentStage: 'reconciliation',
        stageIndex: 2,
        completedStages: ['server-path', 'dry-run-backfill'],
      });

      await rollbackStage('reconciliation', { db: mockFirestore });

      const persisted = mockDocs.get(MIGRATION_STATE_DOC);
      expect(persisted.currentStage).toBe('dry-run-backfill');
      expect(persisted.stageIndex).toBe(1);
      expect(persisted.lastRolledBackAt).toBeTruthy();
    });
  });

  describe('getStageDefinition', () => {
    it('returns stage by ID', () => {
      const stage = getStageDefinition('server-path');
      expect(stage).toBeDefined();
      expect(stage.id).toBe('server-path');
      expect(stage.label).toBe('Server path establishment');
    });

    it('returns undefined for unknown stage', () => {
      const stage = getStageDefinition('nonexistent');
      expect(stage).toBeUndefined();
    });
  });

  describe('getNextStage', () => {
    it('returns first stage when current is null', () => {
      const next = getNextStage(null);
      expect(next.id).toBe('server-path');
    });

    it('returns next stage in sequence', () => {
      const next = getNextStage('server-path');
      expect(next.id).toBe('dry-run-backfill');
    });

    it('returns null when at last stage', () => {
      const next = getNextStage('adapter-removal');
      expect(next).toBeNull();
    });
  });
});
