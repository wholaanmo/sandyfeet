// tests/unit/hooks.unit.test.js
// Unit tests for lib/client/hooks — useReservation, usePayment, useAuth.
// Tests the hook logic via the underlying mutation controller (no React rendering needed).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the pure logic behind the hooks by importing the mutation controller
// and the route validation logic directly. The hooks are thin React wrappers.
import {
  createMutationController,
  generateIdempotencyKey,
  classifyError,
} from '../../lib/client/async/mutation-controller.js';
import { createInitialState, ASYNC_PHASES } from '../../lib/client/async/reducer.js';
import { ROUTE_MANIFEST } from '../../lib/routes/manifest.js';

// ─── Route Manifest Validation ──────────────────────────────────────────────

describe('hooks route manifest validation', () => {
  const reservationRoutes = [
    '/api/reservations/create',
    '/api/reservations/[id]/edit',
    '/api/reservations/[id]/cancel',
  ];

  const paymentRoutes = [
    '/api/payments/[id]/transition',
    '/api/payments/[id]/refund',
  ];

  const authRoutes = ['/api/auth/session'];

  it('reservation routes exist in manifest', () => {
    for (const pattern of reservationRoutes) {
      const found = ROUTE_MANIFEST.some((r) => r.pattern === pattern);
      expect(found, `Missing route: ${pattern}`).toBe(true);
    }
  });

  it('payment routes exist in manifest', () => {
    for (const pattern of paymentRoutes) {
      const found = ROUTE_MANIFEST.some((r) => r.pattern === pattern);
      expect(found, `Missing route: ${pattern}`).toBe(true);
    }
  });

  it('auth session route exists in manifest', () => {
    for (const pattern of authRoutes) {
      const found = ROUTE_MANIFEST.some((r) => r.pattern === pattern);
      expect(found, `Missing route: ${pattern}`).toBe(true);
    }
  });

  it('reservation routes require POST method', () => {
    for (const pattern of reservationRoutes) {
      const route = ROUTE_MANIFEST.find((r) => r.pattern === pattern);
      expect(route.methods).toContain('POST');
    }
  });

  it('payment routes require POST method', () => {
    for (const pattern of paymentRoutes) {
      const route = ROUTE_MANIFEST.find((r) => r.pattern === pattern);
      expect(route.methods).toContain('POST');
    }
  });

  it('auth session route supports POST and DELETE', () => {
    const route = ROUTE_MANIFEST.find((r) => r.pattern === '/api/auth/session');
    expect(route.methods).toContain('POST');
    expect(route.methods).toContain('DELETE');
  });
});

// ─── Mutation Controller Integration (backing useReservation / usePayment) ──

