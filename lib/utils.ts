import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Conditional class lists, merged de-duplicated (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Trigger a client-side download of generated content. The anchor must be
 *  in the document for Safari, and the blob URL must outlive the click —
 *  revoking synchronously cancels the download. */
export function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Human-readable file size (KB/MB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Whole minutes until an ISO timestamp (never negative). Kept out of the
 *  component body so render stays pure (react-hooks/purity). */
export function minutesUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
}

/** Relative timestamp in the design's voice ("22 hours ago"). Only ever
 *  rendered client-side after mount — never during SSR — so it cannot
 *  cause a hydration mismatch. */
export function relativeTime(ts: number, now = Date.now()): string {
  const diffMin = Math.round((now - ts) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
