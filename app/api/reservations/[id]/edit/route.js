// app/api/reservations/[id]/edit/route.js
// POST — Edit an existing reservation.
// Auth: required, Role: guest|admin, CSRF: true
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { isoDate, boundedString, nonNegativeInt } from '@/lib/server/http/schemas.js';
import { editReservation } from '@/lib/server/services/reservation.js';

const roomSelectionSchema = z.object({
  roomId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(10).optional().default(1),
}).strict();

const editReservationSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  isDayTour: z.boolean().optional().default(false),
  specialRequest: boundedString(0, 2000).optional().nullable(),
  isExclusiveResort: z.boolean().optional().default(false),

  // Room stay fields
  checkIn: isoDate.optional(),
  checkOut: isoDate.optional(),
  rooms: z.array(roomSelectionSchema).min(1).max(10).optional(),

  // Day tour fields
  selectedDate: isoDate.optional(),

  // Guest count fields
  adults: nonNegativeInt.optional().default(0),
  children: nonNegativeInt.optional().default(0),
  seniors: nonNegativeInt.optional().default(0),
}).strict();

const policy = {
  methods: ['POST'],
  auth: 'required',
  roles: ['guest', 'admin'],
  bodySchema: editReservationSchema,
  csrf: true,
  rateLimit: 'guest-write',
  sensitiveResponse: true,
  maxBodySize: 16384,
};

async function handler({ request, actor, input, correlationId }) {
  // Extract booking ID from the URL path
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // Pattern: /api/reservations/[id]/edit → segments[3] is the id
  const bookingId = segments[3];

  if (!bookingId || bookingId.length > 128) {
    const err = new Error('Invalid booking ID');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const { idempotencyKey, ...command } = input;

  const result = await editReservation(actor, bookingId, command, idempotencyKey);

  return {
    data: {
      bookingId: result.bookingId,
      action: result.action || 'edit',
      totals: result.totals,
      nights: result.nights,
      roomCount: result.roomCount,
      guestCounts: result.guestCounts,
      idempotent: result.idempotent || false,
    },
  };
}

export const POST = withApiBoundary(policy, handler);
