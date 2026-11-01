/**
 * Plan definitions shared by the client (pricing UI, dialogs) and the
 * server (quota enforcement in the API routes). One source of truth.
 *
 * Payments are NOT wired yet — "premium" is just the second tier here,
 * activated manually per user in Firestore (users/{uid}.plan = "premium").
 * When Stripe lands later, a webhook flips this same field.
 */

export type Plan = "free" | "premium";

export type PlanLimits = {
  /** Study-pack generations allowed per billing period (month). */
  generationsPerMonth: number;
  /** Highest question count the plan may request (5–20 overall). */
  maxQuestions: number;
  /** Fact-check / research mode availability. */
  research: boolean;
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    generationsPerMonth: 10,
    maxQuestions: 10,
    research: false,
  },
  premium: {
    generationsPerMonth: 300,
    maxQuestions: 20,
    research: true,
  },
};

/** Firestore user doc field that decides the plan. */
export const PREMIUM_PLAN_FIELD: { plan: Plan } = { plan: "premium" };

/** Billing-period key: UTC month, e.g. "2026-11". */
export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function planLimits(plan: string | undefined | null): PlanLimits {
  return PLAN_LIMITS[plan === "premium" ? "premium" : "free"];
}
