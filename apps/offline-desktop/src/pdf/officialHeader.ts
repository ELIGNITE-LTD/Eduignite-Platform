import type { Column, Content, TableLayout } from 'pdfmake/interfaces';

import { EDUIGNITE_MARK_PNG } from './eduigniteMark';

/**
 * The official school-record layout for the offline app's documents: the same
 * design the online apps use (see apps/website/src/lib/pdf-official.ts),
 * expressed as pdfmake content. The bilingual Republic of Cameroon and
 * Ministry of Secondary Education header either side of the crest, the
 * school's name and motto, the document title and its facts, and the issuing
 * office with the principal's signature line. EduIgnite's navy and cyan.
 */
export const OFFICIAL = {
  navy: '#173A5B',
  navyDeep: '#0E243C',
  cyan: '#67D0E4',
  cyanText: '#15809A',
  ink: '#12314D',
  muted: '#64748B',
  line: '#DDE5EE',
  soft: '#F5F9FC',
  white: '#FFFFFF',
};

export interface OfficialChip {
  label: string;
  value: string | number;
}

export interface OfficialHeaderOptions {
  schoolName: string;
  motto?: string | null;
  title: string;
  chips?: OfficialChip[];
  /** Smaller type and crest, for A5 documents such as receipts. */
  compact?: boolean;
  /** Width between the page margins, in points. A4 with 40pt margins is 515. */
  contentWidth?: number;
}

const rule = (width: number, alignRight = false): Content => ({
  columns: alignRight
    ? [{ width: '*', text: '' }, { width, canvas: [{ type: 'line', x1: 0, y1: 2, x2: width, y2: 2, lineWidth: 1.4, lineColor: OFFICIAL.cyan }] }]
    : [{ width, canvas: [{ type: 'line', x1: 0, y1: 2, x2: width, y2: 2, lineWidth: 1.4, lineColor: OFFICIAL.cyan }] }, { width: '*', text: '' }],
});

const centred = (content: Content): Content => ({
  columns: [{ width: '*', text: '' }, { width: 'auto', stack: [content] }, { width: '*', text: '' }],
});

const box = (fill: string, border: string, lineWidth: number, pad: number): TableLayout => ({
  hLineWidth: () => lineWidth,
  vLineWidth: () => lineWidth,
  hLineColor: () => border,
  vLineColor: () => border,
  paddingLeft: () => pad,
  paddingRight: () => pad,
  paddingTop: () => pad,
  paddingBottom: () => pad,
  fillColor: () => fill,
});

/** The crest: the mark on its own, with no frame, rim or backing plate. */
function crest(size: number): Content {
  return centred({ image: EDUIGNITE_MARK_PNG, width: size, alignment: 'center' });
}

