import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import {
  ApiError,
  DEFAULT_MODEL,
  EmptyNotesError,
  generateStudyPack,
  MissingApiKeyError,
  ModelResponseError,
  decodeUpload,
  normaliseNotes,
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
    const contentType = req.headers.get("content-type") ?? "";
    let questionCount = 10;
    let quizMode = false;
    let research = false;
    let questionsEnabled = false;
    let notesText: string;
    let trimmed = false;
    let sourceName = "pasted-notes";
    let sources: string[] = [];

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

      const parts: string[] = [];
      for (const file of uploadFiles) {
        const data = new Uint8Array(await file.arrayBuffer());
        const decoded = await decodeUpload(file.name, data);
        parts.push(decoded.trim());
      }
      const pasted = String(form.get("text") ?? "").trim();
      sources = [...uploadFiles.map((f) => f.name)];
      if (pasted) {
        parts.push(pasted);
        sources.push("pasted text");
      }

      if (uploadFiles.length === 1) sourceName = uploadFiles[0].name;
      else if (uploadFiles.length > 1) sourceName = `${uploadFiles.length} attached files`;

      ({ text: notesText, trimmed } = normaliseNotes(parts.join("\n\n")));
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
    const status =
      exc instanceof MissingApiKeyError || exc instanceof EmptyNotesError
        ? 400
        : exc instanceof UnsupportedFileError
          ? 415
          : exc instanceof ApiError
            ? (exc.status ?? 502)
            : exc instanceof ModelResponseError
              ? 502
              : 500;
    const message =
      exc instanceof PipelineError
        ? exc.message
        : "Unexpected error — nothing was lost; please try again. If it repeats, " +
          "check your internet connection or the API key in .env.local.";
    return NextResponse.json({ error: message, status }, { status });
  }
}
