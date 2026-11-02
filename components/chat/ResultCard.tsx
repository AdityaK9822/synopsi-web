"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  BookOpen,
  Check,
  Copy,
  FileDown,
  FileText,
  FileCode,
  Lightbulb,
  ListChecks,
  Lock,
  SearchCheck,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import QuestionCard, { type AnswerState } from "@/components/QuestionCard";
import SourcesRow from "@/components/thread/SourcesRow";
import { MathText } from "@/components/math/MathText";
import {
  buildPackPlainText,
  buildQuizMarkdown,
  buildStudyPackMarkdown,
  slugify,
} from "@/lib/parser";
import type { FactCheck, StudyPack } from "@/lib/types";
import { cn, downloadFile } from "@/lib/utils";

/* ------------------------------------------------------------------ types */

interface ResultCardProps {
  result: {
    raw: string;
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
  /** Mode state for THIS turn (carried on the message, not the page). */
  quizMode?: boolean;
  /** Research turns carry the Sources block; others do not. */
  researchUsed?: boolean;
}

type View = "pack" | "md" | "pdf";
type CopyState = "idle" | "done" | "failed";

/* --------------------------------------------------------------- styles */

/* Design-style section header: plain-word label + accent glyph, no
   small-caps overline. Margins around every block follow ONE rhythm
   (mt-3 under headers, space-y-8 between sections) so nothing sits
   flush against a border. */
const SECTION_H = "flex items-center gap-2 text-base font-semibold tracking-tight";

const ACTION_CHIP =
  "inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-medium text-ink transition [transition-property:background-color,border-color,color] hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9";

/** A compact info banner (input trimmed / structure fallback). */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-line bg-info-bg px-3.5 py-2.5 text-sm text-info">
      {children}
    </p>
  );
}

/** Verdict chip styling: text always names the verdict; colour only supports. */
function verdictClass(verdict: string): string {
  if (/contradict|not supported|wrong/i.test(verdict)) return "border-err/40 bg-err-bg text-err";
  if (/partly/i.test(verdict)) return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (/supported/i.test(verdict)) return "border-ok/40 bg-ok-bg text-ok";
  return "border-line bg-line/40 text-ink"; // Unclear & anything unparsed stays neutral
}

/** "summary points" / "summary points and revision questions" — feeds the
    one empty-sections line (a run of per-section "no X parsed" notes reads
    like the same mistake three times). */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* ------------------------------------------------------------ component */

