// app/api/reservations/create/route.js
// POST — Create a new reservation (room stay or day tour).
// Auth: required, Role: guest, CSRF: true
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { isoDate, bookingId, boundedString, nonNegativeInt } from '@/lib/server/http/schemas.js';
import { createReservation } from '@/lib/server/services/reservation.js';

const roomSelectionSchema = z.object({
  roomId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(10).optional().default(1),
}).strict();

const createReservationSchema = z.object({
  // Common fields
  idempotencyKey: z.string().trim().min(1).max(128),
  isDayTour: z.boolean().optional().default(false),
  paymentMethod: z.string().trim().max(64).optional().nullable(),
  specialRequest: boundedString(0, 2000).optional().nullable(),
  isExclusiveResort: z.boolean().optional().default(false),

  // Room stay fields (required when isDayTour is false)
  checkIn: isoDate.optional(),
  checkOut: isoDate.optional(),
  rooms: z.array(roomSelectionSchema).min(1).max(10).optional(),

  // Day tour fields (required when isDayTour is true)
  selectedDate: isoDate.optional(),

  // Guest count fields
  adults: nonNegativeInt.optional().default(0),
  children: nonNegativeInt.optional().default(0),
  seniors: nonNegativeInt.optional().default(0),
}).strict();

const policy = {
  methods: ['POST'],
  auth: 'required',
  roles: ['guest'],
  bodySchema: createReservationSchema,
  csrf: true,
  rateLimit: 'guest-write',
  sensitiveResponse: true,
  maxBodySize: 16384,
};

async function handler({ actor, input, correlationId }) {
  const { idempotencyKey, ...command } = input;

  const result = await createReservation(actor, command, idempotencyKey);

  // Project response — no internal fields exposed
  return {
    data: {
      bookingId: result.bookingId,
      type: result.type,
      status: result.status,
      totals: result.totals,
      nights: result.nights,
      roomCount: result.roomCount,
      guestCounts: result.guestCounts,
      childIds: result.childIds,
      idempotent: result.idempotent || false,
    },
    status: result.idempotent ? 200 : 201,
  };
}

export const POST = withApiBoundary(policy, handler);
