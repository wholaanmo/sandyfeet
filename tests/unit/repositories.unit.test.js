// tests/unit/repositories.unit.test.js
// Unit tests for lib/server/repositories (base, booking, guest, payment, identity)
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock Firestore
const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn();
const mockCollectionQuery = vi.fn();

vi.mock('../../lib/server/firebase-admin.js', () => ({
  auth: {},
  firestore: {
    collection: (name) => ({
      doc: (id) => ({
        get: () => mockDocGet(name, id),
        update: (data) => mockDocUpdate(name, id, data),
        ref: { path: `${name}/${id}` },
      }),
      where: (field, op, value) => ({
        limit: () => ({
          get: () => mockCollectionQuery(name, field, op, value),
        }),
      }),
    }),
  },
}));

vi.mock('../../lib/server/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3000',
    FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
  },
}));

// ─── Base Repository Tests ──────────────────────────────────────────────────

describe('lib/server/repositories/base', () => {
  let base;

  beforeEach(async () => {
    vi.resetModules();
    base = await import('../../lib/server/repositories/base.js');
  });

  describe('toISOString', () => {
    it('returns null for falsy values', () => {
      expect(base.toISOString(null)).toBeNull();
      expect(base.toISOString(undefined)).toBeNull();
      expect(base.toISOString('')).toBeNull();
      expect(base.toISOString(0)).toBeNull();
    });

    it('converts Firestore Timestamp with toDate()', () => {
      const ts = { toDate: () => new Date('2025-01-15T10:00:00.000Z') };
      expect(base.toISOString(ts)).toBe('2025-01-15T10:00:00.000Z');
    });

    it('converts plain { seconds } object', () => {
      const ts = { seconds: 1705312800, nanoseconds: 0 };
      expect(base.toISOString(ts)).toBe(new Date(1705312800 * 1000).toISOString());
    });

    it('converts Date objects', () => {
      const d = new Date('2025-03-01T12:00:00.000Z');
      expect(base.toISOString(d)).toBe('2025-03-01T12:00:00.000Z');
    });

    it('passes through valid ISO strings', () => {
      expect(base.toISOString('2025-06-15T00:00:00.000Z')).toBe('2025-06-15T00:00:00.000Z');
    });

    it('returns null for invalid strings', () => {
      expect(base.toISOString('not-a-date')).toBeNull();
    });
  });

  describe('projectFields', () => {
    it('returns only allowed fields', () => {
      const data = { name: 'Alice', role: 'admin', email: 'a@b.com', secret: 'x' };
      const result = base.projectFields(data, ['name', 'email']);
      expect(result).toEqual({ name: 'Alice', email: 'a@b.com' });
    });

    it('auto-converts Firestore timestamps', () => {
      const data = { createdAt: { toDate: () => new Date('2025-01-01T00:00:00.000Z') } };
      const result = base.projectFields(data, ['createdAt']);
      expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
    });

    it('handles missing fields gracefully', () => {
      const data = { name: 'Bob' };
      const result = base.projectFields(data, ['name', 'email', 'phone']);
      expect(result).toEqual({ name: 'Bob' });
    });

    it('returns empty object for null/undefined data', () => {
      expect(base.projectFields(null, ['name'])).toEqual({});
      expect(base.projectFields(undefined, ['name'])).toEqual({});
    });
  });

  describe('throwNotFound', () => {
    it('throws with code NOT_FOUND', () => {
      try {
        base.throwNotFound();
      } catch (e) {
        expect(e.code).toBe('NOT_FOUND');
        expect(e.message).toBe('Resource not found');
      }
    });

    it('uses custom message without disclosing details', () => {
      try {
        base.throwNotFound('Not available');
      } catch (e) {
        expect(e.message).toBe('Not available');
      }
    });
  });

  describe('throwForbidden', () => {
    it('throws with code FORBIDDEN', () => {
      try {
        base.throwForbidden();
      } catch (e) {
        expect(e.code).toBe('FORBIDDEN');
        expect(e.message).toBe('Access denied');
      }
    });
  });

  describe('requireAuthenticatedActor', () => {
    it('throws UNAUTHENTICATED for null actor', () => {
      expect(() => base.requireAuthenticatedActor(null)).toThrow();
      try {
        base.requireAuthenticatedActor(null);
      } catch (e) {
        expect(e.code).toBe('UNAUTHENTICATED');
      }
    });

    it('throws UNAUTHENTICATED for actor without uid', () => {
      expect(() => base.requireAuthenticatedActor({})).toThrow();
    });

    it('passes for valid actor with uid', () => {
      expect(() => base.requireAuthenticatedActor({ uid: 'user-1' })).not.toThrow();
    });
  });

  describe('stripRestrictedFields', () => {
    it('removes restricted fields from patch', () => {
      const patch = { name: 'Updated', role: 'admin', status: 'inactive', phone: '123' };
      const result = base.stripRestrictedFields(patch, base.GUEST_RESTRICTED_FIELDS);
      expect(result).toEqual({ name: 'Updated', phone: '123' });
      expect(result.role).toBeUndefined();
      expect(result.status).toBeUndefined();
    });

    it('returns empty object for null input', () => {
      expect(base.stripRestrictedFields(null, [])).toEqual({});
    });
  });
});

