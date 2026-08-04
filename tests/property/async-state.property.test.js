// Property 28: Async phases are distinct and time-correct
// Property 29: Async failure and retry preserve usable state
// Property 30: Async mutations de-duplicate and reconcile effects
// Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.8, 13.9, 13.10, 15.14

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  asyncReducer,
  createInitialState,
  ASYNC_PHASES,
  ASYNC_ACTIONS,
  PENDING_DELAY_MS,
} from '../../lib/client/async/reducer.js';
import { reconcileAfterNavigation } from '../../lib/client/async/reconciliation.js';

// --- Arbitraries ---

/** Generate a valid action type */
const actionTypeArb = fc.constantFrom(...Object.values(ASYNC_ACTIONS));

/** Generate a timestamp */
const timestampArb = fc.nat({ max: 2_000_000_000_000 });

/** Generate an idempotency key */
const idempotencyKeyArb = fc.oneof(fc.uuid(), fc.string({ minLength: 1, maxLength: 30 }));

/** Generate an input snapshot (non-null object representing user form data) */
const inputSnapshotArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  { minKeys: 1, maxKeys: 5 },
);

/** Generate data payload */
const dataArb = fc.oneof(
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    { minKeys: 0, maxKeys: 5 },
  ),
  fc.array(fc.integer(), { minLength: 0, maxLength: 5 }),
  fc.string(),
  fc.integer(),
);

/** Generate a well-formed action with appropriate fields for its type */
const asyncActionArb = fc.oneof(
  // SUBMIT
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.SUBMIT),
    inputSnapshot: fc.option(inputSnapshotArb, { nil: undefined }),
    idempotencyKey: fc.option(idempotencyKeyArb, { nil: undefined }),
    timestamp: timestampArb,
  }),
  // SHOW_LOADING
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.SHOW_LOADING),
  }),
  // SUCCESS
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.SUCCESS),
    data: fc.option(dataArb, { nil: undefined }),
    message: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    affectedKeys: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 1, maxLength: 3 }), { nil: undefined }),
  }),
  // EMPTY
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.EMPTY),
    message: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  }),
  // PARTIAL
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.PARTIAL),
    data: fc.option(dataArb, { nil: undefined }),
    message: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    retryable: fc.option(fc.boolean(), { nil: undefined }),
  }),
  // ERROR
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.ERROR),
    message: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    retryable: fc.option(fc.boolean(), { nil: undefined }),
    fieldErrors: fc.option(
      fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ minLength: 1, maxLength: 30 }), { minKeys: 1, maxKeys: 3 }),
      { nil: undefined },
    ),
    inputSnapshot: fc.option(inputSnapshotArb, { nil: undefined }),
    errorKind: fc.option(fc.constantFrom('route_error', 'not_found', 'network', 'validation', 'generic'), { nil: undefined }),
  }),
  // RETRY
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.RETRY),
    timestamp: timestampArb,
  }),
  // RECONCILE
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.RECONCILE),
    timestamp: timestampArb,
  }),
  // RESET
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.RESET),
  }),
  // INVALIDATE
  fc.record({
    type: fc.constant(ASYNC_ACTIONS.INVALIDATE),
    affectedKeys: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 1, maxLength: 3 }), { nil: undefined }),
  }),
);

/** Generate a sequence of actions */
const actionSequenceArb = fc.array(asyncActionArb, { minLength: 1, maxLength: 15 });

// All valid phases
const ALL_PHASES = Object.values(ASYNC_PHASES);

// --- Property 28: Async phases are distinct and time-correct ---

