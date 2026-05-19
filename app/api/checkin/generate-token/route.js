// app/api/checkin/generate-token/route.js
import { firestore } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request) {
  try {
    if (!firestore) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { bookingId } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID required' }, { status: 400 });
    }

    const bookingsRef = firestore.collection('bookings');
    const [snapshot1, snapshot2] = await Promise.all([
      bookingsRef.where('bookingId', '==', bookingId).get(),
      bookingsRef.where('parentBookingId', '==', bookingId).get(),
    ]);
    const matchedRoomDocs = [...snapshot1.docs, ...snapshot2.docs];

    const dayTourRef = firestore.collection('dayTourBookings');
    const dayTourSnapshot = await dayTourRef.where('bookingId', '==', bookingId).get();
    const matchedDayTourDocs = dayTourSnapshot.docs;

    const matchedDocs = [...matchedRoomDocs, ...matchedDayTourDocs];
    if (matchedDocs.length === 0) {
      return NextResponse.json({ error: 'No booking found with the given ID' }, { status: 404 });
    }

    const token = crypto.randomBytes(32).toString('hex');

    await firestore.collection('checkinTokens').doc(token).set({
      bookingId,
      createdAt: FieldValue.serverTimestamp(),
      used: false,
      usedAt: null,
      valid: true,
    });

    const batch = firestore.batch();
    for (const docSnap of matchedDocs) {
      batch.update(docSnap.ref, {
        checkinToken: token,
        checkinTokenCreatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    return NextResponse.json({
      success: true,
      token,
      checkinUrl: `${baseUrl}/check-in?token=${token}`,
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
