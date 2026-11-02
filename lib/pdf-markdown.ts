/**
 * PDF -> Markdown for the LLM.
 *
 * Two stages, both using prebuilt tools:
 *
 *  1. Text layer — `@opendocsg/pdf2md` converts the PDF's own text into
 *     Markdown (headings, lists, tables keep their structure), which is a
 *     better prompt input than the flat string `extractText` produced.
 *  2. Scanned pages — when the text layer is missing, pages that are mostly
 *     image get rendered with pdf.js (`unpdf` + `@napi-rs/canvas`) and read
 *     with `tesseract.js`. No browser, no external OCR service.
 *
 * Server-only: pulls in native/WASM dependencies. Never import from a
 * client component.
 */

import os from "node:os";
import path from "node:path";

import { inspectPages, renderPageAsImage } from "unpdf";

/* ---------------------------------------------------------------- limits */
/** Below this, the text layer is considered absent (a title/header only). */
const MIN_TEXT_CHARS = 40;
/** OCR is expensive; a study pack never needs more than this many pages. */
const MAX_OCR_PAGES = 20;
/** Image coverage that identifies a page as a scan rather than a diagram. */
const MIN_IMAGE_COVERAGE = 0.2;
/** Stop OCR once we have comfortably more text than the prompt will use. */
const MAX_OUTPUT_CHARS = 60_000;
/** Wall-clock guard so one pathological scan cannot hold the request open. */
const OCR_BUDGET_MS = 120_000;

/* ---------------------------------------------------------------- errors */
/** Why a PDF could not be turned into text. Each reason gets its own
 *  actionable message — a locked PDF is a different fix from a scan. */
export type PdfFailure = "encrypted" | "corrupt" | "no-text";

export class PdfError extends Error {
  reason: PdfFailure;
  constructor(reason: PdfFailure, message: string) {
    super(message);
    this.name = "PdfError";
    this.reason = reason;
  }
}

/** Message per failure mode. The caller prefixes the file name. */
const PDF_MESSAGES: Record<PdfFailure, string> = {
  encrypted:
    "This PDF is password-protected, so its text cannot be read. Remove the " +
    "password (or export an unlocked copy) and try again.",
  corrupt:
    "This file could not be read as a PDF — it may be corrupted or not a PDF " +
    "at all. Re-export it and try again.",
  "no-text":
    "No readable text was found in this PDF. Try a text-based PDF, or paste " +
    "the text instead.",
};

/** OCR ran on an image-only document and still produced nothing usable. */
const OCR_EMPTY_MESSAGE =
  "This PDF looks like scanned images, but OCR could not read any text from " +
  "it. Try a clearer scan, or paste the text instead.";

/** pdf.js signals the reason through the error name; map it onto our
 *  vocabulary so the UI never has to guess. */
function pdfFailure(exc: unknown): Exclude<PdfFailure, "no-text"> {
  const name = String((exc as { name?: string } | null)?.name ?? "");
  return /password|encrypt/i.test(name) ? "encrypted" : "corrupt";
}

/** A PDF header may legally sit up to 1 KB into the file (junk prefix), so
 *  sniff the whole window rather than just byte 0. */
export function looksLikePdf(data: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(data.subarray(0, 1024));
  return head.includes("%PDF-");
}

/* ------------------------------------------------------------- conversion */
export interface PdfMarkdown {
  /** Extracted markdown (empty when the pages are handed over as images). */
  markdown: string;
  /** Base64 JPEG page images for vision models — no data: prefix. */
  images: string[];
  /** Which stage produced the content. */
  method: "text" | "vision" | "ocr";
  /** Pages the document contains (not necessarily the pages read). */
  pages: number;
}

/** Tesseract keeps its language data in a writable dir; serverless functions
 *  only allow /tmp, and the project dir is read-only there. */
function cacheDir(): string {
  return path.join(os.tmpdir(), "synopsi-tesseract");
}

