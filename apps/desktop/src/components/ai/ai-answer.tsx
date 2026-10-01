"use client";

/**
 * An AI answer, laid out like a lesson rather than a block of text.
 *
 * The assistant is asked to structure what it says: a short answer to a short
 * question; for a harder one, headings for each step, mathematics on its own
 * lines, a table where a comparison helps, a graph or a diagram where a picture
 * explains better than words. This is the other half of that: the structure it
 * writes arrives as structure. Headings look like headings, mathematics is
 * typeset, tables are tables, graphs and diagrams are drawn, and nothing on
 * screen is a markdown or LaTeX character.
 *
 * `tone="inverted"` is for the panels that put an answer on the brand colour,
 * where borders and shaded blocks have to come from white rather than ink.
 *
 * This file is identical in the website, mobile and desktop apps.
 */

import "katex/dist/katex.min.css";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Info, KeyRound, Lightbulb, NotebookPen, Star } from "lucide-react";

import { parseAiAnswer, type AiBlock, type AiSpan, type CalloutVariant } from "@/lib/ai-format";
import { cn } from "@/lib/utils";
import { AiDiagram } from "@/components/ai/ai-diagram";
import { AiGraph } from "@/components/ai/ai-graph";
import { AiFigure } from "@/components/ai/ai-figure";
import { DisplayMath, InlineMath } from "@/components/ai/ai-math";

type Tone = "default" | "inverted";

const SHADE: Record<Tone, string> = {
  default: "bg-primary/[0.06]",
  inverted: "bg-white/15",
};

const EDGE: Record<Tone, string> = {
  default: "border-primary/15",
  inverted: "border-white/25",
};

const MUTED: Record<Tone, string> = {
  default: "text-primary/70",
  inverted: "text-white/70",
};

/** A bullet nobody can see is not a bullet: the marker follows the ground. */
const MARKER: Record<Tone, string> = {
  default: "marker:text-primary/60",
  inverted: "marker:text-white/70",
};

const HEADING_INK: Record<Tone, string> = {
  default: "text-primary",
  inverted: "text-white",
};

const CALLOUTS: Record<CalloutVariant, { icon: typeof Info; box: string; title: string }> = {
  note: { icon: Info, box: "border-sky-300 bg-sky-50", title: "text-sky-800" },
  tip: { icon: Lightbulb, box: "border-emerald-300 bg-emerald-50", title: "text-emerald-800" },
  important: { icon: Star, box: "border-violet-300 bg-violet-50", title: "text-violet-800" },
  warning: { icon: AlertTriangle, box: "border-amber-300 bg-amber-50", title: "text-amber-800" },
  example: { icon: NotebookPen, box: "border-slate-300 bg-slate-50", title: "text-slate-800" },
  key: { icon: KeyRound, box: "border-primary/30 bg-primary/[0.05]", title: "text-primary" },
};

