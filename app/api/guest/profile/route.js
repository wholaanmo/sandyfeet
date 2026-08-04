// app/api/guest/profile/route.js
// GET — Retrieve own guest profile.
// PATCH — Update own guest profile fields.
// Auth: required, Role: guest
import { z } from 'zod';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { boundedString } from '@/lib/server/http/schemas.js';
import { getOwnProfile, updateOwnProfile } from '@/lib/server/repositories/guest.js';

// ─── GET /api/guest/profile ─────────────────────────────────────────────────

const getPolicy = {
  methods: ['GET'],
  auth: 'required',
  roles: ['guest'],
  csrf: false,
  sensitiveResponse: true,
};

async function getHandler({ actor }) {
  const profile = await getOwnProfile(actor);
  return { data: profile };
}

export const GET = withApiBoundary(getPolicy, getHandler);

// ─── PATCH /api/guest/profile ───────────────────────────────────────────────

const updateProfileSchema = z.object({
  displayName: boundedString(1, 200).optional(),
  name: boundedString(1, 200).optional(),
  firstName: boundedString(1, 100).optional(),
  lastName: boundedString(1, 100).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
}).strict();

const patchPolicy = {
  methods: ['PATCH'],
  auth: 'required',
  roles: ['guest'],
  bodySchema: updateProfileSchema,
  csrf: true,
  sensitiveResponse: true,
};

async function patchHandler({ actor, input }) {
  const updatedProfile = await updateOwnProfile(actor, input);
  return { data: updatedProfile };
}

export const PATCH = withApiBoundary(patchPolicy, patchHandler);
