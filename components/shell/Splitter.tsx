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
 * Keyboard — the panel edge grows/shrinks with Left/Right (±24px, Shift for
 *   a fine 8px step, direction-aware per edge), Home/End jump to min/max.
 *
 * Focus is indicated by the accent rail that lights along the panel edge
 * (the strip itself is too thin to carry a ring); this is an enhancement
 * control, so skipping it costs nothing.
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
  /** True while a pointer drag is live (parent disables transitions). */
  active: boolean;
  onActiveChange: (dragging: boolean) => void;
  /** Live width updates during drag / per keypress (no persistence). */
  onChange: (width: number) => void;
  /** Called when a drag ends / a keyboard edit settles (persist). */
  onCommit: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    // Direct manipulation: the page must not select text or show a text
    // cursor while the pointer drags the edge.
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

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${value} pixels wide`}
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
        onChange(clamped(drag.current.startWidth + delta));
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
      onDoubleClick={() => {
        onChange(def);
        onCommit();
      }}
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
        onChange(clamped(next));
        onCommit(); // keyboard edits settle immediately → persist
      }}
      className={cn(
        // 8px hit strip at the panel edge (full height): transparent at
        // rest, a faint tint on hover/keyboard focus; the accent rail
        // lighting up on the panel edge is the focus + drag indicator.
        "group absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-line/40 focus-visible:bg-line/40 focus-visible:outline-none",
        side === "right" ? "right-0" : "left-0",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 w-px transition-colors",
          side === "right" ? "right-0" : "left-0",
          "bg-transparent group-hover:bg-line-strong group-focus-visible:bg-accent group-active:bg-accent",
        )}
      />
    </div>
  );
}
