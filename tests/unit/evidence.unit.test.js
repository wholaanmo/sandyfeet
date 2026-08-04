// tests/unit/evidence.unit.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Use vi.hoisted for mock Firestore
const { mockStore, mockFirestore } = vi.hoisted(() => {
  const mockStore = new Map();
  const mockFirestore = {
    collection: (name) => ({
      doc: (id) => ({
        set: async (data) => {
          mockStore.set(`${name}/${id}`, data);
        },
        get: async () => {
          const data = mockStore.get(`${name}/${id}`);
          return { exists: !!data, data: () => data };
        },
      }),
      where: () => ({
        orderBy: () => ({
          limit: () => ({
            get: async () => ({
              docs: [...mockStore.entries()]
                .filter(([k]) => k.startsWith(`${name}/`))
                .map(([k, v]) => ({ id: k.split('/')[1], data: () => v })),
            }),
          }),
        }),
      }),
      get: async () => ({
        docs: [...mockStore.entries()]
          .filter(([k]) => k.startsWith(`${name}/`))
          .map(([k, v]) => ({ id: k.split('/')[1], data: () => v })),
      }),
    }),
  };
  return { mockStore, mockFirestore };
});

vi.mock('../../lib/server/firebase-admin.js', () => ({
  firestore: mockFirestore,
}));

import {
  VALID_CATEGORIES,
  VALID_RESULTS,
  validateEvidence,
  redactSecrets,
  recordEvidence,
} from '../../lib/server/services/evidence.js';

describe('Evidence Service', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  describe('VALID_CATEGORIES', () => {
    it('defines all required categories', () => {
      const expected = [
        'keyboard', 'screen-reader', 'contrast', 'reflow', 'touch',
        'reduced-motion', 'route-load', 'interaction', 'image',
        'layout-stability', 'animation',
      ];
      expect(VALID_CATEGORIES).toEqual(expected);
    });
  });

  describe('VALID_RESULTS', () => {
    it('supports passed, failed, and unverified', () => {
      expect(VALID_RESULTS).toEqual(['passed', 'failed', 'unverified']);
    });
  });

  describe('validateEvidence', () => {
    it('accepts valid passed evidence', () => {
      const result = validateEvidence({
        category: 'keyboard',
        result: 'passed',
        environment: 'ci',
        tool: 'playwright',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects invalid category', () => {
      const result = validateEvidence({
        category: 'invalid',
        result: 'passed',
        environment: 'ci',
        tool: 'playwright',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid category');
    });

    it('rejects invalid result', () => {
      const result = validateEvidence({
        category: 'keyboard',
        result: 'maybe',
        environment: 'ci',
        tool: 'playwright',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid result');
    });

    it('requires additional fields for unverified result', () => {
      const result = validateEvidence({
        category: 'keyboard',
        result: 'unverified',
        environment: 'ci',
        tool: 'manual',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('blocker');
      expect(result.errors[0]).toContain('dependency');
      expect(result.errors[0]).toContain('owner');
      expect(result.errors[0]).toContain('followUp');
    });

    it('accepts unverified with required fields', () => {
      const result = validateEvidence({
        category: 'screen-reader',
        result: 'unverified',
        environment: 'local',
        tool: 'manual',
        blocker: 'No screen reader available',
        dependency: 'NVDA license',
        owner: 'a11y-team',
        followUp: 'Schedule manual testing session',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects non-object input', () => {
      const result = validateEvidence(null);
      expect(result.valid).toBe(false);
    });

    it('requires environment', () => {
      const result = validateEvidence({
        category: 'keyboard',
        result: 'passed',
        environment: '',
        tool: 'playwright',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Environment'))).toBe(true);
    });

    it('requires tool', () => {
      const result = validateEvidence({
        category: 'keyboard',
        result: 'passed',
        environment: 'ci',
        tool: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Tool'))).toBe(true);
    });
  });

  describe('redactSecrets', () => {
    it('redacts keys matching secret patterns', () => {
      const input = { password: 'mysecret', username: 'user1' };
      const result = redactSecrets(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.username).toBe('user1');
    });

    it('redacts api_key fields', () => {
      const input = { api_key: 'abc123def456', name: 'test' };
      const result = redactSecrets(input);
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.name).toBe('test');
    });

    it('redacts JWT-like values', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.signature123';
      const input = { data: jwt };
      const result = redactSecrets(input);
      expect(result.data).toBe('[REDACTED]');
    });

    it('redacts long base64 values', () => {
      const longBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
      const input = { key: longBase64 };
      const result = redactSecrets(input);
      expect(result.key).toBe('[REDACTED]');
    });

    it('preserves normal string values', () => {
      const input = { message: 'Hello world', count: 42 };
      const result = redactSecrets(input);
      expect(result.message).toBe('Hello world');
      expect(result.count).toBe(42);
    });

    it('handles nested objects', () => {
      const input = {
        config: {
          token: 'secret123',
          host: 'localhost',
        },
      };
      const result = redactSecrets(input);
      expect(result.config.token).toBe('[REDACTED]');
      expect(result.config.host).toBe('localhost');
    });

    it('handles arrays', () => {
      const input = { items: ['safe', 'also-safe'] };
      const result = redactSecrets(input);
      expect(result.items).toEqual(['safe', 'also-safe']);
    });

    it('handles null and undefined', () => {
      expect(redactSecrets(null)).toBeNull();
      expect(redactSecrets(undefined)).toBeUndefined();
    });
  });

  describe('recordEvidence', () => {
    it('records valid evidence and returns success', async () => {
      const result = await recordEvidence(
        {
          category: 'keyboard',
          result: 'passed',
          environment: 'ci',
          tool: 'playwright',
          metadata: { test: 'focus-trap' },
        },
        { db: mockFirestore }
      );

      expect(result.success).toBe(true);
      expect(result.id).toBeTruthy();
      expect(result.record.category).toBe('keyboard');
      expect(result.record.result).toBe('passed');
      expect(result.record.recordedAt).toBeTruthy();
    });

    it('rejects invalid evidence', async () => {
      const result = await recordEvidence(
        { category: 'invalid', result: 'maybe', environment: '', tool: '' },
        { db: mockFirestore }
      );

      expect(result.success).toBe(false);
      expect(result.id).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('redacts secrets in metadata', async () => {
      const result = await recordEvidence(
        {
          category: 'route-load',
          result: 'passed',
          environment: 'staging',
          tool: 'vitest',
          metadata: { secret_key: 'should-be-hidden', route: '/dashboard' },
        },
        { db: mockFirestore }
      );

      expect(result.success).toBe(true);
      expect(result.record.metadata.secret_key).toBe('[REDACTED]');
      expect(result.record.metadata.route).toBe('/dashboard');
    });

    it('includes unverified fields when result is unverified', async () => {
      const result = await recordEvidence(
        {
          category: 'screen-reader',
          result: 'unverified',
          environment: 'local',
          tool: 'manual',
          blocker: 'No screen reader',
          dependency: 'NVDA',
          owner: 'a11y-team',
          followUp: 'Schedule testing',
        },
        { db: mockFirestore }
      );

      expect(result.success).toBe(true);
      expect(result.record.blocker).toBe('No screen reader');
      expect(result.record.dependency).toBe('NVDA');
      expect(result.record.owner).toBe('a11y-team');
      expect(result.record.followUp).toBe('Schedule testing');
    });
  });
});
