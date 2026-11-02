# **Smart Academic Notes Assistant**

Prompt Engineering Documentation — AI Tools & Prompt Engineering | Mini Project

**Aditya Kadam** · Roll No: 150096725122 · 2 November 2026

Live: https://synopsi-web.vercel.app/  ·  Repo: https://github.com/AdityaK9822/synopsi-web

## **Overview**

This document records the main prompts used to build the Smart Academic Notes Assistant, in development order. The app is a Next.js 16 (App Router, TypeScript, Tailwind v4) web app that turns messy lecture notes into a structured study pack — Summary → Key Concepts → Revision Questions — using `gemma4:31b` on Ollama Cloud (free tier, API key only). It adds interactive quiz mode, optional research/fact-check mode, PDF/OCR input, chat threads, account tiers with quotas and a Vercel deployment. Each entry below shows type, where used, purpose, the prompt text, the intent, and the outcome. Small repeated styling and wording revisions are omitted to keep the list in flow.

## **Prompt 1 — Initial Architecture and Core Study-Pack Workflow**

**Type:** Full-stack application build · **Used in:** initial development · **Purpose:** build the first notes-to-study-pack workflow.

**Full prompt text**

ROLE: senior full-stack developer for AI applications.

TASK: Build the Smart Academic Notes Assistant (Synopsi). Users paste lecture notes or upload `.txt`/`.md`/`.pdf` files and receive Summary, Key Concepts and Revision Questions.

FEATURES: call `gemma4:31b` on Ollama Cloud with a server-side key; system prompt (persona, fixed template, few-shot, grounding) plus a task message; validate and cap input at ~30,000 characters with a visible warning; chat-style UI with thread sidebar and auto-saved copies in `output/`; Questions toggle (5–20); local thread persistence with auto-naming after the first finished turn; clear offline demo mode clearly labelled as demo data.

RELIABILITY: keep `OLLAMA_API_KEY` server-side only; handle timeouts, quota, rate limits and failures with user-facing messages; keep partial history on failure; modular code (pipeline, prompts, parser separated).

DELIVERABLE: working app, local run steps, and remaining configuration.

**Thinking:** Define the product and the three-section contract before design details. Validation, limits and modular code make the first version usable, and offline demo support matters for an academic presentation.

**Outcome:** Foundational pipeline — paste/upload input, parsed study-pack rendering, chat UI, 30-char-cap validation, temperature 0.4 generation, auto-saved outputs.

## **Prompt 2 — Prompt-Engineering System and Output Contract**

**Type:** Prompt design · **Used in:** prompt-core stage · **Purpose:** make every run grounded and machine-parseable across modes.

**Full prompt text**

TASK: Build the prompt core in `lib/prompts.ts` using role prompting, an exact markdown template, a few-shot example, grounding guardrails, injection isolation, and output levelling.

REQUIREMENTS: fixed persona; exact template (`## Summary`, `## Key Concepts` table, then `## Revision Questions` or a mode replacement); embedded complete worked example (photosynthesis) with the note that its question count is overridden; answer only from notes, and state missing detail instead of inventing; wrap notes in `<<<<NOTES/NOTES>>>>` sentinels as data not instructions; enforce a recall/short-answer/applied mix (~1/3 each); assemble schema per request (questions off; quiz swaps Q&A for A–D + one correct letter; research appends a Fact-Check table with fixed verdicts plus Sources); bake the requested count; forbid output beyond the required sections.

VERIFY: `buildSystemPrompt`/`buildUserPrompt` keep one contract for every mode and `parseStudyPack` still renders it.

**Thinking:** The graded core is prompt engineering. A strict schema makes output render identically and parse into UI elements; grounding and isolation prevent invented or injected content; one shared contract keeps modes from drifting.

**Outcome:** `lib/prompts.ts` with `buildSystemPrompt`, `buildUserPrompt`, `buildTitlePrompt`, supporting all modes in one contract.

## **Prompt 3 — Multi-Format Input Pipeline and PDF OCR**

**Type:** Input-ingestion feature · **Used in:** file-input stage · **Purpose:** accept text/Markdown/PDF (incl. scans) alongside pasted text.

