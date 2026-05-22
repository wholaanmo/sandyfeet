// app/api/auth/guest-reset-password/route.js
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Admin SDK safely
const initAdmin = () => {
  if (admin.apps.length) return admin;
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw new Error('Firebase Admin initialization failed. Check FIREBASE_ADMIN_SDK_KEY env variable.');
  }
  return admin;
};

export async function POST(request) {
  try {
    const { token, newPassword } = await request.json();
    console.log('Reset request received for token:', token);
    
    if (!token || !newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Invalid request. Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const firebaseAdmin = initAdmin();
    const db = firebaseAdmin.firestore();

    const resetDoc = await db.collection('guestPasswordResets').doc(token).get();
    if (!resetDoc.exists) {
      console.log('Token not found:', token);
      return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 });
    }

    const resetData = resetDoc.data();
    if (resetData.used) {
      return NextResponse.json({ error: 'This reset link has already been used.' }, { status: 400 });
    }
    if (new Date(resetData.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Reset link has expired. Please request a new one.' }, { status: 400 });
    }

    const uid = resetData.uid;
    await firebaseAdmin.auth().updateUser(uid, { password: newPassword });
    console.log('Password updated for user:', uid);

    await resetDoc.ref.update({ used: true, usedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() });

    return NextResponse.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Guest reset password error:', error);
    return NextResponse.json(
      { error: 'Failed to reset password. Please try again later.' },
      { status: 500 }
    );
  }
}