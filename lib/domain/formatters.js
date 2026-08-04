// lib/domain/formatters.js
// Pure canonical data formatters — no Firebase, no React, no server dependencies.
// All formatters are total functions: they handle null/undefined gracefully
// and always return a non-empty string.

import { RESORT_TIMEZONE } from './occupancy.js';

// ─── Role formatting ─────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const ROLE_LABELS = Object.freeze({
  admin: 'Admin',
  staff: 'Staff',
  guest: 'Guest',
});

/**
 * Format a role identifier to its canonical display label.
 *
 * @param {string|null|undefined} role
 * @returns {string} — 'Admin' | 'Staff' | 'Guest' | 'Unknown'
 */
export function formatRole(role) {
  if (!role || typeof role !== 'string') return 'Unknown';
  const normalized = role.trim().toLowerCase();
  return ROLE_LABELS[normalized] ?? 'Unknown';
}

// ─── Money formatting ────────────────────────────────────────────────────────

/**
 * Format an integer centavo amount to Philippine Peso display string.
 * Uses integer arithmetic to avoid floating-point rounding issues.
 *
 * @param {number|null|undefined} centavos — integer minor currency units
 * @returns {string} — e.g. '₱5,000.00'
 */
export function formatMoney(centavos) {
  if (centavos == null || typeof centavos !== 'number' || !Number.isFinite(centavos)) {
    return '₱0.00';
  }

  const rounded = Math.round(centavos);
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded);
  const pesos = Math.floor(abs / 100);
  const cents = abs % 100;

  // Format pesos with thousand separators
  const pesosStr = pesos.toLocaleString('en-US');
  const centsStr = cents.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}₱${pesosStr}.${centsStr}`;
}

// ─── Date formatting ─────────────────────────────────────────────────────────

/**
 * Format a date string (YYYY-MM-DD or ISO) to a human-friendly resort date.
 *
 * @param {string|null|undefined} dateString — YYYY-MM-DD or ISO 8601
 * @returns {string} — e.g. 'Jan 15, 2025'
 */
export function formatResortDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return '—';

  try {
    // Handle YYYY-MM-DD without timezone shifting by parsing components directly
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    let date;

    if (dateOnly) {
      const [, yearStr, monthStr, dayStr] = dateOnly;
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);

      // Validate month and day ranges
      if (month < 1 || month > 12 || day < 1 || day > 31) return '—';

      // Use UTC to avoid timezone-induced date shifts
      date = new Date(Date.UTC(year, month - 1, day));

      // Verify the date components didn't roll over (e.g., Feb 30 → Mar 2)
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        return '—';
      }
    } else {
      date = new Date(dateString);
    }

    if (isNaN(date.getTime())) return '—';

    // Format using the components to avoid timezone issues
    if (dateOnly) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }

    // For full ISO strings, format in resort timezone
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: RESORT_TIMEZONE,
    });
  } catch {
    return '—';
  }
}

// ─── Time formatting ─────────────────────────────────────────────────────────

/**
 * Format an ISO datetime string to a human-friendly resort time.
 *
 * @param {string|null|undefined} isoString — ISO 8601 datetime
 * @returns {string} — e.g. '2:30 PM'
 */
export function formatResortTime(isoString) {
  if (!isoString || typeof isoString !== 'string') return '—';

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: RESORT_TIMEZONE,
    });
  } catch {
    return '—';
  }
}

// ─── Booking ID formatting ───────────────────────────────────────────────────

/**
 * Format a booking ID for display. Returns the ID in uppercase with
 * a "BK-" prefix if not already present.
 *
 * @param {string|null|undefined} id
 * @returns {string} — e.g. 'BK-ABC123'
 */
export function formatBookingId(id) {
  if (!id || typeof id !== 'string') return '—';
  const trimmed = id.trim();
  if (!trimmed) return '—';

  const upper = trimmed.toUpperCase();
  return upper.startsWith('BK-') ? upper : `BK-${upper}`;
}

// ─── Reservation status formatting ──────────────────────────────────────────

/** @type {Record<string, string>} */
const STATUS_LABELS = Object.freeze({
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  completed: 'Completed',
  cancelled: 'Cancelled',
  unpaid: 'Unpaid',
  deposit_pending: 'Deposit Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  requested: 'Requested',
  details_provided: 'Details Provided',
  proof_submitted: 'Proof Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  not_requested: 'Not Requested',
  processing: 'Processing',
  refunded: 'Refunded',
  failed: 'Failed',
  eligible: 'Eligible',
});

/**
 * Format a canonical reservation/payment/refund status to a human-friendly label.
 *
 * @param {string|null|undefined} status
 * @returns {string} — e.g. 'Pending Payment', 'Confirmed', etc.
 */
export function formatReservationStatus(status) {
  if (!status || typeof status !== 'string') return '—';
  const normalized = status.trim().toLowerCase().replace(/\s+/g, '_');
  return STATUS_LABELS[normalized] ?? '—';
}
