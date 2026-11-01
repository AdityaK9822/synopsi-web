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

/** Accounts that always get full premium access (server-side, validated).
 *  Keep this list short and review every addition. */
export const ADMIN_EMAILS = ["asukathreads@gmail.com"];

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  guest: {
    generationsPerMonth: 3,
    downloadsPerMonth: 0,
    maxQuestions: 0,
    research: false,
  },
  free: {
    /* 5 generations + 3 downloads per 5-hour rolling window */
    generationsPerMonth: 5,
    downloadsPerMonth: 3,
    maxQuestions: 10,
    research: false,
  },
  premium: {
    generationsPerMonth: 100,
    downloadsPerMonth: null,
    maxQuestions: 20,
    research: true,
  },
};

/** Firestore user doc field that decides the tier (Google sign-ups only). */
export const PREMIUM_PLAN_FIELD: { plan: Tier } = { plan: "premium" };

/** Billing-period key: rolling 5-hour UTC bucket, e.g. "2026-11-01-2". */
export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}-${Math.floor(
    date.getUTCHours() / 5,
  )}`;
}

/** End of the current 5-hour UTC billing bucket (when the allowance resets). */
export function periodEnd(date = new Date()): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = Math.floor(date.getUTCHours() / 5) * 5 + 5;
  // Date.UTC normalises overflow into the next day/month/year.
  return new Date(Date.UTC(y, m, d, h, 0, 0, 0));
}

/** Legacy name — free/premium limits by plan value (Google users only). */
export function planLimits(plan: string | undefined | null): TierLimits {
  return TIER_LIMITS[plan === "premium" ? "premium" : "free"];
}
