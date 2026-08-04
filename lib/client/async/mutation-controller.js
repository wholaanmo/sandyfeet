// lib/client/async/mutation-controller.js
// Mutation controller — manages idempotency keys, duplicate prevention,
// affected-view invalidation, and error/retry semantics.
// Pure logic (no React hooks) for testability; framework adapters wrap this.

import {
  ASYNC_PHASES,
  ASYNC_ACTIONS,
  PENDING_DELAY_MS,
  asyncReducer,
  isSubmitBlocked,
  createInitialState,
} from './reducer.js';

/**
 * Generate a persistent idempotency key for an operation.
 * Uses crypto.randomUUID when available, falls back to timestamp+random.
 *
 * @returns {string} A unique idempotency key
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @typedef {object} MutationControllerOptions
 * @property {string[]} [affectedKeys] - View keys to invalidate on success
 * @property {function} [onInvalidate] - Callback when views should be invalidated
 * @property {function} [onSuccess] - Callback on successful mutation
 * @property {function} [onError] - Callback on failed mutation
 */

/**
 * @typedef {object} MutationController
 * @property {function} submit - Submit a mutation (returns new state)
 * @property {function} retry - Retry the last failed mutation (returns new state)
 * @property {function} handleSuccess - Handle successful result (returns new state)
 * @property {function} handleError - Handle error result (returns new state)
 * @property {function} reset - Reset to idle (returns new state)
 * @property {function} getIdempotencyKey - Get the current idempotency key
 */

/**
 * Create a mutation controller instance.
 * Manages the lifecycle of a single mutation operation including:
 * - Persistent idempotency key generation and retention through retries
 * - Duplicate submission prevention while pending
 * - Input preservation across error states
 * - Affected-view invalidation on success
 * - Route error vs not-found distinction
 *
 * @param {object} initialState - Initial async state
 * @param {MutationControllerOptions} [options]
 * @returns {MutationController}
 */
