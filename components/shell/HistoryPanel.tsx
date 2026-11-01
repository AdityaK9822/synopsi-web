"use client";

import { useEffect, useState } from "react";
import { Search, SquarePen, X, Lightbulb } from "lucide-react";

import { relativeTime } from "@/lib/utils";
import type { SessionSnapshot } from "@/lib/history";
import { cn } from "@/lib/utils";

const TIPS_KEY = "synopsi-tips-dismissed";

/** Subtitle derivation for the history row: which modes the thread used. */
function sessionMeta(s: SessionSnapshot): string {
  const mode = s.messages.some((m) => m.kind === "done" && m.researchUsed)
    ? "Research"
    : s.messages.some((m) => m.kind === "done" && m.quizMode)
      ? "Quiz"
      : null;
  return `${relativeTime(s.updatedAt)}${mode ? ` · ${mode}` : ""}`;
}

/** Search across title, attachment names and each pack's source name. */
function matches(s: SessionSnapshot, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (s.title.toLowerCase().includes(needle)) return true;
  return s.messages.some((m) => {
    if (m.kind === "done") return m.result.sourceName.toLowerCase().includes(needle);
    if (m.kind === "user") return m.files.some((f) => f.name.toLowerCase().includes(needle));
    return m.message.toLowerCase().includes(needle);
  });
}

export default function HistoryPanel({
  sessions,
  activeId,
  generatingIds,
  onSelect,
  onNew,
  onDelete,
  autoFocusSearch,
  searchId = "synopsi-search",
  onCollapse,
}: {
  sessions: SessionSnapshot[];
  activeId: string | null;
  generatingIds?: string[];
  onSelect: (id: string) => void;
  onNew?: () => void;
  onDelete: (id: string) => void;
  /** The drawer twin sets this when it opens, for keyboard entry. */
  autoFocusSearch?: boolean;
  /** Desktop-only collapse control (returns null otherwise). */
  onCollapse?: () => void;
  /** DOM id for the search input — drawer twin passes `"synopsi-search-drawer"`. */
  searchId?: string;
}) {
  const [query, setQuery] = useState("");
  const [tipsDismissed, setTipsDismissed] = useState(false);

  useEffect(() => {
    // Deferred a frame: the one-time localStorage read should not setState
    // synchronously inside the effect body.
    const raf = requestAnimationFrame(() => {
      try {
        setTipsDismissed(localStorage.getItem(TIPS_KEY) === "1");
      } catch {
        /* private mode: the tip simply always shows */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const visible = sessions.filter((s) => matches(s, query));

  return (
    <div className="flex h-full w-full flex-col bg-panel">
      {/* header: brand + new chat (the design's edit affordance) */}
      <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
        <span className="truncate text-xl font-bold tracking-tight">Synopsi</span>
        <button
          type="button"
          onClick={onNew}
          aria-label="New chat"
          className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-line-strong bg-card text-muted transition [transition-property:color,border-color] hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
        >
          <SquarePen className="size-4.5" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {/* search */}
      <div className="px-5 pt-1">
        <div className="relative">
          <label htmlFor="synopsi-search" className="sr-only">
            Search your chats
          </label>
          <input
            id="synopsi-search"
            type="search"
            value={query}
            autoFocus={autoFocusSearch || undefined}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything..."
            className="h-10 w-full rounded-full border border-line-strong bg-card pl-4 pr-10 text-sm text-ink placeholder:text-faint focus:outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-accent"
          />
          <Search
            className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* history list */}
      <ul
        aria-label="Chat history"
        className="mt-4 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-4"
      >
        {sessions.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-faint">
            No chats yet — packs you generate are saved here automatically.
          </li>
        ) : visible.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-faint">
            No chats match “{query.trim()}”.
          </li>
        ) : (
          visible.map((s) => (
            <li key={s.id} className="group relative">
              <button
                type="button"
                aria-current={s.id === activeId ? "page" : undefined}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-xl border-l-2 py-2 pl-4 pr-8 text-left transition [transition-property:background-color,border-color,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:hover:bg-line/40 motion-reduce:transition-none",
                  s.id === activeId
                    ? "border-l-accent bg-line/30"
                    : "border-l-faint hover:border-l-line-strong",
                )}
              >
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    s.id === activeId ? "text-ink" : "text-muted group-hover:text-ink",
                  )}
                >
                  {s.title}
                </span>
                <span className="truncate text-xs text-faint">{sessionMeta(s)}</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(s.id)}
                aria-label={`Delete chat ${s.title}`}
                className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg text-faint opacity-100 transition-[opacity,color] focus-visible:text-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:focus-visible:opacity-100 hover:text-err enabled:motion-safe:active:scale-[0.94] motion-reduce:transition-none"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>

      {/* supporting card: how to feed it (the design's featured-card slot) */}
      {!tipsDismissed && sessions.length === 0 && (
        <div className="ui-enter p-5">
          <div className="rounded-3xl border border-line bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-line/50 text-accent">
                <Lightbulb className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm leading-relaxed text-muted">
                Paste messy notes or attach{" "}
                <span className="font-mono text-xs text-ink">.pdf .txt .md</span> files — get a
                summary, key concepts and revision questions.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setTipsDismissed(true);
                  try {
                    localStorage.setItem(TIPS_KEY, "1");
                  } catch {
                    /* dismiss simply won't persist */
                  }
                }}
                className="text-sm font-bold text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
