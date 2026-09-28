"use client";

/**
 * An AI answer, laid out so it can be read at a glance.
 *
 * The assistant is asked to answer briefly and to structure what it says - a
 * line of summary, then the parts of the answer. This is the other half of
 * that: the structure it writes has to arrive as structure. A heading looks
 * like a heading, a list of steps is numbered, the term to remember is bold,
 * and nothing on screen is a markdown character.
 *
 * `tone="inverted"` is for the panels that put an answer on the brand colour,
 * where borders and shaded blocks have to come from white rather than ink.
 */

import type { ReactNode } from "react";

import { parseAiAnswer, type AiBlock, type AiSpan } from "@/lib/ai-format";
import { cn } from "@/lib/utils";

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

function Block({ block, tone }: { block: AiBlock; tone: Tone }): ReactNode {
  switch (block.kind) {
    case "heading":
      return (
        <p
          className={cn(
            "pt-1 font-black leading-snug first:pt-0",
            block.level === 2 ? "text-[0.95em] uppercase tracking-wide" : "text-[0.95em]",
          )}
        >
          <Spans spans={block.spans} tone={tone} />
        </p>
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
        <blockquote className={cn("border-l-2 pl-3 italic", EDGE[tone], MUTED[tone])}>
          <Spans spans={block.spans} tone={tone} />
        </blockquote>
      );

    case "code":
      return (
        <pre className={cn("overflow-x-auto rounded-lg p-3 text-[0.85em] leading-relaxed", SHADE[tone])}>
          <code className="font-mono">{block.text}</code>
        </pre>
      );

    case "table":
      return (
        <div className={cn("overflow-x-auto rounded-lg border", EDGE[tone])}>
          <table className="w-full border-collapse text-[0.9em]">
            <thead>
              <tr className={SHADE[tone]}>
                {block.head.map((cell, index) => (
                  <th
                    key={index}
                    className={cn("border-b px-2.5 py-1.5 text-left font-black", EDGE[tone])}
                  >
                    <Spans spans={cell} tone={tone} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={cn(rowIndex > 0 && "border-t", EDGE[tone])}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2.5 py-1.5 tabular-nums">
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
    <div className={cn("flex min-w-0 flex-col gap-2 break-words", className)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} tone={tone} />
      ))}
    </div>
  );
}
