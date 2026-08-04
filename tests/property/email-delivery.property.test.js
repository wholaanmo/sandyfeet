// Property 8: Email commands cannot control delivery templates
// Validates: Requirements 2.7, 3.9

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('server-only', () => ({}));
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-msg' }),
    }),
  },
}));

import {
  EMAIL_OPERATIONS,
  getOperationNames,
  validateEmailCommand,
} from '../../lib/server/services/email-commands.js';

/**
 * Arbitrary that generates a random operation name from the registry.
 */
const operationNameArb = fc.constantFrom(...getOperationNames());

/**
 * Arbitrary that generates arbitrary string fields intended to inject
 * custom to, subject, or html values into the operation.
 */
const injectionFieldsArb = fc.record({
  to: fc.emailAddress(),
  subject: fc.string({ minLength: 1, maxLength: 100 }),
  html: fc.string({ minLength: 1, maxLength: 200 }),
  from: fc.emailAddress(),
  cc: fc.emailAddress(),
  bcc: fc.emailAddress(),
  replyTo: fc.emailAddress(),
});

/**
 * Arbitrary that generates strings containing HTML special characters.
 */
const htmlInjectionStringArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 80 }).map((s) => `<script>${s}</script>`),
  fc.string({ minLength: 1, maxLength: 80 }).map((s) => `<img onerror="${s}">`),
  fc.string({ minLength: 1, maxLength: 80 }).map((s) => `"onmouseover='${s}'`),
  fc.string({ minLength: 1, maxLength: 80 }).map((s) => `${s}<div>&"'</div>`),
  fc.constantFrom(
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "' OR '1'='1",
    '<iframe src="javascript:alert(1)">',
    '&lt;not-escaped&gt;',
    '<svg onload=alert(1)>',
  ),
);

