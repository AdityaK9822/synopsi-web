"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import HistoryPanel from "@/components/shell/HistoryPanel";
import type { SessionSnapshot } from "@/lib/history";

/**
 * Chat history for narrow viewports: a NATIVE <dialog> opened with
 * showModal(), which supplies the focus trap, Escape handling, the inert
 * background and focus restoration on close. Sliding in from the trigger
 * edge is `.drawer-dlg` in globals.css.
 *
 * Stays mounted: a closed dialog is display:none, so the panel keeps its
 * search text and scroll position between openings.
 */
export default function HistoryDrawer({
  open,
  onClose,
  sessions,
  activeId,
  generatingIds,
  onSelect,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  sessions: SessionSnapshot[];
  activeId: string | null;
  generatingIds: string[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      // Keyboard entry point: the search field, not the close button.
      requestAnimationFrame(() =>
        dlg.querySelector<HTMLInputElement>("input[type='search']")?.focus(),
      );
    }
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A backdrop click targets the dialog element itself; the content
        // fills the box, so anything else is an inside click.
        if (e.target === ref.current) onClose();
      }}
      aria-label="Chat history"
      className="drawer-dlg fixed inset-y-0 left-0 m-0 flex h-dvh max-h-none w-72 max-w-[85vw] flex-col border-r border-line bg-panel p-0 text-ink shadow-xl lg:hidden"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <p className="text-sm font-bold">Chat history</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat history"
          className="grid size-11 place-items-center rounded-full text-muted transition [transition-property:color,background-color] hover:bg-line/50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
        >
          <X className="size-4.5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <HistoryPanel
          sessions={sessions}
          activeId={activeId}
          generatingIds={generatingIds}
          onSelect={onSelect}
          onDelete={onDelete}
          searchId="synopsi-search-drawer"
        />
      </div>
    </dialog>
  );
}
