/**
 * Firestore layout (only collections open in firestore.rules, and even
 * those deny ALL client writes — only the Admin SDK touches them):
 *
 *   users/{uid}   { plan: "free"|"premium", provider, email, name,
 *                   createdAt, lastSeenAt }
 *   usage/{uid}   { gen: {"2026-11": 3}, dl: {"2026-11": 1} }
 *                  — one doc per user, one map per counter, keys are
 *                    UTC-period ids so a month rollover needs no new doc.
 *
 * Tier derivation (server-side, from the verified session):
 *   provider anonymous          → guest
 *   users/{uid}.plan premium    → premium
 *   otherwise                   → free
 */

import { AdminNotConfiguredError, adminDb } from "@/lib/server/firebase-admin";
import type { AuthUser } from "@/lib/server/auth";
import { TIER_LIMITS, currentPeriod, type Tier, type TierLimits } from "@/lib/plans";

export class QuotaExceededError extends Error {
  readonly kind: "gen" | "dl";
  readonly period: string;
  readonly used: number;
  readonly limit: number | null;

  constructor(kind: "gen" | "dl", period: string, used: number, limit: number | null) {
    super(kind === "gen" ? `Generations exhausted for ${period}: ${used}/${limit}.` : `Downloads exhausted for ${period}: ${used}/${limit}.`);
    this.name = "QuotaExceededError";
    this.kind = kind;
    this.period = period;
    this.used = used;
    this.limit = limit;
  }
}

const usersCollection = () => adminDb().collection("users");
const usageCollection = () => adminDb().collection("usage");

type UsageDoc = { gen?: Record<string, number>; dl?: Record<string, number> };

/** Upsert the user profile on every session mint (keeps profile fields fresh). */
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
    await ref.set({ ...base, plan: "free", createdAt: new Date() });
  } else {
    await ref.set(base, { merge: true });
  }
}

/** Server-side tier derivation from the verified session + profile doc. */
export async function getUserTier(user: AuthUser): Promise<{ tier: Tier; plan: string }> {
  if (user.provider === "anonymous") return { tier: "guest", plan: "guest" };
  const snap = await usersCollection().doc(user.uid).get();
  const plan = snap.exists ? (snap.get("plan") as string) : "free";
  return { tier: plan === "premium" ? "premium" : "free", plan };
}

type Kind = "gen" | "dl";

export async function getUsage(uid: string): Promise<{ gen: number; dl: number }> {
  const period = currentPeriod();
  const snap = await usageCollection().doc(uid).get();
  const data = (snap.exists ? (snap.data() as UsageDoc | undefined) : undefined) ?? {};
  const gen = typeof data.gen?.[period] === "number" ? (data.gen[period] as number) : 0;
  const dl = typeof data.dl?.[period] === "number" ? (data.dl[period] as number) : 0;
  return { gen, dl };
}

/** Full account overview for the /api/auth/me surface. */
export async function getAccountOverview(user: AuthUser, tier: Tier, plan: string) {
  const { gen, dl } = await getUsage(user.uid);
  const limits: TierLimits = TIER_LIMITS[tier];
  return {
    user,
    tier,
    plan,
    limits,
    period: currentPeriod(),
    used: { generations: gen, downloads: dl },
  };
}

/** Pre-flight check before a server-initiated Ollama call / PDF build. */
export async function assertWithinQuota(uid: string, tier: Tier, kind: Kind): Promise<void> {
  const data = await getUsage(uid);
  const limits = TIER_LIMITS[tier];
  const used = kind === "gen" ? data.gen : data.dl;
  const limit = kind === "gen" ? limits.generationsPerMonth : limits.downloadsPerMonth;
  if (limit === null) return; // unlimited tier
  if (used >= limit) throw new QuotaExceededError(kind, currentPeriod(), used, limit);
}

/** Success-path consumption (transaction-atomic increment per counter). */
export async function consumeTierUse(uid: string, kind: Kind): Promise<void> {
  const period = currentPeriod();
  const doc = usageCollection().doc(uid);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(doc);
    const existing = (snap.exists ? (snap.data() as UsageDoc | undefined) : undefined) ?? {};
    const used =
      existing[kind] && typeof existing[kind]?.[period] === "number"
        ? (existing[kind][period] as number)
        : 0;
    tx.set(
      doc,
      { [kind]: { ...existing[kind], [period]: used + 1 }, updatedAt: new Date() },
      { merge: true },
    );
  });
}

export { AdminNotConfiguredError };
