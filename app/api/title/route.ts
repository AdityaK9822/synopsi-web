import { NextRequest, NextResponse } from "next/server";

import {
  ApiError,
  DEFAULT_MODEL,
  generateChatTitle,
  MissingApiKeyError,
  ModelResponseError,
  PipelineError,
} from "@/lib/pipeline";
import { ForbiddenError, gateErrorResponse, gateRequest, UnauthorizedError } from "@/lib/server/gate";

const MAX_TITLE_NOTES = 4_000; // the title only needs the opening context

/**
 * POST /api/title
 * Body: { notes: string } — an excerpt of the chat's opening notes.
 * Returns 200 { title } (AI-named via the same Ollama chat API as /api/generate)
 * or a client-facing { error } so the UI keeps its heuristic title.
 *
 * Access: any signed-in non-guest session. Guests skip AI naming entirely
 * (this endpoint would otherwise be an unlimited Ollama bypass) — the UI
 * falls back to its deterministic heuristic title.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await gateRequest(req);
    if (gate.tier === "guest") {
      throw new ForbiddenError("AI chat naming is not part of guest sessions.", "guest_locked");
    }

    const body = await req.json().catch(() => null);
    const notes = String(body?.notes ?? "").trim();
    if (notes.length < 8) {
      return NextResponse.json(
        { error: "Nothing to name yet — send some notes first." },
        { status: 400 },
      );
    }

    const apiKey = process.env.OLLAMA_API_KEY ?? "";
    const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
    const title = await generateChatTitle(
      notes.slice(0, MAX_TITLE_NOTES),
      apiKey,
      { model },
    );
    return NextResponse.json({ title });
  } catch (exc) {
    const gated = gateErrorResponse(exc, { status: 500, error: "access denied" });
    if (gated) return NextResponse.json(gated, { status: gated.status });
    const status =
      exc instanceof MissingApiKeyError
        ? 400
        : exc instanceof ApiError
          ? (exc.status ?? 502)
          : exc instanceof ModelResponseError
            ? 502
            : 500;
    const message =
      exc instanceof PipelineError
        ? exc.message
        : exc instanceof UnauthorizedError || exc instanceof ForbiddenError
          ? exc.message
          : "Unexpected error while naming the chat — the default title stays.";
    return NextResponse.json({ error: message, status }, { status });
  }
}
