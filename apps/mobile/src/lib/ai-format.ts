/**
 * Turning an AI answer into something a person can read.
 *
 * The assistant answers in markdown: it writes a heading, bullets the parts of
 * an answer, numbers the steps of a task, and bolds the thing you are meant to
 * notice. None of that reached the reader - the chat put the raw characters on
 * screen, so a good answer arrived as "## Fees" and "- **Pay** the balance".
 *
 * This reads the markdown the assistant actually writes, and nothing more.
 * There is no markdown library here on purpose: a chat bubble needs headings,
 * lists, emphasis, code and the occasional small table, and a parser for that
 * much is short enough to read in one sitting and cannot carry HTML out of a
 * model's answer and into the page.
 *
 * Anything it does not recognise stays as plain text, so a stray character is a
 * cosmetic flaw and never a blank answer.
 */

export type AiSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string };

export type AiListItem = { spans: AiSpan[]; depth: number };

export type AiBlock =
  | { kind: 'heading'; level: 2 | 3; spans: AiSpan[] }
  | { kind: 'paragraph'; spans: AiSpan[] }
  | { kind: 'bullets'; items: AiListItem[] }
  | { kind: 'steps'; items: AiListItem[]; start: number }
  | { kind: 'quote'; spans: AiSpan[] }
  | { kind: 'code'; language: string; text: string }
  | { kind: 'table'; head: AiSpan[][]; rows: AiSpan[][][] }
  | { kind: 'rule' };

/** `**bold**`, `*italic*` and `` `code` `` - the emphasis the assistant uses. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

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

/** The markdown source of a run of spans, for joining a wrapped line. */
export function spansToText(spans: AiSpan[]): string {
  return spans
    .map((span) => {
      if (span.kind === 'bold') return `**${span.text}**`;
      if (span.kind === 'italic') return `*${span.text}*`;
      if (span.kind === 'code') return '`' + span.text + '`';
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
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
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

function tableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.includes('|') && tableCells(line).length > 1;
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
      blocks.push({ kind: 'code', language: fence[1] || '', text: body.join('\n') });
      continue;
    }

    if (RULE.test(trimmed)) {
      close();
      blocks.push({ kind: 'rule' });
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      close();
      blocks.push({
        kind: 'heading',
        level: heading[1].length <= 2 ? 2 : 3,
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

    const quote = QUOTE.exec(trimmed);
    if (quote) {
      close();
      blocks.push({ kind: 'quote', spans: inlineSpans(quote[1]) });
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

    closeList();
    paragraph.push(trimmed);
  }

  close();
  return blocks;
}
