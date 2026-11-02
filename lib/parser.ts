/**
 * Parsing + pure output helpers (ported from notes_pipeline.py).
 *
 * This module is deliberately import-safe in the browser: no "fs", no network,
 * no secrets. The server-only half lives in lib/pipeline.ts.
 */

import type { FactCheck, KeyConcept, Question, SourceRef, StudyPack } from "./types";

/* Regexes are a direct port of the Python ones (same semantics). */

const SECTION_RE =
  /^#{2,6}\s*\*{0,2}(Summary|Key Concepts|Revision Questions|Fact-Check|Sources)\*{0,2}\s*$/gim;

const QUESTION_HEAD_RE =
  /^#{0,6}\s*[*_]{0,2}\s*Q(\d+)\s*[.:)\-]?\s*[*_]{0,2}\s*(.*)$/i;

const QUESTION_TYPE_RE = /\((Recall|Short Answer|Applied)\)/i;

const ANSWER_RE = /^[*_`]{0,2}\s*answer\b[ :*_`]*(.*)$/i;

/** Quiz option line: "A) text", "**B)** text", "- C. text", "(D) text".
 *  The letter must be followed by a delimiter + whitespace, so ordinary
 *  sentences that merely start with a capital A-D are not mangled. */
const OPTION_RE = /^[\s\-*_>`]*\(?([A-D])\)?[).:\s\*_>`]*\s+(.+)$/i;

/** Quiz correct-mark line: "**Correct:** C", "Correct answer: B", "**Answer:** B)". */
const CORRECT_RE =
  /^[*_\s]*(?:correct\b[^:]*|answer\b[ \*_]*):?[\*_\s]*\(?([A-Da-d])\)?\b/i;

/** Fact-check verdict vocabulary (research mode). */
const VERDICTS = ["Supported", "Partly supported", "Not supported", "Contradicted", "Unclear"];

function trimSet(s: string, chars: string): string {
  const re = new RegExp(`^[${chars}]+|[${chars}]+$`, "g");
  return s.replace(re, "");
}

const TAIL_CHARS = "\\s\\-_*.:"; // Python parity: strip(" \t-_*.:")
const tailTrim = (s: string) => trimSet(s, TAIL_CHARS);

function splitSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const matches = [...text.matchAll(SECTION_RE)];
  matches.forEach((match, i) => {
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    sections[match[1].toLowerCase()] = text.slice(start, end).trim();
  });
  return sections;
}

/** Shared markdown-table reader for | a | b | c | rows (skips separators/headers). */
function parseTableRows(
  chunk: string,
  headerCheck: (cells: string[]) => boolean,
): string[][] {
  const rows: string[][] = [];
  for (const rawLine of chunk.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const cells = line
      .replace(/^\|+/, "")
      .replace(/\|+$/, "")
      .split("|")
      .map((c) => c.trim());
    if (!cells.length || cells.every((c) => !c)) continue;
    // Markdown table separator row: | --- | --- | --- |
    if (cells.every((c) => c && /^[-:\s]*$/.test(c))) continue;
    if (headerCheck(cells)) continue;
    rows.push(cells);
  }
  return rows;
}

function parseSummary(chunk: string, chunkApplies: boolean): string[] {
  if (!chunkApplies) return [];
  const points: string[] = [];
  for (const rawLine of chunk.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^[\s\-*•·–—]+/, "").trim(); // bullets
    line = line.replace(/^\d+[.)]\s*/, "");          // stray numbering
    if (line) points.push(line);
  }
  return points;
}

function parseKeyConcepts(chunk: string, chunkApplies: boolean): KeyConcept[] {
  if (!chunkApplies) return [];
  const rows = parseTableRows(chunk, (cells) =>
    cells.length > 1 && cells[0].toLowerCase() === "term",
  );
  return rows
    .filter((cells) => cells.length >= 3)
    .map((cells) => ({
      term: cells[0] || "—",
      definition: cells[1],
      why: cells.slice(2).filter(Boolean).join(" "),
    }));
}

