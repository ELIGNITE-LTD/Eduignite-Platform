/**
 * The official document layout for every list a school downloads: student
 * rosters, staff rosters, class lists, activation sheets, grade and exam
 * sheets.
 *
 * Laid out like a Cameroonian school record: the bilingual Republic of
 * Cameroon and Ministry of Secondary Education header on either side of the
 * school's crest, the school's name and motto, the document title, a row of
 * facts (totals, academic year, date), the table, and the issuing office with
 * the principal's signature line. Coloured in EduIgnite's own palette, the navy
 * and cyan of the shield, so every document reads as an EduIgnite record.
 *
 * This file is identical in the website, mobile and desktop apps. It only
 * draws; each app's `pdf-branded.ts` decides how the finished file is saved
 * (a download, a print dialog, or the device's EduIgnite folder).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { resolveMediaUrl } from "@/lib/media";
import { EDUIGNITE_LOGO_PNG } from "@/lib/platform-brand";

type RGB = [number, number, number];

/** EduIgnite's palette, taken from the shield. */
export const OFFICIAL = {
  navy: [23, 58, 91] as RGB, // shield body #173A5B
  navyDeep: [14, 36, 60] as RGB, // table header
  cyan: [103, 208, 228] as RGB, // shield rim #67D0E4
  cyanText: [21, 128, 154] as RGB, // the cyan, deep enough to read as text
  ink: [18, 49, 77] as RGB, // #12314D
  muted: [100, 116, 139] as RGB,
  line: [221, 229, 238] as RGB,
  soft: [245, 249, 252] as RGB,
  white: [255, 255, 255] as RGB,
}

export interface OfficialSchool {
  name?: string | null;
  motto?: string | null;
  principal?: string | null;
  logo?: string | null;
}

export interface OfficialChip {
  label: string;
  value: string | number;
}

export interface OfficialDocumentOptions {
  /** The document title, e.g. "Official Student Roster & Registration Record". */
  title: string;
  school?: OfficialSchool | null;
  /** Falls back to this when no school record is available. */
  schoolName?: string;
  /** Short facts shown under the title. Academic year and date are added if missing. */
  chips?: OfficialChip[];
  /** Left of the signature block, e.g. "Registry & Examination Office". */
  issuingOffice?: string;
  /** Under the signature line. */
  signatoryTitle?: string;
}

export interface OfficialTableOptions extends OfficialDocumentOptions {
  columns: string[];
  rows: (string | number | null | undefined)[][];
  landscape?: boolean;
  /** Column indexes set in a fixed-width face, for matricules and IDs. */
  monoColumns?: number[];
  /** Column indexes centred, for short values such as gender or counts. */
  centerColumns?: number[];
  /** A closing line above the signature, e.g. totals. */
  footnote?: string;
}

const MARGIN = 14;

/** September to August, the Cameroonian school year. */
export function currentAcademicYear(date = new Date()): string {
  const year = date.getFullYear();
  const start = date.getMonth() >= 8 ? year : year - 1;
  return `${start} - ${start + 1}`;
}

function formatDate(date = new Date()): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

interface LoadedImage {
  data: string;
  width: number;
  height: number;
  format: "PNG" | "JPEG";
}

async function loadImage(url: string): Promise<LoadedImage | null> {
  if (!url || typeof window === "undefined") return null;
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.type.includes("svg")) return null;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("image"));
      img.src = data;
    });
    return { data, ...size, format: blob.type.includes("png") ? "PNG" : "JPEG" };
  } catch {
    return null;
  }
}

/**
 * The school's own crest when it has one that can be loaded, otherwise the
 * EduIgnite mark, so the header is never left with an empty frame.
 */
async function loadCrest(school?: OfficialSchool | null): Promise<LoadedImage | null> {
  const own = school?.logo ? resolveMediaUrl(school.logo) : "";
  return (own && (await loadImage(own))) || (await loadImage(EDUIGNITE_LOGO_PNG));
}

