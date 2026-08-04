// lib/server/integrations/circuit-breaker.js
// Simple circuit breaker pattern: closed → open (after N failures) → half-open (after cooldown) → closed (on success).
import 'server-only';

/**
 * @typedef {'closed' | 'open' | 'half-open'} CircuitState
 */

/**
 * @typedef {Object} CircuitBreakerOptions
 * @property {number} [failureThreshold] - Number of consecutive failures before opening (default: 5)
 * @property {number} [cooldownMs] - Time in ms before transitioning from open to half-open (default: 30000)
 */

/**
 * @typedef {Object} CircuitBreaker
 * @property {<T>(fn: () => Promise<T>) => Promise<T>} call - Execute a function through the circuit breaker
 * @property {() => CircuitState} getState - Get the current circuit state
 * @property {() => void} reset - Reset the circuit breaker to closed state
 */

/**
 * Create a circuit breaker instance.
 *
 * - closed: requests pass through normally
 * - open: requests are immediately rejected (after failureThreshold consecutive failures)
 * - half-open: one request is allowed through (after cooldownMs); success closes, failure reopens
 *
 * @param {CircuitBreakerOptions} [options]
 * @returns {CircuitBreaker}
 */
export function createCircuitBreaker(options = {}) {
  const {
    failureThreshold = 5,
    cooldownMs = 30_000,
  } = options;

  /** @type {CircuitState} */
  let state = 'closed';
  let failureCount = 0;
  let lastFailureTime = 0;

  /**
   * Get the effective current state, considering cooldown transitions.
   * @returns {CircuitState}
   */
  function getState() {
    if (state === 'open') {
      const elapsed = Date.now() - lastFailureTime;
      if (elapsed >= cooldownMs) {
        state = 'half-open';
      }
    }
    return state;
  }

  /**
   * Record a successful call.
   */
  function onSuccess() {
    failureCount = 0;
    state = 'closed';
  }

  /**
   * Record a failed call.
   */
  function onFailure() {
    failureCount++;
    lastFailureTime = Date.now();
    if (failureCount >= failureThreshold) {
      state = 'open';
    }
  }

  /**
   * Execute a function through the circuit breaker.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async function call(fn) {
    const currentState = getState();

    if (currentState === 'open') {
      const err = new Error('Circuit breaker is open — provider unavailable');
      err.code = 'CIRCUIT_OPEN';
      throw err;
    }

    try {
      const result = await fn();
      onSuccess();
      return result;
    } catch (err) {
      onFailure();
      throw err;
    }
  }

  /**
   * Reset the circuit breaker to closed state.
   */
  function reset() {
    state = 'closed';
    failureCount = 0;
    lastFailureTime = 0;
  }

  return { call, getState, reset };
}
