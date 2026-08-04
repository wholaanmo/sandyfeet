import { defineConfig } from 'vitest/config';
import { sharedTestConfig, sharedTestEnv } from './vitest.shared.config.js';

export default defineConfig({
  test: {
    ...sharedTestConfig,
    name: 'unit',
    environment: 'jsdom',
    include: ['tests/unit/**/*.unit.test.{js,jsx}', '**/*.unit.test.{js,jsx}'],
    exclude: ['tests/property/**', 'tests/integration/**', 'tests/browser/**', '.history/**'],
    setupFiles: ['./tests/setup/unit.js'],
    env: { ...sharedTestEnv, TEST_SUITE: 'unit' },
  },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
});
