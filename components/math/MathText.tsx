"use client";

import { useMemo } from "react";
import katex from "katex";

/** Renders plain text with inline LaTeX `$...$` (and `$$...$$` blocks)
 *  expanded to KaTeX HTML. Everything else is escaped first. */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    if (!text) return "";
    // Split on $$...$$ (block) and $...$ (inline), preserving delimiters.
    const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
    return parts
      .map((chunk) => {
        if (chunk.startsWith("$$") && chunk.endsWith("$$")) {
          try {
            return katex.renderToString(chunk.slice(2, -2).trim(), {
              displayMode: true,
              throwOnError: false,
            });
          } catch {
            return escapeHtml(chunk);
          }
        }
        if (chunk.startsWith("$") && chunk.endsWith("$") && chunk.length > 2) {
          try {
            return katex.renderToString(chunk.slice(1, -1).trim(), {
              displayMode: false,
              throwOnError: false,
            });
          } catch {
            return escapeHtml(chunk);
          }
        }
        return escapeHtml(chunk);
      })
      .join("");
  }, [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
