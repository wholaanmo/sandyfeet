// lib/client/async/reducer.js
// Async state reducer — pure, no React, no browser globals.
// Models idle/pending/success/empty/partial/error/reconciling phases
// with 300ms delayed loading labels and input/data preservation.

/**
 * Canonical async phases.
 */
export const ASYNC_PHASES = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  SUCCESS: 'success',
  EMPTY: 'empty',
  PARTIAL: 'partial',
  ERROR: 'error',
  RECONCILING: 'reconciling',
});

/**
 * Async action types.
 */
export const ASYNC_ACTIONS = Object.freeze({
  SUBMIT: 'submit',
  SUCCESS: 'success',
  EMPTY: 'empty',
  PARTIAL: 'partial',
  ERROR: 'error',
  RETRY: 'retry',
  RECONCILE: 'reconcile',
  RESET: 'reset',
  INVALIDATE: 'invalidate',
  SHOW_LOADING: 'show_loading',
});

/**
 * The delay in milliseconds before a pending operation shows a loading label.
 * Suppresses flashing loaders for fast operations.
 */
export const PENDING_DELAY_MS = 300;

/**
 * Create an initial idle async state.
 *
 * @param {object} [options]
 * @param {*} [options.data] - Initial data if any
 * @param {string|null} [options.idempotencyKey] - Pre-assigned idempotency key
 * @returns {object} Initial async state
 */
export function createInitialState(options = {}) {
  return Object.freeze({
    phase: ASYNC_PHASES.IDLE,
    data: options.data ?? null,
    inputSnapshot: null,
    fieldErrors: null,
    message: null,
    retryable: false,
    pendingSince: null,
    showLoading: false,
    idempotencyKey: options.idempotencyKey ?? null,
    affectedKeys: null,
    errorKind: null,
  });
}

/**
 * Pure async state reducer. Handles phase transitions for async operations.
 *
 * Invariants:
 * - Exactly one phase is active at any time
 * - Valid input is preserved across error states
 * - Primary data is preserved during reconciliation and partial states
 * - Loading label appears only after 300ms of continued pending
 * - Empty is only reachable after a successful collection result with zero records
 *
 * @param {object} state - Current async state
 * @param {object} action - Action to apply
 * @param {string} action.type - One of ASYNC_ACTIONS
 * @param {*} [action.data] - Data payload
 * @param {object} [action.inputSnapshot] - User input to preserve
 * @param {string} [action.message] - Error/success message
 * @param {object} [action.fieldErrors] - Field-level validation errors
 * @param {boolean} [action.retryable] - Whether the error is retryable
 * @param {string} [action.idempotencyKey] - Idempotency key for the operation
 * @param {string[]} [action.affectedKeys] - View keys affected by mutation
 * @param {number} [action.timestamp] - Timestamp for pending tracking
 * @param {string} [action.errorKind] - 'route_error' | 'not_found' | 'network' | 'validation' | 'generic'
 * @returns {object} New async state (frozen)
 */
