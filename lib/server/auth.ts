/**
 * Session flow:
 *
 *   Google popup (client, firebase/auth) → Firebase ID token
 *     → POST /api/auth/session  { idToken }
 *     → verified server-side, exchanged for a 14-day session cookie
 *     → httpOnly cookie "synopsi_session" rides every API request
 *
 * The ID token never touches storage; the cookie is opaque (minted by
 * firebase-admin, not a raw token), so it can be revoked server-side.
 */

import type { NextRequest } from "next/server";

import { AdminNotConfiguredError, adminAuth } from "@/lib/server/firebase-admin";

export const SESSION_COOKIE = "synopsi_session";
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

export type AuthUser = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  provider: string | null;
};

/** Mint a long-lived session cookie from a freshly obtained ID token. */
export function mintSessionCookie(idToken: string): Promise<string> {
  return adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_TTL_SECONDS * 1000,
  });
}

/** Decode the request's session cookie → user, or null. Soft-fails when the admin SDK is not configured. */
export async function getSessionUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null,
      provider: decoded.firebase?.sign_in_provider ?? null,
    };
  } catch (exc) {
    if (exc instanceof AdminNotConfiguredError) return null;
    // Expired / revoked / tampered cookie — treat as signed out.
    return null;
  }
}
