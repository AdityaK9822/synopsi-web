/**
 * Study-pack PDF generation with pdf-lib (no runtime font files — standard
 * Helvetica family only, so it works under any bundler).
 *
 * Layout: A4, 48pt margins, plain academic handout — title block, then the
 * three parsed sections. Text is wrapped by measurement; WinAnsi-safe
 * sanitisation because the standard fonts are single-byte.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { FactCheck, StudyPack } from "@/lib/types";

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 48;
const CONTENT_W = A4_W - MARGIN * 2;

const INK = rgb(0.094, 0.094, 0.106); // #18181b
const MUTED = rgb(0.443, 0.443, 0.478); // #71717a
const LINE = rgb(0.894, 0.894, 0.906); // #e4e4e7
const ACCENT = rgb(0.427, 0.29, 0.933); // #6d4aee
const ERR = rgb(0.561, 0.114, 0.173); // #8f1d2c

/** Standard-font (WinAnsi) safe text: curly quotes to straight, dashes down,
 *  ellipsis expanded, everything outside Latin-1 dropped. */
function sanitize(text: string): string {
  return (text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\t\v\f]/g, "  ")
    .split("")
    .filter((ch) => ch === "\n" || (ch >= " " && ch <= "\u00FF"))
    .join("");
}

/** Greedy word wrap by measured width. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Writing cursor state for the multi-page build. */
class Page {
  private doc: PDFDocument;
  private regular: PDFFont;
  private bold: PDFFont;
  page!: Awaited<ReturnType<PDFDocument["addPage"]>>;
  y = A4_H - MARGIN;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4_W, A4_H]);
    this.y = A4_H - MARGIN;
  }

  /** Reserve vertical space; starts a new page when it will not fit. */
  ensure(height: number) {
    if (this.y - height < MARGIN + 14) this.newPage();
  }

  /** Draw wrapped text starting at `x`, right-aligned to a top edge at this.y
   *  (i.e. the first baseline sits `size` below y). Returns the drawn lines and
   *  the first baseline's y (for line-anchored glyphs such as bullets). */
  text(
    content: string,
    opts: {
      x: number;
      width: number;
      font?: PDFFont;
      size?: number;
      color?: typeof INK;
      lineHeight?: number;
      gapAfter?: number;
    },
  ): { lines: string[]; firstBaseline: number | null } {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? 10.5;
    const lineHeight = (opts.lineHeight ?? 1.45) * size;
    const color = opts.color ?? INK;
    const lines = wrap(content, font, size, opts.width);
    let firstBaseline: number | null = null;
    for (const line of lines) {
      this.ensure(lineHeight);
      const baselineY = this.y - size;
      if (firstBaseline === null) firstBaseline = baselineY;
      this.page.drawText(line, {
        x: opts.x,
        y: baselineY,
        size,
        font,
        color,
      });
      this.y -= lineHeight;
    }
    this.y -= opts.gapAfter ?? 0;
    return { lines, firstBaseline };
  }

  rule(color: typeof LINE | typeof ACCENT, weight: 1 | 2) {
    this.ensure(weight + 6);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 4,
      width: weight === 2 ? 46 : CONTENT_W,
      height: weight,
      color,
    });
    this.y -= weight + 12;
  }

  sectionHeader(title: string) {
    this.ensure(46);
    this.y -= 14;
    this.page.drawText(sanitize(title).toUpperCase(), {
      x: MARGIN,
      y: this.y - 8.5,
      size: 8.5,
      font: this.bold,
      color: MUTED,
    });
    this.y -= 12;
    this.rule(ACCENT, 2);
  }
}

