import { NextResponse } from 'next/server';
import { firestore } from '@/lib/firebaseAdmin';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token')?.trim();

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });
  }

  if (!firestore) {
    return NextResponse.json({ valid: false, error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const tokenSnap = await firestore.collection('checkinTokens').doc(token).get();

    if (!tokenSnap.exists) {
      return NextResponse.json({ valid: false, error: 'Invalid check-in token' }, { status: 404 });
    }

    const tokenData = tokenSnap.data() || {};

    if (tokenData.valid === false) {
      return NextResponse.json({ valid: false, error: 'This check-in token is no longer valid' }, { status: 410 });
    }

    return NextResponse.json({
      valid: true,
      token,
      bookingId: tokenData.bookingId || null,
    });
  } catch (error) {
    console.error('resolve-token error:', error);
    return NextResponse.json({ valid: false, error: 'Failed to validate token' }, { status: 500 });
  }
}
