import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/auth-api';
import { sendTransactionalEmail } from '../../../../lib/mailer';
import { buildStaffVerificationEmailHtml } from '../../../../lib/emailTemplates';

export async function POST(request) {
  const authz = await requireAdmin(request);
  if ('error' in authz) return authz.error;

  try {
    const body = await request.json();
    const { email, name, verificationToken, role, linkStyle } = body;

    if (!email || !name || !verificationToken) {
      return NextResponse.json(
        { error: 'Missing email, name, or verificationToken' },
        { status: 400 }
      );
    }

    const base = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const qEmail = encodeURIComponent(email);
    const path =
      linkStyle === 'redirect'
        ? `${base}/api/auth/verify-staff?token=${verificationToken}&email=${qEmail}`
        : `${base}/verify-staff?token=${verificationToken}&email=${qEmail}`;

    const { to, subject, html } = buildStaffVerificationEmailHtml(email, name, path, role || 'staff');

    const result = await sendTransactionalEmail({ to, subject, html });
    return NextResponse.json(result);
  } catch (error) {
    console.error('staff-verification-email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
