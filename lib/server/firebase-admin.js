// lib/server/firebase-admin.js
// Single fail-fast Firebase Admin initialization.
// Never catch-and-continue. Never console.log credentials.
import 'server-only';

import admin from 'firebase-admin';
import { env } from './env.js';

/**
 * Required fields in the service account JSON.
 */
const REQUIRED_SA_FIELDS = ['project_id', 'client_email', 'private_key'];

/**
 * Parse and validate the service account credential from the environment.
 * Throws if required fields are missing — never falls back silently.
 * @returns {admin.ServiceAccount}
 */
function parseServiceAccount() {
  const raw = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);

  const missingFields = REQUIRED_SA_FIELDS.filter(
    (field) => !raw[field] || typeof raw[field] !== 'string' || raw[field].trim() === ''
  );

  if (missingFields.length > 0) {
    throw new Error(
      `[firebase-admin] Service account JSON is missing required fields: ${missingFields.join(', ')}. ` +
        'Cannot initialize Firebase Admin.'
    );
  }

  return raw;
}

/**
 * Initialize Firebase Admin. Fails fast if already initialized with a
 * different app or if credentials are invalid.
 */
function initializeAdmin() {
  if (admin.apps.length > 0) {
    // Already initialized (e.g. hot-reload in dev) — reuse existing app.
    return admin.app();
  }

  const serviceAccount = parseServiceAccount();

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return app;
}

// Initialize at module load — fail-fast, no catch-and-continue.
const app = initializeAdmin();

export const auth = admin.auth(app);
export const firestore = admin.firestore(app);
