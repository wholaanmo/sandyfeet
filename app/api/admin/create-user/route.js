// app/api/admin/create-user/route.js
import { NextResponse } from 'next/server';
import { auth as adminAuth, firestore } from '@/lib/firebaseAdmin';
import { sendStaffVerificationEmail } from '@/lib/staffEmailService';

export async function POST(request) {
  try {
    // 1. Verify admin authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (err) {
      console.error('Token verification failed:', err);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const adminUid = decodedToken.uid;

    // 2. Check that the requester is an admin in Firestore
    const adminDoc = await firestore.collection('users').doc(adminUid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 3. Parse request body
    const { email, password, name, role, phone } = await request.json();
    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 4. Create user in Firebase Auth (Admin SDK does not auto-sign in)
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: name,
      });
    } catch (err) {
      console.error('Auth user creation failed:', err);
      if (err.code === 'auth/email-already-exists') {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    const uid = userRecord.uid;

    // 5. Generate verification token & expiry (15 minutes)
    const verificationToken = Math.random().toString(36).substring(2, 15) +
                              Math.random().toString(36).substring(2, 15);
    const verificationExpiresAt = new Date();
    verificationExpiresAt.setMinutes(verificationExpiresAt.getMinutes() + 15);

    // 6. Create Firestore user document
    const userData = {
      uid,
      name,
      email,
      role,
      phone: phone || '',
      status: 'pending_verification',
      emailVerified: false,
      verificationToken,
      verificationExpiresAt: verificationExpiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: adminUid,
    };
    await firestore.collection('users').doc(uid).set(userData);

    // 7. Send verification email (server-side)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    (request.headers.get('origin') ?? 'http://localhost:3000');
    const verificationLink = `${baseUrl}/verify-staff?token=${verificationToken}&email=${encodeURIComponent(email)}`;
    await sendStaffVerificationEmail(email, name, verificationLink, role);

    return NextResponse.json({
      success: true,
      message: 'Staff account created. Verification email sent.',
      uid,
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}