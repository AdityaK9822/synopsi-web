"use client";

import { useEffect, useState } from "react";
import { Search, Lightbulb, Trash2 } from "lucide-react";

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
  onDelete,
  searchId = "synopsi-search",
}: {
  sessions: SessionSnapshot[];
  activeId: string | null;
  generatingIds?: string[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** DOM id for the search input — drawer twin passes `"synopsi-search-drawer"`.
   *  Both panels are mounted at once, so the id must be unique. */
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
      {/* header: brand wordmark. A display setting, not body rhythm: the
          size step's default leading (1.33 at text-2xl) is for text that
          wraps, and on a single-line wordmark it adds dead space below the
          "y" descender. 1.15 is unitless display leading (1.1–1.2), so the
          wordmark's own box — not an empty line box — sets the header
          height. tracking-tight is the project's display tracking scale. */}
      <div className="flex h-14 items-center border-b border-line px-4">
        <span className="truncate text-2xl leading-[1.15] font-bold tracking-tight">
          Synopsi
        </span>
      </div>

      {/* search */}
      <div className="px-4 pt-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search your chats
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything..."
            className="h-11 w-full rounded-full border border-line-strong bg-card pl-4 pr-10 text-sm text-ink placeholder:text-muted focus:outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-accent"
          />
          <Search
            className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* history list */}
      <ul
        aria-label="Chat history"
        className="mt-3 flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 pb-4"
      >
        {sessions.length === 0 ? (
          <li className="py-10 text-center">
            <p className="text-sm font-semibold text-ink">No saved chats</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Packs you generate are saved here automatically.
            </p>
          </li>
        ) : visible.length === 0 ? (
          <li className="py-10 text-center">
            <p className="text-sm font-semibold text-ink">
              No results for “{query.trim()}”
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-3 rounded-full px-3 py-1.5 text-xs font-bold text-accent transition-[background-color] hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              Clear search
            </button>
          </li>
        ) : (
          visible.map((s) => {
            const generating = generatingIds?.includes(s.id) ?? false;
            const active = s.id === activeId;
            return (
              <li key={s.id} className="relative">
                {/* Open-chat marker: the rail's PRESENCE (plus the card
                    surface and weight) says "this is the open chat", so the
                    state never leans on hue alone. Inset so it rides the
                    card's rounded edge. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-y-2.5 left-0 w-[3px] rounded-full transition-colors motion-reduce:transition-none",
                    active ? "bg-accent" : "bg-transparent",
                  )}
                />
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(s.id)}
                  title={s.title}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-2xl py-2.5 pl-4 pr-11 text-left transition [transition-property:background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
                    active
                      ? "bg-card shadow-[0_1px_3px_rgb(15_23_42/0.08)]"
                      : "hover:bg-line/50",
                  )}
                >
                  {/* Two lines instead of one: most generated titles fit
                      whole, and the title attribute + the opened chat's
                      breadcrumb carry any that still clip. */}
                  <span
                    className={cn(
                      "line-clamp-2 text-sm tracking-tight text-ink",
                      active ? "font-bold" : "font-semibold",
                    )}
                  >
                    {s.title}
                  </span>
                  {generating ? (
                    // Background generation: the sidebar is the only place
                    // this is visible, so the row names the state in words.
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-accent">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
                      />
                      <span className="truncate">Generating…</span>
                    </span>
                  ) : (
                    <span className="truncate text-xs font-medium text-muted">
                      {sessionMeta(s)}
                    </span>
                  )}
                </button>
                {/* Destructive control: always visible (touch has no hover
                    to reveal it), 36px hit area, and the danger surface is
                    reserved for this action alone. Confirming the delete is
                    the page's job — this only arms it. */}
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  aria-label={`Delete chat ${s.title}`}
                  className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-xl text-muted transition [transition-property:color,background-color] hover:bg-err-bg hover:text-err focus-visible:bg-err-bg focus-visible:text-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
                >
                  <Trash2 className="size-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            );
          })
        )}
      </ul>

      {/* supporting card: how to feed it (the design's featured-card slot) */}
      {!tipsDismissed && sessions.length === 0 && (
        <div className="ui-enter p-4">
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
