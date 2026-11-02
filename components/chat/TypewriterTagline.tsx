"use client";

import { useEffect, useState } from "react";

/**
 * Typewriter tagline: the sentence frame is static; one keyword slot cycles
 * through the accepted input kinds (typed out, held, deleted, next word).
 * Reduced-motion users get the plain word swap with no per-character effect
 * and no caret blink — same information, none of the motion.
 * The animated copy is aria-hidden; a static sentence is exposed to screen
 * readers so the announcement never stutters per character.
 */
const KEYWORDS = ["lectures", "PDFs", "handwritten scans", "bullet points"];
const FRAME = "Turn messy";
const SENTENCE = "Turn messy lectures into clean, exam-ready study material.";

const TYPE_MS = 70;
const DELETE_MS = 40;
const HOLD_MS = 2400;
const FIRST_HOLD_MS = 1800;
const REDUCED_SWAP_MS = 3200;

type Phase = "holding" | "typing" | "waiting" | "deleting";

export default function TypewriterTagline() {
  const [reduce, setReduce] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  // First paint shows the full default keyword on server and client alike.
  const [chars, setChars] = useState(KEYWORDS[0].length);
  const [phase, setPhase] = useState<Phase>("holding");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Deferred a frame: the one-time DOM read should not setState
    // synchronously inside the effect body.
    const raf = requestAnimationFrame(() => setReduce(mq.matches));
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    if (reduce) {
      const t = window.setInterval(
        () => setWordIndex((i) => (i + 1) % KEYWORDS.length),
        REDUCED_SWAP_MS,
      );
      return () => window.clearInterval(t);
    }

    const word = KEYWORDS[wordIndex];
    let t: number;
    if (phase === "holding") {
      t = window.setTimeout(() => setPhase("deleting"), wordIndex === 0 ? FIRST_HOLD_MS : HOLD_MS);
    } else if (phase === "deleting") {
      if (chars > 0) {
        t = window.setTimeout(() => setChars((c) => c - 1), DELETE_MS);
      } else {
        t = window.setTimeout(() => {
          setWordIndex((i) => (i + 1) % KEYWORDS.length);
          setPhase("typing");
        }, 350);
      }
    } else if (phase === "typing") {
      if (chars < word.length) {
        t = window.setTimeout(() => setChars((c) => c + 1), TYPE_MS);
      } else {
        t = window.setTimeout(() => setPhase("holding"), 60);
      }
    } else {
      t = window.setTimeout(() => setPhase("deleting"), HOLD_MS);
    }
    return () => window.clearTimeout(t);
  }, [chars, phase, wordIndex, reduce]);

  const shown = reduce ? KEYWORDS[wordIndex] : KEYWORDS[wordIndex].slice(0, chars);
  // Caret stays solid while the machine is working, blinks at rest (gated).
  const caretAnimating = phase === "holding";

  return (
    <>
      <span className="sr-only">{SENTENCE}</span>
      <span aria-hidden="true">
        {FRAME}{" "}
        <span className="text-accent">{shown}</span>
        {!reduce && (
          <span
            className={
              "tw-caret ml-px inline-block h-[1.05em] w-[2px] translate-y-[0.12em] rounded-full bg-accent/70 " +
              (caretAnimating ? "" : "tw-caret-solid")
            }
          />
        )}{" "}
        into clean, exam-ready study material.
      </span>
    </>
  );
}
