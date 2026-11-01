/**
 * Firestore layout (only collections left open in firestore.rules, and
 * even those deny ALL client writes — only the Admin SDK touches them):
 *
 *   users/{uid}              { plan, email, name, createdAt, stats… }
 *   usage/{uid}              { "2026-11": 7, …one map key per period }
 *
 * The usage doc is a single document whose map keys are UTC-period ids,
 * so a month rolling over never needs a new doc.
 */

import {
  AdminNotConfiguredError,
  adminDb,
} from "@/lib/server/firebase-admin";
import type { AuthUser } from "@/lib/server/auth";
import {
  PLAN_LIMITS,
  currentPeriod,
  planLimits,
  type Plan,
} from "@/lib/plans";

export class QuotaExceededError extends Error {
  constructor(
    public period: string,
    public used: number,
    public limit: number,
  ) {
    super(`Quota exceeded for ${period} (${used}/${limit}).`);
  }
}

const usersCollection = () => adminDb().collection("users");
const usageCollection = () => adminDb().collection("usage");

/** Upsert the user profile on every session mint (keeps display name/email fresh). */
export async function upsertUserDoc(user: AuthUser): Promise<void> {
  const ref = usersCollection().doc(user.uid);
  const base = {
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    lastSeenAt: new Date(),
  };
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ ...base, plan: "free" as Plan, createdAt: new Date() });
  } else {
    await ref.set(base, { merge: true });
  }
}

export async function getUserPlan(uid: string): Promise<Plan> {
  const snap = await usersCollection().doc(uid).get();
  const plan = snap.exists ? (snap.get("plan") as string) : undefined;
  return plan === "premium" ? "premium" : "free";
}

export async function getUsage(uid: string): Promise<number> {
  const snap = await usageCollection().doc(uid).get();
  if (!snap.exists) return 0;
  const value = snap.get(currentPeriod());
  return typeof value === "number" ? value : 0;
}

/** Full account overview for the /api/auth/me surface. */
export async function getAccountOverview(user: AuthUser, plan?: Plan) {
  const [resolvedPlan, used] = await Promise.all([
    plan ?? getUserPlan(user.uid),
    getUsage(user.uid),
  ]);
  const limits = PLAN_LIMITS[resolvedPlan];
  return { user, plan: resolvedPlan, limits, period: currentPeriod(), used };
}

/** Pre-flight check before a paid Ollama call. */
export async function assertWithinQuota(uid: string, plan: Plan): Promise<void> {
  const used = await getUsage(uid);
  const limit = PLAN_LIMITS[plan].generationsPerMonth;
  if (used >= limit) throw new QuotaExceededError(currentPeriod(), used, limit);
}

/** Success-path consumption (transaction-atomic increment). */
export async function consumeGeneration(uid: string): Promise<void> {
  const period = currentPeriod();
  const doc = usageCollection().doc(uid);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(doc);
    const used = snap.exists && typeof snap.get(period) === "number" ? (snap.get(period) as number) : 0;
    tx.set(doc, { [period]: used + 1, updatedAt: new Date() }, { merge: true });
  });
}

/** For plan gating: re-derive limits for a request body's knobs. */
export const limitsForPlan = planLimits;

export { AdminNotConfiguredError };
