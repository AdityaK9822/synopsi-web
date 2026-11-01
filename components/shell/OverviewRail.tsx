"use client";

import { BookOpen, Info, Lightbulb, ListChecks, PanelRightClose, SearchCheck } from "lucide-react";
import type { StudyPack } from "@/lib/types";

/* Round square icon button for the slim header's collapse control. */
const HEADER_BTN =
  "grid size-8 shrink-0 place-items-center rounded-full text-muted transition [transition-property:color,background-color] hover:text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none";

/**
 * The design's right rail: an at-a-glance inventory of the OPEN chat's
 * latest finished pack — what produced it and how it was run. The page
 * only mounts it once such a pack exists, so there is no empty branch.
 */
export default function OverviewRail({
  result,
  researchUsed,
  quizMode,
  onCollapse,
}: {
  /** The open chat's latest finished pack. */
  result: {
    pack: StudyPack;
    parsed: boolean;
    model: string;
    savedPath: string | null;
    sourceName: string;
    sources?: string[];
    inputChars?: number;
    inputHash?: string;
    trimmed: boolean;
  };
  researchUsed: boolean;
  quizMode: boolean;
  /** Show the collapse control in the header — the rail is replaced by a
      floating Overview pill in the chat when it collapses. */
  onCollapse?: () => void;
}) {
  const pack = result.pack;

  return (
    // Plain panel body: the page wraps it in the resizable aside that owns
    // the landmark, border, background and width (collapsible + resizable).
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain">
      {/* Slim header: a quiet strip pinned under the shared top bar, not a
          second bar of the same height. Sticky so it holds while the
          inventory scrolls. */}
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-paper px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Info className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold tracking-tight">Overview</h2>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse pack overview panel"
            className={HEADER_BTN}
          >
            <PanelRightClose
              className="size-4"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3.5 px-3.5 pb-5 pt-4">
        {/* how this pack was run */}
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex h-6 items-center rounded-full border border-line bg-panel px-2.5 text-[11px] font-semibold text-muted">
            Study pack
          </span>
          {quizMode && (
            <span className="inline-flex h-6 items-center rounded-full border border-line bg-primary/10 px-2.5 text-[11px] font-semibold text-ink">
              Quiz mode
            </span>
          )}
          {researchUsed && (
            <span className="inline-flex h-6 items-center rounded-full border border-line bg-primary/10 px-2.5 text-[11px] font-semibold text-ink">
              Research
            </span>
          )}
        </div>

        {/* contents (hidden when nothing parsed) */}
        {pack.summary.length + pack.keyConcepts.length + pack.questions.length + pack.factChecks.length >
          0 && (
          <ul aria-label="Pack contents" className="flex flex-col gap-2">
            {[
              { icon: BookOpen, label: "summary points", count: pack.summary.length },
              { icon: Lightbulb, label: "key concepts", count: pack.keyConcepts.length },
              { icon: ListChecks, label: "questions", count: pack.questions.length },
              { icon: SearchCheck, label: "fact-checks", count: pack.factChecks.length },
            ]
              .filter((row) => row.count > 0)
              .map((row) => (
                <li
                  key={row.label}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card p-2.5 text-sm font-medium text-ink"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel text-accent">
                    <row.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    {row.count}&nbsp;
                    <span className="text-muted">{row.label}</span>
                  </span>
                </li>
              ))}
          </ul>
        )}

        {/* provenance details */}
        <dl
          aria-label="Pack details"
          className="rounded-xl border border-line bg-card px-3 py-2 text-sm"
        >
          <div className="flex items-baseline justify-between gap-3 py-1">
            <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
              Model
            </dt>
            <dd className="min-w-0 truncate font-mono text-xs text-ink">{result.model}</dd>
          </div>
          {result.inputChars !== undefined && (
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                Input
              </dt>
              <dd className="min-w-0 font-mono text-xs text-ink tabular-nums">
                {new Intl.NumberFormat("en-US").format(result.inputChars)} chars
              </dd>
            </div>
          )}
          {result.inputHash && (
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                Hash
              </dt>
              <dd className="min-w-0 truncate font-mono text-xs text-ink">{result.inputHash}</dd>
            </div>
          )}
          {result.savedPath && (
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                Saved
              </dt>
              <dd className="min-w-0 truncate font-mono text-xs text-ink" title={result.savedPath}>
                {result.savedPath}
              </dd>
            </div>
          )}
          {(result.sources?.length ?? 0) > 0 && (
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                Files
              </dt>
              <dd className="min-w-0 truncate font-mono text-xs text-ink">
                {result.sources!.length}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
