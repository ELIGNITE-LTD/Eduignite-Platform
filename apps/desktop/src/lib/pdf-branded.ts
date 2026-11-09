/**
 * Branded PDF generation used everywhere a list, sheet or receipt is
 * downloaded or printed: real styled PDFs (jsPDF + autotable) — never raw
 * HTML dumps or screen prints. Web build (studio-main website).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function savePdfDoc(doc: jsPDF, rawName: string) {
  const fileName = rawName.endsWith(".pdf") ? rawName : `${rawName}.pdf`;
  doc.save(fileName);
}

import {
  OFFICIAL,
  buildOfficialTablePdf,
  type OfficialChip,
  type OfficialSchool,
  type OfficialTableOptions,
} from "@/lib/pdf-official";

// Report cards and receipts share the official palette with the lists.
const PRIMARY = OFFICIAL.navy;
const INK = OFFICIAL.ink;
const SOFT = OFFICIAL.soft;

export interface BrandedTableOptions {
  title: string;
  /** Shown as a fact under the title when no `chips` are given. */
  subtitle?: string;
  schoolName?: string;
  /** The school record: its crest, motto and principal fill the official header. */
  school?: OfficialSchool | null;
  /** Facts under the title, e.g. total enrolled. Academic year and date are always added. */
  chips?: OfficialChip[];
  /** Left of the signature, e.g. "Registry & Examination Office". */
  issuingOffice?: string;
  signatoryTitle?: string;
  columns: string[];
  rows: OfficialTableOptions["rows"];
  fileName: string;
  landscape?: boolean;
  monoColumns?: number[];
  centerColumns?: number[];
  /** Open the system print dialog instead of downloading. */
  print?: boolean;
  /** Extra footer line (e.g. totals). */
  footnote?: string;
  /** Figures in boxes after the table. */
  summary?: OfficialTableOptions["summary"];
  /** Tighter rows, for long registers. */
  compact?: boolean;
  /** The name above the signature line, instead of the principal's. */
  signatoryName?: string;
  /** Put the school's name in the page footer. */
  footerSchoolName?: boolean;
}

/**
 * Every list download, in the official school-record layout (see
 * `pdf-official.ts`). Asynchronous because the school's crest is fetched and
 * embedded before the file is written.
 */
export async function buildBrandedTablePdf(options: BrandedTableOptions) {
  return buildOfficialTablePdf({
    ...options,
    chips: options.chips ?? (options.subtitle ? [{ label: "Scope", value: options.subtitle }] : []),
  });
}

export async function generateBrandedTablePdf(options: BrandedTableOptions): Promise<void> {
  const doc = await buildBrandedTablePdf(options);

  if (options.print) {
    doc.autoPrint();
    const url = doc.output("bloburl");
    window.open(url, "_blank");
  } else {
    savePdfDoc(doc, options.fileName);
  }
}

// ── Report cards ────────────────────────────────────────────────────────────
// Render one report card per A4 page (fit-to-page, ordered, no page numbers) so
// a class batch can be printed individually, one student per sheet.
function drawReportCard(doc: jsPDF, card: any, fallbackSchool?: string, fallbackTitle?: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const student = card?.student || {};
  const school = card?.school || {};
  const seq = card?.sequence || {};

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(String(school.name || fallbackSchool || "EduIgnite"), W / 2, 10, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const period = seq.name
    ? `${seq.name} · Term ${seq.term || ""} · ${seq.academic_year || ""}`
    : (fallbackTitle || "Report Card");
  doc.text(`Report Card — ${period}`, W / 2, 17, { align: "center" });

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(String(student.name || ""), 14, 33);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Class: ${student.class_name || student.class || ""}`, 14, 39);
  doc.text(`Matricule: ${student.matricule || ""}`, W - 14, 33, { align: "right" });
  doc.text(`Adm. No: ${student.admission_number || ""}`, W - 14, 39, { align: "right" });

  autoTable(doc, {
    startY: 44,
    head: [["Subject", "Coef", "/20", "Grade", "Total", "Teacher", "Remark"]],
    body: (card?.grades || []).map((g: any) => [
      String(g.subject_name ?? ""),
      String(g.coefficient ?? ""),
      String(g.score ?? ""),
      String(g.grade_letter ?? ""),
      String(g.total ?? ""),
      String(g.teacher_name ?? ""),
      String(g.comment ?? ""),
    ]),
    styles: { font: "helvetica", fontSize: 8, textColor: INK, cellPadding: 1.6 },
    headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: SOFT },
    columnStyles: {
      1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" },
    },
    margin: { left: 14, right: 14 },
    theme: "grid",
  });

  const afterY = (doc as any).lastAutoTable?.finalY ?? 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const rankTxt = card?.rank != null ? `${card.rank}${card?.total_students ? ` / ${card.total_students}` : ""}` : "—";
  doc.text(
    `Average: ${card?.average ?? "—"}/20     Rank: ${rankTxt}     Status: ${card?.promotion_status || ""}`,
    14,
    Math.min(afterY + 8, H - 20),
  );

  if (card?.qr_code) {
    try {
      doc.addImage(card.qr_code, "PNG", W - 34, Math.min(afterY + 2, H - 30), 20, 20);
      doc.setFontSize(6.5);
      doc.setTextColor(130, 130, 150);
      doc.setFont("helvetica", "normal");
      doc.text("Scan to verify", W - 24, Math.min(afterY + 24, H - 8), { align: "center" });
    } catch {
      /* qr embed failed — skip */
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(130, 130, 150);
  doc.setFont("helvetica", "normal");
  doc.text("Generated by EduIgnite · official report card", 14, H - 8);
}

export interface ReportCardsPdfOptions {
  schoolName?: string;
  title?: string;
  fileName: string;
  print?: boolean;
}

export function generateReportCardsPdf(cards: any[], options: ReportCardsPdfOptions) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const list = (cards || []).filter(Boolean);
  if (list.length === 0) return;
  list.forEach((card, index) => {
    if (index > 0) doc.addPage();
    drawReportCard(doc, card, options.schoolName, options.title);
  });
  if (options.print) {
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  } else {
    savePdfDoc(doc, options.fileName);
  }
}

export interface ReceiptOptions {
  schoolName: string;
  title: string;
  lines: [string, string][];
  reference?: string;
  fileName: string;
  print?: boolean;
}

/** A5 payment receipt with the EduIgnite band and a details grid. */
export function generateReceiptPdf(options: ReceiptOptions) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, width, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(options.schoolName, width / 2, 11, { align: "center" });
  doc.setFontSize(10);
  doc.text(options.title, width / 2, 19, { align: "center" });

  autoTable(doc, {
    startY: 34,
    body: options.lines,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48, textColor: [110, 106, 138] },
      1: { fontStyle: "bold" },
    },
    margin: { left: 12, right: 12 },
    didParseCell: (data) => {
      if (data.row.index % 2 === 0) data.cell.styles.fillColor = SOFT;
    },
  });

  const y = (doc as any).lastAutoTable?.finalY ?? 60;
  if (options.reference) {
    doc.setFontSize(8.5);
    doc.setTextColor(110, 106, 138);
    doc.text(`Reference: ${options.reference}`, 12, y + 8);
  }
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 150);
  doc.text(
    `Generated by EduIgnite • ${new Date().toLocaleString()}`,
    width / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: "center" }
  );

  if (options.print) {
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  } else {
    savePdfDoc(doc, options.fileName);
  }
}