// ─── Booking Repository Tests ───────────────────────────────────────────────

describe('lib/server/repositories/booking', () => {
  let booking;

  beforeEach(async () => {
    vi.resetModules();
    mockDocGet.mockReset();
    booking = await import('../../lib/server/repositories/booking.js');
  });

  const guestActor = { uid: 'guest-1', role: 'guest', accountType: 'guest', status: 'active' };
  const staffActor = { uid: 'staff-1', role: 'staff', accountType: 'staff', status: 'active' };
  const adminActor = { uid: 'admin-1', role: 'admin', accountType: 'staff', status: 'active' };

  describe('getOwnedSummary', () => {
    it('throws UNAUTHENTICATED for null actor', async () => {
      await expect(booking.getOwnedSummary(null, 'booking-1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('throws NOT_FOUND for empty bookingId', async () => {
      await expect(booking.getOwnedSummary(guestActor, '')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws NOT_FOUND when booking does not exist', async () => {
      mockDocGet.mockResolvedValue({ exists: false });
      await expect(booking.getOwnedSummary(guestActor, 'missing-id')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws NOT_FOUND when booking belongs to another user (non-disclosing)', async () => {
      mockDocGet.mockImplementation((collection, id) => {
        if (collection === 'bookings') {
          return { exists: true, id: 'booking-1', data: () => ({ ownerUid: 'other-user', status: 'confirmed', type: 'room' }), ref: {} };
        }
        return { exists: false };
      });
      await expect(booking.getOwnedSummary(guestActor, 'booking-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns projected summary for owned booking', async () => {
      mockDocGet.mockImplementation((collection, id) => {
        if (collection === 'bookings') {
          return {
            exists: true,
            id: 'booking-1',
            data: () => ({
              ownerUid: 'guest-1',
              status: 'confirmed',
              type: 'room',
              roomType: 'Deluxe',
              totalPrice: 5000,
              downPayment: 2500,
              secretField: 'should-not-appear',
              staffNotes: 'internal',
            }),
            ref: {},
          };
        }
        return { exists: false };
      });

      const result = await booking.getOwnedSummary(guestActor, 'booking-1');
      expect(result.status).toBe('confirmed');
      expect(result.type).toBe('room');
      expect(result.totalPrice).toBe(5000);
      // Restricted fields not exposed
      expect(result.secretField).toBeUndefined();
      expect(result.staffNotes).toBeUndefined();
      expect(result.ownerUid).toBeUndefined();
    });

    it('resolves booking from dayTourBookings collection', async () => {
      mockDocGet.mockImplementation((collection, id) => {
        if (collection === 'bookings') return { exists: false };
        if (collection === 'dayTourBookings') {
          return {
            exists: true,
            id: 'dt-booking-1',
            data: () => ({ ownerUid: 'guest-1', status: 'confirmed', type: 'day-tour', adults: 2 }),
            ref: {},
          };
        }
        return { exists: false };
      });

      const result = await booking.getOwnedSummary(guestActor, 'dt-booking-1');
      expect(result.status).toBe('confirmed');
      expect(result.adults).toBe(2);
    });
  });

  describe('getForStaff', () => {
    it('throws FORBIDDEN for guest actor', async () => {
      await expect(booking.getForStaff(guestActor, 'booking-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns staff projection for staff actor', async () => {
      mockDocGet.mockImplementation((collection) => {
        if (collection === 'bookings') {
          return {
            exists: true,
            id: 'booking-1',
            data: () => ({ ownerUid: 'guest-1', status: 'confirmed', type: 'room', email: 'g@test.com' }),
            ref: {},
          };
        }
        return { exists: false };
      });

      const result = await booking.getForStaff(staffActor, 'booking-1');
      expect(result.ownerUid).toBe('guest-1');
      expect(result.email).toBe('g@test.com');
    });

    it('allows admin to access staff projection', async () => {
      mockDocGet.mockImplementation((collection) => {
        if (collection === 'bookings') {
          return { exists: true, id: 'b1', data: () => ({ ownerUid: 'g1', status: 'confirmed' }), ref: {} };
        }
        return { exists: false };
      });

      const result = await booking.getForStaff(adminActor, 'b1');
      expect(result.status).toBe('confirmed');
    });
  });

  describe('getForAdmin', () => {
    it('throws FORBIDDEN for staff actor', async () => {
      await expect(booking.getForAdmin(staffActor, 'booking-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns full data for admin actor', async () => {
      mockDocGet.mockImplementation((collection) => {
        if (collection === 'bookings') {
          return {
            exists: true,
            id: 'booking-1',
            data: () => ({
              ownerUid: 'guest-1',
              status: 'confirmed',
              internalFlag: true,
              staffNotes: 'note',
            }),
            ref: {},
          };
        }
        return { exists: false };
      });

      const result = await booking.getForAdmin(adminActor, 'booking-1');
      expect(result.internalFlag).toBe(true);
      expect(result.staffNotes).toBe('note');
    });
  });

  describe('resolveEmailToUid', () => {
    it('returns null for empty email', async () => {
      const result = await booking.resolveEmailToUid('');
      expect(result).toBeNull();
    });

    it('resolves from guestProfiles collection', async () => {
      mockCollectionQuery.mockImplementation((collection) => {
        if (collection === 'guestProfiles') {
          return { empty: false, docs: [{ id: 'guest-uid-1' }] };
        }
        return { empty: true, docs: [] };
      });

      const result = await booking.resolveEmailToUid('Guest@Test.Com');
      expect(result).toBe('guest-uid-1');
    });

    it('resolves from users collection when not in guestProfiles', async () => {
      mockCollectionQuery.mockImplementation((collection) => {
        if (collection === 'guestProfiles') return { empty: true, docs: [] };
        if (collection === 'users') return { empty: false, docs: [{ id: 'user-uid-1' }] };
        return { empty: true, docs: [] };
      });

      const result = await booking.resolveEmailToUid('staff@sandyfeet.com');
      expect(result).toBe('user-uid-1');
    });

    it('returns null when email not found anywhere', async () => {
      mockCollectionQuery.mockResolvedValue({ empty: true, docs: [] });
      const result = await booking.resolveEmailToUid('nobody@nowhere.com');
      expect(result).toBeNull();
    });
  });
});

// ─── Guest Repository Tests ─────────────────────────────────────────────────

describe('lib/server/repositories/guest', () => {
  let guest;

  beforeEach(async () => {
    vi.resetModules();
    mockDocGet.mockReset();
    mockDocUpdate.mockReset();
    guest = await import('../../lib/server/repositories/guest.js');
  });

  const guestActor = { uid: 'guest-1', role: 'guest', accountType: 'guest', status: 'active' };

  describe('getOwnProfile', () => {
    it('throws UNAUTHENTICATED for null actor', async () => {
      await expect(guest.getOwnProfile(null)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('throws NOT_FOUND when profile does not exist', async () => {
      mockDocGet.mockResolvedValue({ exists: false });
      await expect(guest.getOwnProfile(guestActor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns projected own profile', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'guest-1',
        data: () => ({
          email: 'guest@test.com',
          displayName: 'Test Guest',
          phone: '+639123456789',
          status: 'active',
          emailVerified: true,
          role: 'guest',
          secretInternalField: 'hidden',
        }),
      });

      const result = await guest.getOwnProfile(guestActor);
      expect(result.email).toBe('guest@test.com');
      expect(result.displayName).toBe('Test Guest');
      expect(result.status).toBe('active');
      // Internal fields not exposed
      expect(result.secretInternalField).toBeUndefined();
    });
  });

  describe('updateOwnProfile', () => {
    it('throws UNAUTHENTICATED for null actor', async () => {
      await expect(guest.updateOwnProfile(null, { name: 'X' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('throws NOT_FOUND when profile does not exist', async () => {
      mockDocGet.mockResolvedValue({ exists: false });
      await expect(guest.updateOwnProfile(guestActor, { name: 'X' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('strips restricted fields (role, status, emailVerified)', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'guest-1',
        data: () => ({ email: 'g@t.com', displayName: 'Old', status: 'active' }),
      });
      mockDocUpdate.mockResolvedValue(undefined);

      await guest.updateOwnProfile(guestActor, {
        displayName: 'New Name',
        role: 'admin',  // MUST be stripped
        status: 'inactive',  // MUST be stripped
        emailVerified: true,  // MUST be stripped
        phone: '123',
      });

      // Verify only safe fields were written
      const updateCall = mockDocUpdate.mock.calls[0];
      const writtenData = updateCall[2];
      expect(writtenData.displayName).toBe('New Name');
      expect(writtenData.phone).toBe('123');
      expect(writtenData.role).toBeUndefined();
      expect(writtenData.status).toBeUndefined();
      expect(writtenData.emailVerified).toBeUndefined();
      expect(writtenData.updatedAt).toBeDefined(); // server timestamp added
    });

    it('returns current profile when all fields are restricted', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'guest-1',
        data: () => ({ email: 'g@t.com', displayName: 'Same', status: 'active' }),
      });

      const result = await guest.updateOwnProfile(guestActor, {
        role: 'admin',
        status: 'inactive',
      });

      // No update call made
      expect(mockDocUpdate).not.toHaveBeenCalled();
      expect(result.displayName).toBe('Same');
    });
  });
});

// ─── Payment Repository Tests ───────────────────────────────────────────────

describe('lib/server/repositories/payment', () => {
  let payment;

  beforeEach(async () => {
    vi.resetModules();
    mockDocGet.mockReset();
    payment = await import('../../lib/server/repositories/payment.js');
  });

  const guestActor = { uid: 'guest-1', role: 'guest', accountType: 'guest', status: 'active' };
  const staffActor = { uid: 'staff-1', role: 'staff', accountType: 'staff', status: 'active' };
  const adminActor = { uid: 'admin-1', role: 'admin', accountType: 'staff', status: 'active' };

  describe('getGuestPaymentStatus', () => {
    it('throws UNAUTHENTICATED for null actor', async () => {
      await expect(payment.getGuestPaymentStatus(null, 'b1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('throws NOT_FOUND for unowned booking (non-disclosing)', async () => {
      mockDocGet.mockImplementation((collection) => {
        if (collection === 'bookings') {
          return { exists: true, id: 'b1', data: () => ({ ownerUid: 'other-user', totalPrice: 9000 }), ref: {} };
        }
        return { exists: false };
      });

      await expect(payment.getGuestPaymentStatus(guestActor, 'b1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns status fields without evidence for owned booking', async () => {
      mockDocGet.mockImplementation((collection) => {
        if (collection === 'bookings') {
          return {
            exists: true,
            id: 'b1',
            data: () => ({
              ownerUid: 'guest-1',
              totalPrice: 5000,
              downPayment: 2500,
              remainingBalance: 2500,
              paymentMethod: 'gcash',
              paymentProofUrl: 'https://secret-proof.jpg',  // should NOT appear
              staffNotes: 'internal',  // should NOT appear
            }),
            ref: {},
          };
        }
        return { exists: false };
      });

      const result = await payment.getGuestPaymentStatus(guestActor, 'b1');
      expect(result.totalPrice).toBe(5000);
      expect(result.paymentMethod).toBe('gcash');
      // Evidence not exposed to guest
      expect(result.paymentProofUrl).toBeUndefined();
      expect(result.staffNotes).toBeUndefined();
    });
  });

  describe('getPaymentEvidence', () => {
    it('throws FORBIDDEN for guest actor', async () => {
      await expect(payment.getPaymentEvidence(guestActor, 'b1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns evidence for staff actor', async () => {
      mockDocGet.mockImplementation((collection) => {
        if (collection === 'bookings') {
          return {
            exists: true,
            id: 'b1',
            data: () => ({
              ownerUid: 'guest-1',
              totalPrice: 5000,
              paymentProofUrl: 'https://proof.jpg',
              bankDetails: { bank: 'BPI', account: '1234' },
              staffNotes: 'Verified OK',
            }),
            ref: {},
          };
        }
        return { exists: false };
      });

      const result = await payment.getPaymentEvidence(staffActor, 'b1');
      expect(result.paymentProofUrl).toBe('https://proof.jpg');
      expect(result.staffNotes).toBe('Verified OK');
    });

    it('returns evidence for admin actor', async () => {
      mockDocGet.mockImplementation((collection) => {
        if (collection === 'bookings') {
          return {
            exists: true,
            id: 'b1',
            data: () => ({ ownerUid: 'g1', paymentProofUrl: 'https://p.jpg' }),
            ref: {},
          };
        }
        return { exists: false };
      });

      const result = await payment.getPaymentEvidence(adminActor, 'b1');
      expect(result.paymentProofUrl).toBe('https://p.jpg');
    });
  });
});

// ─── Identity Repository Tests ──────────────────────────────────────────────

describe('lib/server/repositories/identity', () => {
  let identity;

  beforeEach(async () => {
    vi.resetModules();
    mockDocGet.mockReset();
    identity = await import('../../lib/server/repositories/identity.js');
  });

  const guestActor = { uid: 'guest-1', role: 'guest', accountType: 'guest', status: 'active' };
  const staffActor = { uid: 'staff-1', role: 'staff', accountType: 'staff', status: 'active' };
  const adminActor = { uid: 'admin-1', role: 'admin', accountType: 'staff', status: 'active' };

  describe('getIdentityDocument', () => {
    it('throws FORBIDDEN for guest actor', async () => {
      await expect(identity.getIdentityDocument(guestActor, 'guest-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws FORBIDDEN for staff actor (admin-only)', async () => {
      await expect(identity.getIdentityDocument(staffActor, 'guest-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws NOT_FOUND when guest profile missing', async () => {
      mockDocGet.mockResolvedValue({ exists: false });
      await expect(identity.getIdentityDocument(adminActor, 'no-one')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws NOT_FOUND when no identity data on profile', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'guest-1',
        data: () => ({ email: 'g@t.com', displayName: 'Guest' }),
      });
      await expect(identity.getIdentityDocument(adminActor, 'guest-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns projected identity data for admin', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'guest-1',
        data: () => ({
          email: 'g@t.com',
          validIdType: 'passport',
          validIdUrl: 'https://storage/id.jpg',
          validIdImage: 'https://storage/id-thumb.jpg',
          idVerificationStatus: 'verified',
          idVerifiedBy: 'admin-1',
          secretField: 'should not appear',
        }),
      });

      const result = await identity.getIdentityDocument(adminActor, 'guest-1');
      expect(result.validIdType).toBe('passport');
      expect(result.validIdUrl).toBe('https://storage/id.jpg');
      expect(result.status).toBe('verified');
      // Non-identity fields excluded
      expect(result.email).toBeUndefined();
      expect(result.secretField).toBeUndefined();
    });
  });

  describe('hasIdentityDocument', () => {
    it('throws FORBIDDEN for guest actor', async () => {
      await expect(identity.hasIdentityDocument(guestActor, 'g1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns false for missing profile', async () => {
      mockDocGet.mockResolvedValue({ exists: false });
      const result = await identity.hasIdentityDocument(staffActor, 'g1');
      expect(result).toBe(false);
    });

    it('returns false when no identity fields present', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'g1',
        data: () => ({ email: 'g@t.com' }),
      });
      const result = await identity.hasIdentityDocument(staffActor, 'g1');
      expect(result).toBe(false);
    });

    it('returns true when identity data exists', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'g1',
        data: () => ({ validIdType: 'drivers_license', validIdUrl: 'https://id.jpg' }),
      });
      const result = await identity.hasIdentityDocument(staffActor, 'g1');
      expect(result).toBe(true);
    });

    it('allows admin to check identity existence', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'g1',
        data: () => ({ validIdImage: 'https://img.jpg' }),
      });
      const result = await identity.hasIdentityDocument(adminActor, 'g1');
      expect(result).toBe(true);
    });
  });
});
