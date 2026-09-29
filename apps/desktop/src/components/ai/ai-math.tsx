"use client";

/**
 * Mathematics in an AI answer, typeset by KaTeX.
 *
 * KaTeX builds its own markup from the TeX it is given and escapes every piece
 * of text, so its output is safe to place on the page. `trust: false` keeps
 * commands like \href and \includegraphics switched off, and the size and
 * expansion limits stop a runaway expression from freezing the chat. A formula
 * KaTeX cannot read is shown in red as the TeX itself, never as a blank.
 *
 * This file is identical in the website, mobile and desktop apps.
 */

import { useMemo } from "react";
import katex from "katex";

import { cn } from "@/lib/utils";

function typeset(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    maxSize: 20,
    maxExpand: 500,
    output: "htmlAndMathml",
  });
}

export function InlineMath({ tex }: { tex: string }) {
  const html = useMemo(() => typeset(tex, false), [tex]);
  return <span className="ai-math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function DisplayMath({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => typeset(tex, true), [tex]);
  return (
    <div
      className={cn(
        "ai-math-display -mx-1 overflow-x-auto overflow-y-hidden px-1 py-0.5 text-[1.05em] [&_.katex-display]:my-1",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
