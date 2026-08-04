import { defineConfig } from 'vitest/config';
import { sharedTestConfig, sharedTestEnv } from './vitest.shared.config.js';

export default defineConfig({
  test: {
    ...sharedTestConfig,
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.js'],
    exclude: ['tests/unit/**', 'tests/property/**', 'tests/browser/**', '.history/**'],
    setupFiles: ['./tests/setup/integration.js'],
    env: {
      ...sharedTestEnv,
      TEST_SUITE: 'integration',
      GCLOUD_PROJECT: 'demo-sandyfeet-test',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
});
