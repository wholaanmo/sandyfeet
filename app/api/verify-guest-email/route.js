// app/api/verify-guest-email/route.js
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing verification token' }, { status: 400 });
  }

  try {
    const tokenDoc = await db.collection('emailVerificationTokens').doc(token).get();
    if (!tokenDoc.exists) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    const { uid, email, expiresAt } = tokenDoc.data();

    if (Date.now() > expiresAt) {
      await db.collection('emailVerificationTokens').doc(token).delete();
      return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
    }

    const user = await admin.auth().getUser(uid);
    if (user.emailVerified) {
      // Already verified – still redirect with email to open modal
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      return NextResponse.redirect(`${baseUrl}/?verify=success&email=${encodeURIComponent(email)}`, 302);
    }

    await admin.auth().updateUser(uid, { emailVerified: true });

    await db.collection('guestProfiles').doc(uid).update({
      emailVerified: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('emailVerificationTokens').doc(token).delete();

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/?verify=success&email=${encodeURIComponent(email)}`, 302);
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}