"use client";

import { useState } from "react";
import { Sun, Moon, Trash2 } from "lucide-react";

import DialogShell from "@/components/shell/DialogShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { minutesUntil } from "@/lib/utils";

/**
 * Settings. Only REAL capabilities get controls here: the theme switch
 * (works) and clearing local chat history (works, destructive with an
 * inline two-step confirm). Sections like "Account" live in the account
 * dialog; nothing pretends to have a backend.
 */
export default function SettingsDialog({
  open,
  onClose,
  dark,
  onToggleDark,
  onClearHistory,
  historyCount,
}: {
  open: boolean;
  onClose: () => void;
  dark: boolean;
  onToggleDark: (dark: boolean) => void;
  onClearHistory: () => void;
  historyCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const auth = useAuth();
  const used = auth.overview?.used;
  const limits = auth.overview?.limits;
  const usedGens = used?.generations ?? 0;
  const usedDls = used?.downloads ?? 0;
  const genLimit = limits?.generationsPerMonth;
  const dlLimit = limits?.downloadsPerMonth;

  return (
    <DialogShell
      open={open}
      onClose={() => {
        // Leave no half-armed destructive confirm behind the dialog.
        setConfirming(false);
        onClose();
      }}
      title="Settings"
      subtitle="Appearance and your local chat history."
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="set-usage">
          <h3 id="set-usage" className="text-sm font-semibold">
            Usage this 5-hour window
          </h3>
          <p className="mt-1 text-sm text-muted">
            {auth.isGuest
              ? "You're a guest — sign in with Google to get 5 generations, 3 downloads and quiz features."
              : auth.gatesLive
                ? "Server-tracked against your account."
                : "Generations aren't tracked until server auth is configured."}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-line bg-card p-3 text-xs">
            <div>
              <p className="text-muted">Generations</p>
              <p className="mt-1 font-bold text-ink tabular-nums">
                {usedGens}
                <span className="font-normal text-muted">
                  {" "}
                  / {genLimit ? genLimit : "∞"}
                </span>
              </p>
            </div>
            <div>
              <p className="text-muted">Downloads</p>
              <p className="mt-1 font-bold text-ink tabular-nums">
                {usedDls}
                <span className="font-normal text-muted">
                  {" "}
                  / {dlLimit === null ? "∞" : dlLimit ?? 0}
                </span>
              </p>
            </div>
            <div>
              <p className="text-muted">Tier</p>
              <p className="mt-1 font-bold text-ink capitalize">{auth.tier}</p>
            </div>
          </div>
          {auth.overview?.resetAt &&
            !isNaN(new Date(auth.overview.resetAt).getTime()) && (
              <p className="mt-2 text-xs text-muted">
                Resets in {minutesUntil(auth.overview.resetAt)} min · at{" "}
                {new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(
                  new Date(auth.overview.resetAt),
                )}
                .
              </p>
            )}
        </section>

        <section aria-labelledby="set-theme">
          <h3 id="set-theme" className="text-sm font-semibold">
            Appearance
          </h3>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {[
              { value: false, label: "Light", Icon: Sun },
              { value: true, label: "Dark", Icon: Moon },
            ].map(({ value, label, Icon }) => (
              <label key={label} className="cursor-pointer">
                {/* Native radios: the platform supplies arrow-key navigation
                    and the checked state, so the group needs no ARIA patch. */}
                <input
                  type="radio"
                  name="theme"
                  value={value ? "dark" : "light"}
                  checked={dark === value}
                  onChange={() => onToggleDark(value)}
                  className="peer sr-only"
                />
                <span className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-paper text-sm font-semibold text-muted transition [transition-property:background-color,border-color,color] hover:border-line-strong hover:text-ink peer-checked:border-accent peer-checked:bg-primary/10 peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent motion-reduce:transition-none">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="set-history">
          <h3 id="set-history" className="text-sm font-semibold">
            Chat history
          </h3>
          <p className="mt-1 text-sm text-muted">
            {historyCount === 0
              ? "No saved chats yet."
              : `${historyCount} chat${historyCount === 1 ? "" : "s"} saved on this device.`}{" "}
            Clearing is permanent.
          </p>
          {confirming ? (
            <div className="mt-3">
              <p role="alert" className="text-sm font-semibold text-err">
                Delete all {historyCount} saved chat{historyCount === 1 ? "" : "s"}? This
                cannot be undone.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    setConfirming(false);
                  }}
                  className="inline-flex h-11 items-center rounded-full border border-err/40 bg-err-bg px-3.5 text-sm font-medium text-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9"
                >
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="inline-flex h-11 items-center rounded-full border border-line bg-paper px-3.5 text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9"
                >
                  Keep them
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (historyCount === 0) return;
                setConfirming(true);
              }}
              disabled={historyCount === 0}
              className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 text-sm font-medium text-err transition-[border-color] hover:border-err/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Clear chat history
            </button>
          )}
        </section>

        <p className="text-center text-xs text-muted">Synopsi 0.1.0 — Smart Academic Notes Assistant</p>
      </div>
    </DialogShell>
  );
}
