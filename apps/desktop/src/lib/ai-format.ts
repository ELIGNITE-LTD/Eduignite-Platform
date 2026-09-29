/**
 * Turning an AI answer into something a person can read.
 *
 * The assistant answers in markdown: it writes a heading, bullets the parts of
 * an answer, numbers the steps of a task, and bolds the thing you are meant to
 * notice. As a tutor it also writes mathematics in LaTeX, and it can describe
 * a graph or a diagram for the app to draw.
 *
 * This reads the markdown the assistant actually writes, and nothing more.
 * There is no markdown library here on purpose: a parser for this much is
 * short enough to read in one sitting and cannot carry HTML out of a model's
 * answer and into the page. Mathematics is handed to KaTeX, diagrams to
 * Mermaid in its strict mode, and graphs to our own drawing code - never
 * straight to the page.
 *
 * Anything it does not recognise stays as plain text, so a stray character is a
 * cosmetic flaw and never a blank answer.
 *
 * This file is identical in the website, mobile and desktop apps.
 */

import { parseGraphSpec, type GraphSpec } from './ai-graph';

export type AiSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'math'; text: string };

export type AiListItem = { spans: AiSpan[]; depth: number };

export type CalloutVariant = 'note' | 'tip' | 'important' | 'warning' | 'example' | 'key';

export type AiBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; spans: AiSpan[] }
  | { kind: 'paragraph'; spans: AiSpan[] }
  | { kind: 'bullets'; items: AiListItem[] }
  | { kind: 'steps'; items: AiListItem[]; start: number }
  | { kind: 'quote'; paragraphs: AiSpan[][] }
  | { kind: 'callout'; variant: CalloutVariant; title: string; paragraphs: AiSpan[][] }
  | { kind: 'code'; language: string; text: string }
  | { kind: 'math'; tex: string }
  | { kind: 'diagram'; source: string }
  | { kind: 'graph'; spec: GraphSpec }
  | { kind: 'table'; head: AiSpan[][]; rows: AiSpan[][][] }
  | { kind: 'rule' };

/**
 * Inline tokens, earliest match wins: `code`, \(math\), $$math$$ written inside
 * a sentence, $math$, **bold**, *italic*.
 * `$...$` only counts when it hugs its contents and is not followed by a digit,
 * so "5 000 FCFA or $20 and $30" stays text.
 */
