// Client-only: staff verification email via secured admin API.
import { auth } from './firebase';

/**
 * @param {string} linkStyle - omit or 'page' for /verify-staff; 'redirect' for /api/auth/verify-staff
 */
export async function sendStaffVerificationEmail(email, name, verificationToken, role, linkStyle) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: 'Not signed in' };
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/staff-verification-email', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      email,
      name,
      verificationToken,
      role,
      linkStyle: linkStyle === 'redirect' ? 'redirect' : undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data.error || 'Request failed' };
  if (data.success === false) return data;
  return { success: true, ...data };
}
