"use client";

import { Plus, CircleHelp, Settings } from "lucide-react";

import { Logomark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

const RAIL_BTN =
  "grid size-11 shrink-0 place-items-center rounded-full text-muted transition [transition-property:color,background-color] hover:text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none";

/**
 * Slim left icon rail (the reference's "App Sidebar"). Desktop-only:
 * every control here also has a reachable twin on mobile (menu drawer /
 * top bar), so nothing hides behind breakpoint.
 */
export default function IconRail({
  onNewChat,
  onOpenHelp,
  onOpenSettings,
  onOpenAccount,
  helpOpen,
  settingsOpen,
}: {
  onNewChat: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  helpOpen: boolean;
  settingsOpen: boolean;
}) {
  return (
    <aside
      aria-label="App sidebar"
      className="hidden w-[72px] shrink-0 flex-col items-center gap-6 border-r border-line bg-panel py-5 md:flex"
    >
      {/* brand mark */}
      <Logomark className="size-9" />

      <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onNewChat}
          aria-label="New chat"
          className={RAIL_BTN}
        >
          <Plus className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          aria-pressed={helpOpen}
          aria-label="How it works"
          className={cn(RAIL_BTN, helpOpen && "text-accent")}
        >
          <CircleHelp className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </nav>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-pressed={settingsOpen}
          aria-label="Settings"
          className={cn(RAIL_BTN, settingsOpen && "text-accent")}
        >
          <Settings className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        {/* Guest avatar: placeholder for the future auth system. Opens the
            account dialog; no backend behind it in this build. */}
        <button
          type="button"
          onClick={onOpenAccount}
          aria-label="Account — sign in"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-accent transition-[box-shadow,transform] hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
        >
          G
        </button>
      </div>
    </aside>
  );
}
