// app/api/reservations/[id]/cancel/route.js
// POST — Cancel an existing reservation.
// Auth: required, Role: guest|admin, CSRF: true
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { cancelReservation } from '@/lib/server/services/reservation.js';

const cancelReservationSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

const policy = {
  methods: ['POST'],
  auth: 'required',
  roles: ['guest', 'admin'],
  bodySchema: cancelReservationSchema,
  csrf: true,
  rateLimit: 'guest-write',
  sensitiveResponse: true,
};

async function handler({ request, actor, input, correlationId }) {
  // Extract booking ID from the URL path
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // Pattern: /api/reservations/[id]/cancel → segments[3] is the id
  const bookingId = segments[3];

  if (!bookingId || bookingId.length > 128) {
    const err = new Error('Invalid booking ID');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const result = await cancelReservation(actor, bookingId, input.idempotencyKey);

  return {
    data: {
      bookingId: result.bookingId,
      action: 'cancel',
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      idempotent: result.idempotent || false,
    },
  };
}

export const POST = withApiBoundary(policy, handler);
