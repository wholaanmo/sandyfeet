// app/api/auth/reset-password/route.js
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, isAdminInitialized } from '../../../../lib/firebaseAdmin';

export async function POST(request) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const { token, email, newPassword } = await request.json();

    if (!token || !email || !newPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const db = getAdminDb();
    const resetRef = db.collection('passwordResets').doc(token);
    const resetDoc = await resetRef.get();

    if (!resetDoc.exists) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    const resetData = resetDoc.data();

    if (resetData.used) {
      return NextResponse.json({ error: 'Reset link already used' }, { status: 400 });
    }
    if (resetData.email !== email) {
      return NextResponse.json({ error: 'Invalid reset link' }, { status: 400 });
    }
    if (new Date() > new Date(resetData.expiresAt)) {
      return NextResponse.json({ error: 'Reset link has expired' }, { status: 400 });
    }

    await getAdminAuth().updateUser(resetData.uid, { password: newPassword });

    await resetRef.update({ used: true, updatedAt: new Date().toISOString() });

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }
}
