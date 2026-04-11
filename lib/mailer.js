import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

/**
 * @returns {{ success: true, messageId?: string } | { success: false, error: string, development?: boolean }}
 */
export async function sendTransactionalEmail({ to, subject, html }) {
  if (!to || !subject || !html) {
    return { success: false, error: 'Missing required fields' };
  }

  const transport = getTransporter();
  if (!transport) {
    console.warn('Email credentials not configured. Email not sent.');
    return {
      success: false,
      error: 'Email service not configured',
      development: true,
    };
  }

  try {
    await transport.verify();
    const info = await transport.sendMail({
      from: `"Resort Management" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('sendTransactionalEmail:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}
