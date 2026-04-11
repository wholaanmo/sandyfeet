import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb, isAdminInitialized } from './firebaseAdmin';

export const SESSION_COOKIE_NAME = 'sf_session';

/**
 * @returns {Promise<{ uid: string, role: string } | null>}
 */
export async function verifyDashboardSession() {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!session || !isAdminInitialized()) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
    if (!snap.exists) return null;
    const role = snap.data()?.role;
    if (role !== 'admin' && role !== 'staff') return null;
    return { uid: decoded.uid, role };
  } catch {
    return null;
  }
}
