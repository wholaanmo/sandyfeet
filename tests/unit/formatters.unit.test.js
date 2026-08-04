// tests/unit/formatters.unit.test.js
// Unit tests for lib/domain/formatters.js and lib/domain/tokens.js
import { describe, it, expect } from 'vitest';

import {
  formatRole,
  formatMoney,
  formatResortDate,
  formatResortTime,
  formatBookingId,
  formatReservationStatus,
} from '../../lib/domain/formatters.js';

import {
  VALID_TYPOGRAPHY_ROLES,
  VALID_COLOR_ROLES,
  VALID_TEXT_SIZES,
  VALID_FONT_WEIGHTS,
  VALID_LINE_HEIGHTS,
  VALID_SPACING_TOKENS,
  VALID_CONTROL_SIZES,
  VALID_TRANSITION_DURATIONS,
  VALID_EASINGS,
  TOKEN_CATEGORIES,
  validateToken,
  isValidColorRole,
  isValidTypographyRole,
} from '../../lib/domain/tokens.js';

// ─── formatRole ──────────────────────────────────────────────────────────────

describe('formatRole', () => {
  it('formats canonical roles to display labels', () => {
    expect(formatRole('admin')).toBe('Admin');
    expect(formatRole('staff')).toBe('Staff');
    expect(formatRole('guest')).toBe('Guest');
  });

  it('is case-insensitive', () => {
    expect(formatRole('ADMIN')).toBe('Admin');
    expect(formatRole('Staff')).toBe('Staff');
    expect(formatRole('GUEST')).toBe('Guest');
  });

  it('trims whitespace', () => {
    expect(formatRole('  admin  ')).toBe('Admin');
  });

  it('returns Unknown for unrecognized roles', () => {
    expect(formatRole('superuser')).toBe('Unknown');
    expect(formatRole('moderator')).toBe('Unknown');
  });

  it('handles null/undefined gracefully', () => {
    expect(formatRole(null)).toBe('Unknown');
    expect(formatRole(undefined)).toBe('Unknown');
    expect(formatRole('')).toBe('Unknown');
  });

  it('handles non-string types gracefully', () => {
    expect(formatRole(123)).toBe('Unknown');
    expect(formatRole({})).toBe('Unknown');
  });
});

// ─── formatMoney ─────────────────────────────────────────────────────────────

describe('formatMoney', () => {
  it('formats centavos to PHP currency string', () => {
    expect(formatMoney(500000)).toBe('₱5,000.00');
    expect(formatMoney(100)).toBe('₱1.00');
    expect(formatMoney(99)).toBe('₱0.99');
    expect(formatMoney(1000000)).toBe('₱10,000.00');
  });

  it('formats zero correctly', () => {
    expect(formatMoney(0)).toBe('₱0.00');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(-500000)).toBe('-₱5,000.00');
    expect(formatMoney(-99)).toBe('-₱0.99');
  });

  it('rounds non-integer centavos', () => {
    expect(formatMoney(500050.6)).toBe('₱5,000.51');
  });

  it('handles large amounts', () => {
    expect(formatMoney(100000000)).toBe('₱1,000,000.00');
  });

  it('returns ₱0.00 for null/undefined', () => {
    expect(formatMoney(null)).toBe('₱0.00');
    expect(formatMoney(undefined)).toBe('₱0.00');
  });

  it('returns ₱0.00 for non-number types', () => {
    expect(formatMoney('5000')).toBe('₱0.00');
    expect(formatMoney(NaN)).toBe('₱0.00');
    expect(formatMoney(Infinity)).toBe('₱0.00');
  });
});

// ─── formatResortDate ────────────────────────────────────────────────────────

describe('formatResortDate', () => {
  it('formats YYYY-MM-DD to human-friendly date', () => {
    expect(formatResortDate('2025-01-15')).toBe('Jan 15, 2025');
    expect(formatResortDate('2025-12-25')).toBe('Dec 25, 2025');
    expect(formatResortDate('2025-06-01')).toBe('Jun 1, 2025');
  });

  it('handles ISO 8601 datetime strings', () => {
    // This is midnight Manila time = previous day in UTC
    const result = formatResortDate('2025-01-15T16:00:00Z');
    // In Manila timezone (UTC+8), this is Jan 16 at midnight
    expect(result).toBe('Jan 16, 2025');
  });

  it('returns dash for null/undefined', () => {
    expect(formatResortDate(null)).toBe('—');
    expect(formatResortDate(undefined)).toBe('—');
    expect(formatResortDate('')).toBe('—');
  });

  it('returns dash for invalid dates', () => {
    expect(formatResortDate('not-a-date')).toBe('—');
    expect(formatResortDate('2025-13-01')).toBe('—');
  });

  it('handles non-string types gracefully', () => {
    expect(formatResortDate(12345)).toBe('—');
    expect(formatResortDate({})).toBe('—');
  });
});

