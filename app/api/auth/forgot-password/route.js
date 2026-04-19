// app/api/auth/forgot-password/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { doc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';

async function sendResetEmail(to, resetLink, name = '', baseUrl) {
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Reset Your Password</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      <div style="background-color: white; border-radius: 12px; padding: 20px;">
        <p style="color: #0B3B4F;">Hello${name ? ` ${name}` : ''},</p>
        <p>We received a request to reset your password. Click the button below to set a new password. This link will expire in <strong>15 minutes</strong>.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Reset Password</a>
        </p>
        <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
      </div>
    </div>
  `;

  const response = await fetch(`${baseUrl}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject: 'Reset Your Password - Sandy Feet Resort', html: emailContent })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error || 'Failed to send reset email');
  }

  return true;
}

export async function POST(request) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if user exists in Firestore using the client SDK
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const userSnapshot = await getDocs(q);
    
    if (userSnapshot.empty) {
      // Security: don't reveal if email exists
      return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    const uid = userDoc.id;

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Store token in Firestore using client SDK
    const { doc, setDoc } = await import('firebase/firestore');
    const resetRef = doc(db, 'passwordResets', resetToken);
    await setDoc(resetRef, {
      uid,
      email,
      token: resetToken,
      expiresAt: expiresAt.toISOString(),
      used: false,
      createdAt: new Date().toISOString()
    });

    // Send email
    const baseUrl = request.nextUrl?.origin || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    await sendResetEmail(email, resetLink, userData.name, baseUrl);

    return NextResponse.json({ message: 'Reset link sent to your email address.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to send reset email. Please try again.' }, { status: 500 });
  }
}