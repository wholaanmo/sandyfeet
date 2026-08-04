// app/api/send-email/route.js
// Hardened email API — only predefined server-owned operations allowed.
// Client supplies operation name + safe field values; server controls recipients,
// subjects, and templates.
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { boundedString } from '@/lib/server/http/schemas.js';
import { executeEmailCommand, getOperationNames } from '@/lib/server/services/email-commands.js';

export const runtime = 'nodejs';

const operationNames = getOperationNames();

const bodySchema = z.object({
  operation: z.enum(operationNames),
  fields: z.record(z.string(), boundedString(0, 2000)).default({}),
}).strict();

export const POST = withApiBoundary(
  {
    methods: ['POST'],
    auth: 'required',
    roles: ['admin'],
    csrf: true,
    rateLimit: 'email-send',
    bodySchema,
  },
  async ({ input, actor, correlationId }) => {
    const { operation, fields } = input;

    const result = await executeEmailCommand(operation, fields, actor);

    return {
      data: { success: true, operation, recipient: result.recipient },
      status: 200,
    };
  }
);
