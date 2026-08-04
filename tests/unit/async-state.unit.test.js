// tests/unit/async-state.unit.test.js
// Unit tests for lib/client/async/ — reducer, mutation-controller, reconciliation.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  ASYNC_PHASES,
  ASYNC_ACTIONS,
  PENDING_DELAY_MS,
  createInitialState,
  asyncReducer,
  shouldShowLoading,
  isSubmitBlocked,
  isRetryable,
  getErrorKind,
} from '../../lib/client/async/reducer.js';

import {
  generateIdempotencyKey,
  createMutationController,
  classifyError,
} from '../../lib/client/async/mutation-controller.js';

import {
  reconcileAfterNavigation,
  reconcileArrayData,
  createInvalidationRegistry,
  reconcilePendingOperation,
  computeAffectedKeys,
} from '../../lib/client/async/reconciliation.js';

// ─── Reducer ──────────────────────────────────────────────────────────────────

describe('lib/client/async/reducer', () => {
  describe('ASYNC_PHASES', () => {
    it('is frozen/immutable', () => {
      expect(Object.isFrozen(ASYNC_PHASES)).toBe(true);
    });

    it('defines all documented phases', () => {
      expect(ASYNC_PHASES.IDLE).toBe('idle');
      expect(ASYNC_PHASES.PENDING).toBe('pending');
      expect(ASYNC_PHASES.SUCCESS).toBe('success');
      expect(ASYNC_PHASES.EMPTY).toBe('empty');
      expect(ASYNC_PHASES.PARTIAL).toBe('partial');
      expect(ASYNC_PHASES.ERROR).toBe('error');
      expect(ASYNC_PHASES.RECONCILING).toBe('reconciling');
    });
  });

  describe('PENDING_DELAY_MS', () => {
    it('equals 300 milliseconds', () => {
      expect(PENDING_DELAY_MS).toBe(300);
    });
  });

  describe('createInitialState', () => {
    it('returns idle state with null defaults', () => {
      const state = createInitialState();
      expect(state.phase).toBe('idle');
      expect(state.data).toBeNull();
      expect(state.inputSnapshot).toBeNull();
      expect(state.fieldErrors).toBeNull();
      expect(state.message).toBeNull();
      expect(state.retryable).toBe(false);
      expect(state.pendingSince).toBeNull();
      expect(state.showLoading).toBe(false);
      expect(state.idempotencyKey).toBeNull();
      expect(state.affectedKeys).toBeNull();
      expect(state.errorKind).toBeNull();
    });

    it('accepts initial data', () => {
      const state = createInitialState({ data: { items: [1, 2] } });
      expect(state.data).toEqual({ items: [1, 2] });
    });

    it('accepts initial idempotency key', () => {
      const state = createInitialState({ idempotencyKey: 'key-1' });
      expect(state.idempotencyKey).toBe('key-1');
    });

    it('returns a frozen object', () => {
      const state = createInitialState();
      expect(Object.isFrozen(state)).toBe(true);
    });
  });

  describe('asyncReducer', () => {
    it('returns initial state for null state', () => {
      const result = asyncReducer(null, { type: ASYNC_ACTIONS.SUBMIT });
      expect(result.phase).toBe('idle');
    });

    it('returns unchanged state for unknown action type', () => {
      const state = createInitialState();
      const result = asyncReducer(state, { type: 'unknown_action' });
      expect(result).toBe(state);
    });

    describe('SUBMIT action', () => {
      it('transitions from idle to pending', () => {
        const state = createInitialState();
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        expect(result.phase).toBe('pending');
        expect(result.pendingSince).toBe(1000);
        expect(result.showLoading).toBe(false);
      });

      it('preserves input snapshot', () => {
        const state = createInitialState();
        const input = { name: 'John', email: 'john@test.com' };
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          inputSnapshot: input,
          timestamp: 1000,
        });
        expect(result.inputSnapshot).toEqual(input);
      });

      it('assigns idempotency key', () => {
        const state = createInitialState();
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          idempotencyKey: 'key-abc',
          timestamp: 1000,
        });
        expect(result.idempotencyKey).toBe('key-abc');
      });

      it('blocks duplicate submission (returns same state when pending)', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 2000,
        });
        expect(result).toBe(pending);
        expect(result.pendingSince).toBe(1000);
      });

      it('preserves existing data during pending', () => {
        const state = createInitialState({ data: { existing: true } });
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        expect(result.data).toEqual({ existing: true });
      });

      it('clears error/message state on submit', () => {
        let state = createInitialState();
        state = asyncReducer(state, { type: ASYNC_ACTIONS.SUBMIT, timestamp: 100 });
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.ERROR,
          message: 'Failed',
          retryable: true,
        });
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 2000,
        });
        expect(result.message).toBeNull();
        expect(result.fieldErrors).toBeNull();
        expect(result.retryable).toBe(false);
        expect(result.errorKind).toBeNull();
      });
    });

    describe('SHOW_LOADING action', () => {
      it('sets showLoading to true when pending', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, { type: ASYNC_ACTIONS.SHOW_LOADING });
        expect(result.showLoading).toBe(true);
        expect(result.phase).toBe('pending');
      });

      it('does nothing when not pending', () => {
        const idle = createInitialState();
        const result = asyncReducer(idle, { type: ASYNC_ACTIONS.SHOW_LOADING });
        expect(result).toBe(idle);
      });
    });

    describe('SUCCESS action', () => {
      it('transitions to success with data', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, {
          type: ASYNC_ACTIONS.SUCCESS,
          data: { items: [1, 2, 3] },
        });
        expect(result.phase).toBe('success');
        expect(result.data).toEqual({ items: [1, 2, 3] });
        expect(result.pendingSince).toBeNull();
        expect(result.showLoading).toBe(false);
        expect(result.inputSnapshot).toBeNull();
      });

      it('preserves affected keys', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, {
          type: ASYNC_ACTIONS.SUCCESS,
          data: {},
          affectedKeys: ['bookings:list'],
        });
        expect(result.affectedKeys).toEqual(['bookings:list']);
      });
    });

    describe('EMPTY action', () => {
      it('transitions to empty phase', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, {
          type: ASYNC_ACTIONS.EMPTY,
          message: 'No bookings found',
        });
        expect(result.phase).toBe('empty');
        expect(result.data).toBeNull();
        expect(result.message).toBe('No bookings found');
      });
    });

    describe('PARTIAL action', () => {
      it('retains primary data when secondary fails', () => {
        const withData = asyncReducer(
          asyncReducer(createInitialState(), {
            type: ASYNC_ACTIONS.SUBMIT,
            timestamp: 1000,
          }),
          { type: ASYNC_ACTIONS.SUCCESS, data: { primary: 'data' } },
        );
        const result = asyncReducer(withData, {
          type: ASYNC_ACTIONS.PARTIAL,
          message: 'Payment details unavailable',
          retryable: true,
        });
        expect(result.phase).toBe('partial');
        expect(result.data).toEqual({ primary: 'data' });
        expect(result.message).toBe('Payment details unavailable');
        expect(result.retryable).toBe(true);
      });
    });

    describe('ERROR action', () => {
      it('transitions to error, preserves input and data', () => {
        const input = { name: 'Jane' };
        const pending = asyncReducer(createInitialState({ data: { old: true } }), {
          type: ASYNC_ACTIONS.SUBMIT,
          inputSnapshot: input,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, {
          type: ASYNC_ACTIONS.ERROR,
          message: 'Server error',
          retryable: true,
          errorKind: 'route_error',
        });
        expect(result.phase).toBe('error');
        expect(result.inputSnapshot).toEqual(input);
        expect(result.data).toEqual({ old: true });
        expect(result.message).toBe('Server error');
        expect(result.retryable).toBe(true);
        expect(result.errorKind).toBe('route_error');
        expect(result.idempotencyKey).toBeNull();
      });

      it('distinguishes route_error from not_found', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const routeError = asyncReducer(pending, {
          type: ASYNC_ACTIONS.ERROR,
          errorKind: 'route_error',
        });
        const notFound = asyncReducer(pending, {
          type: ASYNC_ACTIONS.ERROR,
          errorKind: 'not_found',
        });
        expect(routeError.errorKind).toBe('route_error');
        expect(notFound.errorKind).toBe('not_found');
      });

      it('defaults to generic error kind', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, { type: ASYNC_ACTIONS.ERROR });
        expect(result.errorKind).toBe('generic');
      });
    });

    describe('RETRY action', () => {
      it('re-enters pending from error, preserving input and key', () => {
        let state = createInitialState();
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUBMIT,
          idempotencyKey: 'retry-key',
          inputSnapshot: { field: 'value' },
          timestamp: 1000,
        });
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.ERROR,
          message: 'Failed',
          retryable: true,
        });
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.RETRY,
          timestamp: 2000,
        });
        expect(result.phase).toBe('pending');
        expect(result.idempotencyKey).toBe('retry-key');
        expect(result.inputSnapshot).toEqual({ field: 'value' });
        expect(result.pendingSince).toBe(2000);
        expect(result.message).toBeNull();
      });

      it('blocks retry when already pending', () => {
        const pending = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 1000,
        });
        const result = asyncReducer(pending, {
          type: ASYNC_ACTIONS.RETRY,
          timestamp: 2000,
        });
        expect(result).toBe(pending);
      });
    });

    describe('RECONCILE action', () => {
      it('enters reconciling phase preserving data', () => {
        let state = createInitialState();
        state = asyncReducer(state, { type: ASYNC_ACTIONS.SUBMIT, timestamp: 100 });
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUCCESS,
          data: { bookings: ['a'] },
        });
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.RECONCILE,
          timestamp: 2000,
        });
        expect(result.phase).toBe('reconciling');
        expect(result.data).toEqual({ bookings: ['a'] });
        expect(result.pendingSince).toBe(2000);
      });
    });

    describe('RESET action', () => {
      it('returns to initial idle state', () => {
        let state = asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          idempotencyKey: 'k',
          timestamp: 1000,
        });
        state = asyncReducer(state, {
          type: ASYNC_ACTIONS.SUCCESS,
          data: { x: 1 },
        });
        const result = asyncReducer(state, { type: ASYNC_ACTIONS.RESET });
        expect(result.phase).toBe('idle');
        expect(result.data).toBeNull();
        expect(result.idempotencyKey).toBeNull();
      });
    });

    describe('INVALIDATE action', () => {
      it('sets affected keys without changing phase', () => {
        const state = asyncReducer(
          asyncReducer(createInitialState(), {
            type: ASYNC_ACTIONS.SUBMIT,
            timestamp: 100,
          }),
          { type: ASYNC_ACTIONS.SUCCESS, data: {} },
        );
        const result = asyncReducer(state, {
          type: ASYNC_ACTIONS.INVALIDATE,
          affectedKeys: ['bookings:list', 'booking:BK-1'],
        });
        expect(result.phase).toBe('success');
        expect(result.affectedKeys).toEqual(['bookings:list', 'booking:BK-1']);
      });
    });
  });

  describe('shouldShowLoading', () => {
    it('returns false for idle state', () => {
      expect(shouldShowLoading(createInitialState())).toBe(false);
    });

    it('returns false for pending without showLoading flag', () => {
      const pending = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 1000,
      });
      expect(shouldShowLoading(pending)).toBe(false);
    });

    it('returns true for pending with showLoading flag', () => {
      let state = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 1000,
      });
      state = asyncReducer(state, { type: ASYNC_ACTIONS.SHOW_LOADING });
      expect(shouldShowLoading(state)).toBe(true);
    });

    it('returns false for null state', () => {
      expect(shouldShowLoading(null)).toBe(false);
    });
  });

  describe('isSubmitBlocked', () => {
    it('returns true for pending', () => {
      const pending = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 1000,
      });
      expect(isSubmitBlocked(pending)).toBe(true);
    });

    it('returns true for reconciling', () => {
      let state = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 100,
      });
      state = asyncReducer(state, { type: ASYNC_ACTIONS.SUCCESS, data: {} });
      state = asyncReducer(state, { type: ASYNC_ACTIONS.RECONCILE, timestamp: 200 });
      expect(isSubmitBlocked(state)).toBe(true);
    });

    it('returns false for idle, success, error', () => {
      expect(isSubmitBlocked(createInitialState())).toBe(false);
      const success = asyncReducer(
        asyncReducer(createInitialState(), {
          type: ASYNC_ACTIONS.SUBMIT,
          timestamp: 100,
        }),
        { type: ASYNC_ACTIONS.SUCCESS, data: {} },
      );
      expect(isSubmitBlocked(success)).toBe(false);
    });

    it('returns false for null state', () => {
      expect(isSubmitBlocked(null)).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('returns true for retryable error state', () => {
      let state = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 100,
      });
      state = asyncReducer(state, {
        type: ASYNC_ACTIONS.ERROR,
        retryable: true,
      });
      expect(isRetryable(state)).toBe(true);
    });

    it('returns false for non-retryable error', () => {
      let state = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 100,
      });
      state = asyncReducer(state, {
        type: ASYNC_ACTIONS.ERROR,
        retryable: false,
      });
      expect(isRetryable(state)).toBe(false);
    });

    it('returns false for non-error phases', () => {
      expect(isRetryable(createInitialState())).toBe(false);
    });
  });

  describe('getErrorKind', () => {
    it('returns errorKind for error state', () => {
      let state = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 100,
      });
      state = asyncReducer(state, {
        type: ASYNC_ACTIONS.ERROR,
        errorKind: 'not_found',
      });
      expect(getErrorKind(state)).toBe('not_found');
    });

    it('returns null for non-error phases', () => {
      expect(getErrorKind(createInitialState())).toBeNull();
    });

    it('returns null for null state', () => {
      expect(getErrorKind(null)).toBeNull();
    });
  });
});