function Spans({ spans, tone }: { spans: AiSpan[]; tone: Tone }): ReactNode {
  return (
    <>
      {spans.map((span, index) => {
        if (span.kind === "bold") {
          return (
            <strong key={index} className="font-bold">
              {span.text}
            </strong>
          );
        }
        if (span.kind === "italic") {
          return <em key={index}>{span.text}</em>;
        }
        if (span.kind === "math") {
          return <InlineMath key={index} tex={span.text} />;
        }
        if (span.kind === "code") {
          return (
            <code
              key={index}
              className={cn("rounded px-1 py-0.5 font-mono text-[0.88em]", SHADE[tone])}
            >
              {span.text}
            </code>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

function CodeBlock({ language, text, tone }: { language: string; text: string; tone: Tone }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className={cn("overflow-hidden rounded-lg border", EDGE[tone])}>
      <div className={cn("flex items-center justify-between px-3 py-1.5 text-[0.75em] font-bold uppercase tracking-wide", SHADE[tone], MUTED[tone])}>
        <span>{language || "code"}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 normal-case tracking-normal hover:opacity-80">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[0.85em] leading-relaxed">
        <code className="font-mono">{text}</code>
      </pre>
    </div>
  );
}

function Block({ block, tone }: { block: AiBlock; tone: Tone }): ReactNode {
  switch (block.kind) {
    case "heading":
      if (block.level === 2) {
        return (
          <h3 className={cn("border-b pb-1 pt-2 text-[1.05em] font-black leading-snug first:pt-0", EDGE[tone], HEADING_INK[tone])}>
            <Spans spans={block.spans} tone={tone} />
          </h3>
        );
      }
      if (block.level === 3) {
        return (
          <h4 className={cn("pt-1.5 text-[1em] font-extrabold leading-snug first:pt-0", HEADING_INK[tone])}>
            <Spans spans={block.spans} tone={tone} />
          </h4>
        );
      }
      return (
        <h5 className="pt-1 text-[0.95em] font-bold leading-snug first:pt-0">
          <Spans spans={block.spans} tone={tone} />
        </h5>
      );

    case "paragraph":
      return (
        <p className="leading-relaxed">
          <Spans spans={block.spans} tone={tone} />
        </p>
      );

    case "bullets":
      return (
        <ul className="flex flex-col gap-1">
          {block.items.map((item, index) => (
            <li
              key={index}
              className={cn(
                "list-disc leading-relaxed",
                MARKER[tone],
                item.depth > 0 ? "ml-9 list-[circle]" : "ml-4",
              )}
            >
              <Spans spans={item.spans} tone={tone} />
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol start={block.start} className="flex flex-col gap-1">
          {block.items.map((item, index) => (
            <li
              key={index}
              className={cn(
                "list-decimal leading-relaxed marker:font-bold",
                MARKER[tone],
                item.depth > 0 ? "ml-9" : "ml-4",
              )}
            >
              <Spans spans={item.spans} tone={tone} />
            </li>
          ))}
        </ol>
      );

    case "quote":
      return (
        <blockquote className={cn("flex flex-col gap-1 border-l-2 pl-3 italic", EDGE[tone], MUTED[tone])}>
          {block.paragraphs.map((spans, index) => (
            <p key={index}>
              <Spans spans={spans} tone={tone} />
            </p>
          ))}
        </blockquote>
      );

    case "callout": {
      const style = CALLOUTS[block.variant];
      const Icon = style.icon;
      return (
        <div className={cn("rounded-lg border-l-4 px-3 py-2.5 text-slate-800", style.box)}>
          <p className={cn("mb-1 flex items-center gap-1.5 text-[0.8em] font-black uppercase tracking-wide", style.title)}>
            <Icon className="h-3.5 w-3.5" /> {block.title}
          </p>
          <div className="flex flex-col gap-1 leading-relaxed">
            {block.paragraphs.map((spans, index) => (
              <p key={index}>
                <Spans spans={spans} tone="default" />
              </p>
            ))}
          </div>
        </div>
      );
    }

    case "math":
      return <DisplayMath tex={block.tex} />;

    case "graph":
      return <AiGraph spec={block.spec} />;

    case "graph-failed":
      // The assistant meant to draw something and described it in a way we
      // could not read. A quiet line is better than a wall of its JSON.
      return (
        <p className="rounded-xl border border-dashed border-primary/20 px-4 py-3 text-xs font-medium text-muted-foreground">
          A chart was meant to appear here. Ask again and it will usually draw.
        </p>
      );

    case "diagram":
      return <AiDiagram source={block.source} />;

    case "figure":
      return <AiFigure spec={block.spec} />;

    case "code":
      return <CodeBlock language={block.language} text={block.text} tone={tone} />;

    case "table":
      return (
        <div className={cn("max-w-full overflow-x-auto rounded-lg border", EDGE[tone])}>
          <table className="w-full min-w-max border-collapse text-[0.9em]">
            <thead>
              <tr className={SHADE[tone]}>
                {block.head.map((cell, index) => (
                  <th
                    key={index}
                    className={cn("border-b px-3 py-2 text-left font-black", EDGE[tone])}
                  >
                    <Spans spans={cell} tone={tone} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={cn(rowIndex > 0 && "border-t", EDGE[tone], rowIndex % 2 === 1 && tone === "default" && "bg-primary/[0.025]")}
                >
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="max-w-[18rem] px-3 py-2 align-top tabular-nums">
                      <Spans spans={cell} tone={tone} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "rule":
      return <hr className={EDGE[tone]} />;

    default:
      return null;
  }
}

export function AiAnswer({
  content,
  className,
  tone = "default",
}: {
  content: string;
  className?: string;
  tone?: Tone;
}) {
  const blocks = parseAiAnswer(content);

  // Nothing recognisable is still something the person typed a question for.
  if (blocks.length === 0) {
    return <p className={cn("whitespace-pre-wrap break-words", className)}>{content}</p>;
  }

  return (
    <div className={cn("flex min-w-0 max-w-full flex-col gap-2.5 break-words", className)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} tone={tone} />
      ))}
    </div>
  );
}
