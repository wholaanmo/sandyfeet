// middleware.js
import { NextResponse } from 'next/server';

// Define protected admin routes
const adminRoutes = [
  '/dashboard/admin/archive',
  '/dashboard/admin/audit',
  '/dashboard/admin/calendar',
  '/dashboard/admin/calendar-daytour',
  '/dashboard/admin/calendars',
  '/dashboard/admin/day-tour',
  '/dashboard/admin/overview',
  '/dashboard/admin/payment',
  '/dashboard/admin/reports',
  '/dashboard/admin/reservations',
  '/dashboard/admin/rooms',
  '/dashboard/admin/staff',
];

// Define protected staff routes
const staffRoutes = [
  '/dashboard/staff/front-desk',
  '/dashboard/staff/calendar',
  '/dashboard/staff/calendar-daytour',
  '/dashboard/staff',
];

// Check if a path matches any of the routes (exact or starts with)
const matchesRoute = (path, routes) => {
  return routes.some(route => 
    path === route || path.startsWith(`${route}/`)
  );
};

export function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Check if this is an admin route
  const isAdminRoute = matchesRoute(pathname, adminRoutes);
  // Check if this is a staff route
  const isStaffRoute = matchesRoute(pathname, staffRoutes);
  
  // If not a protected route, allow access
  if (!isAdminRoute && !isStaffRoute) {
    return NextResponse.next();
  }
  
  // Get session data from cookies (set during login)
  const sessionToken = request.cookies.get('sessionToken')?.value;
  const userType = request.cookies.get('userType')?.value;
  const sessionExpiry = request.cookies.get('sessionExpiry')?.value;
  
  // Check if session exists and is not expired
  const isValidSession = sessionToken && userType && sessionExpiry && 
    parseInt(sessionExpiry) > Date.now();
  
  // If no valid session, redirect to login
  if (!isValidSession) {
    const loginUrl = new URL('/login', request.url);
    // Add redirect parameter to return to the original page after login
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // For admin routes, verify user has admin role
  if (isAdminRoute && userType !== 'admin') {
    // If user is staff trying to access admin route, redirect to staff dashboard
    if (userType === 'staff') {
      const staffDashboard = new URL('/dashboard/staff/front-desk', request.url);
      return NextResponse.redirect(staffDashboard);
    }
    // Otherwise redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
  
  // For staff routes, enforce staff-only access
  if (isStaffRoute) {
    if (userType === 'admin') {
      const adminDashboard = new URL('/dashboard/admin/overview', request.url);
      return NextResponse.redirect(adminDashboard);
    }
    if (userType !== 'staff') {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }
  
  // Session is valid, allow access
  return NextResponse.next();
}

// Configure which paths to run middleware on
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login'
  ],
};