"use client";

import DialogShell from "@/components/shell/DialogShell";

const KBD =
  "rounded-md border border-line bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink";

/**
 * "How it works" — the lightweight support surface (the Figma reference
 * has a "?" FAB; here it's a TopBar help button opening this dialog).
 * Static, factual content only: shortcuts, accepted inputs, modes.
 */
export default function HelpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <DialogShell open={open} onClose={onClose} title="How it Works" subtitle="Everything you can do in Synopsi.">
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-muted">
        <section aria-label="Keyboard shortcuts">
          <h3 className="font-semibold text-ink">Keyboard</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            <li className="flex items-center gap-2">
              <kbd className={KBD}>Enter</kbd> send
            </li>
            <li className="flex items-center gap-2">
              <kbd className={KBD}>Shift + Enter</kbd> new line
            </li>
            <li className="flex items-center gap-2">
              <kbd className={KBD}>⌘ / Ctrl</kbd>
              <kbd className={KBD}>B</kbd>
              show / hide the chat-history panel
            </li>
          </ul>
        </section>
        <section aria-label="Accepted inputs">
          <h3 className="font-semibold text-ink">Inputs it understands</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            <li>Pasted text — lecture notes, transcripts, messiness welcome</li>
            <li>
              Files: <code className="font-mono text-xs text-ink">.pdf</code>{" "}
              <code className="font-mono text-xs text-ink">.txt</code>{" "}
              <code className="font-mono text-xs text-ink">.md</code> — attach several, they combine
            </li>
            <li>
              Sample: <code className="font-mono text-xs text-ink">sample_notes/sample_lecture.txt</code>
            </li>
          </ul>
        </section>
        <section aria-label="Modes">
          <h3 className="font-semibold text-ink">Modes</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            <li>
              <strong className="font-semibold text-ink">Questions</strong> — revision questions with a count
            </li>
            <li>
              <strong className="font-semibold text-ink">Quiz mode</strong> — same questions as multiple choice you can answer in the pack
            </li>
            <li>
              <strong className="font-semibold text-ink">Research</strong> — fact-checks the notes and lists the sources it used
            </li>
          </ul>
        </section>
      </div>
    </DialogShell>
  );
}
