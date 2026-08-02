/**
 * The end-of-term / end-of-year performance report, as a printable PDF.
 *
 * Drawn with jsPDF primitives so the text stays selectable and searchable,
 * matching the fee statement and the receipts. No logo: the school name and
 * motto carry the letterhead.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [71, 85, 105];
const RULE: [number, number, number] = [148, 163, 184];
const NAVY: [number, number, number] = [38, 77, 115];

export type PerformanceReport = {
  academic_year: string;
  term: string;
  scope: string;
  is_annual?: boolean;
  pass_mark?: number;
  student_count: number;
  passed_count?: number;
  failed_count?: number;
  promoted_count?: number;
  repeated_count?: number;
  school_average: number;
  best: { name: string; matricule: string; class_name: string; average: number } | null;
  weakest: { name: string; matricule: string; class_name: string; average: number } | null;
  classes: Array<{
    class_name: string;
    student_count: number;
    passed_count?: number;
    failed_count?: number;
    promoted_count?: number;
    repeated_count?: number;
    class_average: number;
    top: Array<{ position: number; name: string; matricule: string; average: number }>;
    bottom: Array<{ position: number; name: string; matricule: string; average: number }>;
  }>;
};

export type PerformanceReportOptions = {
  schoolName: string;
  schoolMotto?: string;
  principal: string;
  report: PerformanceReport;
};

const avg = (value: unknown) => `${Number(value || 0).toFixed(2)}`;

export async function buildPerformanceReportPdf(options: PerformanceReportOptions): Promise<jsPDF> {
  const { report } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = pageWidth - 14;
  const mid = pageWidth / 2;
  let y = 16;

  // ---- Letterhead ----
  doc.setTextColor(...INK);
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text(options.schoolName.toUpperCase(), mid, y + 3, { align: "center", maxWidth: right - left });
  y += 8;
  if (options.schoolMotto) {
    doc.setFont("times", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(options.schoolMotto, mid, y, { align: "center" });
    y += 5;
  }
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(`${report.scope.toUpperCase()} PERFORMANCE REPORT`, mid, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Academic year: ${report.academic_year}   |   Term: ${report.term}   |   ${report.student_count} learner(s) with marks`,
    mid, y, { align: "center" },
  );
  y += 7;

  // ---- School headline ----
  autoTable(doc, {
    startY: y,
    margin: { left, right: 14 },
    head: [["School Average", "First in School", "Last in School"]],
    body: [[
      `${avg(report.school_average)} / 20`,
      report.best ? `${report.best.name} — ${avg(report.best.average)} (${report.best.class_name})` : "-",
      report.weakest ? `${report.weakest.name} — ${avg(report.weakest.average)} (${report.weakest.class_name})` : "-",
    ]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, halign: "center", textColor: INK, lineColor: RULE, lineWidth: 0.2, cellPadding: 2.5 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontStyle: "bold" },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

  // ---- Whole-school tally: sat / passed / failed (+ promoted / repeated) ----
  const tallyHead = ["Students", "Passed", "Failed"];
  const tallyBody = [
    String(report.student_count ?? 0),
    String(report.passed_count ?? 0),
    String(report.failed_count ?? 0),
  ];
  if (report.is_annual) {
    tallyHead.push("Promoted", "Repeated");
    tallyBody.push(String(report.promoted_count ?? 0), String(report.repeated_count ?? 0));
  }
  autoTable(doc, {
    startY: y,
    margin: { left, right: 14 },
    head: [tallyHead],
    body: [tallyBody],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, halign: "center", textColor: INK, lineColor: RULE, lineWidth: 0.2, cellPadding: 2.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontStyle: "bold" },
  });
  if (report.pass_mark != null) {
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Pass mark: ${avg(report.pass_mark)} / 20`, right, y, { align: "right" });
  }
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;

  // ---- Class by class ----
  for (const klass of report.classes || []) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(klass.class_name, left, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const classTally = [
      `${klass.student_count} learner(s)`,
      `${klass.passed_count ?? 0} passed`,
      `${klass.failed_count ?? 0} failed`,
      ...(report.is_annual
        ? [`${klass.promoted_count ?? 0} promoted`, `${klass.repeated_count ?? 0} repeated`]
        : []),
      `avg ${avg(klass.class_average)} / 20`,
    ].join("   |   ");
    doc.text(classTally, right, y, { align: "right" });
    y += 3;

    const maxRows = Math.max(klass.top.length, klass.bottom.length);
    const body: string[][] = [];
    for (let i = 0; i < maxRows; i += 1) {
      const top = klass.top[i];
      const bottom = klass.bottom[i];
      body.push([
        top ? String(top.position) : "",
        top ? top.name : "",
        top ? avg(top.average) : "",
        bottom ? String(bottom.position) : "",
        bottom ? bottom.name : "",
        bottom ? avg(bottom.average) : "",
      ]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left, right: 14 },
      head: [["#", "Top of the class", "Avg", "#", "Needs support", "Avg"]],
      body,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.5, textColor: INK, cellPadding: 1.6, lineColor: RULE, lineWidth: 0.15 },
      headStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        2: { cellWidth: 16, halign: "right" },
        3: { cellWidth: 8, halign: "center" },
        5: { cellWidth: 16, halign: "right" },
      },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 7;
  }

  // ---- Signature ----
  const pageHeight = doc.internal.pageSize.getHeight();
  let signY = y + 10;
  if (signY > pageHeight - 30) {
    doc.addPage();
    signY = 30;
  }
  const signLeft = right - 70;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("Signed: The Principal", right, signY, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(options.principal, right, signY + 5, { align: "right" });
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(signLeft, signY + 16, right, signY + 16);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Signature & Stamp", (signLeft + right) / 2, signY + 20, { align: "center" });

  return doc;
}

export async function downloadPerformanceReportPdf(options: PerformanceReportOptions) {
  const doc = await buildPerformanceReportPdf(options);
  const name = `performance_${options.report.academic_year}_${options.report.term}_${options.schoolName}`
    .replace(/[^a-z0-9_.-]+/gi, "_");
  doc.save(`${name}.pdf`);
}
