"use client";

import { LogOut } from "lucide-react";

import DialogShell from "@/components/shell/DialogShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { TIER_LIMITS, type Tier } from "@/lib/plans";

/**
 * Account / sign-in surface wired to Firebase Auth (Google only —
 * email/password sign-up is a later build). Reflects the SERVER-verified
 * tier: guest (anonymous), free, premium — with live quota meters.
 */
export default function AccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { loading, user, overview, gatesLive, signInError, signInWithGoogle, signOut } = useAuth();

  const guest = Boolean(user?.isAnonymous);
  const signedIn = Boolean(user?.isAnonymous === false);
  const name = overview?.user.name ?? user?.displayName ?? null;
  const email = overview?.user.email ?? user?.email ?? null;
  const tier: Tier = overview?.tier ?? (guest ? "guest" : "free");
  const planLabel: Record<Tier, string> = { guest: "guest", free: "free", premium: "premium" };

  const gensUsed = overview?.used.generations ?? 0;
  const gensLimit = overview?.limits.generationsPerMonth ?? TIER_LIMITS.guest.generationsPerMonth;
  const dlUsed = overview?.used.downloads ?? 0;
  const dlLimit = overview?.limits.downloadsPerMonth ?? TIER_LIMITS.guest.downloadsPerMonth;
  const genPct = Math.min(100, Math.round((gensUsed / gensLimit) * 100));
  const dlPct = dlLimit === null ? 0 : Math.min(100, Math.round((dlUsed / dlLimit) * 100));

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={signedIn ? "Account" : guest ? "Guest session" : "Sign in"}
      subtitle={
        signedIn
          ? "Your notes stay local; this only tracks your tier and monthly allowance."
          : guest
            ? "You're browsing as a guest — everything resets when you refresh."
            : "Sign in to keep your chats on every device and unlock your free monthly allowance."
      }
    >
      {signedIn ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photoURL}
                alt=""
                className="size-11 shrink-0 rounded-full border border-line object-cover"
              />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-accent">
                {(name ?? email ?? "You").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{name ?? "Signed in"}</p>
              <p className="truncate text-sm text-muted">{email}</p>
            </div>
            <span
              className={cn(
                "ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
                tier === "premium" ? "bg-accent/15 text-accent" : "bg-line/60 text-muted",
              )}
            >
              {planLabel[tier]}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Meter
              label="Generations used"
              used={gensUsed}
              limit={gensLimit}
              pct={genPct}
              suffix="this 5h window"
            />
            <Meter label="Downloads used" used={dlUsed} limit={dlLimit} pct={dlPct} suffix="this 5h window" />
          </div>

          {overview?.resetAt && !isNaN(new Date(overview.resetAt).getTime()) && (
            <p className="text-xs text-muted">
              Resets in {Math.max(0, Math.round((new Date(overview.resetAt).getTime() - Date.now()) / 60000))} min
              {" "}· at {new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(overview.resetAt))}.
            </p>
          )}

          {!gatesLive && (
            <p className="text-center text-xs text-muted">
              Server-side tier enforcement is not configured on this deployment yet.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              void signOut().then(onClose);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-paper text-sm font-bold text-ink transition-[background-color] hover:bg-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.98] motion-reduce:transition-none"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {guest && (
            <div className="rounded-2xl border border-line bg-panel p-3.5 text-sm text-muted">
              <p className="font-semibold text-ink">What a guest gets</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>3 study packs this month</li>
                <li>No saved history — a refresh clears everything</li>
                <li>No fact-check (research) mode, no revision questions, no PDF export</li>
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              void signInWithGoogle();
            }}
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-white text-sm font-bold text-neutral-800 transition-[background-color,box-shadow] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.98] motion-reduce:transition-none disabled:opacity-60"
          >
            <GoogleMark className="size-5 shrink-0" />
            {loading ? "Checking your account…" : "Continue with Google"}
          </button>

          <p aria-live="polite" className="text-center text-xs text-muted">
            {signInError ??
              "Free plan: saved history, 3 packs and 5 PDF downloads a month."}
          </p>

          <p className="text-center text-sm text-muted">
            Email/password sign-up is coming in a later build.
          </p>
        </div>
      )}
    </DialogShell>
  );
}

/** One quota meter row; hidden entirely when the tier has no cap info. */
function Meter({
  label,
  used,
  limit,
  pct,
  suffix,
}: {
  label: string;
  used: number;
  limit: number | null;
  pct: number;
  suffix: string;
}) {
  if (limit === null) {
    return (
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-muted">
          {used} · {suffix} · unlimited
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-muted">
          {used} / {limit} {suffix}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-label={`${label} for this month`}
        className="h-2 overflow-hidden rounded-full bg-line/70"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", pct >= 100 ? "bg-amber-500" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Official four-colour Google "G" (decorative; the button's text carries
 * the accessible name) — the one place the style allows non-stroke SVG.
 */
function GoogleMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88 .92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
