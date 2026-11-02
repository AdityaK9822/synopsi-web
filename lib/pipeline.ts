/**
 * Server-side pipeline (ported from notes_pipeline.py).
 *
 * Server-only module: reads env / file system and calls Ollama Cloud.
 * The browser-safe half (parsing, quiz builder) lives in lib/parser.ts.
 *
 * Flow:  notes (.txt/.md/.pdf)  ->  messages (see lib/prompts.ts)
 *        ->  POST https://ollama.com/api/chat  ->  raw markdown
 *        ->  parseStudyPack() -> {summary, keyConcepts, questions}
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { looksLikePdf, pdfToMarkdown } from "./pdf-markdown";

import {
  buildSystemPrompt,
  buildTitlePrompt,
  buildUserPrompt,
  type PromptOptions,
} from "./prompts";
import { parseStudyPack } from "./parser";
import type { GenerateOptions, GenerateResult, StudyPack } from "./types";

/* ---------------------------------------------------------------- constants */
export const OLLAMA_CHAT_URL = "https://ollama.com/api/chat";
export const DEFAULT_MODEL = "gemma4:31b"; // API form; the "-cloud" suffix is CLI-only
export const MAX_NOTES_CHARS = 30_000; // ≈ 7.5k tokens, far inside context limits

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 3_000;

/* ---------------------------------------------------------------- errors */
/** Every error below is meant to surface in the UI with its own message. */
export class PipelineError extends Error {}

export class MissingApiKeyError extends PipelineError {}

export class EmptyNotesError extends PipelineError {}

export class UnsupportedFileError extends PipelineError {}

/* Re-exported so callers keep importing PDF failures from the pipeline. */
export { PdfError } from "./pdf-markdown";
export type { PdfFailure } from "./pdf-markdown";

export class ApiError extends PipelineError {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export class ModelResponseError extends PipelineError {}

/* ------------------------------------------------------- note reading */
/** Text uploads: UTF-8, minus the BOM some editors prepend (it would
 *  otherwise become the model's first character). */
function decodeText(data: Uint8Array): string {
  return new TextDecoder("utf-8").decode(data).replace(/^\uFEFF/, "");
}

/**
 * Extract the raw textual content of an upload, without validation/capping.
 * PDFs are detected by extension OR by their %PDF- header, so a correctly
 * built file with a missing/odd extension still works.
 */
export async function decodeUpload(name: string, data: Uint8Array): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return (await pdfToMarkdown(data)).markdown;
  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".text")
  ) {
    return decodeText(data);
  }
  if (looksLikePdf(data)) return (await pdfToMarkdown(data)).markdown;
  throw new UnsupportedFileError(
    `Unsupported file type: “${name}”. Use a .txt, .md or .pdf file.`
  );
}

/** Turn an uploaded file into cleaned note text or raise a user-facing error. */
export async function notesFromUpload(
  name: string,
  data: Uint8Array
): Promise<{ text: string; trimmed: boolean }> {
  return normaliseNotes(await decodeUpload(name, data));
}

/** Validate, clean and length-cap raw note text. */
export function normaliseNotes(text: string): { text: string; trimmed: boolean } {
  text = text.replace(/\r\n/g, "\n").trim();
  if (text.length < 40) {
    throw new EmptyNotesError(
      "The notes look empty or too short to build a study pack from. " +
        "Add real lecture text (at least a paragraph)."
    );
  }
  if (text.length > MAX_NOTES_CHARS) {
    return { text: text.slice(0, MAX_NOTES_CHARS), trimmed: true };
  }
  return { text, trimmed: false };
}

/* ------------------------------------------------------- model call */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Ollama rejected the request (HTTP 400). Usually an unknown model name — " +
    "list valid ones with `curl https://ollama.com/api/tags` or restore the default model.",
  401: "Ollama says the API key is invalid or missing (HTTP 401). " +
    "Check OLLAMA_API_KEY in your .env.local file.",
  402: "Payment required (HTTP 402) — your free-tier cloud quota is likely used up. " +
    "Wait for it to reset or review https://ollama.com/settings/usage.",
  403: "Access denied by Ollama (HTTP 403). Verify the key and your plan at " +
    "https://ollama.com/settings.",
  404: "Model not found (HTTP 404). Check available names with `curl " +
    "https://ollama.com/api/tags` (API names drop the “-cloud” suffix).",
  408: "Ollama timed out before responding (HTTP 408). Try again.",
  429: "Rate limited (HTTP 429) — free-tier request limits were hit. Wait a minute " +
    "and generate again.",
};

/** Build the same user-facing error the Python version produced. */
export function apiStatusError(status: number, body: string): ApiError {
  let detail =
    STATUS_MESSAGES[status] ?? `Ollama Cloud returned HTTP ${status}. Try again in a moment.`;
  const snippet = (body || "").trim().replace(/\n/g, " ").slice(0, 160);
  if (snippet) detail += ` · Cloud said: ${snippet}`;
  return new ApiError(detail, status);
}