function parseFactCheck(chunk: string, chunkApplies: boolean): FactCheck[] {
  if (!chunkApplies) return [];
  const rows = parseTableRows(chunk, (cells) =>
    cells.length > 1 && cells[0].toLowerCase() === "claim",
  );
  return rows
    .filter((cells) => cells.length >= 2)
    .map((cells) => {
      // Normalise the verdict onto the vocabulary so the UI can style it.
      const exact = VERDICTS.find((v) => v.toLowerCase() === cells[1].toLowerCase());
      const leading = VERDICTS.find(
        (v) => cells[1].toLowerCase().startsWith(v.toLowerCase()),
      );
      return {
        claim: cells[0] || "—",
        verdict: exact ?? leading ?? cells[1],
        source: cells.slice(2).filter(Boolean).join(" "),
      };
    });
}

/** Sources lines come in three tolerated shapes:
 *  "1. [Name](https://...)", "- [Name](https://...)" and a bare URL. */
const SOURCE_LINK_RE = /^[\s\-*>\d.)]*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const SOURCE_URL_RE = /(https?:\/\/[^\s)>]+)/;

function parseSources(chunk: string, chunkApplies: boolean): SourceRef[] {
  if (!chunkApplies) return [];
  const out: SourceRef[] = [];
  for (const rawLine of chunk.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const labelled = SOURCE_LINK_RE.exec(line);
    if (labelled) {
      out.push({ name: labelled[1].trim() || "Source", url: labelled[2] });
      continue;
    }
    const bare = SOURCE_URL_RE.exec(line);
    if (bare) {
      const url = bare[1];
      const name = line.replace(bare[0], "").trim();
      out.push({ name: name || url, url });
    }
  }
  return out;
}

function titleCase(s: string): string {  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const LETTER_INDEX: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };

function parseQuestions(chunk: string, chunkApplies: boolean): Question[] {
  if (!chunkApplies) return [];
  const questions: Question[] = [];
  let current: Question | null = null;
  let inAnswer = false;

  for (const rawLine of chunk.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const head = QUESTION_HEAD_RE.exec(line);
    if (head) {
      if (current) questions.push(current);
      let remainder = tailTrim(head[2]);
      let qtype = "General";
      const tag = QUESTION_TYPE_RE.exec(remainder);
      if (tag) {
        qtype = titleCase(tag[1]);
        remainder = tailTrim(
          remainder.slice(0, tag.index) + remainder.slice(tag.index + tag[0].length)
        );
      }
      current = {
        number: parseInt(head[1], 10),
        qtype,
        question: remainder,
        answer: "",
      };
      inAnswer = false;
      continue;
    }

    if (current === null) continue;

    // Quiz option line (only before a Correct/Answer marker): "A) text"
    const option = OPTION_RE.exec(line);
    if (
      option &&
      (current.options?.length ?? 0) < 4 &&
      !current.answer &&
      !QUESTION_TYPE_RE.test(line)
    ) {
      current.options = current.options ?? [];
      current.options.push(option[2].trim());
      inAnswer = false;
      continue;
    }

    // Correct-mark line in quiz mode ("**Correct:** B"), also tolerate the
    // plain "**Answer:** B" shape when options exist.
    const correct = CORRECT_RE.exec(line);
    if (correct && current.options && current.options.length > 0) {
      const idx = LETTER_INDEX[correct[1].toLowerCase()];
      if (idx !== undefined && idx < current.options.length) {
        current.correctIndex = idx;
        inAnswer = false;
        continue;
      }
    }

    const answer = ANSWER_RE.exec(line);
    if (answer) {
      // "**Answer:** B) …" in quiz mode doubles as a correct mark.
      if (current.options && current.options.length > 0) {
        const viaAnswer = /^[A-Da-d]\b/.exec(answer[1].trim());
        if (viaAnswer) {
          current.correctIndex = LETTER_INDEX[viaAnswer[0].toLowerCase()];
          inAnswer = false;
          continue;
        }
      }
      inAnswer = true;
      current.answer = answer[1].trim();
      continue;
    }

    if (inAnswer) {
      // Tolerate multi-line answers (no new "Qn." heading was seen).
      current.answer = (current.answer + " " + line).trim();
    }
  }

  if (current) questions.push(current);
  return questions;
}

