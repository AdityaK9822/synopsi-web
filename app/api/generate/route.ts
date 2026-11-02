import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

/* PDF parsing (OCR included) runs native/WASM dependencies, so this route
   must stay on the Node runtime. A scanned document can take longer than the
   default budget: OCR is ~0.2 s/page once the engine is warm, plus ~8 s of
   worker start-up on a cold instance. (`runtime` is implicit under
   cacheComponents, which rejects the export.) */
export const maxDuration = 300;

import {
  ApiError,
  DEFAULT_MODEL,
  EmptyNotesError,
  generateStudyPack,
  MissingApiKeyError,
  ModelResponseError,
  decodeUpload,
  normaliseNotes,
  PdfError,
  PipelineError,
  saveStudyPack,
  UnsupportedFileError,
} from "@/lib/pipeline";
import { ForbiddenError, gateErrorResponse, gateRequest } from "@/lib/server/gate";
import { ADMIN_EMAILS } from "@/lib/plans";
import {
  assertWithinQuota,
  consumeTierUse,
} from "@/lib/server/usage";

const clampCount = (value: unknown): number => {
  const n = parseInt(String(value ?? "10"), 10);
  if (!Number.isFinite(n)) return 10;
  return Math.min(20, Math.max(5, n));
};

const truthy = (value: FormDataEntryValue | null): boolean => {
  const s = String(value ?? "").toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
};

const MAX_UPLOAD_FILES = 10;

/* Upload ceiling. Vercel's serverless functions reject request bodies over
   4.5 MB before this handler runs, so we refuse just under that there and
   give the user an actionable message instead of a platform 413. Locally
   (and on self-hosted Node) a higher cap keeps big lecture PDFs usable. */
const MB = 1024 * 1024;
const MAX_BODY_BYTES = process.env.VERCEL ? 4.5 * MB : 25 * MB;

/**
 * POST /api/generate
 * Body: JSON { text, questionCount, questions?, quiz?, research? }
 *    or multipart FormData { file (repeatable) and/or text, questionCount, questions?, quiz?, research? }
 * Multiple uploads and pasted text are combined: files in pick order first,
 * then the pasted text, separated by blank lines and small title markers.
 * Success: 200 { raw, pack, parsed, model, savedPath, sourceName, trimmed }
 * Errors:  { error, status } — messages are user-facing (ported from the CLI app).
 */
