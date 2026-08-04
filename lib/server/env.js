// lib/server/env.js
// Strict environment schema parser — fail-fast at import time in production.
// Never logs or exposes secret values.

/**
 * @typedef {Object} ServerEnv
 * @property {string} FIREBASE_SERVICE_ACCOUNT_KEY - JSON service account credential (never logged)
 * @property {string} APP_ORIGIN - The canonical application origin (e.g. https://sandyfeet.com)
 * @property {'production' | 'development' | 'test'} NODE_ENV
 */

const REQUIRED_VARS = [
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'APP_ORIGIN',
  'NODE_ENV',
];

const VALID_NODE_ENVS = ['production', 'development', 'test'];

/**
 * Parse and validate required environment variables.
 * Throws at import time if any required var is missing or invalid in production.
 * @returns {ServerEnv}
 */
function parseEnv() {
  const missing = [];
  const invalid = [];

  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (value === undefined || value === '') {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    // In production, fail hard. In dev/test, still fail — no silent fallbacks.
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}. ` +
        'The server cannot start without these values.'
    );
  }

  const nodeEnv = process.env.NODE_ENV;
  if (!VALID_NODE_ENVS.includes(nodeEnv)) {
    invalid.push(`NODE_ENV must be one of: ${VALID_NODE_ENVS.join(', ')} (got "${nodeEnv}")`);
  }

  // Validate APP_ORIGIN is a proper URL (scheme + host, no trailing slash)
  const appOrigin = process.env.APP_ORIGIN;
  try {
    const url = new URL(appOrigin);
    if (!['http:', 'https:'].includes(url.protocol)) {
      invalid.push('APP_ORIGIN must use http or https protocol');
    }
  } catch {
    invalid.push(`APP_ORIGIN is not a valid URL: "${appOrigin}"`);
  }

  // Validate FIREBASE_SERVICE_ACCOUNT_KEY is parseable JSON
  try {
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } catch {
    invalid.push('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }

  if (invalid.length > 0) {
    throw new Error(
      `[env] Invalid environment configuration:\n  - ${invalid.join('\n  - ')}`
    );
  }

  return {
    FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    APP_ORIGIN: appOrigin,
    NODE_ENV: nodeEnv,
  };
}

/** @type {ServerEnv} */
export const env = parseEnv();