// ─── Mutation Controller ──────────────────────────────────────────────────────

describe('lib/client/async/mutation-controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateIdempotencyKey', () => {
    it('returns a non-empty string', () => {
      const key = generateIdempotencyKey();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('generates unique keys on successive calls', () => {
      const keys = new Set(Array.from({ length: 100 }, () => generateIdempotencyKey()));
      expect(keys.size).toBe(100);
    });
  });

  describe('createMutationController', () => {
    it('starts in idle phase', () => {
      const ctrl = createMutationController(createInitialState());
      const state = ctrl.getState();
      expect(state.phase).toBe('idle');
    });

    it('submit generates an idempotency key', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({ name: 'Test' }, { timestamp: 1000 });
      expect(ctrl.getIdempotencyKey()).not.toBeNull();
      expect(typeof ctrl.getIdempotencyKey()).toBe('string');
    });

    it('submit preserves input snapshot', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({ name: 'Test' }, { timestamp: 1000 });
      expect(ctrl.getState().inputSnapshot).toEqual({ name: 'Test' });
    });

    it('blocks duplicate submissions while pending', () => {
      const ctrl = createMutationController(createInitialState());
      const first = ctrl.submit({ name: 'Test' }, { timestamp: 1000 });
      expect(first.blocked).toBe(false);
      const second = ctrl.submit({ name: 'Test2' }, { timestamp: 2000 });
      expect(second.blocked).toBe(true);
      expect(ctrl.getState().phase).toBe('pending');
    });

    it('handleSuccess clears idempotency key (terminal)', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({}, { timestamp: 1000 });
      expect(ctrl.getIdempotencyKey()).not.toBeNull();
      ctrl.handleSuccess({ id: 'BK-1' });
      expect(ctrl.getIdempotencyKey()).toBeNull();
      expect(ctrl.getState().phase).toBe('success');
    });

    it('handleSuccess invokes onInvalidate with affected keys', () => {
      const onInvalidate = vi.fn();
      const ctrl = createMutationController(createInitialState(), {
        affectedKeys: ['bookings:list'],
        onInvalidate,
      });
      ctrl.submit({}, { timestamp: 1000 });
      ctrl.handleSuccess({ id: 'BK-1' });
      expect(onInvalidate).toHaveBeenCalledWith(['bookings:list']);
    });

    it('handleSuccess invokes onSuccess callback', () => {
      const onSuccess = vi.fn();
      const ctrl = createMutationController(createInitialState(), { onSuccess });
      ctrl.submit({}, { timestamp: 1000 });
      ctrl.handleSuccess({ id: 'BK-1' });
      expect(onSuccess).toHaveBeenCalledWith({ id: 'BK-1' });
    });

    it('handleError preserves idempotency key for retry', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({ email: 'a@b.com' }, { timestamp: 1000 });
      const key = ctrl.getIdempotencyKey();
      ctrl.handleError({ message: 'Server error', retryable: true });
      expect(ctrl.getIdempotencyKey()).toBe(key);
      expect(ctrl.getState().phase).toBe('error');
    });

    it('handleError invokes onError callback', () => {
      const onError = vi.fn();
      const ctrl = createMutationController(createInitialState(), { onError });
      ctrl.submit({}, { timestamp: 1000 });
      ctrl.handleError({ message: 'Fail' });
      expect(onError).toHaveBeenCalledWith({ message: 'Fail' });
    });

    it('retry reuses idempotency key', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({ x: 1 }, { timestamp: 1000 });
      const key = ctrl.getIdempotencyKey();
      ctrl.handleError({ message: 'err', retryable: true });
      const { blocked } = ctrl.retry({ timestamp: 2000 });
      expect(blocked).toBe(false);
      expect(ctrl.getIdempotencyKey()).toBe(key);
      expect(ctrl.getState().phase).toBe('pending');
    });

    it('retry is blocked when already pending', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({}, { timestamp: 1000 });
      const { blocked } = ctrl.retry({ timestamp: 2000 });
      expect(blocked).toBe(true);
    });

    it('reset clears everything', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({ data: 1 }, { timestamp: 1000 });
      ctrl.reset();
      expect(ctrl.getState().phase).toBe('idle');
      expect(ctrl.getIdempotencyKey()).toBeNull();
    });

    it('scheduleLoadingLabel shows loading after PENDING_DELAY_MS', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({}, { timestamp: 1000 });
      const onShowLoading = vi.fn();
      ctrl.scheduleLoadingLabel(onShowLoading);
      expect(onShowLoading).not.toHaveBeenCalled();
      vi.advanceTimersByTime(PENDING_DELAY_MS);
      expect(onShowLoading).toHaveBeenCalledTimes(1);
      expect(ctrl.getState().showLoading).toBe(true);
    });

    it('scheduleLoadingLabel does not fire if resolved before delay', () => {
      const ctrl = createMutationController(createInitialState());
      ctrl.submit({}, { timestamp: 1000 });
      const onShowLoading = vi.fn();
      ctrl.scheduleLoadingLabel(onShowLoading);
      ctrl.handleSuccess({ done: true });
      vi.advanceTimersByTime(PENDING_DELAY_MS);
      expect(onShowLoading).not.toHaveBeenCalled();
    });
  });

  describe('classifyError', () => {
    it('returns network for network errors', () => {
      expect(classifyError({ isNetworkError: true })).toBe('network');
      expect(classifyError({ status: 0 })).toBe('network');
    });

    it('returns not_found for 404', () => {
      expect(classifyError({ status: 404 })).toBe('not_found');
      expect(classifyError({ category: 'NotFound' })).toBe('not_found');
    });

    it('returns validation for 400', () => {
      expect(classifyError({ status: 400 })).toBe('validation');
      expect(classifyError({ category: 'ValidationError' })).toBe('validation');
    });

    it('returns route_error for 500+', () => {
      expect(classifyError({ status: 500 })).toBe('route_error');
      expect(classifyError({ status: 503 })).toBe('route_error');
      expect(classifyError({ category: 'InternalError' })).toBe('route_error');
      expect(classifyError({ category: 'ExternalTimeout' })).toBe('route_error');
      expect(classifyError({ category: 'ExternalUnavailable' })).toBe('route_error');
    });

    it('returns generic for unknown errors', () => {
      expect(classifyError({ status: 403 })).toBe('generic');
      expect(classifyError({})).toBe('generic');
    });

    it('returns generic for null', () => {
      expect(classifyError(null)).toBe('generic');
    });
  });
});

