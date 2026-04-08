// app/api/send-email/route.js
import { NextResponse } from 'next/server';

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.warn('Nodemailer not installed. Email functionality will be disabled.');
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
    
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('Email credentials not configured. Email not sent.');
      console.log(`Would have sent email to: ${to}`);
      console.log(`Subject: ${subject}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email service not configured',
          development: true,
          message: 'Email would be sent in production with proper configuration'
        },
        { status: 200 }
      );
    }
    
    // Check if nodemailer is available
    if (!nodemailer) {
      console.warn('Nodemailer not installed. Please run: npm install nodemailer');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email service not available',
          message: 'Please install nodemailer: npm install nodemailer'
        },
        { status: 200 }
      );
    }
    
    // Configure email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail', // or use your SMTP settings
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    
    // Verify connection configuration
    await transporter.verify();
    
    // Send email
    const info = await transporter.sendMail({
      from: `"Resort Management" <${process.env.EMAIL_USER}>`,
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
      { error: 'Failed to send email: ' + error.message },
      { status: 500 }
    );
  }
}