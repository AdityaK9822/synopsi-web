import { NextRequest, NextResponse } from "next/server";

import { slugify } from "@/lib/parser";
import { buildStudyPackPdf } from "@/lib/pdf";
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

    const sourceName = String(body?.sourceName ?? "notes");
    const model = String(body?.model ?? "");
    const bytes = await buildStudyPackPdf(sourceName, model, pack);
    const base = (slugify(sourceName) || "study-pack").slice(0, 60);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${base}-study-pack.pdf"`,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not build the PDF — nothing was lost. Try again; if it keeps failing, download the study pack as .md instead.",
      },
      { status: 500 },
    );
  }
}
