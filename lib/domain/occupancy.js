// lib/domain/occupancy.js
// Pure canonical occupancy policies — no Firebase, no React, no browser globals.

/**
 * The ONE canonical set of active occupancy statuses that consume room or day-tour capacity.
 * Every availability calculation, state transition, ledger update, cancellation,
 * and reconciliation MUST use this array as the single source of truth.
 */
export const ACTIVE_OCCUPANCY_STATUSES = Object.freeze([
  'confirmed',
  'checked_in',
  'pending_payment',
]);

/** Resort timezone used for all local date calculations. */
export const RESORT_TIMEZONE = 'Asia/Manila';

/**
 * Validate and normalize a value to a YYYY-MM-DD date string in the resort timezone.
 *
 * Accepts: Date objects, ISO strings, YYYY-MM-DD strings, Firestore-like timestamp objects.
 * Returns null for invalid or unparseable inputs.
 *
 * @param {unknown} value — the value to normalize
 * @param {string} [resortTimeZone] — IANA timezone (defaults to Asia/Manila)
 * @returns {string | null} — YYYY-MM-DD string or null
 */
export function normalizeLocalDate(value, resortTimeZone = RESORT_TIMEZONE) {
  if (value == null) return null;

  let date = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    // If already a valid YYYY-MM-DD, validate it parses to a real date
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      const check = new Date(Date.UTC(y, m - 1, d));
      if (check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d) {
        return value;
      }
      return null;
    }
    date = new Date(value);
  } else if (typeof value === 'object' && typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value === 'object' && typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  } else {
    return null;
  }

  if (!date || Number.isNaN(date.getTime())) return null;

  // Format in resort timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: resortTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // en-CA uses YYYY-MM-DD format
  return formatter.format(date);
}

/**
 * Expand a check-in/check-out range into an array of occupied date keys.
 * Check-in is inclusive, check-out is exclusive (the guest leaves on check-out day).
 *
 * @param {string} checkIn — YYYY-MM-DD check-in date
 * @param {string} checkOut — YYYY-MM-DD check-out date
 * @returns {string[]} — array of YYYY-MM-DD strings representing occupied nights
 */
export function occupiedDateKeys(checkIn, checkOut) {
  if (!checkIn || !checkOut) return [];
  if (typeof checkIn !== 'string' || typeof checkOut !== 'string') return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return [];
  if (checkOut <= checkIn) return [];

  const keys = [];
  const [startY, startM, startD] = checkIn.split('-').map(Number);

  // Use UTC noon to avoid DST edge cases in iteration
  let current = new Date(Date.UTC(startY, startM - 1, startD, 12, 0, 0));
  const [endY, endM, endD] = checkOut.split('-').map(Number);
  const end = new Date(Date.UTC(endY, endM - 1, endD, 12, 0, 0));

  // Safety bound: max 365 days to prevent infinite loops on bad data
  const MAX_DAYS = 365;
  let count = 0;

  while (current < end && count < MAX_DAYS) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
    count++;
  }

  return keys;
}

/**
 * Check whether a status is an active occupancy status.
 *
 * @param {string} status
 * @returns {boolean}
 */
export function isActiveOccupancy(status) {
  return ACTIVE_OCCUPANCY_STATUSES.includes(status);
}
