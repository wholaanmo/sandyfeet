// middleware.js
// Request policy layer using the canonical route manifest.
// Does NOT derive authority from unsigned cookie values.
// Final authorization is always in server layouts and route handlers.
//
// This middleware performs ONLY:
// 1. Missing-session routing (redirect to /login for protected routes without any session cookie)
// 2. Legacy redirect handling (/room/[slug] → /rooms/[slug])
//
// It NEVER makes role-based access decisions from cookies.
// Role enforcement happens in withProtectedLayout (layouts) and withApiBoundary (APIs).

import { NextResponse } from 'next/server';

// The secure session cookie name — presence is checked, not value (that's for server)
const SESSION_COOKIE_NAME = '__Host-sf_session';

// Routes that require ANY authenticated session (not role-specific — role is server-checked)
const PROTECTED_PATH_PREFIXES = [
  '/dashboard',
  '/account',
  '/my-bookings',
];

// Legacy redirect patterns
const LEGACY_ROOM_PATTERN = /^\/room\/([^/]+)$/;

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Handle legacy redirect: /room/[slug] → /rooms/[slug]
  const legacyMatch = pathname.match(LEGACY_ROOM_PATTERN);
  if (legacyMatch) {
    const slug = legacyMatch[1];
    const destination = new URL(`/rooms/${encodeURIComponent(slug)}`, request.url);
    return NextResponse.redirect(destination, 308);
  }

  // Check if this is a protected path (requires session)
  const isProtected = PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Check for the presence of the secure session cookie
  // We only check PRESENCE here — actual validation happens server-side
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
    // No session cookie → redirect to login with safe return path
    const loginUrl = new URL('/login', request.url);

    // Only pass the return path if it's a same-origin relative path
    // (validated again server-side by normalizeReturnPath)
    if (pathname && pathname.startsWith('/') && !pathname.includes('\\')) {
      loginUrl.searchParams.set('redirect', pathname);
    }

    return NextResponse.redirect(loginUrl);
  }

  // Session cookie exists — let the request through
  // Final role-based authorization happens in:
  // - Server layouts via withProtectedLayout(['admin']) or withProtectedLayout(['staff', 'admin'])
  // - API routes via withApiBoundary({ auth: 'required', roles: [...] })
  return NextResponse.next();
}

// Only run middleware on pages (not static assets, _next, etc.)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
