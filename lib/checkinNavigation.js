/** Session key used when navigating from QR scanner to reservations */
export const PENDING_CHECKIN_TOKEN_KEY = 'pendingCheckinToken';

/** Reservations route for the current staff/admin session */
export function getReservationsPathForCheckin() {
  if (typeof window === 'undefined') {
    return '/dashboard/staff/reservations';
  }
  const userType = localStorage.getItem('userType');
  if (userType === 'admin') {
    return '/dashboard/admin/reservations';
  }
  return '/dashboard/staff/reservations';
}

/** Extract check-in token from scanned QR text */
export function extractCheckinTokenFromScan(decodedText) {
  const text = (decodedText || '').trim();
  if (!text) return null;

  try {
    const url = new URL(text, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const fromQuery = url.searchParams.get('token');
    if (fromQuery) return fromQuery;
  } catch {
    // Not a full URL
  }

  const match = text.match(/[?&]token=([^&\s#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);

  if (/^[a-f0-9]{32,64}$/i.test(text)) return text;

  return null;
}
