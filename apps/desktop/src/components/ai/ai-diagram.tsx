"use client";

/**
 * A diagram the assistant described in Mermaid: a flowchart, a cycle, a
 * timeline, a sequence of steps.
 *
 * Mermaid is large, so it is loaded only when an answer actually contains a
 * diagram. It runs with securityLevel "strict": labels are sanitised, HTML
 * labels and click handlers are off, so the SVG it returns carries no script.
 * A description Mermaid cannot read falls back to showing its text.
 *
 * On a phone a left-to-right flowchart is turned top-to-bottom, which fits the
 * screen, and nothing is shrunk below a readable size: a diagram still wider
 * than the screen scrolls sideways instead.
 *
 * This file is identical in the website, mobile and desktop apps.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const MAX_SOURCE = 5000;
const NARROW = 520;
/** Never scale a diagram below this fraction of its natural size. */
const MIN_SCALE = 0.7;

let setup: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!setup) {
    setup = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "inherit",
        themeVariables: {
          primaryColor: "#e8f1fa",
          primaryBorderColor: "#264d73",
          primaryTextColor: "#12314d",
          lineColor: "#475569",
          secondaryColor: "#fff7e0",
          tertiaryColor: "#f1f5f9",
          fontSize: "14px",
        },
        flowchart: { htmlLabels: false, curve: "basis" },
      });
      return mermaid;
    });
  }
  return setup;
}

/** A left-to-right flowchart reads better top-to-bottom on a narrow screen. */
function forWidth(source: string, width: number): string {
  if (width >= NARROW) return source;
  return source.replace(/^(\s*(?:flowchart|graph))\s+(LR|RL)\b/i, "$1 TD");
}

export function AiDiagram({ source }: { source: string }) {
  const id = `ai-diagram-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const box = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (source.length > MAX_SOURCE) {
      setFailed(true);
      return;
    }
    const width = box.current?.clientWidth ?? 600;
    loadMermaid()
      .then(async (mermaid) => {
        const text = forWidth(source, width);
        await mermaid.parse(text);
        const { svg: rendered } = await mermaid.render(id, text);
        if (active) setSvg(rendered);
      })
      .catch(() => {
        if (active) setFailed(true);
        // Mermaid leaves its error drawing in the document; remove it.
        document.getElementById(`d${id}`)?.remove();
      });
    return () => {
      active = false;
    };
  }, [id, source]);

  // Keep text readable: a wide diagram scrolls rather than shrinking to a smudge.
  useEffect(() => {
    const element = box.current?.querySelector("svg");
    if (!element || !box.current) return;
    const natural = Number(element.getAttribute("viewBox")?.split(/\s+/)[2]) || 0;
    if (natural > 0) {
      element.style.minWidth = `${Math.min(natural, natural * MIN_SCALE)}px`;
    }
  }, [svg]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-lg bg-primary/[0.06] p-3 font-mono text-[0.85em] leading-relaxed">{source}</pre>
    );
  }

  return (
    <div ref={box} className="min-w-0">
      {svg ? (
        <div
          className="ai-diagram overflow-x-auto rounded-xl border border-primary/10 bg-white p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          role="img"
          aria-label="Diagram"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-primary/10 bg-white p-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Drawing diagram...
        </div>
      )}
    </div>
  );
}
