// lib/client/hooks/useReservation.js
// Client hook for reservation create/edit/cancel mutations.
// Uses the async mutation controller with idempotency keys and
// validates API routes against the canonical route manifest.
'use client';

import { useState, useCallback, useRef } from 'react';
import {
  createMutationController,
  generateIdempotencyKey,
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

/**
 * Build the API URL for a reservation operation.
 * @param {'create'|'edit'|'cancel'} operation
 * @param {string} [bookingId] - Required for edit/cancel
 * @returns {string}
 */
function buildReservationUrl(operation, bookingId) {
  switch (operation) {
    case 'create':
      return '/api/reservations/create';
    case 'edit':
      if (!bookingId) throw new Error('bookingId required for edit');
      return `/api/reservations/${encodeURIComponent(bookingId)}/edit`;
    case 'cancel':
      if (!bookingId) throw new Error('bookingId required for cancel');
      return `/api/reservations/${encodeURIComponent(bookingId)}/cancel`;
    default:
      throw new Error(`Unknown reservation operation: ${operation}`);
  }
}

// Validate routes exist at module load
const RESERVATION_ROUTES = {
  create: '/api/reservations/create',
  edit: '/api/reservations/[id]/edit',
  cancel: '/api/reservations/[id]/cancel',
};

for (const [op, pattern] of Object.entries(RESERVATION_ROUTES)) {
  if (!isManifestRoute(pattern)) {
    console.warn(
      `[useReservation] Route pattern "${pattern}" for "${op}" not found in manifest`
    );
  }
}

/**
 * @typedef {object} UseReservationOptions
 * @property {string[]} [affectedKeys] - View keys to invalidate on success
 * @property {function} [onSuccess] - Callback on successful mutation
 * @property {function} [onError] - Callback on error
 */

/**
 * Hook for reservation create/edit/cancel mutations.
 * Wraps the async mutation controller with:
 * - Idempotency key management
 * - Manifest route validation
 * - Server API communication
 * - Async phase state
 *
 * @param {UseReservationOptions} [options]
 * @returns {{ submit: function, retry: function, reset: function, state: object, isLoading: boolean, error: object|null }}
 */
export function useReservation(options = {}) {
  const { affectedKeys, onSuccess, onError } = options;

  const [state, setState] = useState(() => createInitialState());
  const controllerRef = useRef(null);
  const lastCommandRef = useRef(null);

  // Lazily initialize the controller
  if (!controllerRef.current) {
    controllerRef.current = createMutationController(createInitialState(), {
      affectedKeys,
      onInvalidate: options.onInvalidate,
      onSuccess,
      onError,
    });
  }

  /**
   * Submit a reservation mutation.
   *
   * @param {'create'|'edit'|'cancel'} operation
   * @param {object} payload - The command data
   * @param {string} [payload.bookingId] - Required for edit/cancel
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
      const url = buildReservationUrl(operation, bookingId);
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
        message: result.message || 'Reservation operation failed',
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
