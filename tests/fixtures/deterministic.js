export const DEFAULT_TEST_SEED = 424242;
export const TEST_FIREBASE_PROJECT_ID = 'demo-sandyfeet-test';

export function createSeededRandom(seed = DEFAULT_TEST_SEED) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function deterministicId(namespace, index, seed = DEFAULT_TEST_SEED) {
  const random = createSeededRandom(seed + index);
  const suffix = Math.floor(random() * 0xffff_ffff).toString(16).padStart(8, '0');
  return `${namespace}-${index}-${suffix}`;
}

export function createTestActor(index = 0, role = 'guest') {
  const uid = deterministicId(role, index);
  return Object.freeze({ uid, role, email: `${uid}@example.test`, status: 'active' });
}