function setColor(doc: jsPDF, rgb: RGB) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

/** The crest from a bare logo value, for documents that are not built from a school record. */
export async function loadOfficialCrest(logo?: string | null): Promise<LoadedImage | null> {
  return loadCrest({ logo });
}

export type { LoadedImage as OfficialCrest };

/** The crest itself, centred on `centerX`. `outer` is the space it is drawn in, in mm. */
export function drawOfficialCrest(
  doc: jsPDF,
  crest: LoadedImage | null,
  centerX: number,
  top: number,
  outer = 28,
) {
  drawCrest(doc, crest, centerX, top, outer);
}

function drawCrest(doc: jsPDF, crest: LoadedImage | null, centerX: number, top: number, outer = 28) {
  // The logo is printed as itself: no frame, no rim, no backing plate.
  if (!crest) return;
  const ratio = crest.width / crest.height || 1;
  const w = ratio >= 1 ? outer : outer * ratio;
  const h = ratio >= 1 ? outer / ratio : outer;
  try {
    doc.addImage(crest.data, crest.format, centerX - w / 2, top + outer / 2 - h / 2, w, h);
  } catch {
    /* an image jsPDF cannot read leaves the space empty */
  }
}

/** The bilingual state header, left in English and right in French. */
function drawStateHeader(doc: jsPDF, width: number) {
  const right = width - MARGIN;

  setColor(doc, OFFICIAL.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("REPUBLIC OF CAMEROON", MARGIN, 18);
  doc.text("RÉPUBLIQUE DU CAMEROUN", right, 18, { align: "right" });

  setColor(doc, OFFICIAL.muted);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text("Peace - Work - Fatherland", MARGIN, 23);
  doc.text("Paix - Travail - Patrie", right, 23, { align: "right" });

  doc.setDrawColor(...OFFICIAL.cyan);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 25.6, MARGIN + 22, 25.6);
  doc.line(right - 22, 25.6, right, 25.6);

  setColor(doc, OFFICIAL.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("MINISTRY OF SECONDARY", MARGIN, 30.5);
  doc.text("EDUCATION", MARGIN, 34);
  doc.text("MINISTÈRE DES ENSEIGNEMENTS", right, 30.5, { align: "right" });
  doc.text("SECONDAIRES", right, 34, { align: "right" });
}

function chipsWithDefaults(chips: OfficialChip[] = []): OfficialChip[] {
  const labels = new Set(chips.map((chip) => chip.label.toLowerCase()));
  const all = [...chips];
  if (!labels.has("academic year")) all.push({ label: "Academic Year", value: currentAcademicYear() });
  if (!labels.has("date")) all.push({ label: "Date", value: formatDate() });
  return all;
}

/** A centred, wrapping row of "Label: Value" chips. Returns the y below it. */
function drawChips(doc: jsPDF, chips: OfficialChip[], width: number, top: number): number {
  const gap = 3;
  const height = 7.4;
  const pad = 3.6;
  const maxRow = width - MARGIN * 2;

  doc.setFontSize(8);
  const measured = chips.map((chip) => {
    doc.setFont("helvetica", "normal");
    const labelText = `${chip.label}:`;
    // A fixed gap after the colon: trailing spaces are not measured reliably.
    const labelW = doc.getTextWidth(labelText) + 1.4;
    doc.setFont("helvetica", "bold");
    const valueW = doc.getTextWidth(String(chip.value));
    return { chip, labelText, labelW, width: labelW + valueW + pad * 2 };
  });

  const rows: (typeof measured)[] = [];
  let current: typeof measured = [];
  let used = 0;
  for (const item of measured) {
    const needed = current.length ? used + gap + item.width : item.width;
    if (current.length && needed > maxRow) {
      rows.push(current);
      current = [item];
      used = item.width;
    } else {
      current.push(item);
      used = needed;
    }
  }
  if (current.length) rows.push(current);

  let y = top;
  for (const row of rows) {
    const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + gap * (row.length - 1);
    let x = (width - rowWidth) / 2;
    for (const item of row) {
      doc.setFillColor(...OFFICIAL.white);
      doc.setDrawColor(...OFFICIAL.line);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, item.width, height, 1.8, 1.8, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      setColor(doc, OFFICIAL.muted);
      doc.text(item.labelText, x + pad, y + height / 2 + 1.1);
      doc.setFont("helvetica", "bold");
      setColor(doc, OFFICIAL.ink);
      doc.text(String(item.chip.value), x + pad + item.labelW, y + height / 2 + 1.1);
      x += item.width + gap;
    }
    y += height + 2.5;
  }
  return y;
}

/**
 * Draws the full official header on the current page and returns the y where
 * the body can start.
 */
export function drawOfficialHeader(
  doc: jsPDF,
  options: OfficialDocumentOptions,
  crest: LoadedImage | null,
): number {
  const width = doc.internal.pageSize.getWidth();
  const schoolName = options.school?.name || options.schoolName || "EduIgnite";

  drawStateHeader(doc, width);
  drawCrest(doc, crest, width / 2, 9);

  doc.setDrawColor(...OFFICIAL.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 42, width - MARGIN, 42);

  // School name, set large; long names wrap onto a second line.
  setColor(doc, OFFICIAL.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  const nameLines = doc.splitTextToSize(schoolName.toUpperCase(), width - MARGIN * 2 - 10) as string[];
  let y = 51;
  for (const line of nameLines.slice(0, 2)) {
    doc.text(line, width / 2, y, { align: "center" });
    y += 6.5;
  }

  const motto = options.school?.motto?.trim();
  if (motto) {
    setColor(doc, OFFICIAL.cyanText);
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(9.5);
    const mottoLines = doc.splitTextToSize(`"${motto}"`, width - MARGIN * 2 - 20) as string[];
    for (const line of mottoLines.slice(0, 2)) {
      doc.text(line, width / 2, y, { align: "center" });
      y += 4.6;
    }
    y += 1.5;
  }

  // The title, in a soft pill.
  const title = options.title.toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const charSpace = 0.35;
  const titleWidth = doc.getTextWidth(title) + charSpace * title.length;
  const pillW = Math.min(titleWidth + 16, width - MARGIN * 2);
  const pillH = 9.5;
  doc.setFillColor(...OFFICIAL.soft);
  doc.setDrawColor(...OFFICIAL.line);
  doc.setLineWidth(0.3);
  doc.roundedRect((width - pillW) / 2, y, pillW, pillH, 2.2, 2.2, "FD");
  setColor(doc, OFFICIAL.ink);
  // jsPDF's centring ignores letter-spacing, so the start is placed by hand.
  doc.text(title, width / 2 - titleWidth / 2, y + pillH / 2 + 1.2, { charSpace });
  y += pillH + 4;

  y = drawChips(doc, chipsWithDefaults(options.chips), width, y);

  doc.setDrawColor(...OFFICIAL.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 1.5, width - MARGIN, y + 1.5);
  return y + 7;
}

/** A slim header for the second and later pages of a long list. */
function drawContinuationHeader(doc: jsPDF, options: OfficialDocumentOptions) {
  const width = doc.internal.pageSize.getWidth();
  const schoolName = options.school?.name || options.schoolName || "EduIgnite";
  setColor(doc, OFFICIAL.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(schoolName.toUpperCase(), MARGIN, 14);
  setColor(doc, OFFICIAL.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(options.title, width - MARGIN, 14, { align: "right" });
  doc.setDrawColor(...OFFICIAL.cyan);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 17, width - MARGIN, 17);
}

/** Page number and the EduIgnite line, on every page. */
function drawPageFooter(doc: jsPDF, pageNumber: number) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  setColor(doc, OFFICIAL.muted);
  doc.text(`Generated by EduIgnite  |  ${new Date().toLocaleString("en-GB")}`, MARGIN, height - 7);
  doc.text(`Page ${pageNumber} of {total_pages}`, width - MARGIN, height - 7, { align: "right" });
}

/** The issuing office on the left and the principal's signature on the right. */
function drawSignatureBlock(doc: jsPDF, options: OfficialDocumentOptions, top: number) {
  const width = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...OFFICIAL.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, top, width - MARGIN, top);

  const y = top + 12;
  setColor(doc, OFFICIAL.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text((options.issuingOffice || "Registry & Examination Office").toUpperCase(), MARGIN, y);
  setColor(doc, OFFICIAL.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Republic of Cameroon Certified Record", MARGIN, y + 5);

  const lineW = 64;
  const lineX = width - MARGIN - lineW;
  const centerX = lineX + lineW / 2;
  const principal = options.school?.principal?.trim();
  if (principal) {
    setColor(doc, OFFICIAL.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(principal, centerX, y - 2, { align: "center" });
  }
  doc.setDrawColor(...OFFICIAL.muted);
  doc.setLineWidth(0.3);
  doc.line(lineX, y + 1, width - MARGIN, y + 1);
  setColor(doc, OFFICIAL.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text((options.signatoryTitle || "Principal / Le Proviseur").toUpperCase(), centerX, y + 6, {
    align: "center",
  });
}

/** Builds a complete official list document. The caller saves or prints it. */
export async function buildOfficialTablePdf(options: OfficialTableOptions): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: options.landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const crest = await loadCrest(options.school);
  const startY = drawOfficialHeader(doc, options, crest);
  const mono = new Set(options.monoColumns ?? []);
  const centered = new Set([0, ...(options.centerColumns ?? [])]);

  const columnStyles: Record<number, Record<string, unknown>> = {};
  options.columns.forEach((_, index) => {
    const style: Record<string, unknown> = {};
    if (centered.has(index)) style.halign = "center";
    if (index === 0) style.textColor = OFFICIAL.muted;
    if (mono.has(index)) {
      style.font = "courier";
      style.fontStyle = "bold";
      style.fontSize = 8;
    }
    columnStyles[index] = style;
  });

  autoTable(doc, {
    startY,
    head: [options.columns.map((column) => column.toUpperCase())],
    body: options.rows.map((row) => row.map((cell) => String(cell ?? ""))),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: OFFICIAL.ink,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      valign: "middle",
    },
    headStyles: {
      fillColor: OFFICIAL.navyDeep,
      textColor: OFFICIAL.white,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: OFFICIAL.soft },
    columnStyles,
    margin: { top: 22, left: MARGIN, right: MARGIN, bottom: 18 },
    didDrawCell: (data) => {
      // A hairline under each body row, as on a printed register.
      if (data.section !== "body") return;
      doc.setDrawColor(...OFFICIAL.line);
      doc.setLineWidth(0.2);
      doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawContinuationHeader(doc, options);
      drawPageFooter(doc, data.pageNumber);
    },
  });

  const height = doc.internal.pageSize.getHeight();
  let y = ((doc as any).lastAutoTable?.finalY ?? startY) + 8;

  if (options.footnote) {
    setColor(doc, OFFICIAL.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(options.footnote, MARGIN, y);
    y += 6;
  }

  // Keep the signature block whole: move it to a fresh page rather than split it.
  if (y + 26 > height - 18) {
    doc.addPage();
    drawContinuationHeader(doc, options);
    drawPageFooter(doc, doc.getNumberOfPages());
    y = 28;
  }
  drawSignatureBlock(doc, options, y);

  if (typeof (doc as any).putTotalPages === "function") {
    (doc as any).putTotalPages("{total_pages}");
  }
  return doc;
}
