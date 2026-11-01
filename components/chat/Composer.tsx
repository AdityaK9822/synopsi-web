"use client";

import { useRef } from "react";
import { ArrowUp, LoaderCircle, Lock, Paperclip, TriangleAlert, X } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { cn, formatBytes } from "@/lib/utils";

const QUESTION_COUNTS = [5, 8, 10, 12, 15, 20] as const;

/** Shared look for the small icon-only controls in the composer. */
const ICON_BTN =
  "grid size-11 shrink-0 place-items-center rounded-full text-muted transition [transition-property:color,background-color] hover:text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none";

/** Shared look for the mode pills (aria-pressed toggles, never colour-alone:
 *  the dot + label stay, only tint changes). h-10 = the design's pill row. */
const PILL =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none";

export interface ComposerProps {
  text: string;
  files: File[];
  busy: boolean;
  quizMode: boolean;
  questionsEnabled: boolean;
  questionCount: number;
  researchMode: boolean;
  /** Local, submit-time validation message (null = none). */
  error: string | null;
  onText: (value: string) => void;
  onFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onQuizMode: (value: boolean) => void;
  onQuestionsEnabled: (value: boolean) => void;
  onQuestionCount: (value: number) => void;
  onResearchMode: (value: boolean) => void;
  onSubmit: () => void;
}

/**
 * Honouring tier unlocks: guests (no questions/quiz/research), free
 * (questions ≤10, no research), premium (all). Display-only gating —
 * the server remains the authority; this just prevents dead-end errors.
 */
function useTierUnlocks() {
  const { tier, tierLimits } = useAuth();
  const limits = tierLimits();
  const questionsAllowed = limits.maxQuestions > 0 && tier !== "guest";
  const counts = QUESTION_COUNTS.filter((n) => n <= limits.maxQuestions);
  return { tier, questionsAllowed, researchAllowed: limits.research, counts };
}