const INLINE =
  /(`[^`]+`|\\\((?:[^\\]|\\(?!\)))+?\\\)|\$\$[^$]+?\$\$|\$(?=[^\s$\d])(?:[^$\n\\]|\\.)*?[^\s$\\]\$(?!\d)|\$[^\s$\d]\$(?!\d)|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

/** `[label](https://...)`, which reads better as the label and the address. */
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

const BULLET = /^([ \t]*)(?:[-*+•–—])[ \t]+(.*)$/;
const STEP = /^([ \t]*)(\d{1,3})[.)][ \t]+(.*)$/;
const HEADING = /^(#{1,6})[ \t]+(.*)$/;
/** A line that is nothing but bold text is a heading, whatever the markup. */
const BOLD_LINE = /^\*\*([^*]+)\*\*:?$/;
const RULE = /^([-*_])\1{2,}$/;
const QUOTE = /^>[ \t]?(.*)$/;
const FENCE = /^```[ \t]*([A-Za-z0-9+#-]*)[ \t]*$/;
const TABLE_DIVIDER = /^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)+\|?$/;

/** `> [!TIP]` (GitHub style) or a quote that opens with "**Tip:**". */
const CALLOUT_TAG = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|EXAMPLE|KEY)\][ \t]*(.*)$/i;
const CALLOUT_LEAD = /^\*\*(Note|Tip|Important|Warning|Caution|Example|Key idea|Key point|Remember)\s*:?\*\*\s*:?\s*(.*)$/i;

/**
 * A line the model wrote as bare LaTeX, with no delimiters: "\Rightarrow x = -1",
 * "\boxed{x=-1}", "x = \frac{1}{2}". It is shown as mathematics, not as backslashes.
 */
const BARE_LATEX = /^(?:\\(?:Rightarrow|Leftrightarrow|therefore|implies|boxed|frac|dfrac|sqrt|begin|int|sum|lim|quad|qquad|left|text)\b|[^\s].*\\(?:frac|dfrac|sqrt|times|div|pm|cdot|leq|geq|neq|approx|Rightarrow|implies|boxed)\b)/;
/** ...but only when the line is not ordinary prose that happens to contain a command. */
const PROSE_WORDS = /\b(the|and|is|are|we|so|then|this|that|because|which|of|to)\b/i;

/** The markdown source of a run of spans, for joining a wrapped line. */
export function spansToText(spans: AiSpan[]): string {
  return spans
    .map((span) => {
      if (span.kind === 'bold') return `**${span.text}**`;
      if (span.kind === 'italic') return `*${span.text}*`;
      if (span.kind === 'code') return '`' + span.text + '`';
      if (span.kind === 'math') return `\\(${span.text}\\)`;
      return span.text;
    })
    .join('');
}

function inlineSpans(raw: string): AiSpan[] {
  const text = raw
    .replace(/[ 	]+$/, '')
    .replace(LINK, (_match, label: string, url: string) =>
      label.includes(url) ? label : `${label} (${url})`,
    );

  const spans: AiSpan[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
      // Display maths written inside a sentence stays in the line, at display size.
      spans.push({ kind: 'math', text: `\\displaystyle ${part.slice(2, -2).trim()}` });
    } else if (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 4) {
      spans.push({ kind: 'math', text: part.slice(2, -2).trim() });
    } else if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      spans.push({ kind: 'math', text: part.slice(1, -1).trim() });
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      spans.push({ kind: 'bold', text: part.slice(2, -2) });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      spans.push({ kind: 'code', text: part.slice(1, -1) });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      spans.push({ kind: 'italic', text: part.slice(1, -1) });
    } else {
      spans.push({ kind: 'text', text: part });
    }
  }
  return spans.length > 0 ? spans : [{ kind: 'text', text: '' }];
}

/** Indentation of two spaces or more is a sub-point, and one level is enough. */
function depthOf(indent: string): number {
  return indent.replace(/\t/g, '  ').length >= 2 ? 1 : 0;
}

/** Split a table row on its pipes, except a pipe inside maths or code: |x| is not a column. */
function tableCells(line: string): string[] {
  const row = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  const cells: string[] = [];
  let current = '';
  let inDollar = false;
  let inParen = false;
  let inCode = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '\\' && row[i + 1] === '(' && !inCode) {
      inParen = true;
    } else if (char === '\\' && row[i + 1] === ')' && !inCode) {
      inParen = false;
    } else if (char === '$' && !inCode && !inParen) {
      inDollar = !inDollar;
    } else if (char === '`' && !inDollar && !inParen) {
      inCode = !inCode;
    } else if (char === '|' && !inDollar && !inParen && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isTableRow(line: string): boolean {
  return line.includes('|') && tableCells(line).length > 1;
}

function calloutVariant(tag: string): CalloutVariant {
  const value = tag.toLowerCase();
  if (value === 'tip') return 'tip';
  if (value === 'important' || value === 'remember') return 'important';
  if (value === 'warning' || value === 'caution') return 'warning';
  if (value === 'example') return 'example';
  if (value.startsWith('key')) return 'key';
  return 'note';
}

const CALLOUT_TITLES: Record<CalloutVariant, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Remember',
  warning: 'Watch out',
  example: 'Example',
  key: 'Key idea',
};

/** Group a run of quote lines into paragraphs, and recognise a callout. */
function quoteBlock(lines: string[]): AiBlock {
  let variant: CalloutVariant | null = null;
  let title = '';
  const body = [...lines];
  const tagged = CALLOUT_TAG.exec(body[0] ?? '');
  const led = CALLOUT_LEAD.exec(body[0] ?? '');
  if (tagged) {
    variant = calloutVariant(tagged[1]);
    title = CALLOUT_TITLES[variant];
    body[0] = tagged[2];
  } else if (led) {
    variant = calloutVariant(led[1]);
    title = led[1].replace(/\b\w/g, (c) => c.toUpperCase());
    body[0] = led[2];
  }
  const paragraphs: AiSpan[][] = [];
  let current: string[] = [];
  for (const line of body) {
    if (line.trim() === '') {
      if (current.length) paragraphs.push(inlineSpans(current.join(' ')));
      current = [];
    } else {
      current.push(line.trim());
    }
  }
  if (current.length) paragraphs.push(inlineSpans(current.join(' ')));
  return variant ? { kind: 'callout', variant, title, paragraphs } : { kind: 'quote', paragraphs };
}

/** A fenced block: code, or a drawing when the language says so and the drawing is sound. */
function fencedBlock(language: string, text: string): AiBlock {
  const lang = language.toLowerCase();
  if (lang === 'mermaid' && text.trim()) {
    return { kind: 'diagram', source: text.trim() };
  }
  if (lang === 'graph' || lang === 'plot') {
    const spec = parseGraphSpec(text);
    if (spec) return { kind: 'graph', spec };
  }
  if ((lang === 'latex' || lang === 'math' || lang === 'tex') && text.trim()) {
    return { kind: 'math', tex: text.trim() };
  }
  return { kind: 'code', language, text };
}

