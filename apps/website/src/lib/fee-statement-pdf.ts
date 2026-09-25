/**
 * The fee statement a school admin or bursar downloads from the fee ledger.
 *
 * Drawn with jsPDF primitives rather than a screenshot, so the text stays
 * selectable and searchable — the same rule the receipts and the rest of the
 * platform's documents follow. The filters that produced the list are printed
 * on the sheet, so a statement can always be traced back to what was asked for.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { OFFICIAL, drawOfficialHeader, loadOfficialCrest } from "@/lib/pdf-official";

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [71, 85, 105];
const RULE: [number, number, number] = [148, 163, 184];
const NAVY: [number, number, number] = OFFICIAL.navyDeep;

export type FeeStatementRow = {
  student: string;
  matricule: string;
  className: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
};

export type FeeStatementOptions = {
  schoolName: string;
  schoolMotto?: string;
  /** The school's crest; the EduIgnite mark is used when it is missing. */
  schoolLogo?: string;
  /** "The Bursar" or "The Principal" — who signs this copy. */
  signatoryRole: string;
  signatoryName: string;
  filters: { status: string; className: string; feeType: string };
  rows: FeeStatementRow[];
  totals: { billed: number; collected: number; outstanding: number; collectionRate: number };
};

const money = (value: number) =>
  `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export async function buildFeeStatementPdf(options: FeeStatementOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = pageWidth - 14;

  // ---- Official header; the filters that produced the list are its facts ----
  const crest = await loadOfficialCrest(options.schoolLogo);
  let y = drawOfficialHeader(
    doc,
    {
      title: "Official School Fee Statement",
      school: { name: options.schoolName, motto: options.schoolMotto, logo: options.schoolLogo },
      chips: [
        { label: "Status", value: options.filters.status },
        { label: "Class", value: options.filters.className },
        { label: "Fee Type", value: options.filters.feeType },
        { label: "Records", value: options.rows.length },
      ],
    },
    crest,
  );

  // ---- Summary band ----
  autoTable(doc, {
    startY: y,
    margin: { left, right: 14 },
    head: [["Total Billed", "Collected", "Outstanding", "Collection Rate"]],
    body: [[
      money(options.totals.billed),
      money(options.totals.collected),
      money(options.totals.outstanding),
      `${options.totals.collectionRate.toFixed(1)}%`,
    ]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, halign: "center", textColor: INK, lineColor: RULE, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontStyle: "bold" },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

  // ---- The ledger ----
  autoTable(doc, {
    startY: y,
    margin: { left, right: 14 },
    head: [["#", "Student", "Matricule", "Class", "Billed", "Paid", "Balance", "Status"]],
    body: options.rows.map((row, index) => [
      String(index + 1),
      row.student,
      row.matricule,
      row.className,
      money(row.total),
      money(row.paid),
      money(row.balance),
      row.status,
    ]),
    foot: [[
      "", "Totals", "", "",
      money(options.totals.billed),
      money(options.totals.collected),
      money(options.totals.outstanding),
      "",
    ]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, textColor: INK, cellPadding: 1.8, lineColor: RULE, lineWidth: 0.15 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: OFFICIAL.soft, textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: OFFICIAL.soft },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "center", cellWidth: 20 },
    },
  });

  // ---- Signature, on the last page ----
  const finalY = (doc as any).lastAutoTable?.finalY ?? y;
  const pageHeight = doc.internal.pageSize.getHeight();
  let signY = finalY + 18;
  if (signY > pageHeight - 30) {
    doc.addPage();
    signY = 30;
  }
  const signLeft = right - 70;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(`Signed: ${options.signatoryRole}`, right, signY, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(options.signatoryName, right, signY + 5, { align: "right" });
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(signLeft, signY + 16, right, signY + 16);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Signature & Stamp", (signLeft + right) / 2, signY + 20, { align: "center" });

  return doc;
}

export async function downloadFeeStatementPdf(options: FeeStatementOptions) {
  const doc = await buildFeeStatementPdf(options);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `fee_statement_${options.schoolName}_${stamp}`.replace(/[^a-z0-9_.-]+/gi, "_");
  doc.save(`${name}.pdf`);
}
