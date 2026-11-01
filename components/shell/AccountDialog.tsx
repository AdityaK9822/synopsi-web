"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";

import DialogShell from "@/components/shell/DialogShell";

const FIELD =
  "w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-accent";
const LABEL = "block text-sm font-semibold text-ink";

/**
 * Account / sign-in surface. ELEMENTS ONLY: there is no auth backend in
 * this build — the form renders, validates and honestly reports that it
 * is not wired anywhere. No credentials are sent, stored or logged.
 */
export default function AccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // explicitly no auth backend: nothing leaves the page
    setSent(true);
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Account"
      subtitle="Sign in to keep your chats on every device. Sign-up is coming in a later build."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="acct-email" className={LABEL}>
            Email
          </label>
          <input
            id="acct-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@university.edu"
            required
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="acct-passwd" className={LABEL}>
            Password
          </label>
          <input
            id="acct-passwd"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            minLength={8}
            className={FIELD}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="size-4 rounded border-line-strong accent-primary"
          />
          Keep me signed in
        </label>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white transition-[background-color] hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.98] motion-reduce:transition-none"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Sign in
        </button>
        <p className="text-center text-sm text-muted">
          <button
            type="button"
            className="font-semibold text-accent underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Create an account
          </button>
        </p>
        <p role="status" aria-live="polite" className="text-center text-xs text-muted">
          {sent
            ? "Not sent — authentication is not wired to a backend in this build. Your credentials stayed on this page."
            : "This build runs entirely in your browser — no sign-in backend exists yet."}
        </p>
      </form>
    </DialogShell>
  );
}
