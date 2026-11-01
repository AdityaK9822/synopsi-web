"use client";

import { useState } from "react";
import { FileText, Library } from "lucide-react";

import type { StudyPack } from "@/lib/types";

/**
 * The design's "Sources" block, adapted to what this app actually has:
 * the uploads the pack was built (and fact-checked) from. Rendered ONLY
 * for turns generated with Research on — no fake web citations.
 */
export default function SourcesRow({
  sources,
  pack,
}: {
  sources: string[];
  pack: StudyPack;
}) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? sources : sources.slice(0, 3);
  const hidden = sources.length - visible.length;

  return (
    <section aria-label="Sources used for this pack">
      <div className="flex items-center gap-2">
        <Library className="size-5 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold tracking-tight">Sources</h2>
        <span className="text-sm text-muted">
          {sources.length} file{sources.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {visible.map((name, i) => {
          const dot = name.lastIndexOf(".");
          const ext = dot > 0 ? name.slice(dot) : "";
          return (
            // Entrance stagger: group entrance with 40ms steps, occasional.
            <li
              key={`${name}:${i}`}
              className="ui-enter min-w-0 rounded-2xl border border-line bg-background p-3 [transition-delay:40ms]"
            >
              <p
                className="line-clamp-2 text-xs font-medium leading-relaxed text-ink"
                title={name}
              >
                {name}
              </p>
              <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <FileText className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
                {ext && (
                  <span className="rounded-md bg-line/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {ext.replace(".", "")}
                  </span>
                )}
                <span className="truncate">input source</span>
              </p>
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="min-w-0">
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
              className="ui-enter flex h-full w-full min-h-[72px] flex-col justify-between gap-2.5 rounded-2xl border border-dashed border-line-strong bg-background p-3 text-left transition [transition-property:border-color,color] hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.98] motion-reduce:transition-none"
            >
              <p className="line-clamp-2 text-xs font-semibold leading-relaxed">
                View {hidden}+ more source{hidden === 1 ? "" : "s"}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] font-medium">
                <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                {showAll ? "Show all sources" : "Show every source"}
              </p>
            </button>
          </li>
        )}
      </ul>

      {showAll && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-2 text-xs font-bold text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Show fewer
        </button>
      )}
      <p className="mt-2.5 text-xs text-muted">
        {pack.factChecks.length > 0 ? (
          <>
            Every claim below, and the fact-checks, are grounded in these exact
            files.
          </>
        ) : (
          <>The summary and questions below were generated from these exact files.</>
        )}
      </p>
    </section>
  );
}
