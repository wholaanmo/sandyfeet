import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, isAdminInitialized } from '../../../../lib/firebaseAdmin';
import { SESSION_COOKIE_NAME } from '../../../../lib/session-server';

const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 days

export async function POST(request) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: 'Server auth not configured' }, { status: 503 });
    }

    const body = await request.json();
    const idToken = body.idToken;
    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    let sessionCookie;
    try {
      sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: MAX_AGE_MS });
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
    const role = snap.data()?.role;
    if (role !== 'admin' && role !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(MAX_AGE_MS / 1000),
    });
    return res;
  } catch (error) {
    console.error('session route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
