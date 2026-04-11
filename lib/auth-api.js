import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, isAdminInitialized } from './firebaseAdmin';

export function getBearerIdToken(request) {
  const h = request.headers.get('authorization');
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

export async function getUserRole(uid) {
  const snap = await getAdminDb().collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return snap.data()?.role ?? null;
}

/**
 * @returns {Promise<{ uid: string } | { error: NextResponse }>}
 */
export async function requireAdmin(request) {
  if (!isAdminInitialized()) {
    return { error: NextResponse.json({ error: 'Server auth not configured' }, { status: 503 }) };
  }
  const idToken = getBearerIdToken(request);
  if (!idToken) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return { error: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  const role = await getUserRole(decoded.uid);
  if (role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { uid: decoded.uid };
}

/**
 * Staff dashboard and staff APIs: staff or admin.
 * @returns {Promise<{ uid: string, role: string } | { error: NextResponse }>}
 */
export async function requireStaffOrAdmin(request) {
  if (!isAdminInitialized()) {
    return { error: NextResponse.json({ error: 'Server auth not configured' }, { status: 503 }) };
  }
  const idToken = getBearerIdToken(request);
  if (!idToken) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return { error: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  const role = await getUserRole(decoded.uid);
  if (role !== 'staff' && role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { uid: decoded.uid, role };
}
