// lib/client/hooks/usePayment.js
// Client hook for payment transitions and refund processing.
// Uses the async mutation controller with idempotency keys and
// validates against the canonical route manifest.
'use client';

import { useState, useCallback, useRef } from 'react';
import {
  createMutationController,
  classifyError,
} from '../async/mutation-controller.js';
import { createInitialState } from '../async/reducer.js';
import { ROUTE_MANIFEST } from '../../routes/manifest.js';

/**
 * Validate that a route pattern exists in the manifest.
 * @param {string} pattern
 * @returns {boolean}
 */
function isManifestRoute(pattern) {
  return ROUTE_MANIFEST.some((r) => r.pattern === pattern);
}

// Validate routes exist at module load
const PAYMENT_ROUTES = {
  transition: '/api/payments/[id]/transition',
  refund: '/api/payments/[id]/refund',
};

for (const [op, pattern] of Object.entries(PAYMENT_ROUTES)) {
  if (!isManifestRoute(pattern)) {
    console.warn(
      `[usePayment] Route pattern "${pattern}" for "${op}" not found in manifest`
    );
  }
}

/**
 * Build the API URL for a payment operation.
 * @param {'transition'|'refund'} operation
 * @param {string} bookingId
 * @returns {string}
 */
function buildPaymentUrl(operation, bookingId) {
  if (!bookingId) throw new Error('bookingId is required for payment operations');
  switch (operation) {
    case 'transition':
      return `/api/payments/${encodeURIComponent(bookingId)}/transition`;
    case 'refund':
      return `/api/payments/${encodeURIComponent(bookingId)}/refund`;
    default:
      throw new Error(`Unknown payment operation: ${operation}`);
  }
}

/**
 * @typedef {object} UsePaymentOptions
 * @property {string[]} [affectedKeys] - View keys to invalidate on success
 * @property {function} [onSuccess] - Callback on successful mutation
 * @property {function} [onError] - Callback on error
 * @property {function} [onInvalidate] - Callback for view invalidation
 */

/**
 * Hook for payment state transitions and refund processing.
 * Wraps the async mutation controller with:
 * - Idempotency key management
 * - Manifest route validation
 * - Server API communication
 * - Async phase management
 *
 * @param {UsePaymentOptions} [options]
 * @returns {{ submit: function, retry: function, reset: function, state: object, isLoading: boolean, error: object|null }}
 */
export function usePayment(options = {}) {
  const { affectedKeys, onSuccess, onError, onInvalidate } = options;

  const [state, setState] = useState(() => createInitialState());
  const controllerRef = useRef(null);
  const lastCommandRef = useRef(null);

  // Lazily initialize the controller
  if (!controllerRef.current) {
    controllerRef.current = createMutationController(createInitialState(), {
      affectedKeys,
      onInvalidate,
      onSuccess,
      onError,
    });
  }

  /**
   * Submit a payment operation.
   *
   * @param {'transition'|'refund'} operation
   * @param {object} payload
   * @param {string} payload.bookingId - The booking to update
   * @param {string} [payload.transition] - Target payment/refund state
   * @param {object} [payload.evidence] - Evidence metadata (transition only)
   * @param {string} [payload.reasonCode] - Refund reason code
   * @returns {Promise<object|null>} Server result or null if blocked
   */
  const submit = useCallback(async (operation, payload = {}) => {
    const controller = controllerRef.current;
    const { bookingId, ...commandData } = payload;

    // Store command for retry
    lastCommandRef.current = { operation, payload };

    const { state: newState, blocked } = controller.submit(payload);
    setState(newState);

    if (blocked) return null;

    // Schedule loading label after 300ms
    const cancelLoading = controller.scheduleLoadingLabel((s) => setState(s));

    try {
      const url = buildPaymentUrl(operation, bookingId);
      const idempotencyKey = controller.getIdempotencyKey();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ ...commandData, idempotencyKey }),
      });

      const result = await response.json();

      if (response.ok && result.ok) {
        const successState = controller.handleSuccess(result.data, {
          affectedKeys,
        });
        setState(successState);
        return result.data;
      }

      // Handle error response
      const errorKind = classifyError({
        status: response.status,
        category: result.error,
      });

      const errorState = controller.handleError({
        message: result.message || 'Payment operation failed',
        fieldErrors: result.fieldErrors || null,
        retryable: errorKind === 'network' || errorKind === 'route_error',
        errorKind,
      });
      setState(errorState);
      return null;
    } catch (err) {
      // Network / parse failure
      const errorState = controller.handleError({
        message: 'Network error. Please check your connection and try again.',
        retryable: true,
        errorKind: 'network',
      });
      setState(errorState);
      return null;
    } finally {
      cancelLoading();
    }
  }, [affectedKeys, onSuccess, onError]);

  /**
   * Retry the last failed operation using the same idempotency key.
   * @returns {Promise<object|null>}
   */
  const retry = useCallback(async () => {
    const lastCommand = lastCommandRef.current;
    if (!lastCommand) return null;
    return submit(lastCommand.operation, lastCommand.payload);
  }, [submit]);

  /**
   * Reset the hook to idle state. Clears the idempotency key.
   */
  const reset = useCallback(() => {
    const controller = controllerRef.current;
    const newState = controller.reset();
    setState(newState);
    lastCommandRef.current = null;
  }, []);

  return {
    submit,
    retry,
    reset,
    state,
    isLoading: state.phase === 'pending',
    error: state.phase === 'error'
      ? { message: state.message, fieldErrors: state.fieldErrors, kind: state.errorKind }
      : null,
  };
}
