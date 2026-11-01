/* Dependency-free icon set: lucide-style 24×24 viewBox, 1.5px strokes,
   currentColor. Every glyph renders decorative (aria-hidden) — accessible
   names live on the buttons and headings that use them. Seven glyphs only:
   no icon-library dependency for this. */

import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

type IconBaseProps = IconProps & { children: ReactNode };

function IconBase({ className, children }: IconBaseProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function SunIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </IconBase>
  );
}

export function MoonIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </IconBase>
  );
}

export function ArrowDownIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </IconBase>
  );
}

export function FileTextIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </IconBase>
  );
}

export function CheckCircleIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function HelpCircleIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function ArchiveIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </IconBase>
  );
}

export function SparklesIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m12 3 1.912 5.886L20 10.8l-5.886 1.912L12 18.6l-1.912-5.886L4 10.8l5.886-1.912Z" />
      <path d="m5 5 1.1 3.3L9 8.1l-3.3 1.1Z" />
      <path d="m17 17 1.1-3.3L21 15.9l-3.3-1.1Z" />
    </IconBase>
  );
}

export function LayoutGridIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
    </IconBase>
  );
}

export function ZapIcon({ className = "size-5" }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m13 2-8 6h6l-2 10 8-6h-6l2-10Z" />
    </IconBase>
  );
}

