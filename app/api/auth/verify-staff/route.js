// app/api/auth/verify-staff/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const baseUrl = request.nextUrl.origin;
  
  // Redirect to the verification page with parameters
  const redirectUrl = `${baseUrl}/verify-staff?token=${encodeURIComponent(token || '')}&email=${encodeURIComponent(email || '')}`;
  
  return NextResponse.redirect(redirectUrl);
}