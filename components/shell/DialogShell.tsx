"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Thin wrapper around the NATIVE <dialog> element: Escape/cancel,
 * focus trapping and the modal layer already exist in the platform, so
 * the shell only owns open state, the backdrop click and the visual
 * chrome. Motion lives in the `.dlg` CSS block (fade + rise ~160ms).
 */
export default function DialogShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Click on the element itself == outside the content box == backdrop.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dlg-title"
      className={cn(
        "dlg m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-card p-6 text-ink shadow-xl",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="dlg-title" className="text-lg font-bold tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          autoFocus={open}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-[color,background-color] hover:text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:motion-safe:active:scale-[0.96] motion-reduce:transition-none"
        >
          <X className="size-4.5" aria-hidden="true" />
        </button>
      </div>
      <div className={cn(subtitle && "mt-5")}>{children}</div>
    </dialog>
  );
}
