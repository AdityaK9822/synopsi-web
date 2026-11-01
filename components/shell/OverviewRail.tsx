"use client";

import { BookOpen, Info, Lightbulb, ListChecks, SearchCheck } from "lucide-react";
import type { StudyPack } from "@/lib/types";

/**
 * The design's right rail, filled with real data: an at-a-glance
 * inventory of the active pack, what produced it, and how it was run.
 * No invented actions (no videos/tickets — those aren't this app).
 */
export default function OverviewRail({
  result,
  researchUsed,
  quizMode,
}: {
  /** The latest finished pack, or null on a fresh session. */
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
  } | null;
  researchUsed: boolean;
  quizMode: boolean;
}) {
  const pack = result?.pack;

  return (
    <aside
      aria-label="Pack overview"
      className="hidden w-[288px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-line bg-paper xl:flex"
    >
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Info className="size-5 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold tracking-tight">Overview</h2>
      </div>

      {result && pack ? (
        <div className="flex flex-col gap-4 px-4 pb-6 pt-5">
          {/* modes this pack was run with */}
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
                  className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 text-sm font-medium text-ink"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent">
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
            className="rounded-2xl border border-line bg-card p-4 text-sm"
          >
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">
                Model
              </dt>
              <dd className="min-w-0 truncate font-mono text-xs text-ink">{result.model}</dd>
            </div>
            {result.inputChars !== undefined && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">
                  Input
                </dt>
                <dd className="min-w-0 font-mono text-xs text-ink">
                  {new Intl.NumberFormat("en-US").format(result.inputChars)} chars
                </dd>
              </div>
            )}
            {result.inputHash && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">
                  Hash
                </dt>
                <dd className="min-w-0 truncate font-mono text-xs text-ink">{result.inputHash}</dd>
              </div>
            )}
            {result.savedPath && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">
                  Saved
                </dt>
                <dd className="min-w-0 truncate font-mono text-xs text-ink" title={result.savedPath}>
                  {result.savedPath}
                </dd>
              </div>
            )}
            {(result.sources?.length ?? 0) > 0 && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">
                  Files
                </dt>
                <dd className="min-w-0 truncate font-mono text-xs text-ink">
                  {result.sources!.length}
                </dd>
              </div>
            )}
          </dl>

          <p className="px-1 text-xs leading-relaxed text-faint">
            Export controls live at the end of the pack — right where the output finishes.
          </p>
        </div>
      ) : (
        <p className="px-5 pb-6 pt-5 text-sm leading-relaxed text-muted">
          Run a generation and its stats land here — the modes used, section
          counts, and exactly where the pack was saved.
        </p>
      )}
    </aside>
  );
}
