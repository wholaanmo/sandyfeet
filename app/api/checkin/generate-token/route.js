// app/api/checkin/generate-token/route.js
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const { bookingId } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID required' }, { status: 400 });
    }

    // 1. Search in room bookings (collection 'bookings')
    const bookingsRef = collection(db, 'bookings');
    const q1 = query(bookingsRef, where('bookingId', '==', bookingId));
    const q2 = query(bookingsRef, where('parentBookingId', '==', bookingId));
    const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const matchedRoomDocs = [...snapshot1.docs, ...snapshot2.docs];

    // 2. Search in day tour bookings (collection 'dayTourBookings')
    const dayTourRef = collection(db, 'dayTourBookings');
    const dayTourQuery = query(dayTourRef, where('bookingId', '==', bookingId));
    const dayTourSnapshot = await getDocs(dayTourQuery);
    const matchedDayTourDocs = dayTourSnapshot.docs;

    const matchedDocs = [...matchedRoomDocs, ...matchedDayTourDocs];
    if (matchedDocs.length === 0) {
      return NextResponse.json({ error: 'No booking found with the given ID' }, { status: 404 });
    }

    // 3. Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // 4. Store token document in checkinTokens collection (common for both types)
    const tokenRef = doc(db, 'checkinTokens', token);
    await setDoc(tokenRef, {
      bookingId: bookingId,
      createdAt: serverTimestamp(),
      used: false,
      usedAt: null,
      valid: true
    });

    // 5. Update each matched booking document with the token
    for (const docSnap of matchedDocs) {
      const bookingDocRef = doc(db, docSnap.ref.parent.path, docSnap.id);
      await updateDoc(bookingDocRef, {
        checkinToken: token,
        checkinTokenCreatedAt: serverTimestamp()
      });
    }

    return NextResponse.json({
      success: true,
      token: token,
      checkinUrl: `${process.env.NEXTAUTH_URL}/check-in?token=${token}`
    });

  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}