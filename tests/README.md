# Verification suites

- `unit/**/*.unit.test.{js,jsx}` runs in jsdom with Testing Library, user-event, and jest-axe available.
- `property/**/*.property.test.js` runs in Node with fast-check seed `424242` by default. Override with `FC_SEED`, `FC_PATH`, or `FC_NUM_RUNS`; failures are retained under `.test-results/property/` with a replay command.
- `integration/**/*.integration.test.js` runs only against the Auth and Firestore emulators using project `demo-sandyfeet-test`.
- `browser/**/*.spec.js` runs through Playwright against a production Next.js server started by `playwright.config.js`.

Fixtures must be deterministic and must use `.test` addresses, demo Firebase projects, and non-secret placeholder values. External services use bounded deterministic fakes in unit/property tests and representative failures or one to three explicit configured examples in integration tests.
