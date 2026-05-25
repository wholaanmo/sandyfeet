import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAWrlcFn_0ymR9F904S6bMbbJnQkaG9KAY",
  authDomain: "sandyfeet-reservation.firebaseapp.com",
  projectId: "sandyfeet-reservation",
  storageBucket: "sandyfeet-reservation.firebasestorage.app",
  messagingSenderId: "561798999220",
  appId: "1:561798999220:web:999722cd746ef59f243be1",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };