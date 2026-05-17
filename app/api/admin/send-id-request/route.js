// app/api/admin/send-id-request/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { sendIdRequestEmail } from '../../../../lib/emailService';
import { applyIdRequestToBookingDocs } from '../../../../lib/idRequestUtils';

export async function POST(request) {
  try {
    const { bookingId, type, adminMessage, roomTypesDisplay } = await request.json();   // added roomTypesDisplay

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

    // Attach formatted room types if provided
    if (roomTypesDisplay) {
      booking.roomTypesDisplay = roomTypesDisplay;
    }

    const result = await sendIdRequestEmail(booking, adminMessage);

    if (result.success) {
      await applyIdRequestToBookingDocs(collectionName, booking, adminMessage);
      return NextResponse.json({ message: 'ID request email sent successfully' });
    } else {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }
  } catch (error) {
    console.error('ID request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}