export function createMutationController(initialState, options = {}) {
  let state = initialState ?? createInitialState();
  let pendingTimer = null;

  const { affectedKeys = null, onInvalidate, onSuccess, onError } = options;

  /**
   * Submit a mutation. Generates an idempotency key if not already present.
   * Blocks duplicate submissions while pending.
   *
   * @param {object} [inputSnapshot] - User input to preserve for error recovery
   * @param {object} [opts]
   * @param {number} [opts.timestamp] - Override timestamp for testing
   * @returns {{ state: object, blocked: boolean }} New state and whether submission was blocked
   */
  function submit(inputSnapshot, opts = {}) {
    if (isSubmitBlocked(state)) {
      return { state, blocked: true };
    }

    const idempotencyKey = state.idempotencyKey || generateIdempotencyKey();
    const timestamp = opts.timestamp ?? Date.now();

    state = asyncReducer(state, {
      type: ASYNC_ACTIONS.SUBMIT,
      inputSnapshot: inputSnapshot ?? undefined,
      idempotencyKey,
      timestamp,
    });

    return { state, blocked: false };
  }

  /**
   * Schedule the delayed loading label. Call this after submit to set up the
   * 300ms timer. Returns a cancel function.
   *
   * @param {function} onShowLoading - Callback with updated state when loading should show
   * @returns {function} Cancel function to clear the timer
   */
  function scheduleLoadingLabel(onShowLoading) {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(() => {
      if (state.phase === ASYNC_PHASES.PENDING) {
        state = asyncReducer(state, { type: ASYNC_ACTIONS.SHOW_LOADING });
        if (onShowLoading) onShowLoading(state);
      }
      pendingTimer = null;
    }, PENDING_DELAY_MS);

    return () => {
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    };
  }

  /**
   * Handle a successful mutation result.
   * Clears the idempotency key (terminal success) and invalidates affected views.
   *
   * @param {*} data - Result data
   * @param {object} [opts]
   * @param {string} [opts.message] - Success message
   * @param {string[]} [opts.affectedKeys] - Override affected keys
   * @returns {object} New state
   */
  function handleSuccess(data, opts = {}) {
    const keys = opts.affectedKeys ?? affectedKeys;

    state = asyncReducer(state, {
      type: ASYNC_ACTIONS.SUCCESS,
      data,
      message: opts.message ?? null,
      affectedKeys: keys,
    });

    // Clear the idempotency key on terminal success
    state = Object.freeze({ ...state, idempotencyKey: null });

    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }

    // Notify affected views
    if (keys && onInvalidate) {
      onInvalidate(keys);
    }

    if (onSuccess) {
      onSuccess(data);
    }

    return state;
  }

  /**
   * Handle a mutation error.
   * Preserves input and idempotency key for retry.
   *
   * @param {object} error
   * @param {string} [error.message] - Error message
   * @param {object} [error.fieldErrors] - Field-level errors
   * @param {boolean} [error.retryable] - Whether retry is possible
   * @param {string} [error.errorKind] - 'route_error' | 'not_found' | 'network' | 'validation' | 'generic'
   * @returns {object} New state
   */
  function handleError(error = {}) {
    state = asyncReducer(state, {
      type: ASYNC_ACTIONS.ERROR,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable ?? true,
      errorKind: error.errorKind ?? 'generic',
    });

    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }

    if (onError) {
      onError(error);
    }

    return state;
  }

  /**
   * Retry the failed operation. Reuses the same idempotency key.
   * Blocks if already pending.
   *
   * @param {object} [opts]
   * @param {number} [opts.timestamp] - Override timestamp for testing
   * @returns {{ state: object, blocked: boolean }}
   */
  function retry(opts = {}) {
    if (isSubmitBlocked(state)) {
      return { state, blocked: true };
    }

    const timestamp = opts.timestamp ?? Date.now();

    state = asyncReducer(state, {
      type: ASYNC_ACTIONS.RETRY,
      timestamp,
    });

    return { state, blocked: false };
  }

  /**
   * Reset the controller to idle state. Clears idempotency key (cancellation).
   *
   * @returns {object} New state
   */
  function reset() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    state = createInitialState();
    return state;
  }

  /**
   * Get the current idempotency key. Survives retries and navigation
   * until terminal success or explicit cancellation/reset.
   *
   * @returns {string|null}
   */
  function getIdempotencyKey() {
    return state.idempotencyKey;
  }

  /**
   * Get the current state snapshot.
   *
   * @returns {object}
   */
  function getState() {
    return state;
  }

  return {
    submit,
    scheduleLoadingLabel,
    handleSuccess,
    handleError,
    retry,
    reset,
    getIdempotencyKey,
    getState,
  };
}

/**
 * Determine whether an error represents a route-level failure vs a not-found.
 *
 * @param {object} errorResponse - Error response from server
 * @param {number} [errorResponse.status] - HTTP status code
 * @param {string} [errorResponse.category] - Error category from server envelope
 * @returns {string} Error kind: 'route_error' | 'not_found' | 'network' | 'validation' | 'generic'
 */
export function classifyError(errorResponse) {
  if (!errorResponse) return 'generic';

  // Network errors (no response)
  if (errorResponse.isNetworkError || errorResponse.status === 0) {
    return 'network';
  }

  // Not found
  if (errorResponse.status === 404 || errorResponse.category === 'NotFound') {
    return 'not_found';
  }

  // Validation errors
  if (errorResponse.status === 400 || errorResponse.category === 'ValidationError') {
    return 'validation';
  }

  // Route-level errors (server errors, service unavailable)
  if (
    errorResponse.status >= 500 ||
    errorResponse.category === 'ExternalTimeout' ||
    errorResponse.category === 'ExternalUnavailable' ||
    errorResponse.category === 'InternalError'
  ) {
    return 'route_error';
  }

  return 'generic';
}