/** OCR text arrives with ragged spacing and stray form feeds. */
function tidyOcr(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** pdf2md marks empty pages with `<!-- PAGE_BREAK -->`, so a scan can yield
 *  dozens of characters of markup and no prose. Count only real text when
 *  deciding whether a text layer exists. */
function readableLength(markdown: string): number {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

async function ocrPages(
  source: Uint8Array,
  pages: number[],
): Promise<string> {
  const started = Date.now();
  const { createWorker } = await import("tesseract.js");

  let worker;
  try {
    worker = await createWorker("eng", 1, {
      cachePath: cacheDir(),
      logger: () => {},
    });
  } catch {
    throw new PdfError(
      "no-text",
      "This PDF appears to be scanned images, and the OCR engine could not " +
        "start. Paste the text instead, or try again in a moment.",
    );
  }

  try {
    const chunks: string[] = [];
    for (const page of pages) {
      if (Date.now() - started > OCR_BUDGET_MS) break;
      // One unreadable page (odd codec, damaged stream) must not sink the
      // whole document — skip it and keep the pages that did work.
      try {
        // pdf.js TRANSFERS the input buffer to its worker, detaching it —
        // every page needs its own copy or the next render fails with
        // DataCloneError.
        const png = await renderPageAsImage(source.slice(), page, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale: 2,
          format: "png",
        });
        const { data } = await worker.recognize(Buffer.from(png));
        const pageText = tidyOcr(data.text);
        if (pageText) chunks.push(`## Page ${page}\n\n${pageText}`);
      } catch (exc) {
        console.warn(`[pdf] OCR skipped page ${page}:`, exc);
      }
      if (chunks.join("\n\n").length >= MAX_OUTPUT_CHARS) break;
    }
    return chunks.join("\n\n").trim();
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * Convert a PDF into Markdown, falling back to OCR for scanned pages.
 *
 * Throws `PdfError` with a user-facing message when the file is locked,
 * corrupt, or genuinely has no readable text.
 */
export async function pdfToMarkdown(data: Uint8Array): Promise<PdfMarkdown> {
  /* Pristine copy: pdf.js and unpdf may transfer the buffers they are given,
     so no consumer below ever receives this one directly. */
  const source = new Uint8Array(data);

  /* 1. Prebuilt PDF -> Markdown on the text layer. A damaged or locked file
        throws here; `inspectPages` below then classifies the failure. */
  let text = "";
  try {
    const { default: pdf2md } = await import("@opendocsg/pdf2md");
    text = (await pdf2md(source.slice())).trim();
  } catch (exc) {
    const reason = pdfFailure(exc);
    throw new PdfError(reason, PDF_MESSAGES[reason]);
  }

  /* 2. Measure the document: page count, and which pages are images only. */
  let totalPages = 0;
  let scanPages: number[] = [];
  try {
    const info = await inspectPages(source.slice());
    totalPages = info.totalPages;
    scanPages = info.pages
      .map((page, i) => ({ ...page, number: i + 1 }))
      .filter(
        (page) =>
          page.textLength < 20 &&
          (page.imageCount > 0 || page.imageCoverage >= MIN_IMAGE_COVERAGE),
      )
      .map((page) => page.number);
  } catch (exc) {
    const reason = pdfFailure(exc);
    throw new PdfError(reason, PDF_MESSAGES[reason]);
  }

  if (readableLength(text) >= MIN_TEXT_CHARS) {
    return { markdown: text, method: "text", pages: totalPages, images: [] };
  }

  /* 3. No usable text layer: OCR the scanned pages, if there are any. A
        blank digital PDF has no images, so it stays a fast, honest error. */
  if (scanPages.length === 0) {
    throw new PdfError("no-text", PDF_MESSAGES["no-text"]);
  }

  let markdown: string;
  try {
    markdown = await ocrPages(source, scanPages.slice(0, MAX_OCR_PAGES));
  } catch (exc) {
    if (exc instanceof PdfError) throw exc;
    // Keep the real cause in the server log: the UI gets the friendly one.
    console.error("[pdf] OCR failed:", exc);
    const reason = pdfFailure(exc);
    throw new PdfError(reason, PDF_MESSAGES[reason]);
  }

  if (markdown.length < MIN_TEXT_CHARS) {
    throw new PdfError("no-text", OCR_EMPTY_MESSAGE);
  }
  return { markdown, method: "ocr", pages: totalPages, images: [] };
}