/**
 * Parse the model's markdown into structured data.
 *
 * Never throws: when parsing fails the UI falls back to showing the raw
 * output so the user is never blocked (same contract as the Python version).
 */
export function parseStudyPack(raw: string): { pack: StudyPack; parsed: boolean } {
  const text = raw.replace(/\r\n/g, "\n");
  const sections = splitSections(text);

  const pack: StudyPack = {
    summary: parseSummary(sections["summary"] ?? "", "summary" in sections),
    keyConcepts: parseKeyConcepts(
      sections["key concepts"] ?? "",
      "key concepts" in sections
    ),
    questions: parseQuestions(
      sections["revision questions"] ?? "",
      "revision questions" in sections
    ),
    factChecks: parseFactCheck(
      sections["fact-check"] ?? "",
      "fact-check" in sections
    ),
    sources: parseSources(sections["sources"] ?? "", "sources" in sections),
    sectionsFound: Object.keys(sections),
  };
  return {
    pack,
    parsed: Boolean(
      pack.summary.length ||
        pack.keyConcepts.length ||
        pack.questions.length ||
        pack.factChecks.length,
    ),
  };
}

/**
 * A printable quiz: questions with their options (when the pack is an
 * interactive quiz) plus a bottom answer key, so the printed page works
 * as a standalone paper the user can take without their notes open.
 */