**Full prompt text**

TASK: Extend note input to accept `.txt`, `.md` and `.pdf` files — multiple at once and alongside pasted text — with server-side extraction.

REQUIREMENTS: validate uploads; reject empty/too-short notes; cap at 30,000 chars with a visible warning; convert PDFs to Markdown with a prebuilt tool preserving headings/lists/tables; use the text layer when present, otherwise render scanned pages and OCR them with Tesseract (no browser/external service); give distinct, actionable errors for locked, corrupt, image-only and OCR-empty PDFs; keep native OCR dependencies server-side.

RELIABILITY: bound OCR by page limit and wall-clock budget; skip a single bad page instead of failing the whole document; never invent text from an unreadable scan.

**Thinking:** A notes assistant needs real lecture material flowing in. Server-side extraction keeps heavy deps out of the browser; distinct errors turn cryptic failures into fixable messages; OCR bounds stop one bad file from hanging a request.

**Outcome:** `lib/pdf-markdown.ts` (text/scan/OCR paths with page and time bounds) feeding `lib/pipeline.ts` alongside pasted text.

## **Prompt 4 — Interactive Study Modes (Quiz and Research)**

**Type:** Feature composition · **Used in:** mode-expansion stage · **Purpose:** add quiz and research modes on the same contract.

**Full prompt text**

TASK: Compose two additive modes onto the study-pack prompt and UI.

QUIZ: swap Q&A for four-option MCQs with exactly one correct option; balanced, plausible, note-grounded, no longer than the correct by one sentence; spread correct letters over A–D (never same letter three in a row); render interactive quiz (pick, instant right/wrong feedback, running score, click-to-reveal for open questions).

RESEARCH: append Fact-Check table — claims from Summary/Key Concepts re-judged against notes as Supported / Partly supported / Not supported / Unclear, with the exact note fragment; end with Sources (3–8 numbered reference sites, always last); judge against notes only.

GENERAL: Questions off by default; count select 5–20; reuse one Ollama call and template so parsing still works.

**Thinking:** Reusing one schema keeps parsing, rendering and cost uniform. Active-recall quiz turns questions into practice; fact-check plus sources makes research mode auditable. Keeping questions off by default preserves a simple first-run pack.

**Outcome:** Interactive quiz with live scoring and click-to-reveal, plus research mode with a Fact-Check table and trailing Sources.

## **Prompt 5 — Chat History, Background Generation and Auto-Titling**

**Type:** State management · **Used in:** thread-workflow stage · **Purpose:** chat-like threads, background generation, self-naming chats.

**Full prompt text**

TASK: Implement chat-style threads over the notes assistant.

REQUIREMENTS: persist threads in localStorage (last 30), searchable by title, attached file, source filename; add a new thread to history immediately when a prompt is sent so generation can run in the background while the user navigates; scope chat state to the signed-in user and clear it on sign-out to avoid cross-account leakage; after a thread's first finished turn, call the same Ollama chat API with a sentinel-guarded prompt to produce a 2–6 word plain title, falling back to the source filename; clean the model's raw reply (remove markdown/quotes); use low variance (temperature ~0.3).

RELIABILITY: never let title generation block or replace the main pack; fall back gracefully on empty/unusable titles.

**Thinking:** Immediate history insertion makes background generation seamless. Titles need the same injection guards because notes flow into that shorter call. Scoping history to the account closes a critical user-data leak.

**Outcome:** Threaded UI with capped localStorage persistence, background-friendly generation, auto-titled chats with filename fallback.

## **Prompt 6 — Authentication, Tiers and Quota Gating**

**Type:** Auth and access control · **Used in:** account stage · **Purpose:** Firebase Google sign-in with tiered quotas.

**Full prompt text**

TASK: Implement tiered access for the study assistant.

TIERS: Guest — 3 generations/5 hours, no downloads; Logged-in (free) — 5 generations/5 hours, 3 downloads/5 hours, quiz/questions, no research; Premium — 100 generations/5 hours, unlimited downloads, full quiz with max questions, research mode.