export default function Composer({
  text,
  files,
  busy,
  quizMode,
  questionsEnabled,
  questionCount,
  researchMode,
  error,
  onText,
  onFiles,
  onRemoveFile,
  onQuizMode,
  onQuestionsEnabled,
  onQuestionCount,
  onResearchMode,
  onSubmit,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { tier, questionsAllowed, researchAllowed, counts } = useTierUnlocks();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      className="bg-paper"
    >
      {/* Submit-time validation alert: a real alert box ABOVE the input —
          icon + text so meaning never rides on colour alone, matching the
          thread's error-card vocabulary, inside the stable live-region shell
          (rendered before its text exists) for a reliable announcement. */}
      <div role="status" aria-live="polite">
        {error && (
          <p className="ui-enter-fast mb-2.5 flex items-start gap-2.5 rounded-2xl border border-err/30 bg-err-bg px-4 py-3 text-sm text-err">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0">{error}</span>
          </p>
        )}
      </div>

      {/* The raised "pill" from the reference design: one rounded-3xl card
          with the two-layer drop shadow; the boundary sharpens to the
          contrast-safe accent ring when the composer has focus. */}
      <div className="rounded-3xl border border-line-strong bg-card px-3.5 py-3 shadow-[0px_4px_4px_rgba(23,23,23,0.1),0px_2px_2px_rgba(23,23,23,0.06)] transition-[outline-color] focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent">
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attached files">
            {files.map((f, i) => (
              <li
                key={`${f.name}:${f.size}:${i}`}
                className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-line bg-background px-2.5 py-1.5 text-sm"
              >
                <span className="truncate font-medium" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {formatBytes(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  aria-label={`Remove attached file ${f.name}`}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="snaw-notes" className="sr-only">
          Lecture notes to turn into a study pack
        </label>
        <textarea
          id="snaw-notes"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !busy) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={2}
          placeholder={
            files.length
              ? "Add pasted notes to combine with the files above — or just send"
              : "Paste your lecture notes here — abbreviations and tangents welcome"
          }
          className="field-sizing-content max-h-44 w-full resize-none bg-transparent text-base sm:text-sm placeholder:text-muted focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* multiple: picking again appends, never replaces (T2b) */}
          <input
            ref={fileInputRef}
            id="snaw-file"
            type="file"
            accept=".pdf,.txt,.md,.markdown,.text"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) onFiles(picked);
              e.target.value = ""; // re-picking the same file still fires change
            }}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach .txt, .md or .pdf files"
            aria-describedby="snaw-file-count"
            className={cn(ICON_BTN, files.length > 0 && "text-accent")}
          >
            <Paperclip className="size-4.5" strokeWidth={2} aria-hidden="true" />
          </button>
          <span id="snaw-file-count" className="sr-only" aria-live="polite">
            {files.length === 0
              ? "No files attached"
              : `${files.length} file${files.length > 1 ? "s" : ""} attached`}
          </span>

          {/* Questions feature: a toggle, DISABLED by default (T4). The count
              select lives INSIDE the same pill so its appearance never
              shifts the other controls — the trailing spacer must absorb the
              pill's growth, keeping Quiz/Research/Send exactly in place.
              Under Quiz mode the same count means the number of quiz
              questions. */}
          <div
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1 rounded-full border pl-3.5 text-sm transition-[background-color,border-color,color]",
              questionsEnabled
                ? "border-primary/40 bg-primary/10 text-ink"
                : "border-line bg-card text-muted hover:border-line-strong",
            )}
          >
            <button
              type="button"
              aria-pressed={questionsEnabled}
              disabled={!questionsAllowed}
              title={
                questionsAllowed
                  ? undefined
                  : tier === "guest"
                    ? "Revision questions unlock with a free account"
                    : undefined
              }
              onClick={() => onQuestionsEnabled(!questionsEnabled)}
              className="inline-flex h-10 items-center gap-2 rounded-full pr-3.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
            >
              {!questionsAllowed && <Lock className="size-3" aria-hidden="true" />}
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  questionsEnabled ? "bg-primary" : "bg-line-strong",
                )}
              />
              {quizMode ? "Quiz questions" : "Questions"}
            </button>
            {questionsEnabled && (
              <>
                <span
                  aria-hidden="true"
                  className="h-5 w-px bg-line-strong"
                />
                <label htmlFor="snaw-questions" className="sr-only">
                  {quizMode
                    ? "Number of quiz questions"
                    : "Number of revision questions"}
                </label>
                <select
                  id="snaw-questions"
                  value={(counts as number[]).includes(questionCount) ? questionCount : counts[0]}
                  onChange={(e) => onQuestionCount(Number(e.target.value))}
                  className="max-w-16 cursor-pointer rounded-r-full bg-transparent pr-3 text-sm font-medium text-ink transition-[background-color] focus:outline-none"
                >
                  {counts.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <button
            type="button"
            aria-pressed={quizMode}
            disabled={!questionsAllowed}
            title={
              questionsAllowed
                ? undefined
                : "Quiz mode unlocks with a free account"
            }
            onClick={() => onQuizMode(!quizMode)}
            className={cn(
              PILL,
              quizMode
                ? "border-primary/40 bg-primary/10 text-ink"
                : "border-line bg-card text-muted hover:border-line-strong hover:text-ink",
              !questionsAllowed && "cursor-not-allowed opacity-60 hover:border-line hover:text-muted",
            )}
          >
            {!questionsAllowed && <Lock className="size-3" aria-hidden="true" />}
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", quizMode ? "bg-primary" : "bg-line-strong")}
            />
            Quiz mode
          </button>

          {/* Research / fact-check: user-enabled, off by default (T3);
              premium-only — locked for other tiers. */}
          <button
            type="button"
            aria-pressed={researchMode}
            disabled={!researchAllowed}
            title={researchAllowed ? undefined : "Fact-check is part of premium"}
            onClick={() => onResearchMode(!researchMode)}
            className={cn(
              PILL,
              researchMode
                ? "border-primary/40 bg-primary/10 text-ink"
                : "border-line bg-card text-muted hover:border-line-strong hover:text-ink",
              !researchAllowed && "cursor-not-allowed opacity-60 hover:border-line hover:text-muted",
            )}
          >
            {!researchAllowed && <Lock className="size-3" aria-hidden="true" />}
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                researchMode ? "bg-primary" : "bg-line-strong",
              )}
            />
            Research
          </button>

          <span className="flex-1" />

          {/* Send doubles as the loading state: spinner while the model runs
              (the mode pills stay usable for the NEXT send). The design uses
              a round arrow-up key — same affordance, tighter silhouette. */}
          <button
            type="submit"
            disabled={busy}
            aria-label={busy ? "Generating study pack" : "Send"}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-white shadow-[0px_2px_4px_rgba(79,70,229,0.25)] transition-[background-color] hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
          >
            {busy ? (
              <LoaderCircle
                className="size-4.5 animate-spin motion-reduce:animate-none"
                strokeWidth={2.25}
                aria-hidden="true"
              />
            ) : (
              <ArrowUp className="size-4.5" strokeWidth={2.25} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <p className="mt-2 px-1 text-center text-xs text-muted">
        Enter to send · Shift+Enter for a new line · answers come strictly from your notes
      </p>
    </form>
  );
}