export async function buildStudyPackPdf(
  sourceName: string,
  model: string,
  pack: StudyPack,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${sanitize(sourceName)} - Study pack`);
  doc.setProducer("Smart Academic Notes Assistant");
  doc.setCreator("Smart Academic Notes Assistant");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = new Page(doc, regular, bold);

  /* title block */
  p.text(sanitize(sourceName), {
    x: MARGIN,
    width: CONTENT_W,
    font: bold,
    size: 17,
    lineHeight: 1.2,
    gapAfter: 4,
  });
  p.text(
    `Smart Academic Notes Assistant${model ? ` · ${sanitize(model)}` : ""} — answers strictly from your own notes`,
    { x: MARGIN, width: CONTENT_W, size: 8.5, color: MUTED, gapAfter: 10 },
  );
  p.rule(ACCENT, 2);

  /* summary */
  if (pack.summary.length > 0) {
    p.sectionHeader("Summary");
    for (const point of pack.summary) {
      const { firstBaseline } = p.text(point, {
        x: MARGIN + 14,
        width: CONTENT_W - 14,
      });
      // bullet dot anchored to the first drawn line of this bullet
      if (firstBaseline !== null) {
        p.page.drawCircle({
          x: MARGIN + 4,
          y: firstBaseline + 3,
          size: 1.6,
          color: ACCENT,
        });
      }
      p.y -= 4;
    }
  }

  /* key concepts */
  if (pack.keyConcepts.length > 0) {
    p.sectionHeader("Key concepts");
    const termX = MARGIN;
    const defX = MARGIN + 140;
    const defW = CONTENT_W - 140;
    for (const c of pack.keyConcepts) {
      const termLines = wrap(c.term, bold, 10, 132);
      const defLines = wrap(c.definition, regular, 10, defW);
      const whyLines = c.why ? wrap(`Why it matters: ${c.why}`, regular, 8.5, defW) : [];
      const blockH =
        Math.max(termLines.length, defLines.length) * 10 * 1.45 +
        whyLines.length * 8.5 * 1.4 +
        (whyLines.length ? 2 : 0) +
        10;
      p.ensure(blockH);
      const startY = p.y;
      let ty = startY;
      for (const line of termLines) {
        p.page.drawText(line, { x: termX, y: ty - 10, size: 10, font: bold, color: INK });
        ty -= 10 * 1.45;
      }
      let dy = startY;
      for (const line of defLines) {
        p.page.drawText(line, { x: defX, y: dy - 10, size: 10, font: regular, color: INK });
        dy -= 10 * 1.45;
      }
      if (whyLines.length) {
        dy -= 2;
        for (const line of whyLines) {
          p.page.drawText(line, { x: defX, y: dy - 8.5, size: 8.5, font: regular, color: MUTED });
          dy -= 8.5 * 1.4;
        }
      }
      p.y = Math.min(ty, dy) - 4;
      p.page.drawLine({
        start: { x: MARGIN, y: p.y + 4 },
        end: { x: A4_W - MARGIN, y: p.y + 4 },
        thickness: 0.75,
        color: LINE,
      });
      p.y -= 6;
    }
  }

  /* revision questions */
  if (pack.questions.length > 0) {
    const isQuiz = pack.questions.some(
      (q) => (q.options?.length ?? 0) > 0 && q.correctIndex !== undefined,
    );
    p.sectionHeader(isQuiz ? "Quiz" : "Revision questions");
    pack.questions.forEach((q, i) => {
      p.ensure(70);
      p.text(`${q.number || i + 1}. (${q.qtype || "General"}) ${q.question}`, {
        x: MARGIN,
        width: CONTENT_W,
        font: bold,
        size: 10.5,
        lineHeight: 1.35,
        gapAfter: 3,
      });
      if ((q.options?.length ?? 0) > 0 && q.correctIndex !== undefined) {
        const letters = ["A", "B", "C", "D"];
        q.options!.forEach((text, oi) => {
          p.ensure(16);
          const optionLines = p.text(`${letters[oi]}) ${text}`, {
            x: MARGIN + 14,
            width: CONTENT_W - 14,
            size: 9.5,
            color: oi === q.correctIndex ? ACCENT : MUTED,
            lineHeight: 1.3,
          });
          // filled-dot marker beside the correct option (the "Correct:" line
          // below carries the same fact in text, colour is never the only cue)
          if (oi === q.correctIndex && optionLines.firstBaseline !== null) {
            p.page.drawCircle({
              x: MARGIN + 4,
              y: optionLines.firstBaseline + 3,
              size: 1.6,
              color: ACCENT,
            });
          }
        });
        p.text(
          `Correct: ${["A", "B", "C", "D"][q.correctIndex] ?? "-"}` +
            (q.answer ? ` — ${q.answer}` : ""),
          {
            x: MARGIN + 14,
            width: CONTENT_W - 14,
            size: 9.5,
            color: MUTED,
            lineHeight: 1.4,
          },
        );
      } else {
        p.text(`Answer: ${q.answer}`, {
          x: MARGIN + 14,
          width: CONTENT_W - 14,
          size: 10,
          color: MUTED,
          lineHeight: 1.4,
          gapAfter: 10,
        });
      }
      p.y -= 10;
    });
  }

  /* research-mode fact-check + merged Sources list (always last).
     Both fields are OPTIONAL (present only in research mode) — a plain
     study pack carries neither. Guarded dereference: a non-research
     pack must export its PDF just fine. */
  const factChecks = pack.factChecks ?? [];
  const sources = pack.sources ?? [];
  if (factChecks.length > 0 || sources.length > 0) {
    p.sectionHeader("Fact-check");
    drawFactChecks(factChecks, p, bold, regular);
    if (sources.length > 0) {
      p.ensure(30);
      p.text("Sources", {
        x: MARGIN,
        width: CONTENT_W,
        font: bold,
        size: 10,
        gapAfter: 4,
      });
      sources.forEach((s, i) => {
        p.ensure(14);
        p.text(`${i + 1}. ${s.name}${s.url ? ` — ${s.url}` : ""}`, {
          x: MARGIN + 14,
          width: CONTENT_W - 14,
          size: 9,
          color: MUTED,
          lineHeight: 1.35,
          gapAfter: 2,
        });
      });
    }
  }

  // Bookkeeping: the Page writer may have appended pages; keep them all.
  return doc.save();
}

/** Fact-check rows: one bolded claim, then verdict + note anchor in muted text. */
function drawFactChecks(
  rows: FactCheck[],
  p: Page,
  bold: PDFFont,
  regular: PDFFont,
): void {
  const verdictTone = (verdict: string) =>
    /not supported/i.test(verdict)
      ? ERR
      : /supported/i.test(verdict)
        ? ACCENT
        : MUTED; // "Unclear" and anything unrecognised stay neutral

  for (const row of rows) {
    p.ensure(60);
    p.text(row.claim, {
      x: MARGIN,
      width: CONTENT_W,
      font: bold,
      size: 10,
      lineHeight: 1.35,
      gapAfter: 2,
    });
    p.text(`Verdict: ${row.verdict}`, {
      x: MARGIN + 14,
      width: CONTENT_W - 14,
      font: regular,
      size: 9.5,
      color: verdictTone(row.verdict),
      lineHeight: 1.35,
    });
    p.text(`Where in the notes: ${row.source}`, {
      x: MARGIN + 14,
      width: CONTENT_W - 14,
      size: 9,
      color: MUTED,
      lineHeight: 1.4,
      gapAfter: 8,
    });
    p.y -= 4;
  }
}
