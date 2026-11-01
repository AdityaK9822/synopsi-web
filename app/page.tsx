"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  FileText,
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
import { AuthProvider } from "@/components/auth/AuthProvider";
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

/* Collapsible, resizable panel prefs. Defaults are SSR-safe (the first
   client render must match the server); persisted values apply after mount. */
const UI_KEY = "synopsi-ui-v1";
const HISTORY_MIN = 240;
const HISTORY_MAX = 440;
const HISTORY_DEF = 320;
const OVERVIEW_MIN = 240;
const OVERVIEW_MAX = 400;
const OVERVIEW_DEF = 288;

interface UiPrefs {
  historyVisible: boolean;
  historyWidth: number;
  overviewVisible: boolean;
  overviewWidth: number;
}

const DEFAULT_UI: UiPrefs = {
  historyVisible: true,
  historyWidth: HISTORY_DEF,
  overviewVisible: true,
  overviewWidth: OVERVIEW_DEF,
};

/** Read + validate stored panel prefs; anything malformed (user-edited
    files, partial writes, old versions) falls back to defaults. */
function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULT_UI;
    const p = JSON.parse(raw) as Partial<UiPrefs> | null;
    const width = (v: unknown, min: number, max: number, def: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(max, Math.max(min, Math.round(v)))
        : def;
    return {
      historyVisible:
        typeof p?.historyVisible === "boolean" ? p.historyVisible : true,
      historyWidth: width(p?.historyWidth, HISTORY_MIN, HISTORY_MAX, HISTORY_DEF),
      overviewVisible:
        typeof p?.overviewVisible === "boolean" ? p.overviewVisible : true,
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

/** When a panel hides while focus is inside it, hand focus to the panel's
    disclosure toggle (stable ids kept on the TopBar buttons + asides). */
function moveFocusToToggle(panelId: string, toggleId: string) {
  const active = document.activeElement;
  const panel = document.getElementById(panelId);
  if (panel && active instanceof Node && panel.contains(active)) {
    document.getElementById(toggleId)?.focus();
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

export default function Page() {
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
      setSessions(loadSessions());
      // Persisted panel prefs apply here: still deferred (no setState in the
      // effect body), and only after the SSR-safe first paint.
      const prefs = loadUiPrefs();
      uiRef.current = prefs;
      setUi(prefs);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

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

  /* ------------------------------------------------ panel show/width */
  /* The outer <aside> shells animate width (see .side-anim in globals.css)
     and go inert while hidden; the inner .side-content keeps its fixed
     width so text never rewraps mid-flight. Toggles persist immediately;
     drag sizes persist on commit. All writers share uiRef as the source
     of truth, so a keyboard binding installed once reads fresh values. */

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
      moveFocusToToggle("synopsi-history-panel", "synopsi-history-toggle");
    }
  }, [setPanelPrefs]);

  const toggleOverviewPanel = useCallback(() => {
    const nextVisible = !uiRef.current.overviewVisible;
    setPanelPrefs({ overviewVisible: nextVisible });
    if (!nextVisible) {
      moveFocusToToggle("synopsi-overview-panel", "synopsi-overview-toggle");
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
    <AuthProvider>
    <div className="flex h-dvh overflow-hidden">
      <IconRail
        onNewChat={newChat}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
        helpOpen={helpOpen}
        settingsOpen={settingsOpen}
      />

      <aside className="hidden w-80 shrink-0 border-r border-line bg-panel lg:block">
        <HistoryPanel
          sessions={sessions}
          activeId={activeId}
          onSelect={openSession}
          onNew={newChat}
          onDelete={deleteSession}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col border-r border-line bg-paper">
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
            <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center sm:px-8">
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
              <p className="mt-2 text-xs text-faint">or a mix of several</p>

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
            <div className="mx-auto w-full max-w-3xl px-4 sm:px-8">
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

      <OverviewRail
        result={lastDone ? lastDone.result : null}
        researchUsed={lastDone?.researchUsed ?? false}
        quizMode={lastDone?.quizMode ?? false}
      />

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
            className="dw-panel fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] flex-col border-r border-line bg-panel shadow-xl lg:hidden"
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
    </AuthProvider>
  );
}
