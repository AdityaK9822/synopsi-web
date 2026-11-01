"use client";

import { useState } from "react";
import { Sun, Moon, Trash2 } from "lucide-react";

import DialogShell from "@/components/shell/DialogShell";
import { cn } from "@/lib/utils";

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

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Settings"
      subtitle="Everything in the app: appearance and your local chat history."
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="set-theme">
          <h3 id="set-theme" className="text-sm font-semibold">
            Appearance
          </h3>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="mt-2.5 grid grid-cols-2 gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!dark}
              onClick={() => onToggleDark(false)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition [transition-property:background-color,border-color,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.98] motion-reduce:transition-none",
                !dark
                  ? "border-accent bg-primary/10 text-ink"
                  : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <Sun className="size-4" aria-hidden="true" />
              Light
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={dark}
              onClick={() => onToggleDark(true)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition [transition-property:background-color,border-color,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.98] motion-reduce:transition-none",
                dark
                  ? "border-accent bg-primary/10 text-ink"
                  : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <Moon className="size-4" aria-hidden="true" />
              Dark
            </button>
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
            <p aria-live="polite" className="mt-3 text-sm font-semibold text-err">
              Delete all {historyCount} saved chat{historyCount === 1 ? "" : "s"}?
              <span className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    setConfirming(false);
                  }}
                  className="inline-flex h-9 items-center rounded-full border border-err/40 bg-err-bg px-3.5 text-sm font-medium text-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
                >
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="inline-flex h-9 items-center rounded-full border border-line bg-paper px-3.5 text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
                >
                  Keep them
                </button>
              </span>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (historyCount === 0) return;
                setConfirming(true);
              }}
              disabled={historyCount === 0}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 text-sm font-medium text-err transition-[border-color] hover:border-err/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Clear chat history
            </button>
          )}
        </section>

        <p className="text-center text-xs text-faint">Synopsi 0.1.0 — Smart Academic Notes Assistant</p>
      </div>
    </DialogShell>
  );
}
