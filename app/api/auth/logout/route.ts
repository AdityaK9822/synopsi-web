/**
 * POST /api/auth/logout — clear the session cookie (and revoke the
 * underlying refresh tokens so a stolen cookie can be retired by hand).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionUser, SESSION_COOKIE } from "@/lib/server/auth";
import { AdminNotConfiguredError, adminAuth, adminConfigured } from "@/lib/server/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    if (adminConfigured()) {
      const user = await getSessionUser(req);
      const uid = user?.uid;
      if (uid) {
        // Invalidate every refresh token first (cookie follows below).
        try {
          await adminAuth().revokeRefreshTokens(uid);
        } catch {
          // best effort — cookie clearing below is the meaningful part
        }
      }
    }
  } catch (exc) {
    if (!(exc instanceof AdminNotConfiguredError)) console.warn("[auth/logout] revoke failed:", exc);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
