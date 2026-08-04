// app/api/checkin/consume/route.js
// POST — consume a check-in credential and atomically transition booking status.
// Auth: required, roles: admin/staff, CSRF enforced.
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { consumeCheckInCredential } from '@/lib/server/services/checkin.js';

export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string().trim().min(1, 'Token is required').max(512, 'Token too long'),
}).strict();

export const POST = withApiBoundary(
  {
    methods: ['POST'],
    auth: 'required',
    roles: ['admin', 'staff'],
    csrf: true,
    bodySchema,
  },
  async ({ input, actor, correlationId }) => {
    const { token } = input;

    const result = await consumeCheckInCredential(actor, token);

    return {
      data: result,
      status: 200,
    };
  }
);
