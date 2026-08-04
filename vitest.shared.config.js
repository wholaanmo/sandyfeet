export const sharedTestConfig = {
  globals: true,
  clearMocks: true,
  restoreMocks: true,
  mockReset: true,
  passWithNoTests: true,
  sequence: { shuffle: false },
  fileParallelism: false,
  maxWorkers: 1,
  reporters: ['default'],
  coverage: {
    provider: 'v8',
    reportsDirectory: 'coverage',
  },
};

export const sharedTestEnv = {
  NODE_ENV: 'test',
  TZ: 'UTC',
};
