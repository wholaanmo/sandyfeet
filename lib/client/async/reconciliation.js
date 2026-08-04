// lib/client/async/reconciliation.js
// Navigation reconciliation and affected-view invalidation.
// Pure logic for merging stale data with fresh data after navigation,
// invalidating views after successful mutations, and handling pending
// operations that survive navigation.

import { ASYNC_PHASES, ASYNC_ACTIONS, asyncReducer } from './reducer.js';

/**
 * Reconcile stale data with fresh data after navigation.
 * Used when a mutation completed during navigation and the destination
 * page loads fresh data that may include the mutation result.
 *
 * Strategy:
 * - If fresh data is available, use it (it reflects committed state)
 * - If fresh data is null/undefined but current data exists, keep current
 * - If both are objects, merge with fresh taking precedence (shallow)
 *
 * @param {*} currentData - Data from before navigation (possibly stale)
 * @param {*} freshData - Data loaded on destination page
 * @returns {*} Reconciled data
 */
export function reconcileAfterNavigation(currentData, freshData) {
  // Fresh data always wins if present
  if (freshData !== null && freshData !== undefined) {
    return freshData;
  }

  // If no fresh data but we have current data, keep it
  if (currentData !== null && currentData !== undefined) {
    return currentData;
  }

  return null;
}

/**
 * Reconcile array data by merging based on a key field.
 * Items in freshData replace matching items in currentData;
 * items only in currentData are retained.
 *
 * @param {Array} currentData - Current array data
 * @param {Array} freshData - Fresh array data
 * @param {string} keyField - Field name to match items by (e.g., 'id')
 * @returns {Array} Reconciled array
 */
export function reconcileArrayData(currentData, freshData, keyField = 'id') {
  if (!Array.isArray(freshData)) return currentData ?? [];
  if (!Array.isArray(currentData)) return freshData;

  const freshMap = new Map(freshData.map((item) => [item[keyField], item]));
  const result = [];
  const seen = new Set();

  // Update existing items with fresh versions
  for (const item of currentData) {
    const key = item[keyField];
    if (freshMap.has(key)) {
      result.push(freshMap.get(key));
      seen.add(key);
    } else {
      result.push(item);
    }
  }

  // Add new items from fresh that weren't in current
  for (const item of freshData) {
    if (!seen.has(item[keyField])) {
      result.push(item);
    }
  }

  return result;
}

/**
 * @typedef {object} ViewInvalidation
 * @property {string} key - View identifier to invalidate
 * @property {number} invalidatedAt - Timestamp of invalidation
 * @property {string} [reason] - Why the view was invalidated
 */

/**
 * Create a view invalidation registry.
 * Tracks which views need fresh data after a mutation succeeds.
 *
 * @returns {object} Invalidation registry
 */
export function createInvalidationRegistry() {
  /** @type {Map<string, ViewInvalidation>} */
  const invalidations = new Map();

  /**
   * Mark views as needing fresh data.
   *
   * @param {string[]} keys - View keys to invalidate
   * @param {object} [opts]
   * @param {string} [opts.reason] - Reason for invalidation
   * @param {number} [opts.timestamp] - Override timestamp for testing
   */
  function invalidate(keys, opts = {}) {
    if (!Array.isArray(keys)) return;
    const timestamp = opts.timestamp ?? Date.now();
    for (const key of keys) {
      if (typeof key === 'string' && key.length > 0) {
        invalidations.set(key, {
          key,
          invalidatedAt: timestamp,
          reason: opts.reason ?? undefined,
        });
      }
    }
  }

  /**
   * Check whether a view key is invalidated.
   *
   * @param {string} key - View key
   * @returns {boolean}
   */
  function isInvalidated(key) {
    return invalidations.has(key);
  }

  /**
   * Get all invalidated keys.
   *
   * @returns {string[]}
   */
  function getInvalidatedKeys() {
    return Array.from(invalidations.keys());
  }

  /**
   * Mark a view key as resolved (fresh data loaded).
   *
   * @param {string} key - View key to clear
   */
  function resolve(key) {
    invalidations.delete(key);
  }

  /**
   * Clear all invalidations.
   */
  function clear() {
    invalidations.clear();
  }

  /**
   * Get the number of pending invalidations.
   *
   * @returns {number}
   */
  function size() {
    return invalidations.size;
  }

  return { invalidate, isInvalidated, getInvalidatedKeys, resolve, clear, size };
}

/**
 * Handle pending operation state during navigation.
 * When a user navigates while an operation is pending, this determines
 * how to reconcile the operation state on the destination page.
 *
 * @param {object} operationState - The async state of the pending operation
 * @param {object} [opts]
 * @param {boolean} [opts.operationCompleted] - Whether the operation completed during nav
 * @param {*} [opts.result] - The operation result if completed
 * @param {object} [opts.error] - The operation error if failed
 * @param {number} [opts.timestamp] - Override timestamp for testing
 * @returns {object} Reconciled async state
 */
export function reconcilePendingOperation(operationState, opts = {}) {
  if (!operationState) return operationState;

  // If the operation is no longer pending (already resolved), return as-is
  if (
    operationState.phase !== ASYNC_PHASES.PENDING &&
    operationState.phase !== ASYNC_PHASES.RECONCILING
  ) {
    return operationState;
  }

  // Operation completed during navigation — apply success
  if (opts.operationCompleted && opts.result !== undefined) {
    return asyncReducer(operationState, {
      type: ASYNC_ACTIONS.SUCCESS,
      data: opts.result,
    });
  }

  // Operation failed during navigation — apply error
  if (opts.operationCompleted && opts.error) {
    return asyncReducer(operationState, {
      type: ASYNC_ACTIONS.ERROR,
      message: opts.error.message,
      retryable: opts.error.retryable ?? true,
      errorKind: opts.error.errorKind ?? 'generic',
    });
  }

  // Operation still pending — enter reconciling phase to refresh with fresh data
  return asyncReducer(operationState, {
    type: ASYNC_ACTIONS.RECONCILE,
    timestamp: opts.timestamp ?? Date.now(),
  });
}

/**
 * Determine which view keys are affected by a mutation on a given resource.
 * Convention: keys are `{resource}:{scope}` (e.g., 'bookings:list', 'booking:BK-123').
 *
 * @param {string} resource - The resource type that was mutated (e.g., 'booking')
 * @param {string} resourceId - The specific resource ID
 * @param {string[]} [additionalKeys] - Extra keys to invalidate
 * @returns {string[]} Affected view keys
 */
export function computeAffectedKeys(resource, resourceId, additionalKeys = []) {
  if (!resource || typeof resource !== 'string') return [...additionalKeys];

  const keys = [
    `${resource}:list`, // List views of this resource type
  ];

  if (resourceId && typeof resourceId === 'string') {
    keys.push(`${resource}:${resourceId}`); // Detail view of this specific resource
  }

  // Add any additional keys
  for (const key of additionalKeys) {
    if (typeof key === 'string' && key.length > 0 && !keys.includes(key)) {
      keys.push(key);
    }
  }

  return keys;
}