// ─── formatResortTime ────────────────────────────────────────────────────────

describe('formatResortTime', () => {
  it('formats ISO datetime to 12-hour time in resort timezone', () => {
    // 2025-01-15 06:30:00 UTC = 2:30 PM Manila (UTC+8)
    const result = formatResortTime('2025-01-15T06:30:00Z');
    expect(result).toBe('2:30 PM');
  });

  it('formats midnight correctly', () => {
    // Midnight UTC = 8:00 AM Manila
    const result = formatResortTime('2025-06-10T00:00:00Z');
    expect(result).toBe('8:00 AM');
  });

  it('returns dash for null/undefined', () => {
    expect(formatResortTime(null)).toBe('—');
    expect(formatResortTime(undefined)).toBe('—');
    expect(formatResortTime('')).toBe('—');
  });

  it('returns dash for invalid datetime', () => {
    expect(formatResortTime('not-a-date')).toBe('—');
  });

  it('handles non-string types gracefully', () => {
    expect(formatResortTime(12345)).toBe('—');
  });
});

// ─── formatBookingId ─────────────────────────────────────────────────────────

describe('formatBookingId', () => {
  it('adds BK- prefix and uppercases', () => {
    expect(formatBookingId('abc123')).toBe('BK-ABC123');
    expect(formatBookingId('xyz789')).toBe('BK-XYZ789');
  });

  it('preserves existing BK- prefix', () => {
    expect(formatBookingId('BK-ABC123')).toBe('BK-ABC123');
    expect(formatBookingId('bk-abc123')).toBe('BK-ABC123');
  });

  it('trims whitespace', () => {
    expect(formatBookingId('  abc123  ')).toBe('BK-ABC123');
  });

  it('returns dash for null/undefined/empty', () => {
    expect(formatBookingId(null)).toBe('—');
    expect(formatBookingId(undefined)).toBe('—');
    expect(formatBookingId('')).toBe('—');
    expect(formatBookingId('   ')).toBe('—');
  });

  it('handles non-string types gracefully', () => {
    expect(formatBookingId(123)).toBe('—');
    expect(formatBookingId({})).toBe('—');
  });
});

// ─── formatReservationStatus ─────────────────────────────────────────────────

describe('formatReservationStatus', () => {
  it('formats canonical reservation statuses', () => {
    expect(formatReservationStatus('pending_payment')).toBe('Pending Payment');
    expect(formatReservationStatus('confirmed')).toBe('Confirmed');
    expect(formatReservationStatus('checked_in')).toBe('Checked In');
    expect(formatReservationStatus('completed')).toBe('Completed');
    expect(formatReservationStatus('cancelled')).toBe('Cancelled');
  });

  it('formats payment statuses', () => {
    expect(formatReservationStatus('unpaid')).toBe('Unpaid');
    expect(formatReservationStatus('deposit_pending')).toBe('Deposit Pending');
    expect(formatReservationStatus('partially_paid')).toBe('Partially Paid');
    expect(formatReservationStatus('paid')).toBe('Paid');
  });

  it('formats refund statuses', () => {
    expect(formatReservationStatus('not_requested')).toBe('Not Requested');
    expect(formatReservationStatus('requested')).toBe('Requested');
    expect(formatReservationStatus('approved')).toBe('Approved');
    expect(formatReservationStatus('rejected')).toBe('Rejected');
    expect(formatReservationStatus('processing')).toBe('Processing');
    expect(formatReservationStatus('refunded')).toBe('Refunded');
    expect(formatReservationStatus('failed')).toBe('Failed');
  });

  it('formats payment request statuses', () => {
    expect(formatReservationStatus('details_provided')).toBe('Details Provided');
    expect(formatReservationStatus('proof_submitted')).toBe('Proof Submitted');
    expect(formatReservationStatus('under_review')).toBe('Under Review');
  });

  it('handles status with spaces (normalizes to underscores)', () => {
    expect(formatReservationStatus('pending payment')).toBe('Pending Payment');
    expect(formatReservationStatus('under review')).toBe('Under Review');
  });

  it('is case-insensitive', () => {
    expect(formatReservationStatus('CONFIRMED')).toBe('Confirmed');
    expect(formatReservationStatus('Cancelled')).toBe('Cancelled');
  });

  it('returns dash for null/undefined/empty', () => {
    expect(formatReservationStatus(null)).toBe('—');
    expect(formatReservationStatus(undefined)).toBe('—');
    expect(formatReservationStatus('')).toBe('—');
  });

  it('returns dash for unrecognized status', () => {
    expect(formatReservationStatus('unknown_status')).toBe('—');
    expect(formatReservationStatus('foobar')).toBe('—');
  });

  it('handles non-string types gracefully', () => {
    expect(formatReservationStatus(123)).toBe('—');
    expect(formatReservationStatus({})).toBe('—');
  });
});

