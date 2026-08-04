// lib/domain/booking-draft.js
// Versioned booking-draft serialization with safe empty recovery.
// Pure module — no Firebase, no React, no browser globals.

/**
 * Current schema version for booking drafts.
 * Increment when the draft shape changes in a backward-incompatible way.
 */
export const DRAFT_SCHEMA_VERSION = 1;

/**
 * Create a safe empty draft result with a reason.
 *
 * @param {string} reason — why the draft could not be recovered
 * @returns {{ empty: true, reason: string }}
 */
function emptyDraft(reason) {
  return { empty: true, reason };
}

/**
 * Normalize a draft's fields to canonical form for comparison.
 * Strips undefined values and normalizes optional fields.
 *
 * @param {object} draft — raw draft object
 * @returns {object} — normalized draft
 */
function normalizeDraft(draft) {
  const normalized = {};

  // Required string fields
  if (draft.checkIn != null) normalized.checkIn = String(draft.checkIn);
  if (draft.checkOut != null) normalized.checkOut = String(draft.checkOut);
  if (draft.selectedDate != null) normalized.selectedDate = String(draft.selectedDate);

  // Room selections
  if (Array.isArray(draft.rooms)) {
    normalized.rooms = draft.rooms.map((r) => ({
      roomId: String(r.roomId || ''),
      quantity: Math.max(1, Math.floor(Number(r.quantity) || 1)),
    }));
  }

  // Guest counts
  if (draft.adults != null) normalized.adults = Math.max(0, Math.floor(Number(draft.adults) || 0));
  if (draft.children != null) normalized.children = Math.max(0, Math.floor(Number(draft.children) || 0));
  if (draft.seniors != null) normalized.seniors = Math.max(0, Math.floor(Number(draft.seniors) || 0));

  // Payment selection
  if (draft.paymentMethod != null) normalized.paymentMethod = String(draft.paymentMethod);

  // Booking type flags
  if (draft.isDayTour != null) normalized.isDayTour = Boolean(draft.isDayTour);
  if (draft.isExclusiveResort != null) normalized.isExclusiveResort = Boolean(draft.isExclusiveResort);

  // Optional notes/special requests
  if (draft.notes != null) normalized.notes = String(draft.notes);
  if (draft.specialRequests != null) normalized.specialRequests = String(draft.specialRequests);

  // Contact info
  if (draft.guestName != null) normalized.guestName = String(draft.guestName);
  if (draft.email != null) normalized.email = String(draft.email);
  if (draft.phone != null) normalized.phone = String(draft.phone);

  return normalized;
}

/**
 * Serialize a booking draft to a versioned JSON string.
 *
 * @param {object} draft — the booking draft to serialize
 * @returns {string} — JSON string with version marker
 */
export function serializeBookingDraft(draft) {
  if (!draft || typeof draft !== 'object') {
    throw new Error('Draft must be a non-null object');
  }

  const normalized = normalizeDraft(draft);

  const envelope = {
    v: DRAFT_SCHEMA_VERSION,
    data: normalized,
  };

  return JSON.stringify(envelope);
}

/**
 * Deserialize a booking draft from raw browser-storage data.
 *
 * If the raw value is malformed, has an unsupported version, or fails validation,
 * returns a safe empty draft with a reason instead of throwing.
 *
 * @param {unknown} raw — raw value from browser storage (string or other)
 * @returns {object} — normalized BookingDraft or { empty: true, reason: string }
 */
export function deserializeBookingDraft(raw) {
  // Null/undefined/empty
  if (raw == null) return emptyDraft('No draft data');
  if (raw === '') return emptyDraft('Empty draft data');

  // Must be a string
  if (typeof raw !== 'string') return emptyDraft('Draft data is not a string');

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyDraft('Draft data is not valid JSON');
  }

  // Must be an object with version
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyDraft('Draft data is not a valid envelope');
  }

  // Version check
  if (typeof parsed.v !== 'number' || parsed.v < 1) {
    return emptyDraft('Draft has no valid version');
  }

  if (parsed.v > DRAFT_SCHEMA_VERSION) {
    return emptyDraft(`Unsupported draft version: ${parsed.v}`);
  }

  // Data must be an object
  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return emptyDraft('Draft data payload is invalid');
  }

  // Normalize and return
  return normalizeDraft(parsed.data);
}
