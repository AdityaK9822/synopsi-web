"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  FileText,
  Info,
  List,
  ScanLine,
  TriangleAlert,
  X,
} from "lucide-react";

import Composer from "@/components/chat/Composer";
import ResultCard from "@/components/chat/ResultCard";
import TypingDots from "@/components/chat/TypingDots";
import TypewriterTagline from "@/components/chat/TypewriterTagline";
import AccountDialog from "@/components/shell/AccountDialog";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import HelpDialog from "@/components/shell/HelpDialog";
import SettingsDialog from "@/components/shell/SettingsDialog";
import IconRail from "@/components/shell/IconRail";
import HistoryPanel from "@/components/shell/HistoryPanel";
import OverviewRail from "@/components/shell/OverviewRail";
import TopBar from "@/components/shell/TopBar";
import Splitter from "@/components/shell/Splitter";
import { Logomark } from "@/components/brand/Logo";
import {
  deriveTitle,
  loadSessions,
  MAX_SESSIONS,
  newSessionId,
  storeSessions,
  type SessionSnapshot,
  type SnapshotMsg,
} from "@/lib/history";
import type { StudyPack } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

/* ------------------------------------------------------------------ types */

interface ApiResult {
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
}

/** What a send actually carries: pasted text, uploads or both together. */
interface RetryInput {
  text: string;
  files: File[];
}

interface UserFileInfo {
  name: string;
  size: number;
}

type ThreadMessage =
  | {
      id: number;
      role: "user";
      files: UserFileInfo[];
      textChars: number | null;
    }
  | {
      id: number;
      role: "assistant";
      status: "pending";
      startedAt: number;
      /** Mode state captured at send time so export + Sources follow the
       *  turn they belong to, not the page's current toggles. */
      quizMode: boolean;
      researchUsed: boolean;
    }
  | {
      id: number;
      role: "assistant";
      status: "error";
      message: string;
      retry: RetryInput | null;
    }
  | {
      id: number;
      role: "assistant";
      status: "done";
      result: ApiResult;
      quizMode: boolean;
      researchUsed: boolean;
    };

/* ---------------------------------------------------------- sub-components */

/** Live elapsed time for a pending generation (tabular digits; a paused-free
 *  caption carries the real information — the timer is informative only). */
function Elapsed({ startedAt }: { startedAt: number }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = window.setInterval(
      () => setS(Math.max(0, Math.round((Date.now() - startedAt) / 1000))),
      1000,
    );
    return () => window.clearInterval(t);
  }, [startedAt]);
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

const RETRY_CHIP =
  "mt-3 inline-flex h-9 items-center rounded-full border border-line bg-card px-3 text-sm font-medium text-ink transition [transition-property:background-color,border-color] hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none";

/** The hero's input-kind chips: a static inventory of what it accepts —
 *  informational (spans, not buttons), matching the tagline's keywords. */
const INPUT_KINDS = [
  { icon: Clipboard, label: "Pasted lectures" },
  { icon: FileText, label: "PDFs" },
  { icon: ScanLine, label: "Handwritten scans" },
  { icon: List, label: "Bullet points" },
] as const;

/* Collapsible + resizable panel prefs. Defaults are SSR-safe (the first
   client render must match the server); persisted values apply after mount.
   v3: a slimmer default history sidebar (244px) — v2's 272 still read wide. */
const UI_KEY = "synopsi-ui-v3";
const HISTORY_MIN = 208;
const HISTORY_MAX = 400;
const HISTORY_DEF = 244;
const OVERVIEW_MIN = 200;
const OVERVIEW_MAX = 320;
const OVERVIEW_DEF = 256;

interface UiPrefs {
  historyVisible: boolean;
  historyWidth: number;
  /** undefined = user never toggled it → the viewport decides at mount
      (expanded xl+, docked below). Toggles persist — and every finished
      generation reopens the panel at full expansion regardless of the
      last toggle. */
  overviewVisible: boolean | undefined;
  overviewWidth: number;
}

const DEFAULT_UI: UiPrefs = {
  historyVisible: true,
  historyWidth: HISTORY_DEF,
  overviewVisible: undefined,
  overviewWidth: OVERVIEW_DEF,
};

/** Read + validate stored panel prefs; anything malformed (user-edited
    files, partial writes, old versions) falls back to defaults. */
function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULT_UI;
    const p = JSON.parse(raw) as Partial<UiPrefs> | null;
    const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
    const width = (v: unknown, min: number, max: number, def: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(max, Math.max(min, Math.round(v)))
        : def;
    return {
      historyVisible: bool(p?.historyVisible) ?? true,
      historyWidth: width(p?.historyWidth, HISTORY_MIN, HISTORY_MAX, HISTORY_DEF),
      overviewVisible: bool(p?.overviewVisible),
      overviewWidth: width(p?.overviewWidth, OVERVIEW_MIN, OVERVIEW_MAX, OVERVIEW_DEF),
    };
  } catch {
    return DEFAULT_UI;
  }
}

/** Busy flag-free narrow write; private mode simply does not persist. */
function storeUiPrefs(next: UiPrefs) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(next));
  } catch {
    /* private mode: prefs simply will not persist */
  }
}

/** When a panel collapses while focus is inside it, hand focus to its
    always-mounted outside control (the icon rail's brand toggle). */
function moveFocusToToggle(panelId: string, toggleId: string) {
  const active = document.activeElement;
  const panel = document.getElementById(panelId);
  if (panel && active instanceof Node && panel.contains(active)) {
    document.getElementById(toggleId)?.focus();
  }
}

/** Overview variant: its reopen control is the Overview pill, which mounts on
    the NEXT commit, so focus moves a frame after the state flip lands. */
function moveFocusToDock(panelId: string, dockId: string) {
  const active = document.activeElement;
  const panel = document.getElementById(panelId);
  if (panel && active instanceof Node && panel.contains(active)) {
    requestAnimationFrame(() => document.getElementById(dockId)?.focus());
  }
}

/** ThreadMessage[] → localStorage-safe snapshot (pending turns dropped,
 *  retry payloads dropped). */
function currentSnapshot(msgs: ThreadMessage[]): SnapshotMsg[] {
  return msgs.flatMap((m): SnapshotMsg[] => {
    if (m.role === "user") {
      return [{ kind: "user", files: m.files, textChars: m.textChars }];
    }
    if (m.status === "done") {
      return [
        {
          kind: "done",
          result: m.result,
          quizMode: m.quizMode,
          researchUsed: m.researchUsed,
        },
      ];
    }
    if (m.status === "error") {
      return [{ kind: "error", message: m.message }];
    }
    return []; // pending: nothing finished yet — not snapshot-worthy
  });
}

/* ---------------------------------------------------------------- page */

/**
 * Page root: the auth provider wraps the entire app shell, so every
 * nested stripe (dialog, rail, composer, cards) can read the verified
 * tier. The shell itself lives in <HomeInner /> one level down —
 * a component cannot consume its own context, hence the split.
 */
/** Impure timestamp indirection that satisfies react-hooks/purity (direct calls to
 *  `Date.now()` inside a component body are flagged). */
function nowish() {
  return Date.now();
}

export default function Page() {
  return (
    <AuthProvider>
      <HomeInner />
    </AuthProvider>
  );
}

