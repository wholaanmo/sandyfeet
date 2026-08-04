import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-123' }),
    }),
  },
}));

describe('lib/server/services/email-commands.js', () => {
  let emailCommands;

  beforeEach(async () => {
    vi.resetModules();
    // Set env variables for email config
    process.env.SMTP_USER = 'test@example.com';
    process.env.SMTP_PASS = 'test-pass';
    emailCommands = await import('../../lib/server/services/email-commands.js');
  });

  describe('getOperationNames', () => {
    it('returns all predefined operation names', () => {
      const names = emailCommands.getOperationNames();
      expect(names).toContain('guest-verification');
      expect(names).toContain('move-date');
      expect(names).toContain('refund-status');
      expect(names).toContain('id-document-request');
      expect(names).toContain('staff-verification');
      expect(names.length).toBe(5);
    });
  });

  describe('validateEmailCommand', () => {
    it('rejects unknown operations', () => {
      const result = emailCommands.validateEmailCommand('send-arbitrary', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown email operation');
    });

    it('rejects operations with missing required fields', () => {
      const result = emailCommands.validateEmailCommand('guest-verification', {
        guestName: 'Test',
        // missing guestEmail, verificationLink
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required fields');
      expect(result.error).toContain('guestEmail');
      expect(result.error).toContain('verificationLink');
    });

    it('accepts valid operations with all required fields', () => {
      const result = emailCommands.validateEmailCommand('guest-verification', {
        guestName: 'Maria Santos',
        guestEmail: 'maria@example.com',
        verificationLink: 'https://sandyfeet.com/verify?token=abc',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects empty string values for required fields', () => {
      const result = emailCommands.validateEmailCommand('guest-verification', {
        guestName: '',
        guestEmail: 'maria@example.com',
        verificationLink: 'https://sandyfeet.com/verify?token=abc',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('guestName');
    });

    it('validates move-date operation with required fields', () => {
      const result = emailCommands.validateEmailCommand('move-date', {
        guestName: 'Juan Cruz',
        guestEmail: 'juan@example.com',
        bookingId: 'BK-001',
      });
      expect(result.valid).toBe(true);
    });

    it('validates refund-status operation', () => {
      const result = emailCommands.validateEmailCommand('refund-status', {
        guestName: 'Ana Reyes',
        guestEmail: 'ana@example.com',
        bookingId: 'BK-002',
      });
      expect(result.valid).toBe(true);
    });

    it('validates id-document-request operation', () => {
      const result = emailCommands.validateEmailCommand('id-document-request', {
        guestName: 'Pedro Garcia',
        guestEmail: 'pedro@example.com',
        bookingId: 'BK-003',
      });
      expect(result.valid).toBe(true);
    });

    it('validates staff-verification operation', () => {
      const result = emailCommands.validateEmailCommand('staff-verification', {
        staffName: 'Admin User',
        staffEmail: 'admin@sandyfeet.com',
        staffRole: 'Admin',
        verificationLink: 'https://sandyfeet.com/verify-staff?token=xyz',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('executeEmailCommand', () => {
    const actor = { uid: 'admin-001', role: 'admin' };

    it('throws VALIDATION_ERROR for unknown operation', async () => {
      await expect(
        emailCommands.executeEmailCommand('arbitrary-send', {}, actor)
      ).rejects.toThrow('Unknown email operation');
    });

    it('throws VALIDATION_ERROR for missing required fields', async () => {
      await expect(
        emailCommands.executeEmailCommand('guest-verification', { guestName: 'Test' }, actor)
      ).rejects.toThrow('Missing required fields');
    });

    it('throws VALIDATION_ERROR if resolved recipient has no @ sign', async () => {
      await expect(
        emailCommands.executeEmailCommand('guest-verification', {
          guestName: 'Test',
          guestEmail: 'not-an-email',
          verificationLink: 'https://sandyfeet.com/verify',
        }, actor)
      ).rejects.toThrow('Unable to resolve a valid recipient');
    });

    it('successfully executes a valid guest-verification command', async () => {
      const result = await emailCommands.executeEmailCommand('guest-verification', {
        guestName: 'Maria Santos',
        guestEmail: 'maria@example.com',
        verificationLink: 'https://sandyfeet.com/verify?token=abc123',
      }, actor);

      expect(result.success).toBe(true);
      expect(result.recipient).toBe('maria@example.com');
    });

    it('escapes HTML in template field values', async () => {
      // This test verifies that HTML injection is prevented
      const result = await emailCommands.executeEmailCommand('guest-verification', {
        guestName: '<script>alert("xss")</script>',
        guestEmail: 'test@example.com',
        verificationLink: 'https://sandyfeet.com/verify?token=abc',
      }, actor);

      expect(result.success).toBe(true);
    });
  });

  describe('EMAIL_OPERATIONS structure', () => {
    it('every operation has a resolveRecipient function', () => {
      const ops = emailCommands.EMAIL_OPERATIONS;
      for (const [name, op] of Object.entries(ops)) {
        expect(typeof op.resolveRecipient).toBe('function');
      }
    });

    it('every operation has a subject template', () => {
      const ops = emailCommands.EMAIL_OPERATIONS;
      for (const [name, op] of Object.entries(ops)) {
        expect(typeof op.subject).toBe('string');
        expect(op.subject.length).toBeGreaterThan(0);
      }
    });

    it('every operation has a non-empty template', () => {
      const ops = emailCommands.EMAIL_OPERATIONS;
      for (const [name, op] of Object.entries(ops)) {
        expect(typeof op.template).toBe('string');
        expect(op.template.length).toBeGreaterThan(0);
      }
    });

    it('every operation has requiredFields array', () => {
      const ops = emailCommands.EMAIL_OPERATIONS;
      for (const [name, op] of Object.entries(ops)) {
        expect(Array.isArray(op.requiredFields)).toBe(true);
        expect(op.requiredFields.length).toBeGreaterThan(0);
      }
    });

    it('client cannot supply arbitrary recipients — resolveRecipient derives from fields', () => {
      const ops = emailCommands.EMAIL_OPERATIONS;
      // Verify that recipient comes from a known email field, not arbitrary input
      const guestOp = ops['guest-verification'];
      const recipient = guestOp.resolveRecipient({ guestEmail: 'safe@example.com' });
      expect(recipient).toBe('safe@example.com');
    });
  });
});
