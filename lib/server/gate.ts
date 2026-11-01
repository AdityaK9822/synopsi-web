/**
 * The single access-control gate for every server route that costs money
 * or user trust (Ollama calls, PDF builds).
 *
 * FAIL-CLOSED: with no configured admin SDK, NOTHING is allowed. There
 * is deliberately no "dev escape hatch" — a missing credential must
 * never widen public access (that was a real escalation hole once).
 *
 * Every metered route:
 *   1. verifies the session cookie (signature + revocation state)
 *   2. derives the tier server-side (cookies/plans the client sends
 *      are never trusted for authorisation)
 *   3. checks the Firestore usage counter BEFORE consuming upstream
 *   4. consumes only after success
 */

import type { NextRequest } from "next/server";

import { getSessionUser, type AuthUser } from "@/lib/server/auth";
import { AdminNotConfiguredError } from "@/lib/server/firebase-admin";
import { getUserTier, QuotaExceededError } from "@/lib/server/usage";
import { TIER_LIMITS, type Tier, type TierLimits } from "@/lib/plans";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type Gate = {
  user: AuthUser;
  tier: Tier;
  plan: string;
  limits: TierLimits;
};

/** Resolve the access gate for a request or throw a typed error. */
export async function gateRequest(req: NextRequest): Promise<Gate> {
  let user: AuthUser | null = null;
  try {
    user = await getSessionUser(req);
  } catch (exc) {
    if (exc instanceof AdminNotConfiguredError) throw exc;
    user = null;
  }
  if (!user) throw new UnauthorizedError();

  const { tier, plan } = await getUserTier(user);
  return { user, tier, plan, limits: TIER_LIMITS[tier] };
}

/** Map a typed gate error to the HTTP status + JSON body (402/401/403/503). */
export function gateErrorResponse(
  exc: unknown,
  fallback: { status: number; error: string },
): { status: number; error: string; code?: string } | null {
  if (exc instanceof AdminNotConfiguredError) {
    return {
      status: 503,
      error:
        "Server auth is not configured (FIREBASE_SERVICE_ACCOUNT missing) — access is locked until it is set.",
      code: "gates_offline",
    };
  }
  if (exc instanceof UnauthorizedError) {
    return { status: 401, error: exc.message, code: "auth_required" };
  }
  if (exc instanceof ForbiddenError) {
    return { status: 403, error: exc.message, code: exc.code };
  }
  if (exc instanceof QuotaExceededError) {
    const feature = exc.kind === "gen" ? "generations" : "downloads";
    return {
      status: 402,
      error: `You used all ${exc.limit} ${feature} for ${exc.period}. Premium unlocks more.`,
      code: `${exc.kind}_quota_exceeded`,
    };
  }
  void fallback;
  return null;
}
