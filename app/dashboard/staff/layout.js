// app/dashboard/staff/layout.js
// Server-authoritative staff layout guard.
// Enforces staff or admin role at the server level before rendering any content.

import { withProtectedLayout } from '@/lib/server/auth/layout-guard.js';
import StaffLayoutClient from './StaffLayoutClient';

export default async function StaffLayout({ children }) {
  // Server-authoritative: verify session and enforce staff or admin role
  // Redirects to /login if unauthenticated, or to role landing if wrong role
  await withProtectedLayout(['staff', 'admin']);

  return <StaffLayoutClient>{children}</StaffLayoutClient>;
}
