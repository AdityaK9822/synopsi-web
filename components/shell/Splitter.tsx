"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Keyboard- and pointer-operable panel splitter (the ARIA "separator"
 * pattern). The panel EXTERIOR owns show/hide; this control owns width:
 *
 * Pointer — press and drag horizontally; the width follows the pointer 1:1
 *   with transitions disabled (direct manipulation must never lag), and a
 *   double-click resets to the default width.
 * Keyboard — Left/Right step ±24px (Shift = fine ±8px, per-edge direction),
 *   Home/End jump to min/max; focus ring + value are announced by the
 *   platform through role="separator" + aria-values.
 *
 * This is an enhancement control: skipping it in a_tab order costs nothing.
 */
export default function Splitter({
  value,
  min,
  max,
  def,
  side,
  label,
  controls,
  active,
  onActiveChange,
  onChange,
  onCommit,
  onReset,
}: {
  /** Current panel width (px). */
  value: number;
  min: number;
  max: number;
  /** Double-click reset target (px). */
  def: number;
  /** Which edge of the panel the splitter sits on. */
  side: "left" | "right";
  label: string;
  /** id of the resizable panel (aria-controls). */
  controls: string;
  /** True while a pointer drag is live (parent may disable transitions). */
  active: boolean;
  onActiveChange: (dragging: boolean) => void;
  /** Live width updates during drag / per keypress (no persistence). */
  onChange: (width: number) => void;
  /** Called after a drag ends (persist the settled value). */
  onCommit: () => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    // Direct manipulation: the rest of the page must not select text or
    // show a text cursor while the pointer drags the edge.
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [active]);

  const clamped = (w: number) => Math.min(max, Math.max(min, Math.round(w)));

  function commit(w: number) {
    onChange(clamped(w));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault(); // no text selection during the drag
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startWidth: value };
        onActiveChange(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current || e.buttons !== 1) return;
        // "right" splitter grows the panel on a rightward drag; "left" on a
        // leftward one. Magnitude always maps 1:1 to the pointer.
        const delta =
          side === "right" ? e.clientX - drag.current.startX : drag.current.startX - e.clientX;
        commit(drag.current.startWidth + delta);
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        drag.current = null;
        onActiveChange(false);
        onCommit();
      }}
      onLostPointerCapture={() => {
        if (!drag.current) return;
        drag.current = null;
        onActiveChange(false);
        onCommit();
      }}
      onDoubleClick={() => onReset()}
      onKeyDown={(e) => {
        const grow = side === "right" ? "ArrowRight" : "ArrowLeft";
        const shrink = side === "right" ? "ArrowLeft" : "ArrowRight";
        const step = e.shiftKey ? 8 : 24;
        let next: number | null = null;
        if (e.key === grow) next = value + step;
        else if (e.key === shrink) next = value - step;
        else if (e.key === "Home") next = min;
        else if (e.key === "End") next = max;
        if (next === null) return;
        e.preventDefault();
        commit(next);
        onCommit(); // keyboard edits settle immediately → persist
      }}
      className={cn(
        // 8px hit strip at the panel edge (44px+ tall): invisible at rest,
        // a hairline grip on hover, accent line while dragging/focused.
        "absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-line/40 focus-visible:bg-line/40 focus-visible:outline-none",
        side === "right" ? "right-0" : "left-0",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 h-14 w-0.5 -translate-y-1/2 rounded-full transition-colors",
          side === "right" ? "right-0.5" : "left-0.5",
          active
            ? "bg-accent"
            : "bg-line-strong opacity-0 group-hover:opacity-0 peer-hover:opacity-0", // keeps the rest state hairline-free
        )}
      />
    </div>
  );
}