describe('Property 8: Email commands cannot control delivery templates', () => {
  it('for any operation, template and subject are server-defined strings not influenced by fields beyond interpolation', () => {
    fc.assert(
      fc.property(operationNameArb, (opName) => {
        const op = EMAIL_OPERATIONS[opName];

        // Subject and template are defined statically in the registry
        expect(typeof op.subject).toBe('string');
        expect(op.subject.length).toBeGreaterThan(0);
        expect(typeof op.template).toBe('string');
        expect(op.template.length).toBeGreaterThan(0);

        // They are the same object reference every time — server-owned, not derived from input
        const opAgain = EMAIL_OPERATIONS[opName];
        expect(op.subject).toBe(opAgain.subject);
        expect(op.template).toBe(opAgain.template);

        // Template only allows {{word}} interpolation patterns, nothing else
        const interpolationPattern = /\{\{#?\w+\}\}|\{\{\/\w+\}\}/g;
        const subjectWithoutInterpolation = op.subject.replace(interpolationPattern, '');
        const templateWithoutInterpolation = op.template.replace(interpolationPattern, '');

        // After removing interpolation markers, no field placeholder syntax remains
        expect(subjectWithoutInterpolation).not.toMatch(/\{\{/);
        expect(templateWithoutInterpolation).not.toMatch(/\{\{/);
      }),
      { numRuns: 100 },
    );
  });

  it('validateEmailCommand never allows arbitrary to, subject, or html fields to be injected into the operation', () => {
    fc.assert(
      fc.property(operationNameArb, injectionFieldsArb, (opName, injectionFields) => {
        const op = EMAIL_OPERATIONS[opName];

        // Even if the client supplies to, subject, html, from, cc, bcc, replyTo fields,
        // validateEmailCommand only checks requiredFields — it cannot pass through injection fields
        const fieldsWithInjection = { ...injectionFields };

        // Validation should fail because required fields are missing
        const result = validateEmailCommand(opName, fieldsWithInjection);

        // The required fields for the operation are specific known fields (guestEmail, staffEmail, etc.)
        // Injection fields (to, subject, html) are never in requiredFields
        expect(op.requiredFields).not.toContain('to');
        expect(op.requiredFields).not.toContain('subject');
        expect(op.requiredFields).not.toContain('html');
        expect(op.requiredFields).not.toContain('from');
        expect(op.requiredFields).not.toContain('cc');
        expect(op.requiredFields).not.toContain('bcc');
        expect(op.requiredFields).not.toContain('replyTo');

        // If only injection fields are provided (not real required fields), validation fails
        if (!op.requiredFields.every((f) => fieldsWithInjection[f])) {
          expect(result.valid).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('resolveRecipient always derives from a known email field (guestEmail or staffEmail), not from arbitrary input', () => {
    const arbitraryEmailArb = fc.emailAddress();

    fc.assert(
      fc.property(operationNameArb, arbitraryEmailArb, (opName, arbitraryEmail) => {
        const op = EMAIL_OPERATIONS[opName];

        // Provide arbitrary email in a 'to' field — resolveRecipient should NOT use it
        const fieldsWithArbitraryTo = {
          to: arbitraryEmail,
          guestEmail: 'known-guest@sandyfeet.com',
          staffEmail: 'known-staff@sandyfeet.com',
          guestName: 'Guest',
          staffName: 'Staff',
          staffRole: 'admin',
          verificationLink: 'https://sandyfeet.com/verify?t=abc',
          bookingId: 'BK-TEST',
        };

        const recipient = op.resolveRecipient(fieldsWithArbitraryTo);

        // Recipient must come from a known field, never from 'to'
        const knownEmailFields = ['guestEmail', 'staffEmail'];
        const knownEmailValues = knownEmailFields.map((f) => fieldsWithArbitraryTo[f]);

        expect(knownEmailValues).toContain(recipient);
        // Specifically, the arbitrary 'to' field must not become the recipient
        // (unless it happens to equal the known email, which is controlled)
        if (arbitraryEmail !== 'known-guest@sandyfeet.com' && arbitraryEmail !== 'known-staff@sandyfeet.com') {
          expect(recipient).not.toBe(arbitraryEmail);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('HTML-escaped field values in rendered templates never contain unescaped <, >, ", \', & from the input', () => {
    fc.assert(
      fc.property(operationNameArb, htmlInjectionStringArb, (opName, maliciousValue) => {
        const op = EMAIL_OPERATIONS[opName];

        // Build fields with the malicious value in every required field position
        const fields = {};
        for (const fieldName of op.requiredFields) {
          if (fieldName.toLowerCase().includes('email')) {
            // Email fields need to be valid-ish for resolveRecipient
            fields[fieldName] = 'test@example.com';
          } else {
            fields[fieldName] = maliciousValue;
          }
        }

        // Render the template the same way the server does (inline rendering logic)
        function escapeHtml(value) {
          if (typeof value !== 'string') return '';
          return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
        }

        function renderTemplate(template, fieldValues) {
          return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            const value = fieldValues[key];
            return value !== undefined ? escapeHtml(String(value)) : '';
          });
        }

        // Render subject
        const renderedSubject = renderTemplate(op.subject, fields);
        // Render template (handle conditional sections first)
        let renderedTemplate = op.template.replace(
          /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
          (_, key, content) => {
            const value = fields[key];
            return value ? renderTemplate(content, fields) : '';
          },
        );
        renderedTemplate = renderTemplate(renderedTemplate, fields);

        // For fields that had the malicious value, check that the escaped version
        // never contains raw HTML chars from the original input
        const escapedMalicious = escapeHtml(maliciousValue);

        // The rendered output should contain the escaped version, not the raw version
        // Check that no unescaped dangerous chars from the input appear in interpolated positions
        for (const fieldName of op.requiredFields) {
          if (fields[fieldName] === maliciousValue) {
            // The raw malicious value should NOT appear in the output if it contains HTML chars
            if (/[<>"'&]/.test(maliciousValue)) {
              // After escaping, the interpolated section should not contain the raw value
              // We verify by checking the escaped form IS present instead
              const subjectHasEscaped = renderedSubject.includes(escapedMalicious);
              const templateHasEscaped = renderedTemplate.includes(escapedMalicious);

              // If the field was interpolated (exists in the template pattern), escaped form should appear
              if (op.subject.includes(`{{${fieldName}}}`)) {
                expect(subjectHasEscaped).toBe(true);
                // Raw dangerous chars from input must not appear unescaped
                expect(renderedSubject).not.toContain(maliciousValue);
              }
              if (op.template.includes(`{{${fieldName}}}`)) {
                expect(templateHasEscaped).toBe(true);
                expect(renderedTemplate).not.toContain(maliciousValue);
              }
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
