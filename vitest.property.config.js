import { defineConfig } from 'vitest/config';
import { sharedTestConfig, sharedTestEnv } from './vitest.shared.config.js';

export default defineConfig({
  test: {
    ...sharedTestConfig,
    name: 'property',
    environment: 'node',
    include: ['tests/property/**/*.property.test.js', '**/*.property.test.js'],
    exclude: ['tests/unit/**', 'tests/integration/**', 'tests/browser/**', '.history/**'],
    setupFiles: ['./tests/setup/property.js'],
    env: { ...sharedTestEnv, TEST_SUITE: 'property' },
    testTimeout: 30_000,
  },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
});