export function buildQuizMarkdown(pack: StudyPack, title: string): string {
  const lines = [
    `# Quiz — ${title}`,
    "",
    "Work through the questions first, then check yourself with the answer key at the bottom.",
    "",
  ];
  pack.questions.forEach((q, i) => {
    lines.push(`**${i + 1}. (${q.qtype})** ${q.question}`);
    if (q.options && q.correctIndex !== undefined) {
      const letters = ["A", "B", "C", "D"];
      q.options.forEach((text, oi) => {
        lines.push(`${letters[oi]}) ${text}`);
      });
    }
    lines.push("");
  });
  if (pack.questions.length > 0) {
    lines.push("## Answer Key");
    lines.push("");
    pack.questions.forEach((q, i) => {
      if (q.options && q.correctIndex !== undefined) {
        const letter = ["A", "B", "C", "D"][q.correctIndex] ?? "—";
        lines.push(`${i + 1}. ${letter}${q.answer ? ` — ${q.answer}` : ""}`);
      } else {
        lines.push(`${i + 1}. ${q.answer || "—"}`);
      }
    });
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * A plain-text render of the study pack — no markdown tags — for pasting
 * into notes, docs or chat. Mirrors the Study Pack tab: only the sections
 * that exist are emitted, in the same order.
 */
export function buildPackPlainText(pack: StudyPack, title: string): string {
  const lines: string[] = [`STUDY PACK — ${title}`, ""];
  if (pack.summary.length > 0) {
    lines.push("SUMMARY");
    pack.summary.forEach((point, i) => lines.push(`${i + 1}. ${point}`));
    lines.push("");
  }
  if (pack.keyConcepts.length > 0) {
    lines.push("KEY CONCEPTS");
    pack.keyConcepts.forEach((c) => {
      lines.push(`- ${c.term}: ${c.definition}`);
      if (c.why) lines.push(`  Why it matters: ${c.why}`);
    });
    lines.push("");
  }
  if (pack.questions.length > 0) {
    lines.push("REVISION QUESTIONS");
    pack.questions.forEach((q, i) => {
      const n = q.number || i + 1;
      lines.push(`Q${n}. (${q.qtype}) ${q.question}`);
      if (q.options && q.correctIndex !== undefined) {
        const letters = ["A", "B", "C", "D"];
        q.options.forEach((text, oi) =>
          lines.push(`   ${letters[oi]}) ${text}`),
        );
        const letter = letters[q.correctIndex] ?? "-";
        lines.push(`   Answer: ${letter}${q.answer ? ` — ${q.answer}` : ""}`);
      } else if (q.answer) {
        lines.push(`   Answer: ${q.answer}`);
      }
    });
    lines.push("");
  }
  if (pack.factChecks.length > 0) {
    lines.push("FACT-CHECK");
    pack.factChecks.forEach((fc) => {
      lines.push(`- [${fc.verdict}] ${fc.claim}`);
      if (fc.source) lines.push(`  Where in the notes: ${fc.source}`);
    });
    lines.push("");
  }
  // Sources come last, in a copy-friendly citation shape.
  if (pack.sources.length > 0) {
    lines.push("SOURCES");
    pack.sources.forEach((s, i) =>
      lines.push(`${i + 1}. ${s.name}${s.url ? ` — ${s.url}` : ""}`),
    );
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/**
 * The canonical markdown of the study pack — the .md twin of the generated
 * PDF. Every section mirrors `lib/pdf.ts` in the same order, so the app's
 * three views (Study pack, Markdown, PDF) always show the same content.
 * Pipe characters in cell content are escaped so tables stay valid.
 */
function mdCell(text: string | undefined): string {
  return (text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "—";
}

export function buildStudyPackMarkdown(pack: StudyPack, title: string): string {
  const lines: string[] = [`# Study pack — ${title}`, ""];
  if (pack.summary.length > 0) {
    lines.push("## Summary", "");
    pack.summary.forEach((point) => lines.push(`- ${point}`));
    lines.push("");
  }
  if (pack.keyConcepts.length > 0) {
    lines.push("## Key Concepts", "");
    lines.push("| Term | Definition | Why it matters |");
    lines.push("|------|------------|----------------|");
    pack.keyConcepts.forEach((c) =>
      lines.push(`| ${mdCell(c.term)} | ${mdCell(c.definition)} | ${mdCell(c.why)} |`),
    );
    lines.push("");
  }
  if (pack.questions.length > 0) {
    const isQuiz = pack.questions.some(
      (q) => (q.options?.length ?? 0) > 0 && q.correctIndex !== undefined,
    );
    lines.push(isQuiz ? "## Quiz" : "## Revision Questions", "");
    pack.questions.forEach((q, i) => {
      const n = q.number || i + 1;
      lines.push(`### Q${n}. (${q.qtype}) ${q.question}`, "");
      if (q.options && q.correctIndex !== undefined) {
        const letters = ["A", "B", "C", "D"];
        q.options.forEach((text, oi) => lines.push(`${letters[oi]}) ${text}`));
        lines.push("");
        lines.push(
          `**Correct:** ${letters[q.correctIndex] ?? "-"}${q.answer ? ` — ${q.answer}` : ""}`,
          "",
        );
      } else {
        lines.push(`**Answer:** ${q.answer}`, "");
      }
    });
  }
  if (pack.factChecks.length > 0) {
    lines.push("## Fact-Check", "");
    lines.push("| Claim | Verdict | Where in the notes |");
    lines.push("|-------|---------|--------------------|");
    pack.factChecks.forEach((fc) =>
      lines.push(`| ${mdCell(fc.claim)} | ${mdCell(fc.verdict)} | ${mdCell(fc.source)} |`),
    );
    lines.push("");
  }
  // Sources are always the last section, wherever they exist.
  if (pack.sources.length > 0) {
    lines.push("## Sources", "");
    pack.sources.forEach((s, i) => lines.push(`${i + 1}. [${s.name}](${s.url})`));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function slugify(name: string): string {
  return (
    (name || "notes")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "notes"
  );
}
