/**
 * POST /api/auth/session — exchange a Firebase ID token (freshly minted by
 * the Google popup sign-in) for an httpOnly session cookie.
 *
 * The ID token is verified server-side ( firebase-admin), the user doc is
 * upserted, then a 14-day Firebase session cookie is set. Runs only while
 * the admin SDK is configured — otherwise it reports 503 and the app
 * keeps working ungated (pre-credential local dev behaviour).
 */

import { NextRequest, NextResponse } from "next/server";

import { mintSessionCookie, SESSION_COOKIE, SESSION_TTL_SECONDS, type AuthUser } from "@/lib/server/auth";
import { AdminNotConfiguredError, adminAuth, adminConfigured } from "@/lib/server/firebase-admin";
import { getAccountOverview, getUserTier, upsertUserDoc } from "@/lib/server/usage";

export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    // SOFT-FAIL: no service account configured (fresh local dev).
    console.warn("[auth/session] FIREBASE_SERVICE_ACCOUNT is not set — session NOT issued; API routes stay ungated.");
    return NextResponse.json(
      { error: "Server auth is not configured on this deployment (missing FIREBASE_SERVICE_ACCOUNT).", gatesLive: false },
      { status: 503 },
    );
  }

  let idToken: string | undefined;
  try {
    const body = (await req.json()) as { idToken?: unknown };
    idToken = typeof body?.idToken === "string" ? body.idToken : undefined;
  } catch {
    idToken = undefined;
  }
  if (!idToken) {
    return NextResponse.json({ error: "Sign-in incomplete — no ID token received." }, { status: 400 });
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    const user: AuthUser = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null,
      provider: (decoded.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider ?? null,
    };

    await upsertUserDoc(user);
    const cookieValue = await mintSessionCookie(idToken);

    const { tier, plan } = await getUserTier(user);
    const res = NextResponse.json({
      ok: true,
      ...(await getAccountOverview(user, tier, plan)),
      gatesLive: true,
    });
    res.cookies.set(SESSION_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
    return res;
  } catch (exc) {
    if (exc instanceof AdminNotConfiguredError) {
      return NextResponse.json({ error: exc.message, gatesLive: false }, { status: 503 });
    }
    console.warn("[auth/session] session mint failed:", exc);
    return NextResponse.json(
      { error: "Sign-in could not be verified — please try signing in again." },
      { status: 401 },
    );
  }
}