describe('Property 28: Async phases are distinct and time-correct', () => {
  it('reducer always produces exactly one valid phase for any action sequence', () => {
    fc.assert(
      fc.property(actionSequenceArb, (actions) => {
        let state = createInitialState();

        for (const action of actions) {
          state = asyncReducer(state, action);

          // Exactly one phase must be set
          expect(state.phase).toBeDefined();
          expect(ALL_PHASES).toContain(state.phase);

          // The phase field is the only phase indicator — no secondary phase flags
          const phaseCount = ALL_PHASES.filter((p) => state.phase === p).length;
          expect(phaseCount).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('PENDING_DELAY_MS is exactly 300ms', () => {
    expect(PENDING_DELAY_MS).toBe(300);
  });

  it('showLoading is only true when phase is pending and SHOW_LOADING was dispatched', () => {
    fc.assert(
      fc.property(actionSequenceArb, (actions) => {
        let state = createInitialState();
        let showLoadingDispatchedWhilePending = false;

        for (const action of actions) {
          const prevState = state;
          state = asyncReducer(state, action);

          // If the state reference changed (action was not a no-op) and we entered/re-entered
          // pending, then showLoading resets because the reducer sets showLoading=false
          if (state !== prevState) {
            if (
              action.type === ASYNC_ACTIONS.SUBMIT ||
              action.type === ASYNC_ACTIONS.RETRY ||
              action.type === ASYNC_ACTIONS.RECONCILE ||
              action.type === ASYNC_ACTIONS.RESET
            ) {
              showLoadingDispatchedWhilePending = false;
            }

            // SHOW_LOADING only takes effect when phase is pending and state changed
            if (action.type === ASYNC_ACTIONS.SHOW_LOADING && state.phase === ASYNC_PHASES.PENDING) {
              showLoadingDispatchedWhilePending = true;
            }
          }

          if (state.showLoading === true) {
            // showLoading can only be true if phase is pending AND SHOW_LOADING was dispatched while pending
            expect(state.phase).toBe(ASYNC_PHASES.PENDING);
            expect(showLoadingDispatchedWhilePending).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('empty phase is only reachable via EMPTY action (successful collection with zero records)', () => {
    fc.assert(
      fc.property(actionSequenceArb, (actions) => {
        let state = createInitialState();
        let emptyActionSeen = false;

        for (const action of actions) {
          if (action.type === ASYNC_ACTIONS.EMPTY) {
            emptyActionSeen = true;
          }
          state = asyncReducer(state, action);
        }

        if (state.phase === ASYNC_PHASES.EMPTY) {
          expect(emptyActionSeen).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 29: Async failure and retry preserve usable state ---

describe('Property 29: Async failure and retry preserve usable state', () => {
  it('after ERROR action, inputSnapshot is preserved from the prior SUBMIT', () => {
    fc.assert(
      fc.property(inputSnapshotArb, idempotencyKeyArb, timestampArb, (snapshot, key, ts) => {
        // Submit with an inputSnapshot
        let state = createInitialState();
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          inputSnapshot: snapshot,
          idempotencyKey: key,
          timestamp: ts,
        });

        // Error occurs — inputSnapshot must be preserved
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.ERROR,
          message: 'Network failure',
          retryable: true,
        });

        expect(state.phase).toBe(ASYNC_PHASES.ERROR);
        expect(state.inputSnapshot).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });

  it('after RETRY, idempotencyKey is preserved from the original SUBMIT', () => {
    fc.assert(
      fc.property(
        inputSnapshotArb,
        idempotencyKeyArb,
        timestampArb,
        timestampArb,
        (snapshot, key, submitTs, retryTs) => {
          // Submit with idempotency key
          let state = createInitialState();
          state = asyncReducer(state, {
            type: ASYNC_ACTIONS.SUBMIT,
            inputSnapshot: snapshot,
            idempotencyKey: key,
            timestamp: submitTs,
          });

          // Error occurs
          state = asyncReducer(state, {
            type: ASYNC_ACTIONS.ERROR,
            message: 'Server error',
            retryable: true,
          });

          // Retry — idempotency key must be preserved
          state = asyncReducer(state, {
            type: ASYNC_ACTIONS.RETRY,
            timestamp: retryTs,
          });

          expect(state.phase).toBe(ASYNC_PHASES.PENDING);
          expect(state.idempotencyKey).toBe(key);
          expect(state.inputSnapshot).toEqual(snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('retryable flag matches exactly what was provided in the ERROR action', () => {
    fc.assert(
      fc.property(fc.boolean(), timestampArb, (retryableFlag, ts) => {
        let state = createInitialState();
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: ts,
        });

        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.ERROR,
          message: 'Something went wrong',
          retryable: retryableFlag,
        });

        expect(state.phase).toBe(ASYNC_PHASES.ERROR);
        expect(state.retryable).toBe(retryableFlag);
      }),
      { numRuns: 100 },
    );
  });

  it('primary data is preserved through error state', () => {
    fc.assert(
      fc.property(dataArb, inputSnapshotArb, timestampArb, (data, snapshot, ts) => {
        // Start with some data loaded
        let state = createInitialState({ data });

        // Submit
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          inputSnapshot: snapshot,
          timestamp: ts,
        });

        // Error — primary data must remain usable
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.ERROR,
          message: 'Failed',
          retryable: true,
        });

        expect(state.data).toEqual(data);
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 30: Async mutations de-duplicate and reconcile effects ---

describe('Property 30: Async mutations de-duplicate and reconcile effects', () => {
  it('SUBMIT while already PENDING returns the same state (duplicate blocked)', () => {
    fc.assert(
      fc.property(
        inputSnapshotArb,
        idempotencyKeyArb,
        timestampArb,
        timestampArb,
        (snapshot, key, ts1, ts2) => {
          let state = createInitialState();

          // First submit puts us in PENDING
          state = asyncReducer(state, {
            type: ASYNC_ACTIONS.SUBMIT,
            inputSnapshot: snapshot,
            idempotencyKey: key,
            timestamp: ts1,
          });
          expect(state.phase).toBe(ASYNC_PHASES.PENDING);

          const pendingState = state;

          // Second submit while pending — must return exact same state
          const afterDuplicate = asyncReducer(state, {
            type: ASYNC_ACTIONS.SUBMIT,
            inputSnapshot: { different: 'data' },
            idempotencyKey: 'different-key',
            timestamp: ts2,
          });

          expect(afterDuplicate).toBe(pendingState);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('RETRY while PENDING returns the same state (duplicate blocked)', () => {
    fc.assert(
      fc.property(
        inputSnapshotArb,
        idempotencyKeyArb,
        timestampArb,
        timestampArb,
        (snapshot, key, ts1, ts2) => {
          let state = createInitialState();

          // Submit puts us in PENDING
          state = asyncReducer(state, {
            type: ASYNC_ACTIONS.SUBMIT,
            inputSnapshot: snapshot,
            idempotencyKey: key,
            timestamp: ts1,
          });
          expect(state.phase).toBe(ASYNC_PHASES.PENDING);

          const pendingState = state;

          // Retry while pending — must return exact same state (blocked)
          const afterRetry = asyncReducer(state, {
            type: ASYNC_ACTIONS.RETRY,
            timestamp: ts2,
          });

          expect(afterRetry).toBe(pendingState);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('after SUCCESS, idempotencyKey is cleared (terminal state)', () => {
    fc.assert(
      fc.property(
        idempotencyKeyArb,
        dataArb,
        timestampArb,
        (key, successData, ts) => {
          let state = createInitialState();

          // Submit with idempotency key
          state = asyncReducer(state, {
            type: ASYNC_ACTIONS.SUBMIT,
            idempotencyKey: key,
            timestamp: ts,
          });
          expect(state.idempotencyKey).toBe(key);

          // Success — idempotency key must be cleared (operation is terminal)
          state = asyncReducer(state, {
            type: ASYNC_ACTIONS.SUCCESS,
            data: successData,
          });

          expect(state.phase).toBe(ASYNC_PHASES.SUCCESS);
          expect(state.idempotencyKey).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reconcileAfterNavigation: fresh data always wins when non-null', () => {
    fc.assert(
      fc.property(
        fc.oneof(dataArb, fc.constant(null)),
        dataArb,
        (currentData, freshData) => {
          // freshData is always non-null (from dataArb which never produces null/undefined)
          const result = reconcileAfterNavigation(currentData, freshData);
          expect(result).toEqual(freshData);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reconcileAfterNavigation: current data is preserved when fresh is null', () => {
    fc.assert(
      fc.property(dataArb, (currentData) => {
        const result = reconcileAfterNavigation(currentData, null);
        // When fresh is null, current data should be kept
        if (currentData !== null && currentData !== undefined) {
          expect(result).toEqual(currentData);
        } else {
          expect(result).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});
