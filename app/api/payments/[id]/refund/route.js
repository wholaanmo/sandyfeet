// app/api/payments/[id]/refund/route.js
// POST — Process a refund for a booking.
// Auth: required, Roles: admin, CSRF: true
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { processRefund } from '@/lib/server/services/payment.js';

const processRefundSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  transition: z.string().trim().min(1).max(64).optional().default('requested'),
  reasonCode: z.string().trim().max(256).optional().nullable(),
}).strict();

const policy = {
  methods: ['POST'],
  auth: 'required',
  roles: ['admin'],
  bodySchema: processRefundSchema,
  csrf: true,
  rateLimit: 'admin-write',
  sensitiveResponse: true,
};

async function handler({ request, actor, input, correlationId }) {
  // Extract booking ID from the URL path
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // Pattern: /api/payments/[id]/refund → segments[3] is the id
  const bookingId = segments[3];

  if (!bookingId || bookingId.length > 128) {
    const err = new Error('Invalid booking ID');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const result = await processRefund(actor, bookingId, {
    transition: input.transition,
    reasonCode: input.reasonCode || null,
    idempotencyKey: input.idempotencyKey,
  });

  // Project response — only approved fields, no internal balance details
  return {
    data: {
      bookingId: result.bookingId,
      action: 'refund_transition',
      previousRefundState: result.previousRefundState,
      newRefundState: result.newRefundState,
      refundAmountCentavos: result.refundAmountCentavos,
      idempotent: result.idempotent || false,
    },
  };
}

export const POST = withApiBoundary(policy, handler);
