// Client-only: calls secured API routes with Firebase ID token.
import { auth } from './firebase';

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function postBookingEmail(payload) {
  const token = await getIdToken();
  if (!token) return { success: false, error: 'Not signed in' };
  const res = await fetch('/api/admin/booking-email', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data.error || 'Request failed' };
  if (data.success === false) return data;
  return { success: true, ...data };
}

/** @returns {Promise<Record<string, string> | null>} */
export async function adminAuthJsonHeaders() {
  const token = await getIdToken();
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function sendConfirmationEmail(booking) {
  return postBookingEmail({
    action: 'confirm',
    bookingId: booking.id,
    type: 'room',
  });
}

export async function sendCancellationEmail(booking, reason, cancelledBy = 'admin') {
  return postBookingEmail({
    action: 'cancel',
    bookingId: booking.id,
    type: 'room',
    reason,
    cancelledBy,
  });
}

export async function sendDayTourConfirmationEmail(booking) {
  return postBookingEmail({
    action: 'confirm',
    bookingId: booking.id,
    type: 'daytour',
  });
}

export async function sendDayTourCancellationEmail(booking, reason, cancelledBy = 'admin') {
  return postBookingEmail({
    action: 'cancel',
    bookingId: booking.id,
    type: 'daytour',
    reason,
    cancelledBy,
  });
}
