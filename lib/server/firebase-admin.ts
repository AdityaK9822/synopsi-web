/**
 * Server-side Firebase bootstrap (firebase-admin).
 *
 * Credentials come from the FIREBASE_SERVICE_ACCOUNT env var: the full
 * service-account JSON (from Firebase console → Project settings →
 * Service accounts → Generate new private key), pasted as a single line.
 *
 * When the env var is absent (e.g. fresh local dev before the JSON is
 * added), every helper reports adminConfigured() = false and the auth
 * routes fail SOFT — the app keeps working ungated with a console warn,
 * exactly as it did before auth existed. Once the env var is set (it is
 * always set on Vercel/Render), the gates are live.
 */

import { App, cert, getApps, initializeApp, type AppOptions } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export class AdminNotConfiguredError extends Error {
  constructor() {
    super(
      "FIREBASE_SERVICE_ACCOUNT is not set — download the service-account JSON from the Firebase console and paste it as one line into .env.local.",
    );
    this.name = "AdminNotConfiguredError";
  }
}

let app: App | null = null;

export function adminConfigured(): boolean {
  if (app) return true;
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function adminApp(): App {
  if (app) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT ?? "";
  if (!raw) throw new AdminNotConfiguredError();

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is set but not valid JSON.");
  }
  if (json.type !== "service_account" || typeof json.client_email !== "string") {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT must be the service-account JSON (expecting {"type": "service_account", …}).',
    );
  }

  const options: AppOptions = { credential: cert(json as never) };
  if (!getApps().length) app = initializeApp(options);
  else app = getAppSafe(options);
  return app;
}

function getAppSafe(options: AppOptions): App {
  // getApps() is non-empty (another bundle instance raced us) — reuse it.
  const apps = getApps();
  if (apps.length) return apps[0];
  return initializeApp(options);
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

/** Memoised Firestore (avoids the default-health-check log spam in dev). */
let db: Firestore | null = null;
export function adminDb(): Firestore {
  if (db) return db;
  const conn = getFirestore(adminApp());
  conn.settings({ ignoreUndefinedProperties: true });
  db = conn;
  return conn;
}
