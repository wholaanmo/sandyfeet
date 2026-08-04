#!/usr/bin/env node
// scripts/smoke-checks.mjs
// Bounded controlled-environment smoke checks.
// Verifies: parsed configuration (no values logged), security headers present,
// protected routes reject unauthenticated, CSP directives complete.
// Outputs pass/fail per check with correlation ID. Exit code 1 if any check fails.

import { randomUUID } from 'node:crypto';

const correlationId = randomUUID();
const results = [];

/**
 * Record a check result.
 * @param {string} name — human-readable check name
 * @param {'passed' | 'failed'} status
 * @param {string} [detail] — detail message (never includes secret values)
 */
function record(name, status, detail = '') {
  results.push({ name, status, detail, correlationId });
}

// ─── Check 1: Parsed configuration (no values logged) ─────────────────────────

function checkParsedConfig() {
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  ];

  const optionalVars = [
    'SESSION_SECRET',
    'SMTP_HOST',
    'CLOUDINARY_URL',
    'OPENAI_API_KEY',
  ];

  const missingRequired = requiredVars.filter(k => !process.env[k]);

  if (missingRequired.length > 0) {
    record(
      'config:required-vars',
      'failed',
      `Missing required environment variables: ${missingRequired.join(', ')} (values redacted)`
    );
  } else {
    record('config:required-vars', 'passed', `All ${requiredVars.length} required variables present (values redacted)`);
  }

  const presentOptional = optionalVars.filter(k => !!process.env[k]);
  record(
    'config:optional-vars',
    'passed',
    `${presentOptional.length}/${optionalVars.length} optional variables configured (values redacted)`
  );
}

// ─── Check 2: Security headers present ─────────────────────────────────────────

async function checkSecurityHeaders() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

  try {
    const response = await fetch(baseUrl, { method: 'GET', redirect: 'manual' });
    const headers = Object.fromEntries(
      [...response.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])
    );

    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
    ];

    // CSP can be in either enforcement or report-only mode
    const hasCsp = headers['content-security-policy'] || headers['content-security-policy-report-only'];

    const missingHeaders = requiredHeaders.filter(h => !headers[h]);

    if (missingHeaders.length > 0) {
      record('security:headers', 'failed', `Missing headers: ${missingHeaders.join(', ')}`);
    } else {
      record('security:headers', 'passed', 'All required security headers present');
    }

    if (!hasCsp) {
      record('security:csp', 'failed', 'No CSP header (enforce or report-only) found');
    } else {
      record('security:csp', 'passed', 'CSP header present');
    }
  } catch (err) {
    record('security:headers', 'failed', `Connection failed: ${err.message}`);
    record('security:csp', 'failed', `Connection failed: ${err.message}`);
  }
}

// ─── Check 3: Protected routes reject unauthenticated ──────────────────────────

async function checkProtectedRoutes() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

  const protectedPaths = [
    '/dashboard/admin',
    '/dashboard/staff',
    '/api/auth/me',
  ];

  for (const path of protectedPaths) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'Accept': 'application/json' },
      });

      // Protected routes should either redirect (3xx) or reject (401/403)
      const status = response.status;
      const isProtected = status === 301 || status === 302 || status === 307 ||
        status === 308 || status === 401 || status === 403;

      if (isProtected) {
        record(`auth:protected:${path}`, 'passed', `Returned ${status} for unauthenticated request`);
      } else {
        record(`auth:protected:${path}`, 'failed', `Expected redirect/reject, got ${status}`);
      }
    } catch (err) {
      record(`auth:protected:${path}`, 'failed', `Connection failed: ${err.message}`);
    }
  }
}

// ─── Check 4: CSP directives complete ──────────────────────────────────────────

async function checkCspDirectives() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

  try {
    const response = await fetch(baseUrl, { method: 'GET', redirect: 'manual' });
    const cspValue = response.headers.get('content-security-policy') ||
      response.headers.get('content-security-policy-report-only') || '';

    if (!cspValue) {
      record('csp:directives', 'failed', 'No CSP header found to validate directives');
      return;
    }

    const requiredDirectives = [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'connect-src',
      'frame-ancestors',
      'base-uri',
      'form-action',
      'object-src',
    ];

    const presentDirectives = requiredDirectives.filter(d => cspValue.includes(d));
    const missingDirectives = requiredDirectives.filter(d => !cspValue.includes(d));

    if (missingDirectives.length > 0) {
      record('csp:directives', 'failed', `Missing CSP directives: ${missingDirectives.join(', ')}`);
    } else {
      record('csp:directives', 'passed', `All ${requiredDirectives.length} required CSP directives present`);
    }

    // Check that script-src has nonce
    if (cspValue.includes("'nonce-")) {
      record('csp:nonce', 'passed', 'CSP script-src includes nonce');
    } else {
      record('csp:nonce', 'failed', 'CSP script-src missing nonce');
    }
  } catch (err) {
    record('csp:directives', 'failed', `Connection failed: ${err.message}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╭─ Smoke Checks ─ correlation: ${correlationId}`);
  console.log('│');

  // Config checks don't require a running server
  checkParsedConfig();

  // Network checks require SMOKE_BASE_URL or running server
  const skipNetwork = process.argv.includes('--config-only');

  if (!skipNetwork) {
    await checkSecurityHeaders();
    await checkProtectedRoutes();
    await checkCspDirectives();
  }

  // Output results
  let hasFailure = false;
  for (const r of results) {
    const icon = r.status === 'passed' ? '✓' : '✗';
    const line = `│ ${icon} ${r.name}: ${r.detail}`;
    console.log(line);
    if (r.status === 'failed') hasFailure = true;
  }

  console.log('│');
  console.log(`╰─ ${results.length} checks: ${results.filter(r => r.status === 'passed').length} passed, ${results.filter(r => r.status === 'failed').length} failed`);
  console.log(`   correlation: ${correlationId}\n`);

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Smoke check fatal error [${correlationId}]:`, err.message);
  process.exit(1);
});
