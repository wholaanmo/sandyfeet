// app/api/send-email/route.js
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

function getTransportConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!user || !pass) {
    return null;
  }

  if (host && port) {
    return {
      host,
      port,
      secure,
      auth: { user, pass }
    };
  }

  return {
    service: 'gmail',
    auth: { user, pass }
  };
}

export async function POST(request) {
  try {
    const { to, subject, html } = await request.json();
    
    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const transportConfig = getTransportConfig();
    if (!transportConfig) {
      console.error('Email service not configured. Set SMTP_* or EMAIL_* environment variables.');
      return NextResponse.json(
        {
          success: false,
          error: 'Email service is not configured. Please set SMTP_* or EMAIL_* environment variables.'
        },
        { status: 503 }
      );
    }

    const transporter = nodemailer.createTransport(transportConfig);
    await transporter.verify();

    const senderAddress = process.env.EMAIL_FROM || process.env.SMTP_FROM || transportConfig.auth.user;
    const info = await transporter.sendMail({
      from: `"Sandy Feet Resort" <${senderAddress}>`,
      to: to,
      subject: subject,
      html: html,
    });

    console.log('Email sent:', info.messageId);

    return NextResponse.json(
      { success: true, messageId: info.messageId },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send email: ' + error.message },
      { status: 500 }
    );
  }
}