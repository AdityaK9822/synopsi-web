/**
 * GET /api/auth/me — who is signed in, on what plan, and how much of the
 * current period quota they've consumed. Also reports `gatesLive` so the
 * client can be honest when the server cannot enforce anything (no admin
 * credentials configured — fresh local dev).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionUser } from "@/lib/server/auth";
import { AdminNotConfiguredError, adminAuth } from "@/lib/server/firebase-admin";
import { getAccountOverview, getUserPlan } from "@/lib/server/usage";

export async function GET(req: NextRequest) {
  let gatesLive = false;
  try {
    gatesLive = Boolean(adminAuth());
  } catch (exc) {
    if (!(exc instanceof AdminNotConfiguredError)) console.warn("[auth/me] admin check failed:", exc);
    gatesLive = false;
  }

  if (!gatesLive) {
    return NextResponse.json({ signedIn: false, gatesLive });

  }
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ signedIn: false, gatesLive });

  try {
    const plan = await getUserPlan(user.uid);
    const overview = await getAccountOverview(user, plan);
    return NextResponse.json({ ...overview, signedIn: true, gatesLive });
  } catch (exc) {
    console.warn("[auth/me] overview failed:", exc);
    return NextResponse.json({ signedIn: false, gatesLive });
  }
}
