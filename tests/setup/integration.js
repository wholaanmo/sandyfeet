const projectId = process.env.GCLOUD_PROJECT;

if (!projectId?.startsWith('demo-')) {
  throw new Error('Integration tests require a demo-* Firebase project.');
}

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Integration tests require isolated Firebase emulators.');
}
