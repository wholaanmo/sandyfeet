// app/api/payments/[id]/transition/route.js
// POST — Record a payment state transition.
// Auth: required, Roles: admin|staff, CSRF: true
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { recordPaymentTransition } from '@/lib/server/services/payment.js';

const paymentTransitionSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  transition: z.string().trim().min(1).max(64),
  evidence: z.object({
    proofType: z.string().trim().max(64).optional().nullable(),
    evidenceRef: z.string().trim().max(512).optional().nullable(),
  }).strict().optional().nullable(),
}).strict();

const policy = {
  methods: ['POST'],
  auth: 'required',
  roles: ['admin', 'staff'],
  bodySchema: paymentTransitionSchema,
  csrf: true,
  rateLimit: 'admin-write',
  sensitiveResponse: true,
};

async function handler({ request, actor, input, correlationId }) {
  // Extract booking ID from the URL path
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // Pattern: /api/payments/[id]/transition → segments[3] is the id
  const bookingId = segments[3];

  if (!bookingId || bookingId.length > 128) {
    const err = new Error('Invalid booking ID');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const result = await recordPaymentTransition(actor, bookingId, {
    transition: input.transition,
    evidence: input.evidence || null,
    idempotencyKey: input.idempotencyKey,
  });

  // Project response — no evidence URLs or internal balance details exposed
  return {
    data: {
      bookingId: result.bookingId,
      action: 'payment_transition',
      previousPaymentRequestState: result.previousPaymentRequestState,
      newPaymentRequestState: result.newPaymentRequestState,
      paymentStatus: result.paymentStatus,
      idempotent: result.idempotent || false,
    },
  };
}

export const POST = withApiBoundary(policy, handler);
