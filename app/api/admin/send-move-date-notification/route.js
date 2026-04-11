// app/api/admin/send-move-date-notification/route.js
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/auth-api';
import { getAdminDb } from '../../../../lib/firebaseAdmin';
import { sendMoveDateNotificationEmail } from '../../../../lib/emailService.server';

export async function POST(request) {
  const authz = await requireAdmin(request);
  if ('error' in authz) return authz.error;

  try {
    const { bookingId, type } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    // Determine which collection to query based on booking type
    const normalizedType = String(type || '').toLowerCase();
    const collectionName =
      normalizedType === 'daytour'
        ? 'dayTourBookings'
        : normalizedType === 'room' || normalizedType === 'rooms'
          ? 'bookings'
          : null;

    if (!collectionName) {
      return NextResponse.json({ error: 'Invalid booking type' }, { status: 400 });
    }

    const bookingSnap = await getAdminDb().collection(collectionName).doc(bookingId).get();

    if (!bookingSnap.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = { id: bookingSnap.id, ...bookingSnap.data() };

    // Send email
    const result = await sendMoveDateNotificationEmail(booking);

    if (result.success) {
      return NextResponse.json({ message: 'Move date notification email sent successfully' });
    } else {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }
  } catch (error) {
    console.error('Move date notification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}