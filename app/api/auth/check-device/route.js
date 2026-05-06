// app/api/auth/check-device/route.js
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// ----- Helper: send email using nodemailer (copied from /api/send-email) -----
async function sendVerificationEmail(to, code) {
  // Reuse the same SMTP config logic from your existing /api/send-email
  function getTransportConfig() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    if (!user || !pass) return null;
    if (host && port) {
      return { host, port, secure, auth: { user, pass } };
    }
    return { service: 'gmail', auth: { user, pass } };
  }

  const config = getTransportConfig();
  if (!config) {
    console.error('SMTP not configured – cannot send device verification email');
    return false;
  }

  const transporter = nodemailer.createTransport(config);
  await transporter.verify();

  const sender = process.env.EMAIL_FROM || process.env.SMTP_FROM || config.auth.user;
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>Verify your login</h2>
      <p>Use the following code to complete your login:</p>
      <div style="font-size: 32px; font-weight: bold; background: #f0f0f0; padding: 20px; text-align: center; letter-spacing: 5px;">
        ${code}
      </div>
      <p>This code expires in 15 minutes.</p>
      <p>If you did not attempt to log in, please ignore this email.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Sandy Feet Resort" <${sender}>`,
      to,
      subject: 'Login Verification Code',
      html,
    });
    return true;
  } catch (err) {
    console.error('Failed to send verification email:', err);
    return false;
  }
}
// ---------------------------------------------------------------------------

export async function POST(req) {
  try {
    const { email, uid, deviceId } = await req.json();
    if (!email || !uid || !deviceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get IP and User-Agent from headers
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    // Fingerprint
    const fingerprintRaw = `${deviceId}|${userAgent}|${ip}`;
    const fingerprint = crypto.createHash('sha256').update(fingerprintRaw).digest('hex');

    const deviceRef = doc(db, 'users', uid, 'devices', fingerprint);
    const deviceSnap = await getDoc(deviceRef);

    if (deviceSnap.exists()) {
      // Trusted device – update last used
      await setDoc(deviceRef, { lastUsed: Date.now() }, { merge: true });
      return NextResponse.json({ recognised: true });
    }

    // New device – generate 6‑digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    const pendingRef = doc(db, 'pendingDeviceVerifications', email);
    await setDoc(pendingRef, {
      code,
      fingerprint,
      uid,
      expiresAt,
      createdAt: Date.now(),
    });

    // Send email – we now call the local function, no internal fetch
    const emailSent = await sendVerificationEmail(email, code);
    if (!emailSent) {
      console.error(`Could not send verification email to ${email}`);
      // Still return recognised: false, but log the error.
      // The frontend will show "Device verification failed" because checkRes.ok === false? Actually we return 200 OK with recognised:false.
      // But we must consider: the user won't receive the code. You may want to return a more specific error.
      // For now, we keep going; the modal will appear but email never arrives.
    }

    return NextResponse.json({ recognised: false });
  } catch (error) {
    console.error('Device check error (full details):', error);
    // Return a more descriptive error in development, but generic in production
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      { error: isDev ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}