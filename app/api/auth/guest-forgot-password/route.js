// app/api/auth/guest-forgot-password/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { doc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '@/lib/emailService';

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const guestProfilesRef = collection(db, 'guestProfiles');
    const q = query(guestProfilesRef, where('email', '==', email.toLowerCase().trim()));
    const guestSnapshot = await getDocs(q);
    if (guestSnapshot.empty) {
      // Don't reveal if email exists
      return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const guestDoc = guestSnapshot.docs[0];
    const guestData = guestDoc.data();
    const uid = guestDoc.id;

    if (guestData.provider === 'google') {
      return NextResponse.json(
        { error: "You can’t use this feature because your account is signed in using Google." },
        { status: 400 }
      );
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    const resetRef = doc(db, 'guestPasswordResets', resetToken);
    await setDoc(resetRef, {
      uid,
      email: email.toLowerCase().trim(),
      token: resetToken,
      expiresAt: expiresAt.toISOString(),
      used: false,
      createdAt: new Date().toISOString(),
    });

    const baseUrl = request.nextUrl?.origin || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/guest-reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    
    // Use the existing emailService function which has consistent design
    await sendPasswordResetEmail(email, guestData.firstName || '', resetLink);

    return NextResponse.json({ message: 'Reset link sent to your email address.' });
  } catch (error) {
    console.error('Guest forgot password error:', error);
    return NextResponse.json({ error: 'Failed to send reset email. Please try again.' }, { status: 500 });
  }
}