function buildMessages(
  notesText: string,
  questionCount: number,
  promptOpts: PromptOptions,
) {
  return [
    { role: "system", content: buildSystemPrompt(questionCount, promptOpts) },
    { role: "user", content: buildUserPrompt(notesText, questionCount, promptOpts) },
  ];
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Call Ollama Cloud and return { raw, pack, parsed, model }.
 *
 * Retries once for transient failures (network errors, 429, 5xx).
 * Raises subclasses of PipelineError otherwise — same contract as Python.
 *
 * `opts` carries the mode switches (model may also ride along):
 * questionsEnabled off omits the Revision Questions section entirely;
 * quizMode turns the questions into interactive four-option MCQs;
 * research adds the Fact-Check table.
 */
export async function generateStudyPack(
  notesText: string,
  questionCount: number,
  apiKey: string,
  opts: GenerateOptions & { timeoutMs?: number; retries?: number } = {},
): Promise<GenerateResult> {
  const {
    model = DEFAULT_MODEL,
    questionsEnabled = true,
    quizMode = false,
    research = false,
    timeoutMs = 120_000,
    retries = 1,
  } = opts;
  if (!apiKey) {
    throw new MissingApiKeyError(
      "No Ollama API key. Copy `.env.local.example` to `.env.local`, set OLLAMA_API_KEY, " +
        "then restart the dev server (free key: https://ollama.com/settings/keys)."
    );
  }

  const promptOpts: PromptOptions = { questionsEnabled, quizMode, research };
  const payload = {
    model,
    messages: buildMessages(notesText, questionCount, promptOpts),
    stream: false,
    options: { temperature: 0.4 }, // low-ish: rigid format, decent variety
  };
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  let transientError: ApiError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await delay(RETRY_DELAY_MS);

    let response: Response;
    try {
      response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      transientError = new ApiError(
        "Could not reach Ollama Cloud (network error). Check your internet " +
          "connection and try again."
      );
      continue;
    }

    if (TRANSIENT_STATUS.has(response.status)) {
      transientError = apiStatusError(response.status, await response.text());
      continue;
    }
    if (response.status !== 200) {
      throw apiStatusError(response.status, await response.text());
    }

    const bodyText = await response.text();
    let data: {
      message?: { content?: string };
    };
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new ApiError(
        "Ollama Cloud returned a malformed (non-JSON) response. Try again."
      );
    }

    const content = (data?.message?.content ?? "").trim();
    if (!content) {
      throw new ModelResponseError("The model returned an empty response. Try again.");
    }

    const { pack, parsed } = parseStudyPack(content);
    return { raw: content, pack, parsed, model };
  }

  throw transientError ?? new ApiError("Request failed.");
}

/* ------------------------------------------------------- chat auto-title */

/** Clean the model's raw title reply: strip markdown/quotes/markers, keep
 *  one line, cap at 6 words and 60 characters at a word boundary. */
export function cleanTitle(raw: string): string {
  let t = (raw ?? "").replace(/\s+/g, " ").trim();
  t = t.replace(/^[#>*\-\s]+/, "");              // markdown/bullet prefixes
  t = t.replace(/^"?title"?\s*:\s*/i, "");       // "Title: ..." label
  t = t.replace(/["'`*_#]+/g, "");               // quotes + markdown chars
  t = t.replace(/[.,;:! ]+$/, "").trim();
  if (!t) return "";
  const words = t.split(" ").slice(0, 6);
  t = words.join(" ");
  if (t.length > 60) {
    t = t.slice(0, 60);
    const cut = t.lastIndexOf(" ");              // break at a word, not mid-word
    if (cut > 20) t = t.slice(0, cut);
    t = t.replace(/[.,;:! ]+$/, "");
  }
  return t;
}

/**
 * Name a chat from its opening notes via the SAME Ollama chat API the packs
 * use (one short call, ~1s; retried once on transient failures).
 */
export async function generateChatTitle(
  notesExcerpt: string,
  apiKey: string,
  opts: { model?: string; timeoutMs?: number; retries?: number } = {},
): Promise<string> {
  const {
    model = DEFAULT_MODEL,
    timeoutMs = 30_000,
    retries = 1,
  } = opts;
  if (!apiKey) {
    throw new MissingApiKeyError(
      "No Ollama API key. Copy `.env.local.example` to `.env.local`, set OLLAMA_API_KEY, " +
        "then restart the dev server (free key: https://ollama.com/settings/keys)."
    );
  }
  const { system, user } = buildTitlePrompt(notesExcerpt);
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    options: { temperature: 0.3 }, // titles want low-variance determinism
  };
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  let transientError: ApiError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await delay(RETRY_DELAY_MS);
    try {
      const response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (TRANSIENT_STATUS.has(response.status)) {
        transientError = apiStatusError(response.status, await response.text());
        continue;
      }
      if (response.status !== 200) {
        throw apiStatusError(response.status, await response.text());
      }
      const data = (await response.json()) as { message?: { content?: string } };
      const title = cleanTitle(data?.message?.content ?? "");
      if (!title) {
        throw new ModelResponseError("The model returned an empty title. Try again.");
      }
      return title;
    } catch (exc) {
      if (exc instanceof ApiError && !TRANSIENT_STATUS.has(exc.status ?? 0)) throw exc;
      if (exc instanceof ModelResponseError) throw exc;
      transientError = new ApiError(transientError?.message ??
        "Could not reach Ollama Cloud (network error). Check your internet connection and try again.");
    }
  }
  throw transientError ?? new ApiError("Request failed.");
}

/* ------------------------------------------------------- output files */
/** Save a study pack to output/ and return the absolute path. */
export async function saveStudyPack(raw: string, sourceName: string): Promise<string> {
  const outDir = path.join(process.cwd(), "output");
  await mkdir(outDir, { recursive: true });

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  const file = path.join(outDir, `${slugifyLocal(sourceName)}-${stamp}.md`);
  await writeFile(file, raw, "utf8");
  return file;
}

// Local copy avoids importing parser.ts just for the slug (same behaviour).
function slugifyLocal(name: string): string {
  return (
    (name || "notes")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "notes"
  );
}
