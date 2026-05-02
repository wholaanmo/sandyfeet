// app/api/download-qr/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Missing token parameter', { status: 400 });
  }

  // Build the QR code URL (same as in email)
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const qrDataUrl = `${baseUrl}/check-in?token=${token}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrDataUrl)}`;

  try {
    // Fetch the QR code image from the external API
    const response = await fetch(qrImageUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch QR code');
    }

    const imageBuffer = await response.arrayBuffer();

    // Return the image as a downloadable attachment
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="checkin_qrcode.png"',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Download QR error:', error);
    return new NextResponse('Failed to generate QR code', { status: 500 });
  }
}