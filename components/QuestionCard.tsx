"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D"];

export type AnswerState = { picked: number; correct: boolean } | undefined;

export default function QuestionCard({
  question,
  index,
  quizMode,
  answered,
  onAnswer,
}: {
  question: Question;
  index: number;
  quizMode: boolean;
  /** Already-picked answer for this question (interactive quiz, lifted state). */
  answered?: AnswerState;
  /** Called with the picked option index once; ignored afterwards. */
  onAnswer?: (picked: number, correct: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const n = question.number || index;
  const interactive =
    quizMode && (question.options?.length ?? 0) > 1 && question.correctIndex !== undefined;
  const picked = answered?.picked;

  return (
    <li className="border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Q{n}</h3>
        {/* Type chip: token-based; type is carried by text, never colour alone. */}
        <span className="rounded-full border border-line bg-primary/10 px-2 py-0.5 text-xs font-medium text-ink">
          {question.qtype}
        </span>
      </div>

      <p className="mt-1.5 max-w-prose text-base font-medium">{question.question}</p>

      {interactive ? (
        <fieldset className="mt-2.5 max-w-prose">
          <legend className="sr-only">
            Options for Q{n}. Pick one answer.
          </legend>
          <ul className="space-y-1.5">
            {question.options!.map((text, oi) => {
              const isCorrect = oi === question.correctIndex;
              const isPicked = picked === oi;
              const revealed = picked !== undefined;
              return (
                <li key={oi}>
                  <button
                    type="button"
                    disabled={revealed}
                    aria-pressed={isPicked}
                    onClick={() => onAnswer?.(oi, isCorrect)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition [transition-property:background-color,border-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.995] motion-reduce:transition-none",
                      !revealed &&
                        "border-line bg-card hover:border-line-strong enabled:hover:bg-line/30",
                      revealed && isCorrect && "border-ok/40 bg-ok-bg",
                      revealed && isPicked && !isCorrect && "border-err/40 bg-err-bg",
                      revealed && !isCorrect && !isPicked && "border-line bg-card opacity-60",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-px grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular-nums",
                        revealed && isCorrect
                          ? "border-ok bg-ok text-white"
                          : revealed && isPicked
                            ? "border-err bg-err text-white"
                            : "border-line-strong text-muted",
                      )}
                    >
                      {revealed && isCorrect ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : revealed && isPicked ? (
                        <X className="size-3" aria-hidden="true" />
                      ) : (
                        LETTERS[oi]
                      )}
                    </span>
                    <span className="min-w-0 break-words">{text}</span>
                    {/* State is carried by text too, never colour alone. */}
                    <span className="sr-only">
                      {revealed && isCorrect
                        ? " — correct answer"
                        : revealed && isPicked
                          ? " — your pick, incorrect"
                          : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {picked !== undefined && (
            <p
              className={cn(
                "ui-enter-fast mt-2 flex items-start gap-2 text-sm",
                answered!.correct ? "text-ok" : "text-err",
              )}
              role="status"
            >
              <strong className="shrink-0 font-semibold">
                {answered!.correct ? "Correct." : "Not quite."}
              </strong>
              <span className="min-w-0">
                <span className="font-medium text-ink">
                  Correct answer: {LETTERS[question.correctIndex!]} —{" "}
                  {question.options![question.correctIndex!]}
                </span>
                {question.answer && (
                  <span className="block text-muted">{question.answer}</span>
                )}
              </span>
            </p>
          )}
        </fieldset>
      ) : quizMode ? (
        <div className="mt-2.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3.5 text-sm font-medium transition [transition-property:background-color,border-color] hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
          >
            {open ? "Hide answer" : "Show answer"}
          </button>
          {open && (
            <p className="ui-enter-fast mt-2 max-w-prose text-base leading-relaxed">
              <strong className="font-semibold">Answer: </strong>
              {question.answer}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 max-w-prose text-base leading-relaxed text-muted">
          <strong className="font-semibold text-ink">Answer: </strong>
          {question.answer}
        </p>
      )}
    </li>
  );
}
