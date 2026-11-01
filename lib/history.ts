import type { StudyPack } from "@/lib/types";

/**
 * Local, backend-free chat history. Threads are snapshotted into
 * localStorage after every completed turn so the sidebar's history list
 * is real and searchable. Snapshots are intentionally conservative:
 * in-flight ("pending") turns and retry payloads (which hold File
 * objects) are dropped — a restored thread is readable and answerable
 * with a NEW send, never re-runnable with the old files.
 */

const KEY = "synopsi-history-v1";
export const MAX_SESSIONS = 30;

/* -------------------------------------------------------- persistence ctrl */

/**
 * Persistence mode, driven by the auth tier:
 *   "local"  — persist to localStorage (signed-in Google users)
 *   "none"   — in-memory only; a refresh is a clean slate (guests)
 * The mode is set from AuthProvider once the server-verified tier is
 * known; loaded history also disappears for guests (call clearIfNone).
 */
let persistenceMode: "none" | "local" = "none";

export function setHistoryPersistence(mode: "none" | "local"): void {
  persistenceMode = mode;
}

/* Snapshot message shapes (localStorage-safe, no File objects). */
export interface SnapshotUserMsg {
  kind: "user";
  files: { name: string; size: number }[];
  textChars: number | null;
}
export interface SnapshotErrorMsg {
  kind: "error";
  message: string;
}
export interface SnapshotDoneMsg {
  kind: "done";
  result: {
    raw: string;
    pack: StudyPack;
    parsed: boolean;
    model: string;
    savedPath: string | null;
    sourceName: string;
    sources?: string[];
    inputChars?: number;
    inputHash?: string;
    trimmed: boolean;
  };
  /** Mode state at send time, carried with the turn itself. */
  quizMode: boolean;
  researchUsed: boolean;
}
export type SnapshotMsg = SnapshotUserMsg | SnapshotErrorMsg | SnapshotDoneMsg;

export interface SessionSnapshot {
  id: string;
  title: string;
  /** True once the title was generated from the chat context via the Ollama
   *  API (the heuristic name is only a fallback and no longer applied). */
  named?: boolean;
  createdAt: number;
  updatedAt: number;
  messages: SnapshotMsg[];
}

/* ----------------------------------------------------------- storage I/O */

export function loadSessions(): SessionSnapshot[] {
  if (persistenceMode === "none") return []; // guests never reload history
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SessionSnapshot =>
        !!s && typeof s === "object" && "id" in s && "title" in s && "messages" in s,
    );
  } catch {
    return [];
  }
}

export function storeSessions(all: SessionSnapshot[]) {
  if (persistenceMode === "none") return; // guests: refresh wipes everything
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_SESSIONS)));
  } catch {
    /* private mode / full quota: history simply will not persist */
  }
}

/* --------------------------------------------------------- id + identity */

export function newSessionId(): string {
  try {
    if ("randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `s-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

/** Human title for the thread: the first finished pack's source name,
 *  then the first attachment, then the pasted-notes sentinel. */
export function deriveTitle(msgs: { kind: string; files?: SnapshotUserMsg["files"]; textChars?: unknown; result?: SnapshotDoneMsg["result"] }[]): string {
  for (const m of msgs) {
    if (m.kind === "done") return m.result?.sourceName || "Study pack";
  }
  for (const m of msgs) {
    if (m.kind === "user") {
      if (m.files?.[0]?.name) return m.files[0].name;
      if (m.textChars) return "Pasted notes";
    }
  }
  return "Pasted notes";
}