// ─── Reconciliation ───────────────────────────────────────────────────────────

describe('lib/client/async/reconciliation', () => {
  describe('reconcileAfterNavigation', () => {
    it('returns fresh data when available', () => {
      const current = { stale: true };
      const fresh = { fresh: true };
      expect(reconcileAfterNavigation(current, fresh)).toBe(fresh);
    });

    it('returns current data when fresh is null', () => {
      const current = { existing: true };
      expect(reconcileAfterNavigation(current, null)).toBe(current);
    });

    it('returns current data when fresh is undefined', () => {
      const current = { existing: true };
      expect(reconcileAfterNavigation(current, undefined)).toBe(current);
    });

    it('returns null when both are null', () => {
      expect(reconcileAfterNavigation(null, null)).toBeNull();
    });

    it('returns fresh data even if current is null', () => {
      const fresh = { new: true };
      expect(reconcileAfterNavigation(null, fresh)).toBe(fresh);
    });
  });

  describe('reconcileArrayData', () => {
    it('merges arrays by key field', () => {
      const current = [
        { id: '1', name: 'Old A' },
        { id: '2', name: 'B' },
      ];
      const fresh = [
        { id: '1', name: 'New A' },
        { id: '3', name: 'C' },
      ];
      const result = reconcileArrayData(current, fresh);
      expect(result).toEqual([
        { id: '1', name: 'New A' },
        { id: '2', name: 'B' },
        { id: '3', name: 'C' },
      ]);
    });

    it('returns fresh data if current is not an array', () => {
      const fresh = [{ id: '1' }];
      expect(reconcileArrayData(null, fresh)).toEqual(fresh);
    });

    it('returns current if fresh is not an array', () => {
      const current = [{ id: '1' }];
      expect(reconcileArrayData(current, null)).toEqual(current);
    });

    it('uses custom key field', () => {
      const current = [{ uid: 'a', val: 1 }];
      const fresh = [{ uid: 'a', val: 2 }];
      const result = reconcileArrayData(current, fresh, 'uid');
      expect(result).toEqual([{ uid: 'a', val: 2 }]);
    });
  });

  describe('createInvalidationRegistry', () => {
    it('starts with no invalidations', () => {
      const registry = createInvalidationRegistry();
      expect(registry.size()).toBe(0);
      expect(registry.getInvalidatedKeys()).toEqual([]);
    });

    it('invalidates provided keys', () => {
      const registry = createInvalidationRegistry();
      registry.invalidate(['bookings:list', 'booking:BK-1'], { timestamp: 1000 });
      expect(registry.isInvalidated('bookings:list')).toBe(true);
      expect(registry.isInvalidated('booking:BK-1')).toBe(true);
      expect(registry.isInvalidated('other')).toBe(false);
      expect(registry.size()).toBe(2);
    });

    it('resolve removes a key', () => {
      const registry = createInvalidationRegistry();
      registry.invalidate(['a', 'b']);
      registry.resolve('a');
      expect(registry.isInvalidated('a')).toBe(false);
      expect(registry.isInvalidated('b')).toBe(true);
      expect(registry.size()).toBe(1);
    });

    it('clear removes all', () => {
      const registry = createInvalidationRegistry();
      registry.invalidate(['a', 'b', 'c']);
      registry.clear();
      expect(registry.size()).toBe(0);
    });

    it('ignores non-array input', () => {
      const registry = createInvalidationRegistry();
      registry.invalidate(null);
      registry.invalidate('not-array');
      expect(registry.size()).toBe(0);
    });

    it('ignores empty string keys', () => {
      const registry = createInvalidationRegistry();
      registry.invalidate(['', 'valid']);
      expect(registry.size()).toBe(1);
      expect(registry.isInvalidated('valid')).toBe(true);
    });
  });

  describe('reconcilePendingOperation', () => {
    it('returns as-is for non-pending state', () => {
      const idle = createInitialState();
      expect(reconcilePendingOperation(idle)).toBe(idle);
    });

    it('applies success when operation completed during navigation', () => {
      const pending = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 1000,
      });
      const result = reconcilePendingOperation(pending, {
        operationCompleted: true,
        result: { id: 'BK-1' },
      });
      expect(result.phase).toBe('success');
      expect(result.data).toEqual({ id: 'BK-1' });
    });

    it('applies error when operation failed during navigation', () => {
      const pending = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 1000,
      });
      const result = reconcilePendingOperation(pending, {
        operationCompleted: true,
        error: { message: 'Timeout', retryable: true },
      });
      expect(result.phase).toBe('error');
      expect(result.message).toBe('Timeout');
    });

    it('enters reconciling when still pending after navigation', () => {
      const pending = asyncReducer(createInitialState(), {
        type: ASYNC_ACTIONS.SUBMIT,
        timestamp: 1000,
      });
      const result = reconcilePendingOperation(pending, { timestamp: 2000 });
      expect(result.phase).toBe('reconciling');
      expect(result.pendingSince).toBe(2000);
    });

    it('returns null for null input', () => {
      expect(reconcilePendingOperation(null)).toBeNull();
    });
  });

  describe('computeAffectedKeys', () => {
    it('generates list and detail keys', () => {
      const keys = computeAffectedKeys('booking', 'BK-123');
      expect(keys).toContain('booking:list');
      expect(keys).toContain('booking:BK-123');
    });

    it('includes additional keys without duplicates', () => {
      const keys = computeAffectedKeys('booking', 'BK-1', [
        'payments:list',
        'booking:list',
      ]);
      expect(keys).toContain('booking:list');
      expect(keys).toContain('booking:BK-1');
      expect(keys).toContain('payments:list');
      // No duplicates
      expect(keys.filter((k) => k === 'booking:list').length).toBe(1);
    });

    it('handles null resource gracefully', () => {
      const keys = computeAffectedKeys(null, 'id', ['fallback:key']);
      expect(keys).toEqual(['fallback:key']);
    });

    it('handles null resourceId', () => {
      const keys = computeAffectedKeys('booking', null);
      expect(keys).toEqual(['booking:list']);
    });
  });
});
