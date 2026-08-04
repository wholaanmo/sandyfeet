// lib/client/hooks/useAuth.js
// Client hook for session-based authentication.
// Wraps server-authoritative session exchange and sign-out.
// sign-in via POST /api/auth/session
// sign-out via DELETE /api/auth/session
'use client';

import { useState, useCallback, useRef } from 'react';
import {
  createMutationController,
  classifyError,
} from '../async/mutation-controller.js';
import { createInitialState } from '../async/reducer.js';

/**
 * @typedef {object} UseAuthOptions
 * @property {function} [onSignIn] - Callback after successful sign-in
 * @property {function} [onSignOut] - Callback after successful sign-out
 * @property {function} [onError] - Callback on auth error
 */

/**
 * @typedef {object} Actor
 * @property {string} uid - The user's UID
 * @property {string} role - The user's role (guest, staff, admin)
 */

/**
 * Hook for client-side session management.
 * Provides sign-in (Firebase ID token exchange) and sign-out operations
 * through the server-authoritative session API.
 *
 * Sign-in flow:
 * 1. Client signs in with Firebase Auth (externally)
 * 2. Client calls signIn(idToken, rememberMe) from this hook
 * 3. Server validates token, creates HttpOnly session cookie
 * 4. Hook returns actor info (uid, role)
 *
 * Sign-out flow:
 * 1. Client calls signOut()
 * 2. Server revokes refresh tokens, clears session cookie
 *
 * @param {UseAuthOptions} [options]
 * @returns {{ signIn: function, signOut: function, reset: function, state: object, actor: Actor|null, isLoading: boolean, error: object|null }}
 */
export function useAuth(options = {}) {
  const { onSignIn, onSignOut, onError } = options;

  const [state, setState] = useState(() => createInitialState());
  const [actor, setActor] = useState(null);
  const controllerRef = useRef(null);

  // Lazily initialize the controller
  if (!controllerRef.current) {
    controllerRef.current = createMutationController(createInitialState(), {
      onSuccess: onSignIn,
      onError,
    });
  }

  /**
   * Exchange a Firebase ID token for a server session.
   *
   * @param {string} idToken - Fresh Firebase ID token
   * @param {boolean} [rememberMe=false] - Whether to use extended session lifetime
   * @returns {Promise<Actor|null>} Actor info or null on failure
   */
  const signIn = useCallback(async (idToken, rememberMe = false) => {
    const controller = controllerRef.current;

    if (!idToken || typeof idToken !== 'string') {
      const errorState = controller.handleError({
        message: 'ID token is required',
        retryable: false,
        errorKind: 'validation',
      });
      setState(errorState);
      return null;
    }

    const { state: newState, blocked } = controller.submit({ idToken });
    setState(newState);

    if (blocked) return null;

    const cancelLoading = controller.scheduleLoadingLabel((s) => setState(s));

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, rememberMe }),
      });

      const result = await response.json();

      if (response.ok && result.ok) {
        const actorData = result.data;
        setActor(actorData);

        const successState = controller.handleSuccess(actorData);
        setState(successState);

        if (onSignIn) onSignIn(actorData);
        return actorData;
      }

      const errorKind = classifyError({
        status: response.status,
        category: result.error,
      });

      const errorState = controller.handleError({
        message: result.message || 'Sign-in failed',
        retryable: errorKind === 'network' || errorKind === 'route_error',
        errorKind,
      });
      setState(errorState);
      return null;
    } catch (err) {
      const errorState = controller.handleError({
        message: 'Network error. Please check your connection.',
        retryable: true,
        errorKind: 'network',
      });
      setState(errorState);
      return null;
    } finally {
      cancelLoading();
    }
  }, [onSignIn, onError]);

  /**
   * Sign out — clears server session cookie and revokes tokens.
   *
   * @returns {Promise<boolean>} true on success
   */
  const signOut = useCallback(async () => {
    const controller = controllerRef.current;

    const { state: newState, blocked } = controller.submit({});
    setState(newState);

    if (blocked) return false;

    const cancelLoading = controller.scheduleLoadingLabel((s) => setState(s));

    try {
      const response = await fetch('/api/auth/session', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.ok) {
        setActor(null);

        const successState = controller.handleSuccess({ signedOut: true });
        setState(successState);

        if (onSignOut) onSignOut();
        return true;
      }

      const errorKind = classifyError({
        status: response.status,
        category: result.error,
      });

      const errorState = controller.handleError({
        message: result.message || 'Sign-out failed',
        retryable: errorKind === 'network' || errorKind === 'route_error',
        errorKind,
      });
      setState(errorState);
      return false;
    } catch (err) {
      const errorState = controller.handleError({
        message: 'Network error during sign-out.',
        retryable: true,
        errorKind: 'network',
      });
      setState(errorState);
      return false;
    } finally {
      cancelLoading();
    }
  }, [onSignOut, onError]);

  /**
   * Reset the hook state to idle. Clears actor data.
   */
  const reset = useCallback(() => {
    const controller = controllerRef.current;
    const newState = controller.reset();
    setState(newState);
    setActor(null);
  }, []);

  return {
    signIn,
    signOut,
    reset,
    state,
    actor,
    isLoading: state.phase === 'pending',
    error: state.phase === 'error'
      ? { message: state.message, kind: state.errorKind }
      : null,
  };
}
