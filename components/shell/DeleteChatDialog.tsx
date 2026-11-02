"use client";

import DialogShell from "@/components/shell/DialogShell";

/**
 * Confirmation for deleting ONE saved chat. Deleting is a single click in
 * the history list and permanent (the pack is rewritten out of local and
 * remote storage), so the row arms this dialog instead of deleting.
 * Copy follows the settings panel's "clearing is permanent" idiom; the
 * danger surface is the only place `--err` fills a control here.
 */
export default function DeleteChatDialog({
  open,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** The chat's title, full length — the list may have clamped it. */
  title: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={`Delete “${title}”?`}
      subtitle="This removes the chat and its study pack from this device. It cannot be undone."
    >
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center rounded-full border border-line bg-paper px-3.5 text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9"
        >
          Keep chat
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex h-11 items-center rounded-full border border-err/40 bg-err-bg px-3.5 text-sm font-medium text-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none sm:h-9"
        >
          Delete chat
        </button>
      </div>
    </DialogShell>
  );
}