export default function ResultCard({
  result,
  quizMode = false,
  researchUsed = false,
}: ResultCardProps) {
  const { isGuest: guest } = useAuth();
  const { pack, sourceName, model, raw } = result;
  /** Sections the parser produced nothing for — named ONCE at the top of
      the pack view, each with its own recovery path into the Markdown
      tab instead of one per empty section. */
  const missing: string[] = [];
  if (pack.summary.length === 0) missing.push("summary points");
  if (pack.keyConcepts.length === 0) missing.push("key concepts");
  if (pack.questions.length === 0) missing.push("revision questions");
  const [view, setView] = useState<View>("pack");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [mdCopyState, setMdCopyState] = useState<CopyState>("idle");
  const copyTimer = useRef<number | null>(null);

  // Plain-text body for the general Copy button: the Study Pack content
  // without markdown tags (built from the parsed sections; raw fallback).
  const copyPlainContent = result.parsed ? buildPackPlainText(pack, sourceName) : raw;

  // Canonical markdown of the pack — the .md twin of the generated PDF
  // (lib/pdf.ts renders the same parsed sections in the same order).
  // The Markdown tab, Download .md and the snippet copy button all serve
  // THIS; the raw model output only remains as a parsing fallback.
  const packMarkdown = result.parsed
    ? buildStudyPackMarkdown(pack, sourceName)
    : raw;

  /* Interactive quiz answers keyed by question number (survives re-renders;
     the picked letter and its correctness both live here). */
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const quizInteractive =
    quizMode &&
    pack.questions.some((q) => (q.options?.length ?? 0) > 1 && q.correctIndex !== undefined);
  const answeredCount = Object.keys(answers).length;
  const score = Object.values(answers).filter((a) => a?.correct).length;
  function recordAnswer(qNum: number, picked: number, correct: boolean) {
    setAnswers((prev) =>
      prev[qNum] ? prev : { ...prev, [qNum]: { picked, correct } },
    );
  }
  // A ResultCard instance is created fresh for each done message (the pending
  // row above it is a different subtree), so a new result always starts with
  // an empty quiz sheet — no reset effect needed.
  const [pdf, setPdf] = useState<{
    url: string | null;
    error: string | null;
    busy: boolean;
  }>({ url: null, error: null, busy: false });
  const pdfBusyRef = useRef(false);

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /** The general Copy button: the STUDY PACK content in normal plain-text
   *  format — no ##, ** or | separators — exactly what the Study Pack tab
   *  renders; falls back to the raw output when parsing failed. */
  async function copyPlain() {
    try {
      await navigator.clipboard.writeText(copyPlainContent);
      setCopyState("done");
    } catch {
      setCopyState("failed");
    }
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState("idle"), 2200);
  }

  /** The .md snippet has its own copy control: THIS one copies the raw
   *  markdown source (with every .md tag). */
  async function copyMdSource() {
    try {
      await navigator.clipboard.writeText(packMarkdown);
      setMdCopyState("done");
    } catch {
      setMdCopyState("failed");
    }
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setMdCopyState("idle"), 2200);
  }

  /** Build the PDF once per result; caches the blob URL. */
  async function ensurePdf(): Promise<string | null> {
    if (pdf.url || pdfBusyRef.current || pdf.error) return pdf.url;
    pdfBusyRef.current = true;
    setPdf((s) => ({ ...s, busy: true, error: null }));
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName, model, pack }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setPdf((s) => ({
          ...s,
          busy: false,
          error:
            data?.error ?? "Could not build the PDF. Download the markdown instead.",
        }));
        return null;
      }
      const url = URL.createObjectURL(await res.blob());
      setPdf((s) => ({ ...s, busy: false, url }));
      return url;
    } catch {
      setPdf((s) => ({
        ...s,
        busy: false,
        error: "Could not reach the server to build the PDF — check your connection and try again.",
      }));
      return null;
    } finally {
      pdfBusyRef.current = false;
    }
  }

  useEffect(() => {
    if (view !== "pdf") return;
    // Deferred a tick so no setState runs synchronously in the effect body.
    const t = window.setTimeout(() => void ensurePdf(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Blob URLs are documents: revoke the one being replaced (or unmounted)
  // so repeated result cards do not leak memory.
  useEffect(() => {
    const url = pdf.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdf.url]);

  async function downloadPdf() {
    const url = await ensurePdf();
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(sourceName)}-study-pack.pdf`;
      a.click();
    } else {
      setView("pdf"); // surface the inline error next to the retry control
    }
  }

  const pdfName = `${slugify(sourceName)}-study-pack.pdf`;

  const VIEWS: { id: View; label: string }[] = [
    { id: "pack", label: "Study pack" },
    { id: "md", label: "Markdown" },
    { id: "pdf", label: "PDF" },
  ];

  return (
    <article
      className="ui-enter rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6"
      aria-label={`Study pack for ${sourceName}`}
    >
      {/* meta row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <FileText className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="font-medium">{sourceName}</span>
        <span aria-hidden="true" className="text-faint">
          ·
        </span>
        <span className="font-mono text-xs text-muted">{model}</span>
        {result.savedPath && (
          <span className="font-mono text-xs text-muted">→ {result.savedPath}</span>
        )}
      </div>

      {/* Provenance: exactly which inputs produced this pack, how many
          characters were sent and the hash of that text. Identical replies
          necessarily carry an identical hash. */}
      {(result.inputChars !== undefined || (result.sources?.length ?? 0) > 1) && (
        <p className="mt-1 font-mono text-xs text-muted">
          {(result.sources?.length ?? 0) > 1 && (
            <>From: {result.sources!.join(" · ")} · </>
          )}
          {result.inputChars !== undefined && (
            <>
              {new Intl.NumberFormat("en-US").format(result.inputChars)} chars
              {result.inputHash && <> · input {result.inputHash}</>}
            </>
          )}
        </p>
      )}

      {result.trimmed && (
        <Note>
          Your notes exceeded the ~30,000-character input limit, so only the
          beginning was sent — check that the pack covers the full lecture.
        </Note>
      )}

      {/* At-a-glance inventory of the pack — first thing the user reads
          after opening the Study pack, so they know what is inside. */}
      {result.parsed && (
        <ul
          aria-label="What the pack contains"
          className="mt-4 flex flex-wrap gap-1.5 text-xs"
        >
          {pack.summary.length > 0 && (
            <li className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-background px-2.5">
              <BookOpen className="size-3.5 text-accent" aria-hidden="true" />
              <span>
                {pack.summary.length} summary{" "}
                {pack.summary.length === 1 ? "point" : "points"}
              </span>
            </li>
          )}
          {pack.keyConcepts.length > 0 && (
            <li className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-background px-2.5">
              <Lightbulb className="size-3.5 text-accent" aria-hidden="true" />
              <span>
                {pack.keyConcepts.length} key{" "}
                {pack.keyConcepts.length === 1 ? "concept" : "concepts"}
              </span>
            </li>
          )}
          {pack.questions.length > 0 && (
            <li className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-background px-2.5">
              <ListChecks className="size-3.5 text-accent" aria-hidden="true" />
              <span>
                {pack.questions.length}{" "}
                {quizInteractive
                  ? "quiz questions"
                  : pack.questions.length === 1
                    ? "question"
                    : "revision questions"}
              </span>
            </li>
          )}
          {pack.factChecks.length > 0 && (
            <li className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-background px-2.5">
              <SearchCheck className="size-3.5 text-accent" aria-hidden="true" />
              <span>
                {pack.factChecks.length} fact-
                {pack.factChecks.length === 1 ? "check" : "checks"}
                {pack.sources.length > 0 &&
                  ` · ${pack.sources.length} ${
                    pack.sources.length === 1 ? "source" : "sources"
                  }`}
              </span>
            </li>
          )}
        </ul>
      )}

      {/* view switcher — native buttons with aria-pressed (no fake tablist);
          the PDF view is disabled for guests (0 download allowance) */}
      <div className="mt-4 inline-flex items-center gap-1 rounded-xl bg-line/50 p-1">
        {VIEWS.map((v) => {
          const pdfLocked = v.id === "pdf" && guest;
          return (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            disabled={pdfLocked}
            title={pdfLocked ? "PDF export unlocks when you sign in (5 free downloads a month)" : undefined}
            onClick={() => setView(v.id)}
            className={cn(
              "flex h-11 items-center rounded-lg px-3.5 text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9",
              view === v.id
                ? "bg-primary/15 text-ink"
                : "text-muted hover:text-ink",
              pdfLocked && "cursor-not-allowed opacity-60 hover:text-muted",
            )}
          >
            {pdfLocked && <Lock className="size-3.5 mr-1.5" aria-hidden="true" />}
            {v.label}
          </button>
          );
        })}
      </div>

      {/* View content is keyed per view so a tab switch is bridged with the
          repo's shared 300ms enter — never a hard teleport. */}
      <div key={view} className="ui-enter">
        {view === "pack" &&
        (result.parsed ? (
          <div className="mt-6 space-y-8">
            {/* Research turns open with the Sources block, mirroring the
                design's question → sources → answer order. Everyone else
                never sees fake citations. */}
            {researchUsed && (result.sources?.length ?? 0) > 0 && (
              <SourcesRow sources={result.sources!} pack={pack} />
            )}

            {missing.length > 0 && (
              <p className="max-w-prose text-sm leading-relaxed text-muted">
                No {joinList(missing)} came out of these notes — the complete
                model output stays available in the Markdown tab.
              </p>
            )}

            {pack.summary.length > 0 && (
              <section aria-label="Summary">
                <h2 className={SECTION_H}>
                  <BookOpen className="size-5 text-accent" aria-hidden="true" />
                  Summary
                </h2>
                <ul className="mt-3 max-w-prose list-disc space-y-1.5 pl-5 text-base leading-relaxed">
                  {pack.summary.map((point, i) => (
                    <li key={i}><MathText text={point} /></li>
                  ))}
                </ul>
              </section>
            )}

            {pack.keyConcepts.length > 0 && (
              <section aria-label="Key concepts">
                <h2 className={SECTION_H}>
                  <Lightbulb className="size-5 text-accent" aria-hidden="true" />
                  Key concepts
                </h2>
                {/* Aligned term | definition columns — same grid as the PDF
                    key-concepts page, easier to scan than stacked paragraphs. */}
                <dl className="mt-3 max-w-prose">
                  {pack.keyConcepts.map((c, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[7rem_1fr] items-baseline gap-x-4 border-b border-line py-3 sm:grid-cols-[10rem_1fr] first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <dt className="text-base font-semibold">
                        <MathText text={c.term} />
                      </dt>
                      <dd className="min-w-0 text-base leading-relaxed">
                        <span className="block"><MathText text={c.definition} /></span>
                        {c.why && (
                          <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                            Why it matters: {c.why}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {pack.questions.length > 0 && (
              <section aria-label="Revision questions">
                <h2 className={SECTION_H}>
                  <ListChecks className="size-5 text-accent" aria-hidden="true" />
                  {quizInteractive ? "Quiz" : "Revision questions"}
                </h2>
                <>
                  {quizInteractive && (
                    <p
                      aria-live="polite"
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-background px-3 py-1 text-xs font-medium text-muted tabular-nums"
                    >
                      <span>
                        {answeredCount} of {pack.questions.length} answered
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={cn(answeredCount > 0 && "text-ink")}>
                        Score {score}
                      </span>
                      {answeredCount === pack.questions.length && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-ink">
                            {score === pack.questions.length
                              ? "Perfect — all correct!"
                              : `${score}/${pack.questions.length} correct`}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  <ol className="mt-1 list-none">
                    {pack.questions.map((q) => (
                      <QuestionCard
                        key={q.number}
                        question={q}
                        index={q.number}
                        quizMode={quizMode}
                        answered={quizInteractive ? answers[q.number] : undefined}
                        onAnswer={
                          quizInteractive
                            ? (picked, correct) => recordAnswer(q.number, picked, correct)
                            : undefined
                        }
                      />
                    ))}
                  </ol>
                </>
              </section>
            )}

            {(pack.factChecks.length > 0 || pack.sources.length > 0) && (
              <section aria-label="Fact-check and sources">
                <h2 className={SECTION_H}>
                  <SearchCheck className="size-5 text-accent" aria-hidden="true" />
                  {pack.sources.length > 0 ? "Fact-check & sources" : "Fact-check"}
                </h2>
                <p className="mt-3 max-w-prose text-sm text-muted">
                  Claims re-verified against your notes — research mode.
                  {pack.sources.length > 0 &&
                    " Reference websites for further reading are listed last."}
                </p>
                {pack.factChecks.length > 0 && (
                  <ul className="mt-3 max-w-prose space-y-2.5">
                    {pack.factChecks.map((fc: FactCheck, i) => (
                      <li
                        key={i}
                        className="rounded-2xl border border-line bg-background px-3.5 py-3"
                      >
                        <p className="text-sm font-medium">{fc.claim}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-xs font-semibold",
                              verdictClass(fc.verdict),
                            )}
                          >
                            {fc.verdict}
                          </span>
                          {fc.source && (
                            <span className="min-w-0 text-xs text-muted">
                              Where in the notes: {fc.source}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {pack.sources.length > 0 && (
                  // Merged Sources list: always the END of this section —
                  // the reference websites each fact-check can be read at.
                  <div className="mt-4 max-w-prose rounded-2xl border border-line bg-background px-3.5 py-3.5">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted">
                      Sources
                    </h3>
                    <ol className="mt-2 space-y-1.5">
                      {pack.sources.map((s, i) => (
                        <li
                          key={i}
                          className="flex min-w-0 items-baseline gap-2 text-sm"
                        >
                          <span className="shrink-0 text-muted tabular-nums">
                            {i + 1}.
                          </span>
                          <span className="min-w-0 break-words">
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-accent underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                              {s.name}
                            </a>
                            {s.url && (
                              <span className="text-xs text-muted"> — {s.url}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <Note>
            The model did not follow the expected structure, so the sections above
            could not be parsed — read the full markdown in the Markdown tab.
          </Note>
        ))}

      {/* ------------------------------------------- markdown source snippet */}
      {/* The Markdown view is the .md twin of the generated PDF — the exact
          same parsed content in canonical markdown (headings as ##, concepts
          as a table, quiz options + Correct markers) — and what Download .md
          saves. It falls back to the raw model output only when parsing
          failed. */}
      {view === "md" && (
        <figure
          className="mt-5 overflow-hidden rounded-2xl border border-line bg-background"
          aria-label="Markdown source of the study pack — same content as the PDF"
        >
          <figcaption className="flex flex-wrap items-center gap-2 border-b border-line bg-line/40 px-3.5 py-2 font-mono text-xs text-muted">
            <FileCode className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate">{`${slugify(sourceName)}-study-pack.md`}</span>
            <span className="ml-auto shrink-0">
              same content as the PDF · {packMarkdown.length} chars
            </span>
            <button
              type="button"
              onClick={() => void copyMdSource()}
              aria-label="Copy the markdown source"
              className="ml-0 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 font-sans text-xs font-medium text-ink transition-[background-color,border-color] hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
            >
              {mdCopyState === "done" ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              <span aria-live="polite">
                {mdCopyState === "idle"
                  ? "Copy"
                  : mdCopyState === "done"
                    ? "Copied"
                    : "Copy failed"}
              </span>
            </button>
          </figcaption>
          <pre className="max-h-[65vh] overflow-auto p-4 font-mono text-xs leading-relaxed text-ink whitespace-pre">
            <code>{packMarkdown}</code>
          </pre>
        </figure>
      )}

      {/* -------------------------------------------------------- pdf viewer */}
      {view === "pdf" && (
        <div className="mt-5">
          {pdf.error ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-err">
              <span>{pdf.error}</span>
              <button
                type="button"
                onClick={() => {
                  setPdf({ url: null, error: null, busy: false });
                  void ensurePdf();
                }}
                className="inline-flex h-11 shrink-0 items-center rounded-full border border-line bg-card px-3 text-sm font-medium text-ink transition-[border-color] hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9"
              >
                Try again
              </button>
            </p>
          ) : pdf.url ? (
            <object
              data={pdf.url}
              type="application/pdf"
              aria-label="Study pack PDF preview"
              className="h-[65vh] min-h-96 w-full rounded-2xl border border-line bg-card"
            >
              {/* Fallback for browsers with no inline PDF viewer */}
              <p className="p-4 text-sm">
                Inline PDF preview is not available here —{" "}
                <a
                  href={pdf.url}
                  download={pdfName}
                  className="font-semibold text-accent underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  open or save the PDF ({pdfName})
                </a>
                .
              </p>
            </object>
          ) : (
            <p className="mt-3 text-sm text-muted">Building the PDF…</p>
          )}
        </div>
      )}
      </div>

      {/* actions — AFTER the output: copy + every download live below the
          content, never before it. */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <button type="button" onClick={copyPlain} className={ACTION_CHIP}>
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
            {copyState === "done" ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copyState === "idle" ? "Copy" : copyState === "done" ? "Copied" : "Copy failed"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => downloadFile(`${slugify(sourceName)}-study-pack.md`, packMarkdown)}
          className={ACTION_CHIP}
        >
          <ArrowDownToLine className="size-4" aria-hidden="true" />
          Download .md
        </button>

        {pack.questions.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadFile(
                `${slugify(sourceName)}-study-pack-quiz.md`,
                buildQuizMarkdown(pack, sourceName),
              )
            }
            className={ACTION_CHIP}
          >
            <ListChecks className="size-4" aria-hidden="true" />
            Quiz .md
          </button>
        )}

        <button type="button" onClick={downloadPdf} className={ACTION_CHIP}>
          <FileDown className="size-4" aria-hidden="true" />
          Download PDF
        </button>
      </div>
    </article>
  );
}
