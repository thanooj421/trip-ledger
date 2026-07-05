import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

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
    "\nCopy .env.example to .env.local (for local dev) or set the matching GitHub Actions secrets (for deployment)."
  );
}

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {});

// Lets the app keep working (read cached data, queue writes) when a phone
// briefly loses signal on the trip; queued writes sync automatically once
// back online. Fails quietly if multiple tabs are open in the same browser,
// which is fine — it just falls back to online-only behavior in that tab.
enableIndexedDbPersistence(db).catch(() => {});
