// lib/firebaseAdmin.js
import admin from 'firebase-admin';

function tryInit() {
  if (admin.apps.length) return true;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw || raw === 'undefined') {
      return false;
    }
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    return false;
  }
}

tryInit();

export function isAdminInitialized() {
  return admin.apps.length > 0;
}

export function getAdminAuth() {
  if (!isAdminInitialized()) {
    throw new Error('Firebase Admin is not configured (set FIREBASE_SERVICE_ACCOUNT_KEY)');
  }
  return admin.auth();
}

/** @returns {import('firebase-admin/firestore').Firestore} */
export function getAdminDb() {
  if (!isAdminInitialized()) {
    throw new Error('Firebase Admin is not configured (set FIREBASE_SERVICE_ACCOUNT_KEY)');
  }
  return admin.firestore();
}