// ─── Design Tokens ───────────────────────────────────────────────────────────

describe('lib/domain/tokens', () => {
  describe('token constants are frozen arrays', () => {
    it('VALID_TYPOGRAPHY_ROLES is frozen', () => {
      expect(Object.isFrozen(VALID_TYPOGRAPHY_ROLES)).toBe(true);
      expect(VALID_TYPOGRAPHY_ROLES).toContain('body');
      expect(VALID_TYPOGRAPHY_ROLES).toContain('heading');
      expect(VALID_TYPOGRAPHY_ROLES).toContain('mono');
    });

    it('VALID_COLOR_ROLES is frozen and contains expected semantic colors', () => {
      expect(Object.isFrozen(VALID_COLOR_ROLES)).toBe(true);
      expect(VALID_COLOR_ROLES).toContain('text-primary');
      expect(VALID_COLOR_ROLES).toContain('action-primary');
      expect(VALID_COLOR_ROLES).toContain('surface-primary');
      expect(VALID_COLOR_ROLES).toContain('border-default');
    });

    it('VALID_TEXT_SIZES covers the type scale', () => {
      expect(VALID_TEXT_SIZES).toEqual(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl']);
    });

    it('VALID_FONT_WEIGHTS covers available weights', () => {
      expect(VALID_FONT_WEIGHTS).toEqual(['normal', 'medium', 'semibold', 'bold']);
    });

    it('VALID_SPACING_TOKENS covers the spacing scale', () => {
      expect(VALID_SPACING_TOKENS).toEqual(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']);
    });

    it('VALID_TRANSITION_DURATIONS covers motion tokens', () => {
      expect(VALID_TRANSITION_DURATIONS).toEqual(['fast', 'normal', 'slow']);
    });

    it('VALID_EASINGS covers easing tokens', () => {
      expect(VALID_EASINGS).toEqual(['default', 'in', 'out']);
    });
  });

  describe('TOKEN_CATEGORIES', () => {
    it('maps all categories', () => {
      expect(Object.keys(TOKEN_CATEGORIES)).toEqual([
        'typography',
        'textSize',
        'fontWeight',
        'lineHeight',
        'color',
        'spacing',
        'controlSize',
        'duration',
        'easing',
      ]);
    });
  });

  describe('validateToken', () => {
    it('accepts valid tokens in their category', () => {
      expect(validateToken('typography', 'body')).toBe(true);
      expect(validateToken('typography', 'heading')).toBe(true);
      expect(validateToken('color', 'text-primary')).toBe(true);
      expect(validateToken('color', 'action-danger')).toBe(true);
      expect(validateToken('spacing', 'md')).toBe(true);
      expect(validateToken('duration', 'fast')).toBe(true);
      expect(validateToken('easing', 'default')).toBe(true);
    });

    it('rejects undocumented one-off values', () => {
      expect(validateToken('typography', 'comic-sans')).toBe(false);
      expect(validateToken('color', 'hot-pink')).toBe(false);
      expect(validateToken('color', '#ff0000')).toBe(false);
      expect(validateToken('spacing', 'custom')).toBe(false);
      expect(validateToken('duration', 'very-slow')).toBe(false);
    });

    it('rejects invalid categories', () => {
      expect(validateToken('nonexistent', 'value')).toBe(false);
      expect(validateToken('', 'body')).toBe(false);
    });

    it('handles null/undefined gracefully', () => {
      expect(validateToken(null, 'body')).toBe(false);
      expect(validateToken('typography', null)).toBe(false);
      expect(validateToken(undefined, undefined)).toBe(false);
    });

    it('handles non-string types gracefully', () => {
      expect(validateToken(123, 'body')).toBe(false);
      expect(validateToken('typography', 123)).toBe(false);
    });
  });

  describe('isValidColorRole', () => {
    it('accepts documented color roles', () => {
      expect(isValidColorRole('text-primary')).toBe(true);
      expect(isValidColorRole('action-primary')).toBe(true);
      expect(isValidColorRole('surface-overlay')).toBe(true);
    });

    it('rejects undocumented colors', () => {
      expect(isValidColorRole('neon-green')).toBe(false);
      expect(isValidColorRole('#123456')).toBe(false);
    });
  });

  describe('isValidTypographyRole', () => {
    it('accepts documented typography roles', () => {
      expect(isValidTypographyRole('body')).toBe(true);
      expect(isValidTypographyRole('heading')).toBe(true);
      expect(isValidTypographyRole('mono')).toBe(true);
    });

    it('rejects undocumented typography roles', () => {
      expect(isValidTypographyRole('display')).toBe(false);
      expect(isValidTypographyRole('caption')).toBe(false);
    });
  });
});
