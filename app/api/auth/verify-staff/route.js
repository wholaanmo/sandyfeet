// app/api/auth/verify-staff/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  // Use the request origin first, then env, then localhost fallback
  const baseUrl = request.nextUrl?.origin || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const redirectUrl = `${baseUrl}/verify-staff?token=${encodeURIComponent(token || '')}&email=${encodeURIComponent(email || '')}`;
  
  return NextResponse.redirect(redirectUrl);
}