export function parseAiAnswer(source: string): AiBlock[] {
  const lines = (source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: AiBlock[] = [];

  let paragraph: string[] = [];
  let list: { kind: 'bullets' | 'steps'; items: AiListItem[]; start: number } | null = null;

  const closeParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', spans: inlineSpans(paragraph.join(' ')) });
    paragraph = [];
  };

  const closeList = () => {
    if (!list) return;
    blocks.push(
      list.kind === 'bullets'
        ? { kind: 'bullets', items: list.items }
        : { kind: 'steps', items: list.items, start: list.start },
    );
    list = null;
  };

  const close = () => {
    closeParagraph();
    closeList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === '') {
      close();
      continue;
    }

    const fence = FENCE.exec(trimmed);
    if (fence) {
      close();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index].trim())) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push(fencedBlock(fence[1] || '', body.join('\n')));
      continue;
    }

    // Display mathematics: $$ ... $$ or \[ ... \], on one line or several.
    const opener = trimmed.startsWith('$$') ? '$$' : trimmed.startsWith('\\[') ? '\\[' : null;
    if (opener) {
      const closer = opener === '$$' ? '$$' : '\\]';
      const rest = trimmed.slice(2);
      const sameLine = rest.indexOf(closer);
      if (sameLine !== -1 && rest.slice(sameLine + 2).trim() === '') {
        close();
        const tex = rest.slice(0, sameLine).trim();
        if (tex) blocks.push({ kind: 'math', tex });
        continue;
      }
      if (sameLine === -1) {
        const body: string[] = rest.trim() ? [rest] : [];
        let end = index + 1;
        while (end < lines.length && !lines[end].includes(closer)) {
          body.push(lines[end]);
          end += 1;
        }
        if (end < lines.length) {
          close();
          const last = lines[end];
          const before = last.slice(0, last.indexOf(closer));
          if (before.trim()) body.push(before);
          const tex = body.join('\n').trim();
          if (tex) blocks.push({ kind: 'math', tex });
          index = end;
          continue;
        }
      }
    }

    if (RULE.test(trimmed)) {
      close();
      blocks.push({ kind: 'rule' });
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      close();
      const hashes = heading[1].length;
      blocks.push({
        kind: 'heading',
        level: hashes <= 2 ? 2 : hashes === 3 ? 3 : 4,
        spans: inlineSpans(heading[2].replace(/\s*#+\s*$/, '')),
      });
      continue;
    }

    const boldLine = BOLD_LINE.exec(trimmed);
    if (boldLine) {
      close();
      blocks.push({ kind: 'heading', level: 3, spans: inlineSpans(boldLine[1]) });
      continue;
    }

    if (QUOTE.test(trimmed)) {
      close();
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index].trim())) {
        quoted.push(QUOTE.exec(lines[index].trim())![1]);
        index += 1;
      }
      index -= 1;
      blocks.push(quoteBlock(quoted));
      continue;
    }

    if (
      isTableRow(trimmed) &&
      index + 1 < lines.length &&
      TABLE_DIVIDER.test(lines[index + 1].trim())
    ) {
      close();
      const head = tableCells(trimmed).map(inlineSpans);
      const rows: AiSpan[][][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(tableCells(lines[index].trim()).map(inlineSpans));
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: 'table', head, rows });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      closeParagraph();
      if (!list || list.kind !== 'bullets') {
        closeList();
        list = { kind: 'bullets', items: [], start: 1 };
      }
      list.items.push({ spans: inlineSpans(bullet[2]), depth: depthOf(bullet[1]) });
      continue;
    }

    const step = STEP.exec(line);
    if (step) {
      closeParagraph();
      if (!list || list.kind !== 'steps') {
        closeList();
        list = { kind: 'steps', items: [], start: Number(step[2]) || 1 };
      }
      list.items.push({ spans: inlineSpans(step[3]), depth: depthOf(step[1]) });
      continue;
    }

    // A wrapped line belongs to whatever it is wrapping.
    if (list && list.items.length > 0 && /^[ \t]/.test(line)) {
      const item = list.items[list.items.length - 1];
      item.spans = inlineSpans(`${spansToText(item.spans)} ${trimmed}`);
      continue;
    }

    // Bare LaTeX on a line of its own is an equation, not a row of backslashes.
    if (
      BARE_LATEX.test(trimmed) &&
      !trimmed.includes('$') &&
      !trimmed.includes('\\(') &&
      !PROSE_WORDS.test(trimmed.replace(/\\text\{[^}]*\}/g, ''))
    ) {
      close();
      blocks.push({ kind: 'math', tex: trimmed });
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  close();
  return blocks;
}
