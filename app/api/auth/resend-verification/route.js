// app/api/auth/resend-verification/route.js
import { NextResponse } from 'next/server';
import { firestore } from '@/lib/firebaseAdmin';
import { sendStaffVerificationEmail } from '@/lib/staffEmailService';

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email (staff/admin only)
    const usersRef = firestore.collection('users');
    const querySnapshot = await usersRef.where('email', '==', normalizedEmail).limit(1).get();
    if (querySnapshot.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    // Already verified? Prevent resend.
    if (userData.emailVerified === true) {
      return NextResponse.json({ error: 'Email already verified. Please log in.' }, { status: 400 });
    }

    // Simple rate limiting (60 seconds)
    const lastResend = userData.lastResendSent ? new Date(userData.lastResendSent) : null;
    if (lastResend && (Date.now() - lastResend.getTime()) < 60000) {
      return NextResponse.json(
        { error: 'Please wait at least 60 seconds before requesting another email.' },
        { status: 429 }
      );
    }

    // Generate new verification token (15 minutes expiry)
    const verificationToken = Math.random().toString(36).substring(2, 15) +
                              Math.random().toString(36).substring(2, 15);
    const verificationExpiresAt = new Date();
    verificationExpiresAt.setMinutes(verificationExpiresAt.getMinutes() + 15);

    // Update Firestore
    await userDoc.ref.update({
      verificationToken,
      verificationExpiresAt: verificationExpiresAt.toISOString(),
      lastResendSent: new Date().toISOString(),
    });

    // Build verification link (reuses /verify-staff handler)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/verify-staff?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send email using the same design as staffEmailService
    const emailResult = await sendStaffVerificationEmail(
      normalizedEmail,
      userData.name || 'User',
      verificationLink,
      userData.role || 'staff'
    );

    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      return NextResponse.json({ error: 'Failed to send email. Please try again later.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Verification email sent successfully!' });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}