import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasConfig =
  typeof process.env.NEXT_PUBLIC_FIREBASE_API_KEY === "string" &&
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY.length > 0;

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

if (hasConfig) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    app = getApp() as FirebaseApp;
    auth = getAuth(app);
    db = getFirestore(app);
  }
} else {
  // Build-time or missing config: provide stubs so imports don't fail.
  // These must not be used until Firebase is configured in the browser.
  app = null as unknown as FirebaseApp;
  auth = null as unknown as Auth;
  db = null as unknown as Firestore;
}

export { app, auth, db };
