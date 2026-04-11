import { NextResponse } from 'next/server';
import { getAdminDb } from '../../../../lib/firebaseAdmin';
import { sendTransactionalEmail } from '../../../../lib/mailer';
import { buildStaffWelcomeEmailHtml } from '../../../../lib/emailTemplates';

export async function POST(request) {
  try {
    const body = await request.json();
    const token = body.token;
    const emailRaw = body.email;

    if (!token || !emailRaw) {
      return NextResponse.json({ error: 'Missing token or email' }, { status: 400 });
    }

    const email = decodeURIComponent(String(emailRaw)).trim();

    const db = getAdminDb();
    const q = await db
      .collection('users')
      .where('email', '==', email)
      .where('verificationToken', '==', token)
      .limit(1)
      .get();

    if (q.empty) {
      return NextResponse.json(
        { success: false, error: 'invalid', message: 'Invalid or expired verification link.' },
        { status: 400 }
      );
    }

    const docSnap = q.docs[0];
    const userData = docSnap.data();

    if (userData.emailVerified) {
      return NextResponse.json({
        success: true,
        alreadyVerified: true,
        message: 'Your email has already been verified. You can now log in to your account.',
      });
    }

    const expiresAt = userData.verificationExpiresAt ? new Date(userData.verificationExpiresAt) : null;
    if (expiresAt && Number.isFinite(expiresAt.getTime()) && new Date() > expiresAt) {
      return NextResponse.json(
        {
          success: false,
          error: 'expired',
          message: 'Verification link has expired. Please request a new verification email.',
        },
        { status: 400 }
      );
    }

    await docSnap.ref.update({
      emailVerified: true,
      status: 'active',
      verifiedAt: new Date().toISOString(),
      verificationToken: null,
    });

    const { to, subject, html } = buildStaffWelcomeEmailHtml(
      userData.email,
      userData.name || 'Staff Member',
      process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    );
    await sendTransactionalEmail({ to, subject, html });

    return NextResponse.json({
      success: true,
      message: 'Your email has been successfully verified! Your account is now active.',
    });
  } catch (error) {
    console.error('complete-staff-verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
