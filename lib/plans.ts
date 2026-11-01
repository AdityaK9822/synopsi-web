/**
 * Tier definitions shared by the client (pricing UI, dialogs) and the
 * server (quota enforcement in the API routes). One source of truth.
 *
 * Tiers (from weakest to strongest):
 *   guest    — anonymous Firebase identity; the hard cap for walk-ins.
 *   free     — Google-signed-in, on the default plan.
 *   premium  — Google-signed-in, users/{uid}.plan = "premium".
 *
 * Billing security rule: the SERVER is the only authority for any limit.
 * The client reads TIER_LIMITS purely to render honest UI (disabled
 * toggles, usage meters); it can never grant itself more.
 *
 * Payments are NOT wired yet — "premium" is activated manually per user
 * (scripts/usage-probe.cjs plan <uid> premium). When Stripe lands later,
 * a webhook flips this same field.
 */

export type Tier = "guest" | "free" | "premium";

export type TierLimits = {
  /** Study-pack generations allowed per billing period (month). */
  generationsPerMonth: number;
  /** PDF exports allowed per billing period (null = unlimited). */
  downloadsPerMonth: number | null;
  /** Highest question count the tier may request; 0 = questions feature off. */
  maxQuestions: number;
  /** Fact-check / research mode availability. */
  research: boolean;
};

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  guest: {
    generationsPerMonth: 5,
    downloadsPerMonth: 0,
    maxQuestions: 0,
    research: false,
  },
  free: {
    generationsPerMonth: 10,
    downloadsPerMonth: 5,
    maxQuestions: 10,
    research: false,
  },
  premium: {
    generationsPerMonth: 300,
    downloadsPerMonth: null, // unlimited
    maxQuestions: 20,
    research: true,
  },
};

/** Firestore user doc field that decides the tier (Google sign-ups only). */
export const PREMIUM_PLAN_FIELD: { plan: Tier } = { plan: "premium" };

/** Billing-period key: UTC month, e.g. "2026-11". */
export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Legacy name — free/premium limits by plan value (Google users only). */
export function planLimits(plan: string | undefined | null): TierLimits {
  return TIER_LIMITS[plan === "premium" ? "premium" : "free"];
}
