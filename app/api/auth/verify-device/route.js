// app/api/auth/verify-device/route.js
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';

export async function POST(req) {
  try {
    const { email, code, deviceId, uid } = await req.json();
    if (!email || !code || !deviceId || !uid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract IP and User-Agent from headers (same as check-device)
    const headers = req.headers;
    const userAgent = headers.get('user-agent') || 'unknown';
    const ip = headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'unknown';

    // Compute fingerprint using the same method as check-device
    const fingerprintRaw = `${deviceId}|${userAgent}|${ip}`;
    const fingerprint = crypto.createHash('sha256').update(fingerprintRaw).digest('hex');

    const pendingRef = doc(db, 'pendingDeviceVerifications', email);
    const pendingSnap = await getDoc(pendingRef);

    if (!pendingSnap.exists()) {
      return NextResponse.json({ error: 'No pending verification. Please log in again.' }, { status: 400 });
    }

    const data = pendingSnap.data();
    if (data.expiresAt < Date.now()) {
      await deleteDoc(pendingRef);
      return NextResponse.json({ error: 'Verification code expired. Please log in again.' }, { status: 400 });
    }
    if (data.code !== code) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    // Verify that the fingerprint matches the one that requested the code
    if (data.fingerprint !== fingerprint) {
      return NextResponse.json({ error: 'Device mismatch. Please log in again.' }, { status: 400 });
    }

    // Code is correct – trust the device
    const deviceRef = doc(db, 'users', uid, 'devices', fingerprint);
    await setDoc(deviceRef, {
      firstSeen: Date.now(),
      lastUsed: Date.now(),
      userAgent,
      ip,
    });

    // Clean up pending record
    await deleteDoc(pendingRef);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Device verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}