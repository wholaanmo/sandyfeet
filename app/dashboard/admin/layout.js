// app/dashboard/admin/layout.js
// Server-authoritative admin layout guard.
// Enforces admin role at the server level before rendering any content.
// The withProtectedLayout call verifies the session cookie and account status.

import { withProtectedLayout } from '@/lib/server/auth/layout-guard.js';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({ children }) {
  // Server-authoritative: verify session and enforce admin role
  // Redirects to /login if unauthenticated, or to role landing if wrong role
  await withProtectedLayout(['admin']);

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
