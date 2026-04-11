import { NextResponse } from 'next/server';
import { getAdminDb } from '../../../../lib/firebaseAdmin';
import {
  sendRoomCancellationEmail,
  sendDayTourCancellationEmailServer,
} from '../../../../lib/emailService.server';

function normalizeEmail(e) {
  return String(e || '')
    .trim()
    .toLowerCase();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { bookingId, type, guestEmail, reason = '' } = body;

    if (!bookingId || !type || !guestEmail) {
      return NextResponse.json(
        { error: 'Missing bookingId, type, or guestEmail' },
        { status: 400 }
      );
    }

    const normalizedType = String(type).toLowerCase();
    const collectionName =
      normalizedType === 'daytour' ? 'dayTourBookings' : normalizedType === 'room' ? 'bookings' : null;

    if (!collectionName) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const expectedEmail = normalizeEmail(guestEmail);
    const snap = await getAdminDb().collection(collectionName).doc(bookingId).get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = snap.data();
    const docEmail = normalizeEmail(data?.guestInfo?.email);

    if (!docEmail || docEmail !== expectedEmail) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (data.status !== 'cancelled-by-guest') {
      return NextResponse.json(
        { error: 'Booking must be cancelled by guest before notification is sent' },
        { status: 400 }
      );
    }

    const booking = { id: snap.id, ...data };

    let result;
    if (collectionName === 'dayTourBookings') {
      result = await sendDayTourCancellationEmailServer(booking, reason, 'guest');
    } else {
      result = await sendRoomCancellationEmail(booking, reason, 'guest');
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('guest-cancellation-email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
