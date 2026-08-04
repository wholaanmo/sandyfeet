// lib/server/services/email-commands.js
// Predefined server-owned email operations.
// Clients cannot supply arbitrary recipients, subjects, or HTML content.
// They only specify which operation and safe field values.
import 'server-only';

/**
 * @typedef {Object} EmailOperation
 * @property {string} subject - Subject template (fields interpolated with {{fieldName}})
 * @property {string} template - HTML template (fields interpolated with {{fieldName}})
 * @property {string[]} requiredFields - Fields the client must supply
 * @property {(fields: Record<string, string>) => string} resolveRecipient - Server-controlled recipient resolution
 */

/**
 * Escape HTML special characters to prevent injection in templates.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Render a template string by interpolating escaped field values.
 * @param {string} template
 * @param {Record<string, string>} fields
 * @returns {string}
 */
function renderTemplate(template, fields) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = fields[key];
    return value !== undefined ? escapeHtml(String(value)) : '';
  });
}

/**
 * Predefined email operations registry.
 * Server controls: recipient resolution, subject, and message template.
 * Client only supplies: operation name + required field values.
 */
export const EMAIL_OPERATIONS = {
  'guest-verification': {
    subject: 'Verify Your Email - Sandy Feet Resort',
    template: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="text-align: center; color: #111;">Email Verification</h1>
        <p>Dear <strong>{{guestName}}</strong>,</p>
        <p>Please verify your email address to complete your registration at Sandy Feet Resort.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{verificationLink}}" style="background-color: #111; color: #fff; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email</a>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center;">This link will expire in 15 minutes.</p>
      </div>
    `,
    requiredFields: ['guestName', 'guestEmail', 'verificationLink'],
    resolveRecipient: (fields) => fields.guestEmail,
  },

  'move-date': {
    subject: 'Down Payment Refund - {{bookingId}}',
    template: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="text-align: center; color: #111;">Refund Notice</h1>
        <p>Dear <strong>{{guestName}}</strong>,</p>
        <p>Your reservation request has been reviewed by resort management. Your down payment refund is currently being processed.</p>
        <div style="border-top: 1px solid #eee; padding: 15px 0; margin: 20px 0;">
          <p><strong>Booking ID:</strong> {{bookingId}}</p>
        </div>
        {{#adminMessage}}<div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Message from Resort:</strong><br/>{{adminMessage}}</p>
        </div>{{/adminMessage}}
        <p style="font-size: 12px; color: #999; text-align: center;">Sandy Feet Resort</p>
      </div>
    `,
    requiredFields: ['guestName', 'guestEmail', 'bookingId'],
    optionalFields: ['adminMessage'],
    resolveRecipient: (fields) => fields.guestEmail,
  },

  'refund-status': {
    subject: 'Cancellation Notification - {{bookingId}}',
    template: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="text-align: center; color: #111;">Cancellation Update</h1>
        <p>Dear <strong>{{guestName}}</strong>,</p>
        <p>We have received and confirmed your reservation cancellation request.</p>
        <p>In accordance with our policy, the full down payment will be retained by the resort and is non-refundable.</p>
        <div style="border-top: 1px solid #eee; padding: 15px 0; margin: 20px 0;">
          <p><strong>Booking ID:</strong> {{bookingId}}</p>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center;">Sandy Feet Resort</p>
      </div>
    `,
    requiredFields: ['guestName', 'guestEmail', 'bookingId'],
    resolveRecipient: (fields) => fields.guestEmail,
  },

  'id-document-request': {
    subject: 'ID Request - {{bookingId}}',
    template: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="text-align: center; color: #111;">ID Request</h1>
        <p>Dear <strong>{{guestName}}</strong>,</p>
        <p>To finalize your reservation at Sandy Feet Resort, we kindly request a clear copy of your valid government-issued ID.</p>
        <div style="border-top: 1px solid #eee; padding: 15px 0; margin: 20px 0;">
          <p><strong>Booking ID:</strong> {{bookingId}}</p>
        </div>
        {{#adminMessage}}<div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Note from Resort:</strong><br/>{{adminMessage}}</p>
        </div>{{/adminMessage}}
        <p>Please upload a clear photo of your ID in your Sandy Feet account.</p>
        <p style="font-size: 12px; color: #999; text-align: center;">Sandy Feet Resort</p>
      </div>
    `,
    requiredFields: ['guestName', 'guestEmail', 'bookingId'],
    optionalFields: ['adminMessage'],
    resolveRecipient: (fields) => fields.guestEmail,
  },

  'staff-verification': {
    subject: 'Verify Your Account - Sandy Feet Resort',
    template: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="text-align: center; color: #0B3B4F;">Welcome to Sandy Feet Resort!</h1>
        <p>Dear <strong>{{staffName}}</strong>,</p>
        <p>Your account has been created for the Sandy Feet Resort management system.</p>
        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Email:</strong> {{staffEmail}}</p>
          <p><strong>Role:</strong> {{staffRole}}</p>
        </div>
        <p style="color: #e65100;"><strong>Important:</strong> Please verify your email address to activate your account. The link will expire in 15 minutes.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{verificationLink}}" style="background-color: #2C7A7A; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Verify Email Address</a>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center;">Sandy Feet Resort</p>
      </div>
    `,
    requiredFields: ['staffName', 'staffEmail', 'staffRole', 'verificationLink'],
    resolveRecipient: (fields) => fields.staffEmail,
  },
};

/**
 * Get the list of valid operation names.
 * @returns {string[]}
 */
export function getOperationNames() {
  return Object.keys(EMAIL_OPERATIONS);
}

/**
 * Validate that an operation exists and required fields are present.
 * @param {string} operation
 * @param {Record<string, string>} fields
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEmailCommand(operation, fields) {
  const op = EMAIL_OPERATIONS[operation];
  if (!op) {
    return { valid: false, error: `Unknown email operation: ${operation}` };
  }

  const missingFields = op.requiredFields.filter(
    (f) => !fields || fields[f] === undefined || fields[f] === null || fields[f] === ''
  );

  if (missingFields.length > 0) {
    return { valid: false, error: `Missing required fields: ${missingFields.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Execute a predefined email command.
 * Server resolves recipients, subject, and renders the template with escaped fields.
 *
 * @param {string} operation - The predefined operation name
 * @param {Record<string, string>} fields - Safe field values provided by the client
 * @param {{ uid: string, role: string }} actor - The authenticated actor
 * @returns {Promise<{ success: boolean, recipient?: string, error?: string }>}
 */
export async function executeEmailCommand(operation, fields, actor) {
  const validation = validateEmailCommand(operation, fields);
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const op = EMAIL_OPERATIONS[operation];

  // Server-controlled recipient resolution
  const recipient = op.resolveRecipient(fields);
  if (!recipient || typeof recipient !== 'string' || !recipient.includes('@')) {
    const err = new Error('Unable to resolve a valid recipient for this operation');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Render subject and template with escaped field values
  const subject = renderTemplate(op.subject, fields);

  // Handle optional conditional sections ({{#field}}...{{/field}})
  let renderedTemplate = op.template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => {
      const value = fields[key];
      return value ? renderTemplate(content, fields) : '';
    }
  );
  renderedTemplate = renderTemplate(renderedTemplate, fields);

  // Send via nodemailer transport
  try {
    const nodemailer = await import('nodemailer');
    const transportConfig = getTransportConfig();
    if (!transportConfig) {
      const err = new Error('Email service is not configured');
      err.code = 'SERVICE_UNAVAILABLE';
      throw err;
    }
    const transporter = nodemailer.default.createTransport(transportConfig);
    const senderAddress = process.env.EMAIL_FROM || process.env.SMTP_FROM || transportConfig.auth.user;
    await transporter.sendMail({
      from: `"Sandy Feet Resort" <${senderAddress}>`,
      to: recipient,
      subject,
      html: renderedTemplate,
    });
    return { success: true, recipient };
  } catch (sendError) {
    if (sendError.code === 'SERVICE_UNAVAILABLE') {
      throw sendError;
    }
    const err = new Error('Email delivery failed');
    err.code = 'SERVICE_UNAVAILABLE';
    throw err;
  }
}

/**
 * Get SMTP transport configuration from environment.
 * @returns {object | null}
 */
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
    return { host, port, secure, auth: { user, pass } };
  }

  return { service: 'gmail', auth: { user, pass } };
}
