/** Shared types for the Smart Academic Notes Assistant (ported from notes_pipeline.py). */

export interface KeyConcept {
  term: string;
  definition: string;
  why: string;
}

export interface Question {
  number: number;
  qtype: string; // Recall | Short Answer | Applied | General
  question: string;
  /** Open question answer ("**Answer:**" line). Empty for quiz questions
   *  that only mark the correct option (explanation, if any, still lands here). */
  answer: string;
  /** Quiz mode only: option labels (already stripped of the "A)" prefix),
   *  index-aligned with the letters A.. maximum size 4. */
  options?: string[];
  /** Quiz mode only: 0-based index into `options` of the correct answer. */
  correctIndex?: number;
}

/** One row of the optional "Fact-Check" section (research mode). */
export interface FactCheck {
  /** The claim, restated as one specific sentence that came from the notes. */
  claim: string;
  /** Supported | Partly supported | Not supported | Unclear (may carry suffix text). */
  verdict: string;
  /** The exact note fragment (or section name) the verdict was judged against. */
  source: string;
}

/** One reference website listed in the optional "Sources" section (research
 *  mode): where the fact-checked claims can be read in full. */
export interface SourceRef {
  /** Human-readable label, e.g. "Wikipedia — Round-robin scheduling". */
  name: string;
  /** The URL to open. */
  url: string;
}

export interface StudyPack {
  summary: string[];
  keyConcepts: KeyConcept[];
  questions: Question[];
  /** Research mode only; empty when the section is absent or unparsed. */
  factChecks: FactCheck[];
  /** Research mode only: reference websites for the fact-checked claims,
   *  always presented last (merged into the Fact-check section in the UI). */
  sources: SourceRef[];
  sectionsFound: string[];
}

/** Per-generation switches the UI toggles map onto (see buildSystemPrompt). */
export interface GenerateOptions {
  model?: string;
  /** Emit the Revision Questions section at all (default true; the UI keeps it off unless enabled). */
  questionsEnabled?: boolean;
  /** Quiz mode: questions become four-option multiple choice with a marked correct option. */
  quizMode?: boolean;
  /** Research mode: add the Fact-Check table grounded in the notes. */
  research?: boolean;
}

export interface GenerateResult {
  /** The model's raw markdown output (already on disk via saveStudyPack). */
  raw: string;
  pack: StudyPack;
  /** False means the response could not be parsed — the UI shows the raw text. */
  parsed: boolean;
  model: string;
}