export function asyncReducer(state, action) {
  if (!state || !action || !action.type) {
    return state ?? createInitialState();
  }

  switch (action.type) {
    case ASYNC_ACTIONS.SUBMIT: {
      // Prevent duplicate submission: if already pending, return unchanged state
      if (state.phase === ASYNC_PHASES.PENDING) {
        return state;
      }
      return Object.freeze({
        ...state,
        phase: ASYNC_PHASES.PENDING,
        message: null,
        fieldErrors: null,
        retryable: false,
        pendingSince: action.timestamp ?? Date.now(),
        showLoading: false,
        errorKind: null,
        // Preserve input snapshot if provided (for retry scenarios)
        inputSnapshot: action.inputSnapshot ?? state.inputSnapshot,
        // Assign or retain idempotency key
        idempotencyKey: action.idempotencyKey ?? state.idempotencyKey,
        // Preserve existing data during pending (for reconciling/partial scenarios)
        data: state.data,
      });
    }

    case ASYNC_ACTIONS.SHOW_LOADING: {
      // Only transition to showing loading if still pending
      if (state.phase !== ASYNC_PHASES.PENDING) {
        return state;
      }
      return Object.freeze({
        ...state,
        showLoading: true,
      });
    }

    case ASYNC_ACTIONS.SUCCESS: {
      return Object.freeze({
        ...state,
        phase: ASYNC_PHASES.SUCCESS,
        data: action.data ?? state.data,
        message: action.message ?? null,
        fieldErrors: null,
        retryable: false,
        pendingSince: null,
        showLoading: false,
        inputSnapshot: null,
        errorKind: null,
        affectedKeys: action.affectedKeys ?? state.affectedKeys,
        // Terminal: clear idempotency key — operation completed successfully
        idempotencyKey: null,
      });
    }

    case ASYNC_ACTIONS.EMPTY: {
      return Object.freeze({
        ...state,
        phase: ASYNC_PHASES.EMPTY,
        data: null,
        message: action.message ?? null,
        fieldErrors: null,
        retryable: false,
        pendingSince: null,
        showLoading: false,
        inputSnapshot: null,
        errorKind: null,
      });
    }

    case ASYNC_ACTIONS.PARTIAL: {
      // Retain primary data, mark unavailable portion
      return Object.freeze({
        ...state,
        phase: ASYNC_PHASES.PARTIAL,
        data: action.data ?? state.data,
        message: action.message ?? null,
        fieldErrors: null,
        retryable: action.retryable ?? true,
        pendingSince: null,
        showLoading: false,
        errorKind: null,
      });
    }

    case ASYNC_ACTIONS.ERROR: {
      return Object.freeze({
        ...state,
        phase: ASYNC_PHASES.ERROR,
        // Preserve valid input for recovery
        inputSnapshot: action.inputSnapshot ?? state.inputSnapshot,
        // Preserve primary data if it was usable
        data: state.data,
        message: action.message ?? 'An error occurred. Please try again.',
        fieldErrors: action.fieldErrors ?? null,
        retryable: action.retryable ?? true,
        pendingSince: null,
        showLoading: false,
        // Distinguish route errors from not-found
        errorKind: action.errorKind ?? 'generic',
        // Retain idempotency key for retry
        idempotencyKey: state.idempotencyKey,
      });
    }

    case ASYNC_ACTIONS.RETRY: {
      // Re-enter pending state, preserve input and idempotency key
      if (state.phase === ASYNC_PHASES.PENDING) {
        return state;
      }
      return Object.freeze({
        ...state,
        phase: ASYNC_PHASES.PENDING,
        message: null,
        fieldErrors: null,
        retryable: false,
        pendingSince: action.timestamp ?? Date.now(),
        showLoading: false,
        errorKind: null,
        // Preserve input and idempotency key through retry
        inputSnapshot: state.inputSnapshot,
        idempotencyKey: state.idempotencyKey,
        // Preserve existing data
        data: state.data,
      });
    }

    case ASYNC_ACTIONS.RECONCILE: {
      // Enter reconciling phase: preserve primary data while refreshing
      return Object.freeze({
        ...state,
        phase: ASYNC_PHASES.RECONCILING,
        // Keep existing data visible during reconciliation
        data: state.data,
        message: null,
        fieldErrors: null,
        retryable: false,
        pendingSince: action.timestamp ?? Date.now(),
        showLoading: false,
        errorKind: null,
      });
    }

    case ASYNC_ACTIONS.RESET: {
      return createInitialState();
    }

    case ASYNC_ACTIONS.INVALIDATE: {
      // Mark affected views for refresh without destroying current data
      return Object.freeze({
        ...state,
        affectedKeys: action.affectedKeys ?? null,
      });
    }

    default:
      return state;
  }
}

/**
 * Determine whether the current state should show a loading indicator.
 * Loading is shown only after PENDING_DELAY_MS of continued pending.
 *
 * @param {object} state - Current async state
 * @returns {boolean}
 */
export function shouldShowLoading(state) {
  if (!state) return false;
  return state.phase === ASYNC_PHASES.PENDING && state.showLoading === true;
}

/**
 * Determine whether a submit action should be blocked (duplicate prevention).
 *
 * @param {object} state - Current async state
 * @returns {boolean}
 */
export function isSubmitBlocked(state) {
  if (!state) return false;
  return state.phase === ASYNC_PHASES.PENDING || state.phase === ASYNC_PHASES.RECONCILING;
}

/**
 * Check whether the state has a retryable error.
 *
 * @param {object} state - Current async state
 * @returns {boolean}
 */
export function isRetryable(state) {
  if (!state) return false;
  return state.phase === ASYNC_PHASES.ERROR && state.retryable === true;
}

/**
 * Check whether a state represents a route-level error vs not-found.
 *
 * @param {object} state - Current async state
 * @returns {'route_error'|'not_found'|null}
 */
export function getErrorKind(state) {
  if (!state || state.phase !== ASYNC_PHASES.ERROR) return null;
  return state.errorKind;
}
