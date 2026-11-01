"use client";

import {
  CircleHelp,
  Clock,
  ChevronRight,
  Moon,
  Menu,
  Settings,
  Sun,
} from "lucide-react";

import { relativeTime } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

/* The shared button innards WITHOUT display or size utilities, so callers
   can compose their own breakpoint display rules — two unconditional display
   utilities on one element is an ambiguous cascade (bare `grid` vs `hidden`). */
const TOP_BTN_BASE =
  "shrink-0 place-items-center rounded-full text-muted transition [transition-property:color,background-color] hover:text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none";

const TOP_BTN = `grid size-10 ${TOP_BTN_BASE}`;

/**
 * Thread top bar: it spans the full width to the RIGHT of the history
 * sidebar, running over the chat and the overview rail alike — both sit
 * on the row beneath it, so the bar is bounded once (left edges) and
 * never cut again. Identity (real user via the auth provider), the
 * breadcrumb of the active chat, then the lightweight utilities on the
 * right. Panel controls live IN the panels (they dock themselves); help
 * and settings appear here only where the icon rail is hidden (<md).
 */
export default function TopBar({
  title,
  createdAt,
  dark,
  onToggleDark,
  onOpenMenu,
  onOpenAccount,
  onOpenHelp,
  onOpenSettings,
}: {
  /** Active chat title, or null for a fresh session. */
  title: string | null;
  createdAt: number | null;
  dark: boolean;
  onToggleDark: () => void;
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
}) {
  const { user, isGuest, overview, signInWithGoogle } = useAuth();
  const displayName =
    (!isGuest && (overview?.user?.name || user?.displayName || user?.email)) ||
    (isGuest ? "Guest user" : "Account");
  const initial = displayName.charAt(0).toUpperCase() || "G";
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-paper/90 px-3 backdrop-blur sm:px-4">
      {/* menu (mobile/narrow: the drawer trigger) */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open chat history"
        className={`${TOP_BTN} lg:hidden`}
      >
        <Menu className="size-5" strokeWidth={2} aria-hidden="true" />
      </button>

      {/* identity — opens the account dialog (no auth backend in this build) */}
      <button
        type="button"
        onClick={onOpenAccount}
        className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-[background-color] hover:bg-line/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.98] motion-reduce:transition-none"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white"
        >
          {initial}
        </span>
        <span className="hidden text-sm font-bold tracking-tight text-ink sm:block">
          {displayName}
        </span>
      </button>

      {/* breadcrumb: Notes ▸ active chat */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
        <span className="shrink-0 text-sm font-bold text-muted">Notes</span>
        <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden="true" />
        <span
          className="min-w-0 truncate text-sm font-bold tracking-tight text-accent"
          title={title ?? "New chat"}
        >
          {title ?? "New chat"}
        </span>
      </nav>

      <div className="flex flex-1 md:hidden" aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {createdAt !== null && (
          <p className="mr-1 hidden items-center gap-1.5 text-xs font-medium text-ink lg:flex">
            <Clock className="size-3.5 text-faint" aria-hidden="true" />
            <span>{relativeTime(createdAt)}</span>
          </p>
        )}
        {/* help twin for narrow viewports (the icon rail is hidden <md) */}
        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="How it works"
          className={`${TOP_BTN} md:hidden`}
        >
          <CircleHelp className="size-5" strokeWidth={2} aria-hidden="true" />
        </button>
        {/* settings twin for narrow viewports (rail is hidden there) */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className={`${TOP_BTN} md:hidden`}
        >
          <Settings className="size-5" strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleDark}
          aria-pressed={dark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className={TOP_BTN}
        >
          {dark ? (
            <Sun className="size-5" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Moon className="size-5" strokeWidth={2} aria-hidden="true" />
          )}
        </button>
        {isGuest ? (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="ml-1 hidden h-9 items-center rounded-full bg-primary px-4 text-sm font-bold text-white transition-[background-color] hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none md:inline-flex"
          >
            Sign in
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAccount}
            className="ml-1 hidden h-9 items-center rounded-full border border-line bg-card px-4 text-sm font-bold text-ink transition-[border-color,background-color] hover:border-line-strong hover:bg-line/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none md:inline-flex"
          >
            Account
          </button>
        )}
      </div>
    </header>
  );
}
