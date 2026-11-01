import { NextRequest, NextResponse } from "next/server";

import { slugify } from "@/lib/parser";
import { buildStudyPackPdf } from "@/lib/pdf";
import { gateErrorResponse, gateRequest } from "@/lib/server/gate";
import { assertWithinQuota, consumeTierUse } from "@/lib/server/usage";
import type { StudyPack } from "@/lib/types";

const isStudyPack = (x: unknown): x is StudyPack =>
  typeof x === "object" &&
  x !== null &&
  Array.isArray((x as StudyPack).summary) &&
  Array.isArray((x as StudyPack).keyConcepts) &&
  Array.isArray((x as StudyPack).questions);

/**
 * POST /api/export-pdf
 * Body: JSON { sourceName, model, pack } (the client sends back the pack it
 * already parsed — no model call involved).
 * Success: 200 application/pdf (inline, browser-native viewer).
 * Errors:  { error } with 400 (bad payload) or 500 (generator failed).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      sourceName?: unknown;
      model?: unknown;
      pack?: unknown;
    } | null;

    const pack = body?.pack;
    if (!isStudyPack(pack)) {
      return NextResponse.json(
        {
          error:
            "Bad request — expected a parsed study pack. Regenerate the notes, then try again.",
        },
        { status: 400 },
      );
    }

    /* Download gate — FAIL-CLOSED. Guests cannot export at all; free users
       get a monthly download quota; premium is unlimited. */
    let uid: string | null = null;
    let tier: "guest" | "free" | "premium" | null = null;
    let dlLimit: number | null = null;
    try {
      const gate = await gateRequest(req);
      tier = gate.tier;
      uid = gate.user.uid;
      dlLimit = gate.limits.downloadsPerMonth;
      if (tier === "guest" || dlLimit === 0) {
        return NextResponse.json(
          { error: "PDF export is locked for guest sessions — sign in to export (5 free downloads a month).", code: "downloads_locked" },
          { status: 403 },
        );
      }
      await assertWithinQuota(gate.user.uid, gate.tier, "dl");
    } catch (exc) {
      const gated = gateErrorResponse(exc, { status: 403, error: "Access denied." });
      if (gated) return NextResponse.json(gated, { status: gated.status });
      throw exc;
    }

    const sourceName = String(body?.sourceName ?? "notes");
    const model = String(body?.model ?? "");
    const bytes = await buildStudyPackPdf(sourceName, model, pack);
    const base = (slugify(sourceName) || "study-pack").slice(0, 60);

    // Count the download — success-path only.
    if (uid && tier === "free") {
      try {
        await consumeTierUse(uid, "dl");
      } catch (exc) {
        console.warn("[export-pdf] usage accounting failed:", exc);
      }
    }

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${base}-study-pack.pdf"`,
      },
    });
  } catch (exc) {
    console.error("[export-pdf] PDF build failed:", exc);
    return NextResponse.json(
      {
        error:
          "Could not build the PDF — nothing was lost. Try again; if it keeps failing, download the study pack as .md instead.",
      },
      { status: 500 },
    );
  }
}
