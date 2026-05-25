import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAVkxt4OVcGfqQrAbnlMpiz2aeJE0542n4",
  authDomain: "sea-river-view.firebaseapp.com",
  projectId: "sea-river-view",
  storageBucket: "sea-river-view.firebasestorage.app",
  messagingSenderId: "601810946913",
  appId: "1:601810946913:web:459c8356fb956f5bd19320",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };