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
import { setHistoryPersistence } from "@/lib/history";

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

/* Collapsible, resizable panel prefs. Defaults are SSR-safe (the first
   client render must match the server); persisted values apply after mount.
   v2: slimmer defaults (272/256) — the first pass was judged too wide. */
const UI_KEY = "synopsi-ui-v2";
const HISTORY_MIN = 240;
const HISTORY_MAX = 400;
const HISTORY_DEF = 272;
const OVERVIEW_MIN = 200;
const OVERVIEW_MAX = 320;
const OVERVIEW_DEF = 256;
/** Width of a collapsed panel's dock strip (the logo-on-the-edge row). */
const DOCK_W = 48;

interface UiPrefs {
  historyVisible: boolean;
  historyWidth: number;
  /** undefined = user never toggled it → let the breakpoint decide
      (expanded at xl+; docked below). Once toggled it persists. */
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

/** Overview variant: its reopen control is the dock button, which mounts on
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
  const [isLoading, setIsLoading] = useState(false);
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
  const sessionsRef = useRef<SessionSnapshot[]>([]);
  const dirty = useRef(false); // a send happened → the next terminal state saves

  /* Auto-naming via the same Ollama API: the first successful send in a
     thread stashes a notes excerpt here; the persistence effect consumes it
     (once) to fetch a context-generated title for the history list. */
  const pendingTitleRef = useRef<{ excerpt: string } | null>(null);
  const chatNamedRef = useRef(false);

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
      // xl+ (1280px), docked below — so the rail is always findable. It is
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
  const { tier, isGuest, loading } = useAuth();
  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (isGuest) {
      setHistoryPersistence("none");
      // Downgrade (or first visit): drop anything already kept in memory,
      // including history that outlived a signed-out session.
      setSessions([]);
      historyLoadedRef.current = false;
    } else {
      setHistoryPersistence("local");
      if (!historyLoadedRef.current) {
        historyLoadedRef.current = true;
        setSessions(loadSessions());
      }
    }
  }, [loading, isGuest]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    uiRef.current = ui;
  }, [ui]);

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
     visible, reopens it); the overview docks to a slim strip (DOCK_W) that
     stays findable at lg. Both animate via .side-anim: the shell slides,
     the inner .side-content keeps its fixed width (no rewrap) and fades.
     Toggles persist immediately; drag sizes persist on commit. All writers
     share uiRef as the source of truth, so the ⌘B binding reads fresh. */

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
    setPanelPrefs({ overviewVisible: nextVisible });
    if (!nextVisible) {
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
  useEffect(() => {
    if (!dirty.current) return;
    // Deferred a frame so the follow-up state updates don't run
    // synchronously inside the effect body.
    const raf = requestAnimationFrame(() => {
      if (messages.some((m) => m.role === "assistant" && m.status === "pending")) return;
      dirty.current = false;

      const snap = currentSnapshot(messages);
      if (snap.length === 0) return;

      const now = Date.now();
      const id = activeId ?? newSessionId();
      const createdAtFinal = sessionCreatedAt ?? now;

      const updated: SessionSnapshot[] = [
        {
          id,
          title: deriveTitle(snap),
          createdAt: createdAtFinal,
          updatedAt: now,
          messages: snap,
        },
        ...sessionsRef.current.filter((s) => s.id !== id),
      ].slice(0, MAX_SESSIONS);

      sessionsRef.current = updated;
      storeSessions(updated);
      setSessions(updated);

      if (activeId === null) setActiveId(id);
      if (sessionCreatedAt === null) setSessionCreatedAt(createdAtFinal);

      /* Name the chat after its first successful turn: one short call to
         the same Ollama chat API (/api/title). Heuristic title stays until
         it resolves; failures leave the heuristic name in place. The ref
         is consumed here so a chat is named at most once. */
      const row = updated.find((s) => s.id === id) as SessionSnapshot;
      const pending = pendingTitleRef.current;
      if (pending && !row.named) {
        pendingTitleRef.current = null;
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
            const stamped: SessionSnapshot = { ...row, title: named, named: true };
            const next = [stamped, ...sessionsRef.current.filter((x) => x.id !== id)].slice(
              0,
              MAX_SESSIONS,
            );
            sessionsRef.current = next;
            storeSessions(next);
            setSessions(next);
            chatNamedRef.current = true;
          })
          .catch(() => {
            /* nice-to-have only — the heuristic title already applies */
          });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, activeId, sessionCreatedAt]);

  function openSession(id: string) {
    const s = sessionsRef.current.find((x) => x.id === id);
    if (!s) return;
    setDrawerOpen(false);
    setShellEpoch((n) => n + 1); // hero↔thread bridge for the restored thread
    const msgs: ThreadMessage[] = s.messages.flatMap((sm): ThreadMessage[] => {
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
    dirty.current = false;
    pendingTitleRef.current = null;
    chatNamedRef.current = Boolean(s.named);
    setLocalError(null);
    setMessages(msgs);
    setActiveId(s.id);
    setSessionCreatedAt(s.createdAt);
  }

  function newChat() {
    dirty.current = false;
    pendingTitleRef.current = null;
    chatNamedRef.current = false;
    setDrawerOpen(false);
    setShellEpoch((n) => n + 1);
    setLocalError(null);
    setMessages([]);
    setActiveId(null);
    setSessionCreatedAt(null);
  }

  function deleteSession(id: string) {
    const updated = sessionsRef.current.filter((s) => s.id !== id);
    sessionsRef.current = updated;
    storeSessions(updated);
    setSessions(updated);
    if (id === activeId) {
      dirty.current = false;
      pendingTitleRef.current = null;
      chatNamedRef.current = false;
      setShellEpoch((n) => n + 1); // thread → hero bridge
      setMessages([]);
      setActiveId(null);
      setSessionCreatedAt(null);
    }
  }

  function clearHistory() {
    sessionsRef.current = [];
    storeSessions([]);
    setSessions([]);
    dirty.current = false;
    pendingTitleRef.current = null;
    chatNamedRef.current = false;
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
    // Mode state belongs to THIS turn: exports and the Sources block follow
    // the message they were generated with, not the page's live toggles.
    const turnQuiz = quizMode;
    const turnResearch = researchMode;
    // The title names the WHOLE chat, generated from the opening notes after
    // the first finished turn in this thread.
    const isFirstDone = !messages.some(
      (m) => m.role === "assistant" && m.status === "done",
    );

    /* Excerpt for chat auto-naming: pasted text first, else the first plain
       text file's content, else the file names themselves. */
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
    dirty.current = true;
    setIsLoading(true);

    /* The pasted text leaves the textarea the moment the prompt is sent —
       it lives on in the thread bubble; files stay attached until the run
       succeeds so a failed send keeps everything one retry away. */
    if (!input) setPastedState("");

    try {
      const form = new FormData();
      for (const f of useFiles) form.append("file", f);
      if (text) form.append("text", text);
      form.append("questionCount", String(questionCount));
      form.append("questions", String(questionsEnabled));
      form.append("quiz", String(quizMode));
      form.append("research", String(researchMode));

      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as
        | (ApiResult & { error?: string })
        | null;

      if (!res.ok) {
        setMessages((m) =>
          m.map((x) =>
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
        // Success clears the attachments; errors keep them so a retry resends exactly.
        if (!input) clearFiles();
        /* Queue the one-shot AI title for the history list: the same Ollama
           API names this chat from the opening notes once it has content. */
        if (isFirstDone && !chatNamedRef.current) {
          chatNamedRef.current = true; // one naming attempt per chat
          pendingTitleRef.current = { excerpt: titleExcerpt };
        }
        setMessages((m) =>
          m.map((x) =>
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
        );
      }
    } catch {
      setMessages((m) =>
        m.map((x) =>
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
      setIsLoading(false);
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

      {/* No border-r here: the overview rail carries its own border-l —
          two hairlines would stack at this edge. */}
      <main className="flex min-w-0 flex-1 flex-col bg-paper">
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

        <div className="shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 sm:px-6">
          <Composer
            text={pasted}
            files={files}
            busy={isLoading}
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

      {/* Overview rail (lg+): same shell vocabulary — collapsible (dock to
          a slim strip on the right) + resizable. First-run default: docked
          below 1280px, expanded above (mount resolves it once). Grows
          leftward: the splitter sits on its left edge. */}
      <aside
        id="synopsi-overview-panel"
        aria-label="Pack overview"
        className={cn(
          "side-anim relative hidden h-full shrink-0 overflow-hidden border-l border-line bg-paper lg:block",
          draggingPanel === "overview" && "no-motion",
        )}
        style={{ width: ui.overviewVisible ? ui.overviewWidth : DOCK_W }}
      >
        <div
          className={cn("side-content h-full", !ui.overviewVisible && "opacity-0")}
          style={{ width: ui.overviewWidth }}
          inert={!ui.overviewVisible || undefined}
        >
          <OverviewRail
            result={lastDone ? lastDone.result : null}
            researchUsed={lastDone?.researchUsed ?? false}
            quizMode={lastDone?.quizMode ?? false}
            onCollapse={toggleOverviewPanel}
          />
        </div>
        {ui.overviewVisible ? (
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
        ) : (
          <button
            id="synopsi-overview-dock"
            type="button"
            onClick={toggleOverviewPanel}
            title="Show pack overview"
            aria-label="Show pack overview panel"
            className="ui-enter absolute inset-y-0 right-0 z-10 grid w-12 place-items-center transition [transition-property:color] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <span className="grid size-9 place-items-center rounded-full border border-line bg-card text-accent">
              <Info className="size-4.5" aria-hidden="true" />
            </span>
          </button>
        )}
      </aside>

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
