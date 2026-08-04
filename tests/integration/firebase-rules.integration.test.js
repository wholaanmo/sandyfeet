import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { createTestActor, TEST_FIREBASE_PROJECT_ID } from '../fixtures/deterministic.js';

let testEnvironment;

describe('isolated Firebase Rules environment', () => {
  beforeAll(async () => {
    const rules = await readFile(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: TEST_FIREBASE_PROJECT_ID,
      firestore: { rules, host: '127.0.0.1', port: 8080 },
    });
  });

  afterEach(async () => testEnvironment.clearFirestore());
  afterAll(async () => testEnvironment.cleanup());

  it('uses deterministic actors and the deny-all baseline Rules', async () => {
    const actor = createTestActor(0, 'guest');
    const database = testEnvironment.authenticatedContext(actor.uid).firestore();

    await assertFails(setDoc(doc(database, 'verification', 'forbidden-write'), { actorUid: actor.uid }));
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080');
  });
});