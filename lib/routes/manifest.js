/**
 * Canonical Route Manifest
 *
 * Authoritative classification of every active page and API route.
 * Build-time coverage validation ensures this stays in sync with the filesystem.
 *
 * Each record:
 *  - id: unique kebab identifier
 *  - kind: 'page' | 'api'
 *  - pattern: URL pattern (Next.js dynamic segments use [param])
 *  - methods: HTTP methods (pages are always ['GET'])
 *  - audience: 'public' | 'guest' | 'staff' | 'admin' | 'staff-or-admin'
 *  - status: 'active' | 'legacy-redirect'
 *  - landingForRole: if this route is the landing page for a role
 *  - redirectTo: target pattern for legacy-redirect entries
 *  - csrf: whether mutations require CSRF/origin validation
 *  - rateLimitPolicy: named rate-limit policy (null = none)
 *  - sensitiveResponse: whether response contains sensitive data
 */

export const ROUTE_MANIFEST = [
  // ─── Public Pages ───────────────────────────────────────────────────────────
  { id: 'home-root', kind: 'page', pattern: '/', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'home', kind: 'page', pattern: '/home', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'login', kind: 'page', pattern: '/login', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'rooms-list', kind: 'page', pattern: '/rooms', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'rooms-multi-room-booking', kind: 'page', pattern: '/rooms/multi-room-booking', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'rooms-detail', kind: 'page', pattern: '/rooms/[slug]', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'day-tour', kind: 'page', pattern: '/day-tour', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'day-tour-booking', kind: 'page', pattern: '/day-tour/booking', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'day-tour-calendar', kind: 'page', pattern: '/day-tour/calendar', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'calendar', kind: 'page', pattern: '/calendar', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'check-in', kind: 'page', pattern: '/check-in', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'feedback', kind: 'page', pattern: '/feedback', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'verify-staff', kind: 'page', pattern: '/verify-staff', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'reset-password', kind: 'page', pattern: '/reset-password', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'guest-reset-password', kind: 'page', pattern: '/guest-reset-password', methods: ['GET'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },

  // ─── Guest Pages ────────────────────────────────────────────────────────────
  { id: 'account', kind: 'page', pattern: '/account', methods: ['GET'], audience: 'guest', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'my-bookings', kind: 'page', pattern: '/my-bookings', methods: ['GET'], audience: 'guest', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },

  // ─── Legacy Redirects ───────────────────────────────────────────────────────
  { id: 'room-slug-legacy', kind: 'page', pattern: '/room/[slug]', methods: ['GET'], audience: 'public', status: 'legacy-redirect', landingForRole: null, redirectTo: '/rooms/[slug]', csrf: false, rateLimitPolicy: null, sensitiveResponse: false },

  // ─── Dashboard Landing ──────────────────────────────────────────────────────
  { id: 'dashboard', kind: 'page', pattern: '/dashboard', methods: ['GET'], audience: 'staff-or-admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },

  // ─── Dashboard Admin Pages ──────────────────────────────────────────────────
  { id: 'admin-archive', kind: 'page', pattern: '/dashboard/admin/archive', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'admin-audit', kind: 'page', pattern: '/dashboard/admin/audit', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'admin-calendar', kind: 'page', pattern: '/dashboard/admin/calendar', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'admin-calendar-daytour', kind: 'page', pattern: '/dashboard/admin/calendar-daytour', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'admin-calendars', kind: 'page', pattern: '/dashboard/admin/calendars', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'admin-day-tour', kind: 'page', pattern: '/dashboard/admin/day-tour', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'admin-feedback', kind: 'page', pattern: '/dashboard/admin/feedback', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'admin-manage', kind: 'page', pattern: '/dashboard/admin/manage', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'admin-overview', kind: 'page', pattern: '/dashboard/admin/overview', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: 'admin', redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'admin-payment', kind: 'page', pattern: '/dashboard/admin/payment', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'admin-reports', kind: 'page', pattern: '/dashboard/admin/reports', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'admin-reservations', kind: 'page', pattern: '/dashboard/admin/reservations', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'admin-reservations-guest-profile', kind: 'page', pattern: '/dashboard/admin/reservations/guest-profile', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'admin-rooms', kind: 'page', pattern: '/dashboard/admin/rooms', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'admin-staff', kind: 'page', pattern: '/dashboard/admin/staff', methods: ['GET'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },

  // ─── Dashboard Staff Pages ──────────────────────────────────────────────────
  { id: 'staff-audit', kind: 'page', pattern: '/dashboard/staff/audit', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'staff-availability', kind: 'page', pattern: '/dashboard/staff/availability', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'staff-calendar', kind: 'page', pattern: '/dashboard/staff/calendar', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'staff-calendar-daytour', kind: 'page', pattern: '/dashboard/staff/calendar-daytour', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'staff-calendars', kind: 'page', pattern: '/dashboard/staff/calendars', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'staff-overview', kind: 'page', pattern: '/dashboard/staff/overview', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: 'staff', redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'staff-payment', kind: 'page', pattern: '/dashboard/staff/payment', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'staff-reservations', kind: 'page', pattern: '/dashboard/staff/reservations', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'staff-reservations-guest-profile', kind: 'page', pattern: '/dashboard/staff/reservations/guest-profile', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'staff-scanner', kind: 'page', pattern: '/dashboard/staff/scanner', methods: ['GET'], audience: 'staff', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: false },

  // ─── API Routes ─────────────────────────────────────────────────────────────
  { id: 'api-admin-create-user', kind: 'api', pattern: '/api/admin/create-user', methods: ['POST'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: true, rateLimitPolicy: 'admin-write', sensitiveResponse: true },
  { id: 'api-admin-send-id-request', kind: 'api', pattern: '/api/admin/send-id-request', methods: ['POST'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: true, rateLimitPolicy: 'email-send', sensitiveResponse: false },
  { id: 'api-admin-send-move-date-notification', kind: 'api', pattern: '/api/admin/send-move-date-notification', methods: ['POST'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: true, rateLimitPolicy: 'email-send', sensitiveResponse: false },
  { id: 'api-admin-send-refund-notification', kind: 'api', pattern: '/api/admin/send-refund-notification', methods: ['POST'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: true, rateLimitPolicy: 'email-send', sensitiveResponse: false },
  { id: 'api-auth-session', kind: 'api', pattern: '/api/auth/session', methods: ['POST', 'DELETE'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: true },
  { id: 'api-auth-me', kind: 'api', pattern: '/api/auth/me', methods: ['GET'], audience: 'guest', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: null, sensitiveResponse: true },
  { id: 'api-auth-check-device', kind: 'api', pattern: '/api/auth/check-device', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-auth-forgot-password', kind: 'api', pattern: '/api/auth/forgot-password', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-auth-guest-forgot-password', kind: 'api', pattern: '/api/auth/guest-forgot-password', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-auth-guest-reset-password', kind: 'api', pattern: '/api/auth/guest-reset-password', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-auth-resend-verification', kind: 'api', pattern: '/api/auth/resend-verification', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-auth-reset-password', kind: 'api', pattern: '/api/auth/reset-password', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-auth-verify-device', kind: 'api', pattern: '/api/auth/verify-device', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-auth-verify-staff', kind: 'api', pattern: '/api/auth/verify-staff', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
  { id: 'api-chatbot', kind: 'api', pattern: '/api/chatbot', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'chatbot', sensitiveResponse: false },
  { id: 'api-checkin-generate-token', kind: 'api', pattern: '/api/checkin/generate-token', methods: ['POST'], audience: 'staff-or-admin', status: 'active', landingForRole: null, redirectTo: null, csrf: true, rateLimitPolicy: 'checkin', sensitiveResponse: true },
  { id: 'api-download-qr', kind: 'api', pattern: '/api/download-qr', methods: ['POST'], audience: 'staff-or-admin', status: 'active', landingForRole: null, redirectTo: null, csrf: true, rateLimitPolicy: null, sensitiveResponse: false },
  { id: 'api-send-email', kind: 'api', pattern: '/api/send-email', methods: ['POST'], audience: 'admin', status: 'active', landingForRole: null, redirectTo: null, csrf: true, rateLimitPolicy: 'email-send', sensitiveResponse: false },
  { id: 'api-verify-guest-email', kind: 'api', pattern: '/api/verify-guest-email', methods: ['POST'], audience: 'public', status: 'active', landingForRole: null, redirectTo: null, csrf: false, rateLimitPolicy: 'auth-attempt', sensitiveResponse: false },
];

/**
 * Role landing pages — the default redirect target for authenticated users.
 * Uses a null-prototype object to avoid prototype chain pollution.
 */
export const ROLE_LANDINGS = Object.assign(Object.create(null), {
  admin: '/dashboard/admin/overview',
  staff: '/dashboard/staff/overview',
});

/**
 * Public landing page for unauthenticated users.
 */
export const PUBLIC_LANDING = '/';

export default ROUTE_MANIFEST;