REQUIREMENTS: Firebase Google sign-in session flow with a plan quota dialog; fail-closed gating beyond tier limits; mint a server session for guests so their first generation works and wipe guest history/quota on sign-out; refresh the quota meter after every credited generation and download; admin privilege for `asukathreads@gmail.com` with unlimited access; admin plan-flip helper and lint-clean scripts.

VERIFY: sign-in/out, quota exhaustion, guest-to-user switch, meter refresh across browser and server.

**Thinking:** Fail-closed gating keeps free limits trustworthy; separating guest and signed-in identity prevents history leaking between accounts; refreshing the meter removes the stale-quota bug.

**Outcome:** Firebase Google auth, server sessions, guest/premium quotas, metered downloads, admin access and admin CLI.

## **Prompt 7 — Repository Organisation and Vercel Deployment**

**Type:** Deployment and release · **Used in:** final stage · **Purpose:** publish the app while keeping local dev intact.

**Full prompt text**

TASK: Prepare the Smart Academic Notes Assistant for deployment.

REQUIREMENTS: organise/verify the repo; exclude API keys and service-account credentials from version control; configure Vercel env vars (Ollama key/model, Firebase public config, server-side service account); verify frontend pages and API routes in production (incl. PDF/OCR limits); resolve build/runtime compatibility issues before publishing; test generation, quiz, research, downloads and history on the deployed app; document local setup and deployment in the README.

FINAL CHECK: provide the live URL and list any manual configuration remaining.

**Thinking:** Deployment is not done when the build passes. Serverless behaviour, env vars and native deps differ from local dev, so verify end to end. Keeping secrets out of the repo is essential.

**Outcome:** Published on Vercel (`https://synopsi-web.vercel.app/`) and connected to GitHub (`AdityaK9822/synopsi-web`), with documented local setup.

## **Workflow Summary**

| Stage | Focus | Contribution |
|---|---|---|
| 1 | Core architecture | Notes-to-pack pipeline, model call, UI, demo mode |
| 2 | Prompt engineering | Locked schema, grounding, injection isolation |
| 3 | Input pipeline | Text/Markdown/PDF-to-Markdown with OCR |
| 4 | Study modes | Interactive quiz and auditable research mode |
| 5 | Chat history | Persistence, background generation, auto-titles |
| 6 | Access control | Tiers, quotas, metering, admin access |
| 7 | Deployment | Published and verified online |

## **End-to-End Workflow**

1. Input — paste notes or upload `.txt`/`.md`/`.pdf` (multiple, with pasted text).  
2. Validation — clean, min-length check, cap at 30,000 chars.  
3. Prompt assembly — per-mode system + task message (count, quiz, research).  
4. Generation — Ollama returns one pack at temp 0.4, retried once on transient errors.  
5. Rendering — parse Summary, Key Concepts, Questions, Fact-Check/Sources; render quiz.  
6. History — save turn, auto-title from opening notes, persist locally (account-scoped).  
7. Packaging — full pack + quiz-only downloads and an auto-saved `output/` copy.

## **Prompt-Engineering Techniques**

| Technique | Location / purpose |
|---|---|
| Role prompting | Fixed expert persona; stable tone. |
| Explicit output schema | Exact `##` headings/tables parse back into UI. |
| Few-shot example | Embedded photosynthesis example anchors format. |
| Grounding guardrails | Answer only from notes; state missing detail. |
| Injection isolation | `<<<<NOTES … NOTES>>>>`, treated as data. |
| Output levelling | Recall / short-answer / applied (~1/3 each). |
| Mode composition | Questions off, quiz A–D, research fact-check + sources. |
| Low temperature (0.4) | Rigid format with some question variety. |
| Graceful degrade | Unparseable output falls back to raw text. |

## **Conclusion**

The prompts above trace the assistant from its core notes-to-study-pack workflow through prompt engineering, input extraction, interactive modes, chat history, account tiers and cloud deployment. They record the essential decisions and the role of prompt engineering in shaping the final application.

Smart Academic Notes Assistant | Prompt Engineering Documentation