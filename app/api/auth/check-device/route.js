// app/api/auth/check-device/route.js
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';

export async function POST(req) {
  try {
    const { email, uid, deviceId } = await req.json();
    if (!email || !uid || !deviceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get IP and User-Agent from headers
    const headers = req.headers;
    const userAgent = headers.get('user-agent') || 'unknown';
    const ip = headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'unknown';

    // Create a stable fingerprint hash
    const fingerprintRaw = `${deviceId}|${userAgent}|${ip}`;
    const fingerprint = crypto.createHash('sha256').update(fingerprintRaw).digest('hex');

    const deviceRef = doc(db, 'users', uid, 'devices', fingerprint);
    const deviceSnap = await getDoc(deviceRef);

    if (deviceSnap.exists()) {
      // Trusted device – update last used timestamp
      await setDoc(deviceRef, { lastUsed: Date.now() }, { merge: true });
      return NextResponse.json({ recognised: true });
    }

    // New device – generate a 6‑digit code
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

    // Send verification email using the existing /api/send-email endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const emailRes = await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'Login Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Verify your login</h2>
            <p>Use the following code to complete your login:</p>
            <div style="font-size: 32px; font-weight: bold; background: #f0f0f0; padding: 20px; text-align: center; letter-spacing: 5px;">
              ${code}
            </div>
            <p>This code expires in 15 minutes.</p>
            <p>If you did not attempt to log in, please ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error('Failed to send verification email');
    }

    return NextResponse.json({ recognised: false });
  } catch (error) {
    console.error('Device check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}