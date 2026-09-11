// app/api/admin/send-payment-request/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { sendPaymentRequestEmail } from '../../../../lib/emailService';
import { applyPaymentRequestToBookingDocs } from '../../../../lib/paymentRequestUtils';

export async function POST(request) {
  try {
    const { bookingId, type, adminMessage, roomTypesDisplay } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

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

    const bookingRef = doc(db, collectionName, bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = { id: bookingSnap.id, ...bookingSnap.data() };

    if (roomTypesDisplay) {
      booking.roomTypesDisplay = roomTypesDisplay;
    }

    const result = await sendPaymentRequestEmail(booking, adminMessage);

    if (result.success) {
      await applyPaymentRequestToBookingDocs(collectionName, booking, adminMessage);
      return NextResponse.json({ message: 'Payment request email sent successfully' });
    } else {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }
  } catch (error) {
    console.error('Payment request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