describe('mutation controller for hooks', () => {
  let controller;

  beforeEach(() => {
    controller = createMutationController(createInitialState());
  });

  it('generates an idempotency key on first submit', () => {
    const { state, blocked } = controller.submit({ checkIn: '2025-01-01' });
    expect(blocked).toBe(false);
    expect(state.phase).toBe(ASYNC_PHASES.PENDING);
    expect(controller.getIdempotencyKey()).toBeTruthy();
  });

  it('blocks duplicate submissions while pending', () => {
    controller.submit({ checkIn: '2025-01-01' });
    const { blocked } = controller.submit({ checkIn: '2025-01-02' });
    expect(blocked).toBe(true);
  });

  it('preserves idempotency key through error and retry', () => {
    controller.submit({ checkIn: '2025-01-01' });
    const key = controller.getIdempotencyKey();

    controller.handleError({ message: 'Network error', retryable: true, errorKind: 'network' });
    expect(controller.getIdempotencyKey()).toBe(key);

    const { state } = controller.retry();
    expect(state.phase).toBe(ASYNC_PHASES.PENDING);
    expect(controller.getIdempotencyKey()).toBe(key);
  });

  it('clears idempotency key on success', () => {
    controller.submit({ checkIn: '2025-01-01' });
    expect(controller.getIdempotencyKey()).toBeTruthy();

    controller.handleSuccess({ bookingId: 'BK-123' });
    expect(controller.getIdempotencyKey()).toBeNull();
  });

  it('clears idempotency key on reset', () => {
    controller.submit({ checkIn: '2025-01-01' });
    expect(controller.getIdempotencyKey()).toBeTruthy();

    controller.reset();
    expect(controller.getIdempotencyKey()).toBeNull();
    expect(controller.getState().phase).toBe(ASYNC_PHASES.IDLE);
  });

  it('preserves input snapshot across errors', () => {
    const input = { checkIn: '2025-01-01', checkOut: '2025-01-03' };
    controller.submit(input);
    controller.handleError({ message: 'Capacity exceeded', retryable: true });

    const state = controller.getState();
    expect(state.inputSnapshot).toEqual(input);
    expect(state.phase).toBe(ASYNC_PHASES.ERROR);
    expect(state.retryable).toBe(true);
  });

  it('calls onInvalidate with affected keys on success', () => {
    const onInvalidate = vi.fn();
    const ctrl = createMutationController(createInitialState(), {
      affectedKeys: ['bookings', 'availability'],
      onInvalidate,
    });

    ctrl.submit({});
    ctrl.handleSuccess({ bookingId: 'BK-456' });

    expect(onInvalidate).toHaveBeenCalledWith(['bookings', 'availability']);
  });

  it('calls onSuccess callback on success', () => {
    const onSuccess = vi.fn();
    const ctrl = createMutationController(createInitialState(), { onSuccess });

    ctrl.submit({});
    ctrl.handleSuccess({ bookingId: 'BK-789' });

    expect(onSuccess).toHaveBeenCalledWith({ bookingId: 'BK-789' });
  });

  it('calls onError callback on error', () => {
    const onError = vi.fn();
    const ctrl = createMutationController(createInitialState(), { onError });

    ctrl.submit({});
    ctrl.handleError({ message: 'Failed', errorKind: 'validation' });

    expect(onError).toHaveBeenCalledWith({ message: 'Failed', errorKind: 'validation' });
  });
});

// ─── Error Classification ──────────────────────────────────────────────────

describe('classifyError for hook error handling', () => {
  it('classifies network errors', () => {
    expect(classifyError({ isNetworkError: true })).toBe('network');
    expect(classifyError({ status: 0 })).toBe('network');
  });

  it('classifies not-found errors', () => {
    expect(classifyError({ status: 404 })).toBe('not_found');
    expect(classifyError({ category: 'NotFound' })).toBe('not_found');
  });

  it('classifies validation errors', () => {
    expect(classifyError({ status: 400 })).toBe('validation');
    expect(classifyError({ category: 'ValidationError' })).toBe('validation');
  });

  it('classifies route/server errors', () => {
    expect(classifyError({ status: 500 })).toBe('route_error');
    expect(classifyError({ status: 503 })).toBe('route_error');
    expect(classifyError({ category: 'InternalError' })).toBe('route_error');
    expect(classifyError({ category: 'ExternalTimeout' })).toBe('route_error');
  });

  it('classifies generic errors', () => {
    expect(classifyError({ status: 403 })).toBe('generic');
    expect(classifyError({ status: 409 })).toBe('generic');
    expect(classifyError(null)).toBe('generic');
  });
});

// ─── Idempotency Key Generation ─────────────────────────────────────────────

describe('generateIdempotencyKey', () => {
  it('produces unique keys', () => {
    const keys = new Set();
    for (let i = 0; i < 100; i++) {
      keys.add(generateIdempotencyKey());
    }
    expect(keys.size).toBe(100);
  });

  it('produces string keys', () => {
    const key = generateIdempotencyKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});

// ─── Barrel Export ──────────────────────────────────────────────────────────

describe('hooks barrel export', () => {
  it('exports useReservation, usePayment, useAuth', async () => {
    const hooks = await import('../../lib/client/hooks/index.js');
    expect(hooks.useReservation).toBeDefined();
    expect(typeof hooks.useReservation).toBe('function');
    expect(hooks.usePayment).toBeDefined();
    expect(typeof hooks.usePayment).toBe('function');
    expect(hooks.useAuth).toBeDefined();
    expect(typeof hooks.useAuth).toBe('function');
  });
});
