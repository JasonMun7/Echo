/**
 * React Native Firebase initialization using the Firebase JS SDK.
 *
 * Reads config from expo-constants (populated by app.config.ts which
 * reads from Doppler-injected env vars at build time).
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey: extra.firebaseApiKey,
  authDomain: extra.firebaseAuthDomain,
  projectId: extra.firebaseProjectId,
  storageBucket: extra.firebaseStorageBucket,
  messagingSenderId: extra.firebaseMessagingSenderId,
  appId: extra.firebaseAppId,
};

const hasConfig = typeof firebaseConfig.apiKey === "string" && firebaseConfig.apiKey.length > 0;

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

if (hasConfig) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    try {
      const { getReactNativePersistence } = require("firebase/auth");
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      auth = getAuth(app);
    }
    db = getFirestore(app);
  } else {
    app = getApp();
    auth = getAuth(app);
    db = getFirestore(app);
  }
} else {
  app = null as unknown as FirebaseApp;
  auth = null as unknown as Auth;
  db = null as unknown as Firestore;
}

export { app, auth, db };
