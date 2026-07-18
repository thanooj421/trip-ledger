import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v);
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing Firebase config values:",
    missing.map(([k]) => k).join(", "),
    "\nCopy .env.example to .env.local (for local dev) or set the matching GitHub Actions secrets (for deployment).",
  );
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {});
