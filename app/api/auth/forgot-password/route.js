// app/api/auth/forgot-password/route.js
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminDb, isAdminInitialized } from '../../../../lib/firebaseAdmin';
import { sendTransactionalEmail } from '../../../../lib/mailer';
import { buildPasswordResetEmailHtml } from '../../../../lib/emailTemplates';

async function sendResetEmail(to, resetLink, name = '') {
  const html = buildPasswordResetEmailHtml(resetLink, name);
  const result = await sendTransactionalEmail({
    to,
    subject: 'Reset Your Password - Sandy Feet Resort',
    html,
  });
  return result.success === true;
}

export async function POST(request) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const userSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();

    if (userSnapshot.empty) {
      return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    const uid = userDoc.id;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await db.collection('passwordResets').doc(resetToken).set({
      uid,
      email,
      token: resetToken,
      expiresAt: expiresAt.toISOString(),
      used: false,
      createdAt: new Date().toISOString(),
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    await sendResetEmail(email, resetLink, userData.name);

    return NextResponse.json({ message: 'Reset link sent to your email address.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to send reset email. Please try again.' }, { status: 500 });
  }
}