export async function POST(req: NextRequest) {
  try {
    // Fail fast on oversized bodies before the multipart parser buffers them.
    const declared = Number(req.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return NextResponse.json(
        {
          error:
            `That upload is too large — the limit is ${Math.round(MAX_BODY_BYTES / MB)} MB ` +
            "per request. Split the PDF into smaller parts, or paste the text instead.",
          code: "file_too_large",
          status: 413,
        },
        { status: 413 },
      );
    }

    const contentType = req.headers.get("content-type") ?? "";
    let questionCount = 10;
    let quizMode = false;
    let research = false;
    let questionsEnabled = false;
    let notesText = "";
    let trimmed = false;
    let sourceName = "pasted-notes";
    let sources: string[] = [];
    /* Uploads are decoded AFTER the access gate: PDF parsing may run OCR,
       and an unauthenticated request must not be able to spend that CPU. */
    let pendingFiles: File[] = [];
    let pendingText = "";

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      questionCount = clampCount(body?.questionCount);
      ({ text: notesText, trimmed } = normaliseNotes(String(body?.text ?? "")));
      questionsEnabled = Boolean(body?.questions);
      quizMode = Boolean(body?.quiz);
      research = Boolean(body?.research);
      sources = ["pasted text"];
    } else {
      const form = await req.formData();
      questionCount = clampCount(form.get("questionCount"));
      questionsEnabled = truthy(form.get("questions"));
      quizMode = truthy(form.get("quiz"));
      research = truthy(form.get("research"));

      const uploadFiles = form
        .getAll("file")
        .filter((f): f is File => f instanceof File)
        .slice(0, MAX_UPLOAD_FILES);

      pendingFiles = uploadFiles;
      pendingText = String(form.get("text") ?? "").trim();
      sources = uploadFiles.map((f) => f.name);
      if (pendingText) sources.push("pasted text");

      if (uploadFiles.length === 1) sourceName = uploadFiles[0].name;
      else if (uploadFiles.length > 1) sourceName = `${uploadFiles.length} attached files`;
    }

    const apiKey = process.env.OLLAMA_API_KEY ?? "";
    const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

    /* Access gate — FAIL-CLOSED. Every request is verified: guest (anonymous
       identity), free or premium, with the tier derived server-side. The
       old unsigned traffic is rejected outright, and a missing admin
       config locks the route (503) instead of widening access. */
    let gate: import("@/lib/server/gate").Gate | null = null;
    try {
      gate = await gateRequest(req);
      const isAdmin = Boolean(gate.user.email && ADMIN_EMAILS.includes(gate.user.email));
      if (!isAdmin) await assertWithinQuota(gate.user.uid, gate.tier, "gen");
      if (questionsEnabled && gate.limits.maxQuestions === 0) {
        throw new ForbiddenError(
          "Revision questions are not part of this tier — sign in (free) unlocks them.",
          "questions_locked",
        );
      }
      if (research && !gate.limits.research) {
        throw new ForbiddenError(
          "Fact-check (research mode) is a premium feature.",
          "premium_only",
        );
      }
      if (questionsEnabled && questionCount > gate.limits.maxQuestions) {
        return NextResponse.json(
          { error: `This tier caps revision questions at ${gate.limits.maxQuestions}. Lower the count or go premium.`, code: "plan_cap" },
          { status: 403 },
        );
      }
    } catch (exc) {
      const gated = gateErrorResponse(exc, { status: 403, error: "Access denied." });
      if (gated) return NextResponse.json(gated, { status: gated.status });
      throw exc;
    }

    /* Decode uploads now that the caller is known: PDF text extraction and
       OCR are the expensive part of the request. */
    if (pendingFiles.length > 0 || pendingText) {
      const parts: string[] = [];
      for (const file of pendingFiles) {
        const data = new Uint8Array(await file.arrayBuffer());
        try {
          parts.push((await decodeUpload(file.name, data)).trim());
        } catch (exc) {
          // Name the file that failed: with several attachments the generic
          // message leaves the user guessing which one to fix.
          if (exc instanceof PdfError) {
            throw new PdfError(exc.reason, `“${file.name}”: ${exc.message}`);
          }
          if (exc instanceof UnsupportedFileError) {
            throw new UnsupportedFileError(
              `“${file.name}” is not a supported file type. Use a .txt, .md or .pdf file.`,
            );
          }
          throw exc;
        }
      }
      if (pendingText) parts.push(pendingText);
      ({ text: notesText, trimmed } = normaliseNotes(parts.join("\n\n")));
    }

    const result = await generateStudyPack(notesText, questionCount, apiKey, {
      model,
      questionsEnabled,
      quizMode: quizMode && questionsEnabled,
      research,
    });

    /* Provenance fingerprint: sources + the exact notes text hash, echoed in
       the result card. Two visibly identical replies MUST carry the identical
       hash — which cleanly separates a stale UI from a fresh generation. */
    const inputChars = notesText.length;
    const inputHash = createHash("sha256").update(notesText).digest("hex").slice(0, 8);

    let savedPath: string | null = null;
    try {
      savedPath = await saveStudyPack(result.raw, sourceName);
    } catch {
      // auto-save is best-effort; the UI result still returns below
    }

    // Count the generation — success-path only, so failed runs stay free.
    if (gate) {
      const isAdmin = Boolean(gate.user.email && ADMIN_EMAILS.includes(gate.user.email));
      if (!isAdmin) {
        try {
          await consumeTierUse(gate.user.uid, "gen");
        } catch (exc) {
          console.warn("[generate] usage accounting failed:", exc);
        }
      }
    }

    return NextResponse.json({
      ...result,
      savedPath,
      sourceName,
      sources,
      inputChars,
      inputHash,
      trimmed,
    });
  } catch (exc) {
    let status = 500;
    if (exc instanceof MissingApiKeyError || exc instanceof EmptyNotesError) {
      status = 400;
    } else if (exc instanceof PdfError) {
      status = 422;
    } else if (exc instanceof UnsupportedFileError) {
      status = 415;
    } else if (exc instanceof ApiError) {
      status = exc.status ?? 502;
    } else if (exc instanceof ModelResponseError) {
      status = 502;
    }
    const message =
      exc instanceof PipelineError || exc instanceof PdfError
        ? exc.message
        : "Unexpected error — nothing was lost; please try again. If it repeats, " +
          "check your internet connection or the API key in .env.local.";
    return NextResponse.json({ error: message, status }, { status });
  }
}
