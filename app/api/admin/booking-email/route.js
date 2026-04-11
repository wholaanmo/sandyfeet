import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/auth-api';
import { getAdminDb } from '../../../../lib/firebaseAdmin';
import {
  sendRoomConfirmationEmail,
  sendRoomCancellationEmail,
  sendDayTourConfirmationEmailServer,
  sendDayTourCancellationEmailServer,
} from '../../../../lib/emailService.server';

export async function POST(request) {
  const authz = await requireAdmin(request);
  if ('error' in authz) return authz.error;

  try {
    const body = await request.json();
    const { action, bookingId, type, reason, cancelledBy = 'admin' } = body;

    if (!action || !bookingId || !type) {
      return NextResponse.json({ error: 'Missing action, bookingId, or type' }, { status: 400 });
    }

    const normalizedType = String(type).toLowerCase();
    const collectionName =
      normalizedType === 'daytour' ? 'dayTourBookings' : normalizedType === 'room' ? 'bookings' : null;

    if (!collectionName) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const snap = await getAdminDb().collection(collectionName).doc(bookingId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = { id: snap.id, ...snap.data() };

    if (action === 'confirm') {
      if (collectionName === 'dayTourBookings') {
        const result = await sendDayTourConfirmationEmailServer(booking);
        return NextResponse.json(result);
      }
      const result = await sendRoomConfirmationEmail(booking);
      return NextResponse.json(result);
    }

    if (action === 'cancel') {
      if (!reason || typeof reason !== 'string') {
        return NextResponse.json({ error: 'reason is required for cancel' }, { status: 400 });
      }
      const by = cancelledBy === 'guest' ? 'guest' : 'admin';
      if (collectionName === 'dayTourBookings') {
        const result = await sendDayTourCancellationEmailServer(booking, reason, by);
        return NextResponse.json(result);
      }
      const result = await sendRoomCancellationEmail(booking, reason, by);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('booking-email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
