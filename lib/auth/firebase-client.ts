"use client";

/**
 * Firebase client SDK bootstrap (browser only). These NEXT_PUBLIC_*
 * identifiers are public by design — Firebase client SDKs ship them in
 * the page bundle; security comes from the verified server session, not
 * from hiding config strings.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, type Auth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Auth UI can render only when both identity keys are present at build time. */
export const firebaseClientConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!firebaseClientConfigured) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_* env vars are missing — copy the Firebase web config into .env.local.",
    );
  }
  if (!auth) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
  return auth;
}

export const googleProvider = new GoogleAuthProvider();
