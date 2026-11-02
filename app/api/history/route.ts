import { NextRequest, NextResponse } from "next/server";
import { SessionSnapshot, type SnapshotMsg } from "@/lib/history";
import { gateRequest, gateErrorResponse } from "@/lib/server/gate";
import { adminDb } from "@/lib/server/firebase-admin";
import { MAX_SESSIONS } from "@/lib/history";

/** Server-authoritative history store: only signed-in (non-guest) users get
 *  a cloud-backed history. Guests are rejected (403) — their work lives
 *  only in memory, matching the tier spec. */
function sanitizeSessions(input: unknown): SessionSnapshot[] | null {
  if (!Array.isArray(input)) return null;
  const out: SessionSnapshot[] = [];
  for (const raw of input.slice(0, MAX_SESSIONS)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.title !== "string" || !Array.isArray(o.messages))
      continue;
    out.push({
      id: o.id,
      title: o.title,
      createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
      named: typeof o.named === "boolean" ? o.named : undefined,
      messages: o.messages as SnapshotMsg[],
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  let gate;
  try {
    gate = await gateRequest(req);
  } catch (exc) {
    const r = gateErrorResponse(exc, { status: 500, error: "History unavailable." });
    if (r) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
    return NextResponse.json({ error: "History unavailable." }, { status: 500 });
  }
  if (gate.user.provider === "anonymous") {
    return NextResponse.json({ error: "Guests have no cloud history.", code: "guest_no_history" }, { status: 403 });
  }
  try {
    const snap = await adminDb().collection("histories").doc(gate.user.uid).get();
    const sessions = snap.exists ? (snap.get("sessions") as unknown) : [];
    return NextResponse.json({ sessions: Array.isArray(sessions) ? sessions : [] });
  } catch {
    return NextResponse.json({ error: "History unavailable." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let gate;
  try {
    gate = await gateRequest(req);
  } catch (exc) {
    const r = gateErrorResponse(exc, { status: 500, error: "History unavailable." });
    if (r) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
    return NextResponse.json({ error: "History unavailable." }, { status: 500 });
  }
  if (gate.user.provider === "anonymous") {
    return NextResponse.json({ error: "Guests have no cloud history.", code: "guest_no_history" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const sessions = sanitizeSessions((body as { sessions?: unknown } | null)?.sessions);
  if (!sessions) {
    return NextResponse.json({ error: "sessions must be an array." }, { status: 400 });
  }
  try {
    await adminDb()
      .collection("histories")
      .doc(gate.user.uid)
      .set({ sessions, updatedAt: new Date() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save history." }, { status: 500 });
  }
}