/** September to August, the Cameroonian school year. */
export function currentAcademicYear(date = new Date()): string {
  const start = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start} - ${start + 1}`;
}

export function officialHeader(options: OfficialHeaderOptions): Content[] {
  const k = options.compact ? 0.78 : 1;
  const side = (lines: [string, string, string], alignRight: boolean): Column => ({
    width: '*',
    stack: [
      { text: lines[0], bold: true, fontSize: 10 * k, color: OFFICIAL.ink },
      { text: lines[1], italics: true, fontSize: 8 * k, color: OFFICIAL.muted, margin: [0, 1, 0, 1] },
      rule(52 * k, alignRight),
      { text: lines[2], bold: true, fontSize: 7 * k, color: OFFICIAL.ink, margin: [0, 3, 0, 0] },
    ],
    alignment: alignRight ? 'right' : 'left',
  });

  const chips = [...(options.chips ?? [])];
  if (!chips.some((chip) => chip.label.toLowerCase() === 'date')) {
    chips.push({
      label: 'Date',
      value: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    });
  }

  const content: Content[] = [
    {
      columns: [
        side(['REPUBLIC OF CAMEROON', 'Peace - Work - Fatherland', 'MINISTRY OF SECONDARY EDUCATION'], false),
        { width: 90 * k, stack: [crest(46 * k)] },
        side(['RÉPUBLIQUE DU CAMEROUN', 'Paix - Travail - Patrie', 'MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES'], true),
      ],
      columnGap: 6,
    },
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: options.contentWidth ?? 515, y2: 8, lineWidth: 0.6, lineColor: OFFICIAL.line }] },
    {
      text: options.schoolName.toUpperCase(),
      bold: true,
      fontSize: 15 * k,
      color: OFFICIAL.navy,
      alignment: 'center',
      margin: [0, 10 * k, 0, 2],
    },
  ];

  if (options.motto?.trim()) {
    content.push({
      text: `"${options.motto.trim()}"`,
      bold: true,
      italics: true,
      fontSize: 9.5 * k,
      color: OFFICIAL.cyanText,
      alignment: 'center',
      margin: [0, 0, 0, 4],
    });
  }

  content.push(
    centred({
      table: {
        body: [[{
          text: options.title.toUpperCase(),
          bold: true,
          fontSize: 9.5 * k,
          characterSpacing: 1,
          color: OFFICIAL.ink,
          margin: [10, 2, 10, 2],
        }]],
      },
      layout: box(OFFICIAL.soft, OFFICIAL.line, 0.6, 3),
      margin: [0, 6 * k, 0, 6 * k],
    }),
    {
      columns: [
        { width: '*', text: '' },
        ...chips.map((chip): Column => ({
          width: 'auto',
          table: {
            body: [[{
              text: [
                { text: `${chip.label}: `, color: OFFICIAL.muted },
                { text: String(chip.value), bold: true, color: OFFICIAL.ink },
              ],
              fontSize: 8 * k,
            }]],
          },
          layout: box(OFFICIAL.white, OFFICIAL.line, 0.6, 3),
        })),
        { width: '*', text: '' },
      ],
      columnGap: 5,
    },
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: options.contentWidth ?? 515, y2: 8, lineWidth: 0.6, lineColor: OFFICIAL.line }], margin: [0, 0, 0, 10] },
  );

  return content;
}

/** The issuing office on the left, the principal's signature on the right. */
export function officialSignature(options: {
  office: string;
  principal?: string | null;
  signatoryTitle?: string;
  compact?: boolean;
  contentWidth?: number;
}): Content {
  const k = options.compact ? 0.8 : 1;
  const width = 170 * k;
  return {
    margin: [0, 24 * k, 0, 0],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: options.contentWidth ?? 515, y2: 0, lineWidth: 0.6, lineColor: OFFICIAL.line }] },
      {
        margin: [0, 12 * k, 0, 0],
        columns: [
          {
            width: '*',
            stack: [
              { text: options.office.toUpperCase(), bold: true, fontSize: 9 * k, color: OFFICIAL.ink },
              { text: 'Republic of Cameroon Certified Record', fontSize: 8 * k, color: OFFICIAL.muted, margin: [0, 2, 0, 0] },
            ],
          },
          {
            width,
            stack: [
              { text: options.principal?.trim() || ' ', bold: true, fontSize: 9.5 * k, color: OFFICIAL.ink, alignment: 'center' },
              { canvas: [{ type: 'line', x1: 0, y1: 4, x2: width, y2: 4, lineWidth: 0.6, lineColor: OFFICIAL.muted }] },
              {
                text: (options.signatoryTitle || 'Principal / Le Proviseur').toUpperCase(),
                bold: true,
                fontSize: 7.5 * k,
                color: OFFICIAL.muted,
                alignment: 'center',
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Navy header row and soft alternating rows, for every official table. */
export const officialTableLayout: TableLayout = {
  hLineWidth: (i) => (i === 0 ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => OFFICIAL.line,
  paddingTop: () => 5,
  paddingBottom: () => 5,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  fillColor: (rowIndex) => (rowIndex === 0 ? OFFICIAL.navyDeep : rowIndex % 2 === 0 ? OFFICIAL.soft : null),
};

export const officialStyles = {
  tableHeader: { bold: true, color: OFFICIAL.white, fontSize: 8.5 },
  muted: { fontSize: 8, color: OFFICIAL.muted },
};
