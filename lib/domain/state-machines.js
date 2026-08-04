// lib/domain/state-machines.js
// Canonical business state machines — pure, no Firebase, no React, no browser globals.
// Each machine is an adjacency map: { state: [allowed_next_states] }
// Guards and role checks are declarative metadata consumed by service layers.

/**
 * Payment request lifecycle.
 * requested → details_provided → proof_submitted → under_review → approved|rejected|cancelled
 * Cancelled is reachable from any non-terminal state.
 */
export const PAYMENT_REQUEST_MACHINE = Object.freeze({
  requested: ['details_provided', 'cancelled'],
  details_provided: ['proof_submitted', 'cancelled'],
  proof_submitted: ['under_review', 'cancelled'],
  under_review: ['approved', 'rejected', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
});

/**
 * Reservation payment balance lifecycle.
 * unpaid → deposit_pending → partially_paid → paid
 */
export const RESERVATION_PAYMENT_MACHINE = Object.freeze({
  unpaid: ['deposit_pending'],
  deposit_pending: ['partially_paid', 'paid'],
  partially_paid: ['paid'],
  paid: [],
});

/**
 * Refund lifecycle.
 * not_requested → requested → approved|rejected → processing → refunded|failed
 */
export const REFUND_MACHINE = Object.freeze({
  not_requested: ['requested'],
  requested: ['approved', 'rejected'],
  approved: ['processing'],
  rejected: [],
  processing: ['refunded', 'failed'],
  refunded: [],
  failed: [],
});

/**
 * Check-in lifecycle.
 * eligible → checked_in (terminal)
 */
export const CHECK_IN_MACHINE = Object.freeze({
  eligible: ['checked_in'],
  checked_in: [],
});

/**
 * Reservation status lifecycle.
 * pending_payment → confirmed → checked_in → completed
 * pending_payment|confirmed → cancelled (from pre-checked-in states)
 */
export const RESERVATION_STATUS_MACHINE = Object.freeze({
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['completed'],
  completed: [],
  cancelled: [],
});

/**
 * Check whether a transition from `from` to `to` is valid within a machine.
 *
 * @param {Record<string, string[]>} machine - Adjacency map
 * @param {string} from - Current state
 * @param {string} to - Target state
 * @returns {boolean}
 */
export function isValidTransition(machine, from, to) {
  if (!machine || typeof machine !== 'object') return false;
  if (!from || !to || typeof from !== 'string' || typeof to !== 'string') return false;
  const allowed = machine[from];
  if (!Array.isArray(allowed)) return false;
  return allowed.includes(to);
}

/**
 * Get all states reachable from `from` within a machine.
 *
 * @param {Record<string, string[]>} machine - Adjacency map
 * @param {string} from - Current state
 * @returns {string[]} - Array of allowed next states (empty if terminal or unknown)
 */
export function getNextStates(machine, from) {
  if (!machine || typeof machine !== 'object') return [];
  if (!from || typeof from !== 'string') return [];
  const allowed = machine[from];
  if (!Array.isArray(allowed)) return [];
  return [...allowed];
}

/**
 * Get all terminal states (states with no outgoing transitions) in a machine.
 *
 * @param {Record<string, string[]>} machine - Adjacency map
 * @returns {string[]}
 */
export function getTerminalStates(machine) {
  if (!machine || typeof machine !== 'object') return [];
  return Object.entries(machine)
    .filter(([, next]) => Array.isArray(next) && next.length === 0)
    .map(([state]) => state);
}

/**
 * Get all states declared in a machine (keys of the adjacency map).
 *
 * @param {Record<string, string[]>} machine - Adjacency map
 * @returns {string[]}
 */
export function getAllStates(machine) {
  if (!machine || typeof machine !== 'object') return [];
  return Object.keys(machine);
}

/**
 * Legacy status mappings — maps old/inconsistent status strings to canonical ones.
 * Used at repository edges to normalize data read from Firestore.
 */
export const LEGACY_STATUS_MAPPINGS = Object.freeze({
  // Reservation statuses
  pending: 'pending_payment',
  Pending: 'pending_payment',
  'Pending Payment': 'pending_payment',
  pending_payment: 'pending_payment',
  Confirmed: 'confirmed',
  confirmed: 'confirmed',
  'Checked In': 'checked_in',
  checked_in: 'checked_in',
  checkedIn: 'checked_in',
  Completed: 'completed',
  completed: 'completed',
  Cancelled: 'cancelled',
  cancelled: 'cancelled',
  canceled: 'cancelled',

  // Payment statuses
  unpaid: 'unpaid',
  Unpaid: 'unpaid',
  'deposit pending': 'deposit_pending',
  deposit_pending: 'deposit_pending',
  'Deposit Pending': 'deposit_pending',
  'partially paid': 'partially_paid',
  partially_paid: 'partially_paid',
  'Partially Paid': 'partially_paid',
  paid: 'paid',
  Paid: 'paid',

  // Payment request statuses
  requested: 'requested',
  Requested: 'requested',
  'details provided': 'details_provided',
  details_provided: 'details_provided',
  'proof submitted': 'proof_submitted',
  proof_submitted: 'proof_submitted',
  'under review': 'under_review',
  under_review: 'under_review',
  'Under Review': 'under_review',
  approved: 'approved',
  Approved: 'approved',
  rejected: 'rejected',
  Rejected: 'rejected',

  // Refund statuses
  not_requested: 'not_requested',
  'not requested': 'not_requested',
  processing: 'processing',
  Processing: 'processing',
  refunded: 'refunded',
  Refunded: 'refunded',
  failed: 'failed',
  Failed: 'failed',
});

/**
 * Normalize a legacy status string to its canonical form.
 * Returns the canonical value if mapped, or the original string if no mapping exists.
 *
 * @param {string} status - The status string to normalize
 * @returns {string} - The canonical status
 */
export function normalizeLegacyStatus(status) {
  if (!status || typeof status !== 'string') return status;
  const trimmed = status.trim();
  return LEGACY_STATUS_MAPPINGS[trimmed] ?? trimmed;
}

/**
 * Transition guard metadata for role-based access control.
 * Each entry specifies which roles can perform a transition.
 */
export const TRANSITION_GUARDS = Object.freeze({
  // Payment request transitions
  'payment_request:requested->details_provided': { roles: ['guest'] },
  'payment_request:details_provided->proof_submitted': { roles: ['guest'] },
  'payment_request:proof_submitted->under_review': { roles: ['admin', 'staff'] },
  'payment_request:under_review->approved': { roles: ['admin'] },
  'payment_request:under_review->rejected': { roles: ['admin'] },
  'payment_request:requested->cancelled': { roles: ['guest', 'admin'] },
  'payment_request:details_provided->cancelled': { roles: ['guest', 'admin'] },
  'payment_request:proof_submitted->cancelled': { roles: ['admin'] },
  'payment_request:under_review->cancelled': { roles: ['admin'] },

  // Reservation payment transitions
  'reservation_payment:unpaid->deposit_pending': { roles: ['guest', 'admin', 'staff'] },
  'reservation_payment:deposit_pending->partially_paid': { roles: ['admin', 'staff'] },
  'reservation_payment:deposit_pending->paid': { roles: ['admin', 'staff'] },
  'reservation_payment:partially_paid->paid': { roles: ['admin', 'staff'] },

  // Refund transitions
  'refund:not_requested->requested': { roles: ['guest', 'admin'] },
  'refund:requested->approved': { roles: ['admin'] },
  'refund:requested->rejected': { roles: ['admin'] },
  'refund:approved->processing': { roles: ['admin', 'staff'] },
  'refund:processing->refunded': { roles: ['admin', 'staff'] },
  'refund:processing->failed': { roles: ['admin', 'staff'] },

  // Reservation status transitions
  'reservation:pending_payment->confirmed': { roles: ['admin', 'staff'] },
  'reservation:pending_payment->cancelled': { roles: ['guest', 'admin'] },
  'reservation:confirmed->checked_in': { roles: ['admin', 'staff'] },
  'reservation:confirmed->cancelled': { roles: ['guest', 'admin'] },
  'reservation:checked_in->completed': { roles: ['admin', 'staff'] },

  // Check-in transitions
  'check_in:eligible->checked_in': { roles: ['admin', 'staff'] },
});

/**
 * Get the guard key for a machine/transition pair.
 *
 * @param {string} machinePrefix - Machine prefix (e.g., 'payment_request', 'reservation')
 * @param {string} from - Current state
 * @param {string} to - Target state
 * @returns {string} - Guard key
 */
export function getGuardKey(machinePrefix, from, to) {
  return `${machinePrefix}:${from}->${to}`;
}

/**
 * Check whether an actor role is allowed to perform a transition.
 *
 * @param {string} machinePrefix - Machine prefix
 * @param {string} from - Current state
 * @param {string} to - Target state
 * @param {string} actorRole - The actor's role
 * @returns {boolean}
 */
export function isRoleAllowedForTransition(machinePrefix, from, to, actorRole) {
  if (!actorRole || typeof actorRole !== 'string') return false;
  const key = getGuardKey(machinePrefix, from, to);
  const guard = TRANSITION_GUARDS[key];
  if (!guard || !Array.isArray(guard.roles)) return false;
  return guard.roles.includes(actorRole);
}