function HomeInner() {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [pasted, setPastedState] = useState("");
  const [files, setFilesState] = useState<File[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionsEnabled, setQuestionsEnabled] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  // Collapsible + resizable panel prefs (synopsi-ui-v1 above). uiRef is the
  // live copy drag handlers and the ⌘B shortcut read without resubscribing.
  const [ui, setUi] = useState<UiPrefs>(DEFAULT_UI);
  const uiRef = useRef(ui);
  const [draggingPanel, setDraggingPanel] = useState<"history" | "overview" | null>(
    null,
  );

  // Chat-history persistence (localStorage; see lib/history.ts).
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionCreatedAt, setSessionCreatedAt] = useState<number | null>(null);
  const ownerUidRef = useRef<string | null>(null);
  const sessionsRef = useRef<SessionSnapshot[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ThreadMessage[]>([]);
  // Threads left on screen while their generation keeps running in the
  // background: stash here so (a) the pending turn survives a chat switch
  // and (b) the finished result lands in the right place on resolve.
  const droppedThreadsRef = useRef(new Map<string, ThreadMessage[]>());
  /* In-flight runs, keyed by their assistant message id, so a chat can be
     deleted even mid-generation (abort) and so a generation survives
     switching away to another chat. */
  const runsRef = useRef(new Map<number, { threadKey: string; cancelled: boolean; controller: AbortController }>());
  const namedSetRef = useRef(new Set<string>()); // threads that queued a title
  const pendingTitleRef = useRef(new Map<string, { excerpt: string }>()); // per-thread
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const dirty = useRef(false);
  /* Auto-naming state lives in `pendingTitleRef`/`namedSetRef` above (now
     per-thread); the old scalar refs are no longer used. */

  // App chrome state.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  /** Bumped only when the thread content changes identity (open a session,
      new chat, delete-active, clear history) so the hero↔thread swap bridges
      once; never bumped on sends. */
  const [shellEpoch, setShellEpoch] = useState(0);

  const endRef = useRef<HTMLLIElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    // Deferred a frame: the one-time DOM/localStorage reads should not
    // setState synchronously inside the effect body.
    const raf = requestAnimationFrame(() => {
      setDark(document.documentElement.classList.contains("dark"));
      // NOTE: chat-history load is NOT here anymore — it is tier-driven
      // once the server has verified the identity below, so guests never
      // see unowned persisted history.
      // Persisted panel prefs apply here: still deferred (no setState in the
      // effect body), and only after the SSR-safe first paint. The unstored
      // overview default is resolved ONCE from the viewport — expanded at
      // xl+ (1280px), docked below — the panel itself only mounts once the
      // open chat has a finished pack (see the aside below). It is
      // written into uiRef/ui state but NOT stored: explicit toggles store.
      const prefs = loadUiPrefs();
      const wide = window.innerWidth >= 1280;
      const resolved: UiPrefs = {
        ...prefs,
        overviewVisible: prefs.overviewVisible ?? wide,
      };
      uiRef.current = resolved;
      setUi(resolved);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  /* History persistence is a TIER right, not a default: guests get an
     in-memory session only (refresh = clean slate), Google users get
     localStorage. Runs once the auth state has settled; the eventual
     check-in only reloads persisted history once. */
  const { user, tier, isGuest, loading } = useAuth();
  /* Owner-scoped persistence: never let one account see another's chats. */
  useEffect(() => {
    if (loading) return;
    const ownerId = !isGuest && user ? user.uid : null;
    // never allow results from another account's in-flight run to land here
    for (const e of runsRef.current.values()) {
      e.cancelled = true;
      try { e.controller.abort(); } catch { /* already aborted */ }
    }
    runsRef.current.clear();
    setBusyIds(new Set());
    droppedThreadsRef.current.clear();
    ownerUidRef.current = ownerId;
    // New account / guest session: clear what the previous account wrote to
    // the screen and load only that account's persisted chats.
    setMessages([]);
    setActiveId(null);
    setSessionCreatedAt(null);
    setSessions(loadSessions(ownerId));
  }, [loading, isGuest, user?.uid]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    uiRef.current = ui;
  }, [ui]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  function toggleDark() {
    const root = document.documentElement;
    // One-frame transition suppression so the flip does not smear.
    root.classList.add("no-theme-transition");
    const next = !dark;
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("snaw-theme", next ? "dark" : "light");
    } catch {
      /* private mode: theme simply will not persist */
    }
    setDark(next);
    requestAnimationFrame(() => root.classList.remove("no-theme-transition"));
  }

  /* ------------------------------------------------- panel show/width */
  /* History fully hides (width → 0; the icon rail's brand button, always
     visible, reopens it). The overview is chat-scoped — it mounts beside
     the chat only after a finished pack and, when collapsed, is replaced
     by a floating Overview pill (no dock strip). Both animate via
     .side-anim: the shell slides, the inner .side-content keeps its fixed
     width (no rewrap) and fades. Toggles persist immediately; drag sizes
     persist on commit. All writers share uiRef as the source of truth, so
     the ⌘B binding reads fresh. */

  const applyUi = useCallback((next: UiPrefs) => {
    uiRef.current = next;
    setUi(next);
  }, []);

  const setPanelPrefs = useCallback(
    (patch: Partial<UiPrefs>) => {
      const next = { ...uiRef.current, ...patch };
      uiRef.current = next;
      setUi(next);
      storeUiPrefs(next);
    },
    [],
  );

  const toggleHistoryPanel = useCallback(() => {
    const nextVisible = !uiRef.current.historyVisible;
    setPanelPrefs({ historyVisible: nextVisible });
    if (!nextVisible) {
      // Target: the icon rail's brand button (synopsi-history-toggle) —
      // always mounted where the panel exists, so focus moves immediately.
      moveFocusToToggle("synopsi-history-panel", "synopsi-history-toggle");
    }
  }, [setPanelPrefs]);

  const toggleOverviewPanel = useCallback(() => {
    const nextVisible = !uiRef.current.overviewVisible;
    if (nextVisible) {
      setPanelPrefs({ overviewVisible: true });
      // The pill unmounts in the same commit the panel mounts; a frame
      // later focus lands on the panel (tabIndex -1) so keyboard users
      // never drop focus mid-swap.
      requestAnimationFrame(() =>
        document.getElementById("synopsi-overview-panel")?.focus({ preventScroll: true }),
      );
    } else {
      setPanelPrefs({ overviewVisible: false });
      moveFocusToDock("synopsi-overview-panel", "synopsi-overview-dock");
    }
  }, [setPanelPrefs]);

  /* Attachments and pasted text now COEXIST: typing never clears files and
     attaching never clears text — they are combined on send. */
  function setPasted(value: string) {
    setPastedState(value);
  }

  /* Quiz mode implies Questions: switching Quiz on turns the Questions toggle
     on automatically; switching Questions off cannot leave a dangling Quiz
     mode (quiz output only exists inside the questions section). */
  function setQuestionsOn(value: boolean) {
    setQuestionsEnabled(value);
    if (!value) setQuizMode(false);
  }
  function setQuizOn(value: boolean) {
    setQuizMode(value);
    if (value) setQuestionsEnabled(true);
  }
  /** Append uploads, de-duplicating by name+size so re-picking the picker
   *  selection does not double the list. */
  function addFiles(incoming: File[]) {
    setFilesState((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }
  function removeFile(index: number) {
    setFilesState((prev) => prev.filter((_, i) => i !== index));
  }
  function clearFiles() {
    setFilesState([]);
  }

  // Chat convention: keep the newest content in view (bottom-anchored).
  useEffect(() => {
    if (messages.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" }),
    );
  }, [messages]);

  // Escape closes the history drawer (native <dialog> handles its own).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // ⌘/Ctrl+B toggles the history panel — lg+ only, where the panel exists;
  // below that history lives in the drawer. The binding installs once and
  // reads fresh state via uiRef inside the (stable) toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        if (!window.matchMedia("(min-width: 1024px)").matches) return;
        e.preventDefault();
        toggleHistoryPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleHistoryPanel]);

  /* ------------------------------------------------- history persistence */

  /** After every terminal turn (done or error), snapshot the thread into
   *  localStorage so the sidebar list is real and searchable. */
    /** Upsert a thread's row from its finished (terminal or live) turn state.
      Works for the on-screen thread and for background completions. */
  function commitThread(threadKey: string, snap: SnapshotMsg[]) {
    const now = nowish();
    const existing = sessionsRef.current.find((s) => s.id === threadKey);
    const createdAt = existing?.createdAt ?? now;
    const title = existing?.named ? existing.title : deriveTitle(snap);

    const row: SessionSnapshot = {
      id: threadKey,
      title,
      createdAt,
      updatedAt: now,
      named: existing?.named,
      messages: snap,
    };

    const updated = [
      row,
      ...sessionsRef.current.filter((s) => s.id !== threadKey),
    ].slice(0, MAX_SESSIONS);

    sessionsRef.current = updated;
    storeSessions(updated, ownerUidRef.current);
    setSessions(updated);

    const pending = pendingTitleRef.current.get(threadKey);
    if (pending && snap.some((m) => m.kind === "done") && !existing?.named) {
      pendingTitleRef.current.delete(threadKey);
      const capturedId = threadKey;
      void fetch("/api/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: pending.excerpt }),
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => null)) as
            | { title?: string }
            | null;
          const named =
            res.ok && typeof data?.title === "string" ? data.title.trim() : "";
          if (!named) return;
          const curr = sessionsRef.current.find((s) => s.id === capturedId);
          if (!curr) return;
          const stamped: SessionSnapshot = { ...curr, title: named, named: true };
          const next = [
            stamped,
            ...sessionsRef.current.filter((x) => x.id !== capturedId),
          ].slice(0, MAX_SESSIONS);
          sessionsRef.current = next;
          storeSessions(next, ownerUidRef.current);
          setSessions(next);
          namedSetRef.current.add(capturedId);
        })
        .catch(() => {
          /* nice-to-have only — the heuristic title already applies */
        });
    }
  }


  function openSession(id: string) {
    const s = sessionsRef.current.find((x) => x.id === id);
    if (!s) return;
    setDrawerOpen(false);
    // Never blow away a thread that's currently live (pending).
    if (id === activeId) return;
    // Stash the thread we are leaving so its in-flight generation (if any)
    // and recent view state survive the trip.
    if (activeId && messages.length > 0) {
      droppedThreadsRef.current.set(activeId, messages);
    }
    // Restore from the stashed live thread if we have one, otherwise from
    // the persisted snapshot (which drops pending).
    const stash = droppedThreadsRef.current.get(id);
    let restored: ThreadMessage[];
    if (stash) {
      droppedThreadsRef.current.delete(id);
      restored = stash;
    } else {
      restored = s.messages.flatMap((sm): ThreadMessage[] => {
      if (sm.kind === "user") {
        return [
          {
            id: nextId.current++,
            role: "user",
            files: sm.files,
            textChars: sm.textChars,
          },
        ];
      }
      if (sm.kind === "done") {
        return [
          {
            id: nextId.current++,
            role: "assistant",
            status: "done",
            result: sm.result,
            quizMode: sm.quizMode,
            researchUsed: sm.researchUsed,
          },
        ];
      }
      return [
        {
          id: nextId.current++,
          role: "assistant",
          status: "error",
          message: sm.message,
          retry: null, // File payloads are not restorable — new sends only
        },
      ];
      });
    }
    if (s.named) namedSetRef.current.add(s.id);
    setLocalError(null);
    setMessages(restored);
    setActiveId(s.id);
    setSessionCreatedAt(s.createdAt);
    setShellEpoch((n) => n + 1); // hero↔thread bridge for the restored thread
  }

  function newChat() {
    if (activeId && messages.length > 0) {
      droppedThreadsRef.current.set(activeId, messages);
    }
    setDrawerOpen(false);
    setShellEpoch((n) => n + 1);
    setLocalError(null);
    setMessages([]);
    setActiveId(null);
    setSessionCreatedAt(null);
  }

  function cancelRunFor(threadKey: string) {
    for (const [aid, entry] of runsRef.current) {
      if (entry.threadKey === threadKey) {
        entry.cancelled = true;
        try { entry.controller.abort(); } catch { /* already aborted */ }
        runsRef.current.delete(aid);
      }
    }
    setBusyIds((prev) => {
      const n = new Set(prev);
      n.delete(threadKey);
      return n;
    });
    droppedThreadsRef.current.delete(threadKey);
  }

  function deleteSession(id: string) {
    cancelRunFor(id);
    const updated = sessionsRef.current.filter((s) => s.id !== id);
    sessionsRef.current = updated;
    storeSessions(updated, ownerUidRef.current);
    setSessions(updated);
    if (id === activeId) {
      setShellEpoch((n) => n + 1); // thread → hero bridge
      setMessages([]);
      setActiveId(null);
      setSessionCreatedAt(null);
    }
  }

  function clearHistory() {
    for (const [aid] of runsRef.current) {
      const e = runsRef.current.get(aid);
      if (e) { e.cancelled = true; try { e.controller.abort(); } catch { } }
    }
    runsRef.current.clear();
    droppedThreadsRef.current.clear();
    setBusyIds(new Set());
    sessionsRef.current = [];
    storeSessions([], ownerUidRef.current);
    setSessions([]);
    setShellEpoch((n) => n + 1); // thread → hero bridge
    setMessages([]);
    setActiveId(null);
    setSessionCreatedAt(null);
  }


  /* ------------------------------------------------------------- sending */

  async function send(input?: RetryInput) {
    const text = (input ? input.text : pasted).trim();
    const useFiles = input ? input.files : files;
    if (!text && useFiles.length === 0) {
      setLocalError(
        "Add your notes first — paste text or attach a .txt, .md or .pdf file.",
      );
      return;
    }
    setLocalError(null);

    const userId = nextId.current++;
    const assistantId = nextId.current++;
    const retry: RetryInput = { text, files: useFiles };
    const turnQuiz = quizMode;
    const turnResearch = researchMode;
    const isFirstDone = !messages.some(
      (m) => m.role === "assistant" && m.status === "done",
    );

    const TITLE_EXCERPT_CHARS = 4_000;
    let titleExcerpt = text.slice(0, TITLE_EXCERPT_CHARS);
    if (!titleExcerpt) {
      const textFile = useFiles.find((f) =>
        /\.(txt|md|markdown|text)$/i.test(f.name),
      );
      if (textFile) {
        try {
          titleExcerpt = (await textFile.text()).slice(0, TITLE_EXCERPT_CHARS);
        } catch {
          /* unreadable file — fall through to the name-based excerpt */
        }
      }
      if (!titleExcerpt) titleExcerpt = useFiles.map((f) => f.name).join(", ");
    }

    // Materialise the chat identity NOW so the sidebar lists it during
    // generation; a brand-new chat appears in history the instant send runs.
    const currentActive = activeIdRef.current;
    const threadKey = currentActive ?? newSessionId();
    const isNewChat = currentActive === null;
    const now = nowish();

    const userSnapshot = {
      kind: "user" as const,
      files: useFiles.map((f) => ({ name: f.name, size: f.size })),
      textChars: text ? text.length : null,
    };
    const snapWithUser = [...currentSnapshot(messages), userSnapshot];
    const existingRow = sessionsRef.current.find((s) => s.id === threadKey);
    const createdAtFinal = existingRow?.createdAt ?? sessionCreatedAt ?? now;
    const sendRow: SessionSnapshot = {
      id: threadKey,
      title: existingRow?.named
        ? existingRow.title
        : deriveTitle(snapWithUser),
      createdAt: createdAtFinal,
      updatedAt: now,
      named: existingRow?.named,
      messages: snapWithUser,
    };
    const upsert = [
      sendRow,
      ...sessionsRef.current.filter((s) => s.id !== threadKey),
    ].slice(0, MAX_SESSIONS);
    sessionsRef.current = upsert;
    storeSessions(upsert, ownerUidRef.current);
    setSessions(upsert);

    if (isNewChat) {
      activeIdRef.current = threadKey;
      setActiveId(threadKey);
      setSessionCreatedAt(createdAtFinal);
    }

    setMessages((m) => [
      ...m,
      {
        id: userId,
        role: "user",
        files: useFiles.map((f) => ({ name: f.name, size: f.size })),
        textChars: text ? text.length : null,
      },
      {
        id: assistantId,
        role: "assistant",
        status: "pending",
        startedAt: Date.now(),
        quizMode: turnQuiz,
        researchUsed: turnResearch,
      },
    ]);

    setBusyIds((prev) => {
      const n = new Set(prev);
      n.add(threadKey);
      return n;
    });

    if (!input) setPastedState("");

    const controller = new AbortController();
    const runEntry = {
      threadKey,
      cancelled: false,
      controller,
    };
    runsRef.current.set(assistantId, runEntry);

    function resolveTurn(
      setter: (msgs: ThreadMessage[]) => ThreadMessage[],
      onSuccess?: () => void,
    ) {
      if (runEntry.cancelled) return;
      let next: ThreadMessage[];
      if (activeIdRef.current === threadKey) {
        next = setter(messagesRef.current);
        messagesRef.current = next;
        setMessages(next);
      } else {
        const stash = droppedThreadsRef.current.get(threadKey);
        if (!stash) return;
        next = setter(stash);
        droppedThreadsRef.current.set(threadKey, next);
      }
      commitThread(threadKey, currentSnapshot(next));
      if (onSuccess && activeIdRef.current === threadKey) onSuccess();
    }

    try {
      const form = new FormData();
      for (const f of useFiles) form.append("file", f);
      if (text) form.append("text", text);
      form.append("questionCount", String(questionCount));
      form.append("questions", String(questionsEnabled));
      form.append("quiz", String(quizMode));
      form.append("research", String(researchMode));

      const res = await fetch("/api/generate", { method: "POST", body: form, signal: controller.signal });
      const data = (await res.json().catch(() => null)) as
        | (ApiResult & { error?: string })
        | null;

      if (!res.ok) {
        resolveTurn((msgs) =>
          msgs.map((x) =>
            x.id === assistantId
              ? {
                  ...x,
                  status: "error" as const,
                  message:
                    data?.error ??
                    "Something went wrong. Check your connection and try again.",
                  retry,
                }
              : x,
          ),
        );
      } else {
        if (!input) clearFiles();
        if (isFirstDone && !namedSetRef.current.has(threadKey)) {
          namedSetRef.current.add(threadKey);
          pendingTitleRef.current.set(threadKey, { excerpt: titleExcerpt });
        }
        resolveTurn(
          (msgs) =>
            msgs.map((x) =>
              x.id === assistantId
                ? {
                    id: x.id,
                    role: "assistant" as const,
                    status: "done" as const,
                    result: data as ApiResult,
                    quizMode: turnQuiz,
                    researchUsed: turnResearch,
                  }
                : x,
            ),
          () => {
            // Auto-expand overview for the on-screen chat only.
            if (!uiRef.current.overviewVisible) {
              setPanelPrefs({ overviewVisible: true });
              if (document.activeElement?.id === "synopsi-overview-dock") {
                requestAnimationFrame(() =>
                  document.getElementById("synopsi-overview-panel")?.focus({
                    preventScroll: true,
                  }),
                );
              }
            }
          },
        );
      }
    } catch {
      if (runEntry.cancelled) return;
      resolveTurn((msgs) =>
        msgs.map((x) =>
          x.id === assistantId
            ? {
                ...x,
                status: "error" as const,
                message: "Could not reach the server — check your connection and try again.",
                retry,
              }
            : x,
        ),
      );
    } finally {
      runsRef.current.delete(assistantId);
      setBusyIds((prev) => {
        const n = new Set(prev);
        n.delete(threadKey);
        return n;
      });
    }
  }

  /* ------------------------------------------------------ derived values */

  const empty = messages.length === 0;

  const threadTitle = useMemo(() => {
    // AI-generated title first (set after the opening notes were processed);
    // the heuristic names remain until/unless that resolves.
    const active = activeId ? sessions.find((s) => s.id === activeId) : null;
    if (active?.named) return active.title;
    const snap = currentSnapshot(messages);
    return snap.length > 0 ? deriveTitle(snap) : null;
  }, [messages, activeId, sessions]);

  const lastDone = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && m.status === "done") return m;
    }
    return null;
  }, [messages]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Skip nav: the icon rail + top bar are the whole chrome; the notes
          input is where work starts. The composer renders in both branches,
          so #snaw-notes always exists. */}
      <a
        href="#snaw-notes"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to your notes
      </a>
      <IconRail
        onNewChat={newChat}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
        onToggleHistory={toggleHistoryPanel}
        historyOpen={ui.historyVisible}
        helpOpen={helpOpen}
        settingsOpen={settingsOpen}
      />

      {/* History panel (lg+): collapsible + resizable. The OUTER aside is
          the animated shell (.side-anim): it slides its width to 0 while
          hiding (fully hidden — reopen via the brand button in the icon
          rail); the inner content keeps a fixed width and fades so text
          never rewraps mid-flight, and is inert while hidden. */}
      <aside
        id="synopsi-history-panel"
        aria-label="Chat history"
        className={cn(
          "side-anim relative hidden h-full shrink-0 overflow-hidden border-r border-line bg-panel lg:block",
          draggingPanel === "history" && "no-motion",
        )}
        style={{ width: ui.historyVisible ? ui.historyWidth : 0 }}
        inert={!ui.historyVisible || undefined}
      >
        <div
          className={cn("side-content h-full", !ui.historyVisible && "opacity-0")}
          style={{ width: ui.historyWidth }}
        >
          <HistoryPanel
            sessions={sessions}
            activeId={activeId}
            generatingIds={Array.from(busyIds)}
            onSelect={openSession}
            onDelete={deleteSession}
            onCollapse={toggleHistoryPanel}
          />
        </div>
        {ui.historyVisible && (
          <Splitter
            value={ui.historyWidth}
            min={HISTORY_MIN}
            max={HISTORY_MAX}
            def={HISTORY_DEF}
            side="right"
            label="Resize chat history panel"
            controls="synopsi-history-panel"
            active={draggingPanel === "history"}
            onActiveChange={(v) => setDraggingPanel(v ? "history" : null)}
            onChange={(w) => applyUi({ ...uiRef.current, historyWidth: w })}
            onCommit={() => setPanelPrefs({})}
          />
        )}
      </aside>

      {/* One top bar, one cut: it starts right of the history sidebar and
          runs unbroken over the chat AND the overview rail — the overview
          lives on the row below the bar, not beside it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={threadTitle}
          createdAt={sessionCreatedAt}
          dark={dark}
          onToggleDark={toggleDark}
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenAccount={() => setAccountOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="relative flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col bg-paper">
            {empty ? (
              <div className="flex flex-1 items-center justify-center overflow-y-auto overscroll-contain">
                <div
                  key={`hero-${shellEpoch}`}
                  className="ui-enter mx-auto w-full max-w-3xl px-4 py-10 text-center sm:px-8"
                >
                  <Logomark className="mx-auto size-14" />
                  {/* Dynamic tagline: the leading sentence is static, the keyword is
                      typed/cycled — reduced-motion users get a plain fade-free swap. */}
                  <h1 className="mt-6 text-balance text-2xl font-bold tracking-tight sm:text-4xl">
                    <TypewriterTagline />
                  </h1>
                  <p className="mt-3 text-base leading-relaxed text-muted">
                    Summary, key concepts and revision questions — answered strictly
                    from your own notes.
                  </p>

                  {/* Supporting elements: the accepted-input inventory (static,
                      informational — no dead controls). */}
                  <ul
                    aria-label="Inputs you can feed it"
                    className="mx-auto mt-5 flex max-w-lg flex-wrap items-center justify-center gap-2"
                  >
                    {INPUT_KINDS.map((k) => (
                      <li
                        key={k.label}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-medium text-muted"
                      >
                        <k.icon className="size-4 text-accent" aria-hidden="true" />
                        {k.label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">or a mix of several</p>

                  <p className="mt-5 text-xs text-muted">
                    gemma4:31b via Ollama Cloud (free tier)
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Try the sample at{" "}
                    <code className="rounded border border-line bg-card px-1 font-mono text-[0.9em]">
                      sample_notes/sample_lecture.txt
                    </code>
                  </p>
                </div>
              </div>
            ) : (
              <div
                role="log"
                aria-label="Conversation"
                className="flex-1 overflow-y-auto overscroll-contain"
              >
                <div
                  key={`thread-${shellEpoch}`}
                  className="ui-enter mx-auto w-full max-w-3xl px-4 sm:px-8"
                >
                  <ol className="space-y-6 pb-6 pt-6">
                    {messages.map((m) =>
                      m.role === "user" ? (
                        <li key={m.id} className="ui-enter flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md border border-line bg-primary/10 px-4 py-2.5">
                            {m.files.map((f) => (
                              <p
                                key={f.name}
                                className="flex items-center gap-2 text-sm font-medium"
                              >
                                <FileText
                                  className="size-4 shrink-0 text-accent"
                                  aria-hidden="true"
                                />
                                <span className="truncate" title={f.name}>
                                  {f.name}
                                </span>
                                <span className="shrink-0 text-xs text-muted tabular-nums">
                                  {formatBytes(f.size)}
                                </span>
                              </p>
                            ))}
                            {m.textChars !== null && (
                              <p
                                className={
                                  m.files.length
                                    ? "mt-0.5 text-sm font-medium"
                                    : "text-sm font-medium"
                                }
                              >
                                Pasted notes
                              </p>
                            )}
                            {m.textChars !== null && (
                              <p className="mt-0.5 text-xs text-muted">
                                {new Intl.NumberFormat("en-US").format(m.textChars)}{" "}
                                characters
                              </p>
                            )}
                            {m.files.length > 1 && (
                              <p className="mt-0.5 text-xs text-muted">
                                {m.files.length} files
                              </p>
                            )}
                          </div>
                        </li>
                      ) : m.status === "pending" ? (
                        <li key={m.id} className="ui-enter flex items-center gap-3 py-1">
                          <TypingDots />
                          <div>
                            <p className="text-sm font-medium">Structuring your notes…</p>
                            <p className="mt-0.5 text-xs text-muted">
                              <Elapsed startedAt={m.startedAt} /> · can take up to two
                              minutes when the cloud is busy
                            </p>
                          </div>
                        </li>
                      ) : m.status === "error" ? (
                        <li key={m.id} className="ui-enter">
                          <div className="rounded-2xl border border-err/30 bg-err-bg px-4 py-3.5">
                            <p className="flex items-start gap-2.5 text-sm text-err">
                              <TriangleAlert
                                className="mt-0.5 size-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span>
                                <strong className="font-semibold">
                                  Could not generate a study pack.
                                </strong>{" "}
                                {m.message}
                              </span>
                            </p>
                            {m.retry && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (m.retry) void send(m.retry);
                                }}
                                className={RETRY_CHIP}
                              >
                                Try again
                              </button>
                            )}
                          </div>
                        </li>
                      ) : (
                        <li key={m.id} className="min-w-0">
                          <ResultCard
                            result={m.result}
                            quizMode={m.quizMode}
                            researchUsed={m.researchUsed}
                          />
                        </li>
                      ),
                    )}
                    <li ref={endRef} aria-hidden="true" />
                  </ol>
                </div>
              </div>
            )}

            {/* The composer keeps the conversation's measure (max-w-3xl, the
                same px-4/sm:px-8 gutters as the hero and thread) — its card
                edges line up with the widest message content instead of
                sprawling across the empty area beside the overview or on
                ultra-wide viewports. */}
            <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 sm:px-8">
              <Composer
                text={pasted}
                files={files}
                busy={messages.some((m)=>m.role==="assistant"&&m.status==="pending")}
                quizMode={quizMode}
                questionsEnabled={questionsEnabled}
                questionCount={questionCount}
                researchMode={researchMode}
                error={localError}
                onText={setPasted}
                onFiles={addFiles}
                onRemoveFile={removeFile}
                onQuizMode={setQuizOn}
                onQuestionsEnabled={setQuestionsOn}
                onQuestionCount={setQuestionCount}
                onResearchMode={setResearchMode}
                onSubmit={() => void send()}
              />
            </div>
          </main>

          {/* Overview rail (lg+): mounts beside the chat ONLY once the open
              chat has a finished pack — the hero never shows it, an errored
              chat keeps it away, and a new chat starts fresh with its own.
              Each finished generation reopens it at full expansion; when
              the user collapses it, the panel vanishes (no dock strip — a
              floating Overview pill takes its place at the chat's top
              right). Still resizable, growing leftward (splitter on its
              left edge). */}
          {lastDone && (
            <>
              {ui.overviewVisible && (
                <aside
                  id="synopsi-overview-panel"
                  aria-label="Pack overview"
                  tabIndex={-1}
                  className={cn(
                    "side-anim relative hidden h-full shrink-0 overflow-hidden border-l border-line bg-paper lg:block",
                    draggingPanel === "overview" && "no-motion",
                  )}
                  style={{ width: ui.overviewWidth }}
                >
                  <div
                    className="side-content h-full"
                    style={{ width: ui.overviewWidth }}
                  >
                    <OverviewRail
                      result={lastDone.result}
                      researchUsed={lastDone.researchUsed}
                      quizMode={lastDone.quizMode}
                      onCollapse={toggleOverviewPanel}
                    />
                  </div>
                  <Splitter
                    value={ui.overviewWidth}
                    min={OVERVIEW_MIN}
                    max={OVERVIEW_MAX}
                    def={OVERVIEW_DEF}
                    side="left"
                    label="Resize pack overview panel"
                    controls="synopsi-overview-panel"
                    active={draggingPanel === "overview"}
                    onActiveChange={(v) => setDraggingPanel(v ? "overview" : null)}
                    onChange={(w) => applyUi({ ...uiRef.current, overviewWidth: w })}
                    onCommit={() => setPanelPrefs({})}
                  />
                </aside>
              )}
              {!ui.overviewVisible && (
                <button
                  id="synopsi-overview-dock"
                  type="button"
                  onClick={toggleOverviewPanel}
                  title="Show pack overview"
                  className="absolute right-4 top-4 z-20 hidden items-center gap-2 rounded-full border border-line bg-card py-2 pl-3 pr-3.5 text-sm font-medium text-ink shadow-sm transition-[border-color] hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none lg:flex"
                >
                  <Info className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  Overview
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ----------------------------------------- history drawer (<lg) -------- */}
      {drawerOpen && (
        <>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close chat history"
            className="fixed inset-0 z-30 cursor-default bg-slate-950/45 lg:hidden"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chat history"
            className="dw-panel fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-line bg-panel shadow-xl lg:hidden"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-bold">Chat history</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close chat history"
                className="grid size-9 place-items-center rounded-full text-muted transition [transition-property:color,background-color] hover:text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
              >
                <X className="size-4.5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <HistoryPanel
                sessions={sessions}
                activeId={activeId}
                generatingIds={Array.from(busyIds)}
                onSelect={openSession}
                onNew={newChat}
                onDelete={deleteSession}
                autoFocusSearch
                searchId="synopsi-search-drawer"
              />
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------ in-app dialogs ------ */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dark={dark}
        onToggleDark={(next) => {
          if (next !== dark) toggleDark();
        }}
        onClearHistory={clearHistory}
        historyCount={sessions.length}
      />
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}
