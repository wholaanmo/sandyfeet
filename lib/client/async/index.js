// lib/client/async/index.js
// Async state system — public API surface.
// Re-exports from reducer, mutation-controller, and reconciliation modules.

export {
  ASYNC_PHASES,
  ASYNC_ACTIONS,
  PENDING_DELAY_MS,
  createInitialState,
  asyncReducer,
  shouldShowLoading,
  isSubmitBlocked,
  isRetryable,
  getErrorKind,
} from './reducer.js';

export {
  generateIdempotencyKey,
  createMutationController,
  classifyError,
} from './mutation-controller.js';

export {
  reconcileAfterNavigation,
  reconcileArrayData,
  createInvalidationRegistry,
  reconcilePendingOperation,
  computeAffectedKeys,
} from './reconciliation.js';
