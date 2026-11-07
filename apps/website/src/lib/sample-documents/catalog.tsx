/**
 * Catalogue of the documents shown on /sample-documents.
 *
 * Only documents the platform really generates are listed, each rendered by
 * the same generator the dashboard uses, fed with the fictional data in
 * `demo-data.ts`. Generators are loaded with dynamic imports, so nothing heavy
 * (jsPDF, html2canvas) is part of the server render or the initial bundle.
 */

import type { ReactNode } from "react";
import * as demo from "@/lib/sample-documents/demo-data";
import { addHtmlWatermark, addPdfWatermark } from "@/lib/sample-documents/watermark";

export type SampleCategoryId = "academic" | "financial" | "administrative";
export type ThumbKind = "report" | "transcript" | "certificate" | "chart" | "receipt" | "statement" | "table" | "attendance" | "card";

export type SampleRender =
  | { kind: "html"; html: string; landscape?: boolean }
  | { kind: "pdf"; blob: Blob }
  | { kind: "card"; node: ReactNode; portrait: boolean };

export interface SampleVariant {
  id: string;
  label: string;
  description: string;
  fileName: string;
  build: () => Promise<SampleRender>;
}

export interface SampleDocument {
  id: string;
  category: SampleCategoryId;
  title: string;
  description: string;
  thumb: ThumbKind;
  /** The source file whose generator renders the samples. */
  generator: string;
  variants: SampleVariant[];
}

export const SAMPLE_CATEGORIES: Array<{ id: SampleCategoryId; label: string; blurb: string }> = [
  { id: "academic", label: "Academic", blurb: "Report cards, transcripts, certificates and results." },
  { id: "financial", label: "Financial", blurb: "Fee receipts and fee statements." },
  { id: "administrative", label: "Administrative", blurb: "Registers, attendance reports and ID cards." },
];

const html = (doc: string, landscape = false): SampleRender => ({ kind: "html", html: addHtmlWatermark(doc), landscape });

async function pdfFrom(doc: import("jspdf").jsPDF): Promise<SampleRender> {
  return { kind: "pdf", blob: addPdfWatermark(doc).output("blob") };
}

async function reportCard(payload: Record<string, any>): Promise<SampleRender> {
  const { buildCameroonReportCardHtml } = await import("@/lib/cameroon-report-card");
  return html(buildCameroonReportCardHtml(payload));
}

async function table(options: import("@/lib/pdf-branded").BrandedTableOptions): Promise<SampleRender> {
  const { buildBrandedTablePdf } = await import("@/lib/pdf-branded");
  return pdfFrom(await buildBrandedTablePdf(options));
}

const school = demo.DEMO_SCHOOL;

/** Every sample is built after the inline demo crest has been drawn, so each header carries it. */
function withLogo(docs: SampleDocument[]): SampleDocument[] {
  return docs.map((d) => ({
    ...d,
    variants: d.variants.map((v) => ({
      ...v,
      build: async () => {
        const { ensureDemoLogo } = await import("@/lib/sample-documents/demo-logo");
        await ensureDemoLogo();
        return v.build();
      },
    })),
  }));
}

export const SAMPLE_DOCUMENTS: SampleDocument[] = withLogo([
  {
    id: "report-cards",
    category: "academic",
    title: "Student report cards",
    description: "Termly and annual report cards for secondary, primary and nursery, in English and French.",
    thumb: "report",
    generator: "lib/cameroon-report-card.ts, lib/basic-report-card.ts",
    variants: [
      { id: "secondary-t2", label: "Secondary - Second Term", description: "Sequence marks, coefficients, positions and remarks.", fileName: "sample-report-card-secondary", build: () => reportCard(demo.secondaryReportTerm2()) },
      { id: "secondary-annual", label: "Secondary - Annual", description: "Third-term card with all six sequences and the promotion status.", fileName: "sample-report-card-secondary-annual", build: () => reportCard(demo.secondaryReportAnnual()) },
      { id: "primary-en", label: "Primary - English", description: "Primary layout: tests, exams, averages and grade labels.", fileName: "sample-report-card-primary", build: () => reportCard(demo.primaryReportEn()) },
      { id: "primary-fr", label: "Primary - French (annual)", description: "Bulletin scolaire with the annual summary and promotion decision.", fileName: "sample-bulletin-primaire", build: () => reportCard(demo.primaryReportFrAnnual()) },
      { id: "nursery-en", label: "Nursery - English", description: "Developmental areas and a rating scale, with no marks or ranks.", fileName: "sample-nursery-report", build: () => reportCard(demo.nurseryReportEn()) },
      { id: "nursery-fr", label: "Nursery - French", description: "Bulletin de la maternelle.", fileName: "sample-bulletin-maternelle", build: () => reportCard(demo.nurseryReportFr()) },
    ],
  },
  {
    id: "transcript",
    category: "academic",
    title: "Official transcript",
    description: "Multi-year record of First and Second Cycle marks with annual averages.",
    thumb: "transcript",
    generator: "lib/official-transcript.ts",
    variants: [
      {
        id: "transcript", label: "Multi-year transcript", description: "Form 1 to Upper Sixth, terms and annual averages.", fileName: "sample-official-transcript",
        build: async () => {
          const { buildOfficialTranscriptHtml } = await import("@/lib/official-transcript");
          return html(buildOfficialTranscriptHtml(demo.transcriptData()), true);
        },
      },
    ],
  },
  {
    id: "honour-roll",
    category: "academic",
    title: "Honour roll certificate",
    description: "Certificate of Excellence awarded to top-performing students.",
    thumb: "certificate",
    generator: "lib/honour-roll-certificate.ts",
    variants: [
      {
        id: "certificate", label: "Certificate of Excellence", description: "Landscape certificate with seal and signatures.", fileName: "sample-honour-roll-certificate",
        build: async () => {
          const { buildHonourRollCertificateHtml } = await import("@/lib/honour-roll-certificate");
          return html(buildHonourRollCertificateHtml(demo.honourRollEntry, school), true);
        },
      },
    ],
  },
  {
    id: "performance",
    category: "academic",
    title: "Class performance report",
    description: "School and class averages, pass rates, best and weakest results.",
    thumb: "chart",
    generator: "lib/performance-report-pdf.ts",
    variants: [
      {
        id: "performance", label: "Term performance report", description: "Per-class summary with top and bottom performers.", fileName: "sample-performance-report",
        build: async () => {
          const { buildPerformanceReportPdf } = await import("@/lib/performance-report-pdf");
          return pdfFrom(await buildPerformanceReportPdf({ schoolName: school.name, schoolMotto: school.motto, principal: school.principal, report: demo.performanceReport() }));
        },
      },
    ],
  },
  {
    id: "exam-results",
    category: "academic",
    title: "Examination results",
    description: "Official results sheet listing scores, percentages and absentees for an exam.",
    thumb: "table",
    generator: "lib/pdf-branded.ts (buildBrandedTablePdf)",
    variants: [
      {
        id: "exam-results", label: "Examination results", description: "Scores out of 20 with wrote / absent status.", fileName: "sample-exam-results",
        build: () =>
          table({
            title: "Official Examination Results", school, schoolName: school.name,
            chips: [{ label: "Exam", value: "Sample Mid-Term Test" }, { label: "Subject", value: "Mathematics" }, { label: "Class", value: "Form 4" }, { label: "Wrote", value: 4 }, { label: "Absent", value: 1 }],
            issuingOffice: "Examinations Office", monoColumns: [2], centerColumns: [3, 4, 5, 6],
            columns: ["No", "Student", "Matricule", "Score", "Total", "%", "Status"], rows: demo.examResultRows, fileName: "sample-exam-results",
          }),
      },
    ],
  },
  {
    id: "fee-receipt",
    category: "financial",
    title: "Fee receipts",
    description: "Two-copy receipts (school and student) for single or multiple fees.",
    thumb: "receipt",
    generator: "app/dashboard/fees/fee-receipt.ts",
    variants: [
      {
        id: "single", label: "Single fee receipt", description: "One tuition instalment paid in cash.", fileName: "sample-fee-receipt",
        build: async () => {
          const { buildFeeReceiptPdf } = await import("@/app/dashboard/fees/fee-receipt");
          return pdfFrom(await buildFeeReceiptPdf(demo.receiptData, school.name));
        },
      },
      {
        id: "multi", label: "Multi-fee receipt", description: "Several fees on one receipt, paid by mobile money.", fileName: "sample-fee-receipt-multi",
        build: async () => {
          const { buildFeeReceiptPdf } = await import("@/app/dashboard/fees/fee-receipt");
          return pdfFrom(await buildFeeReceiptPdf(demo.multiItemReceiptData, school.name));
        },
      },
    ],
  },
  {
    id: "fee-statement",
    category: "financial",
    title: "Fee statements",
    description: "Billed, collected and outstanding fees per student, with collection rate.",
    thumb: "statement",
    generator: "lib/fee-statement-pdf.ts",
    variants: [
      {
        id: "all", label: "Fee statement - all students", description: "Full fee ledger with financial summary totals.", fileName: "sample-fee-statement",
        build: async () => {
          const { buildFeeStatementPdf } = await import("@/lib/fee-statement-pdf");
          return pdfFrom(await buildFeeStatementPdf(demo.feeStatementAll()));
        },
      },
      {
        id: "outstanding", label: "Outstanding fees", description: "The same statement filtered to students who still owe fees.", fileName: "sample-outstanding-fees",
        build: async () => {
          const { buildFeeStatementPdf } = await import("@/lib/fee-statement-pdf");
          return pdfFrom(await buildFeeStatementPdf(demo.feeStatementOutstanding()));
        },
      },
    ],
  },
  {
    id: "lists",
    category: "administrative",
    title: "Student, staff and class lists",
    description: "Official rosters and registers for students, staff, classes and new matricules.",
    thumb: "table",
    generator: "lib/pdf-branded.ts (buildBrandedTablePdf)",
    variants: [
      {
        id: "students", label: "Student roster", description: "Registration record with guardian details.", fileName: "sample-student-roster",
        build: () =>
          table({
            title: "Official Student Roster & Registration Record", school, schoolName: school.name,
            chips: [{ label: "Class Filter", value: "All Classes" }, { label: "Total Enrolled", value: "8 Students" }],
            issuingOffice: "Registry & Examination Office", monoColumns: [2, 3], landscape: true,
            columns: ["No", "Name", "Matricule", "Admission No", "Class", "Section", "Guardian", "Guardian Phone"],
            rows: demo.studentRosterRows(), fileName: "sample-student-roster",
          }),
      },
      {
        id: "staff", label: "Staff roster", description: "Faculty and personnel with roles and subjects.", fileName: "sample-staff-roster",
        build: () =>
          table({
            title: "Official Faculty & Teaching Staff Roster", school, schoolName: school.name,
            chips: [{ label: "Total Personnel", value: "6 Staff" }],
            issuingOffice: "Human Resources & Personnel Office", monoColumns: [2], landscape: true,
            columns: ["No", "Name of Staff", "Matricule", "Role", "Subject(s) Taught", "Section", "Email", "Phone"],
            rows: demo.staffRosterRows(), fileName: "sample-staff-roster",
          }),
      },
      {
        id: "classes", label: "Class list", description: "Classes with class masters and headcounts.", fileName: "sample-class-list",
        build: () =>
          table({
            title: "Official Class List & Enrollment Roster", school, schoolName: school.name,
            chips: [{ label: "Section", value: "All Sub Schools" }, { label: "Total Classes", value: "5 Classes" }, { label: "Total Students", value: "182 Students" }],
            issuingOffice: "Academic Studies & Timetable Board", centerColumns: [3, 4, 5],
            columns: ["No", "Class Name", "Class Master", "Number of Teachers", "Number of Subjects", "Number of Students"],
            rows: demo.classListRows, footnote: "Total institutional summary: 5 classes, 182 students enrolled.", fileName: "sample-class-list",
          }),
      },
      {
        id: "activation", label: "Student activation record", description: "Newly issued matricules for a batch of students.", fileName: "sample-activation-record",
        build: () =>
          table({
            title: "Official Student Activation Record", school, schoolName: school.name,
            chips: [{ label: "Class", value: "Form 1" }, { label: "Matricules Issued", value: 6 }],
            issuingOffice: "Registry & Examination Office", monoColumns: [1],
            columns: ["No", "Matricule", "Class", "Level", "Section"], rows: demo.activationRows, fileName: "sample-activation-record",
          }),
      },
    ],
  },
  {
    id: "attendance",
    category: "administrative",
    title: "Attendance reports",
    description: "Attendance history for a class and period, with presence summary.",
    thumb: "attendance",
    generator: "lib/attendance-history-pdf.ts",
    variants: [
      {
        id: "attendance", label: "Attendance history report", description: "Daily register by date with totals and attendance rate.", fileName: "sample-attendance-report",
        build: async () => {
          const { attendanceHistoryDocument } = await import("@/lib/attendance-history-pdf");
          return table(attendanceHistoryDocument(demo.attendanceReport()));
        },
      },
    ],
  },
  {
    id: "id-cards",
    category: "administrative",
    title: "School ID cards",
    description: "Front and back ID cards for students and staff, including the Basic Education card.",
    thumb: "card",
    generator: "components/student-id-card.tsx, components/basic-education-id-card.tsx, lib/id-card-pdf.ts",
    variants: [
      {
        id: "student-classic", label: "Student ID card", description: "Secondary-school student card (landscape CR80).", fileName: "sample-student-id-card",
        build: async () => {
          const { StudentIdCard } = await import("@/components/student-id-card");
          return { kind: "card", portrait: false, node: <StudentIdCard student={demo.classicIdStudent} school={demo.classicIdSchool} /> };
        },
      },
      {
        id: "basic-student", label: "Basic Education - pupil", description: "Nursery and primary pupil card (portrait CR80).", fileName: "sample-basic-pupil-id-card",
        build: async () => {
          const { BasicEducationIdCard, DEFAULT_BASIC_CARD_OPTIONS } = await import("@/components/basic-education-id-card");
          return { kind: "card", portrait: true, node: <BasicEducationIdCard data={demo.basicStudentCard} options={DEFAULT_BASIC_CARD_OPTIONS} /> };
        },
      },
      {
        id: "basic-staff", label: "Basic Education - staff", description: "Staff card with a position line.", fileName: "sample-basic-staff-id-card",
        build: async () => {
          const { BasicEducationIdCard, DEFAULT_BASIC_CARD_OPTIONS } = await import("@/components/basic-education-id-card");
          return { kind: "card", portrait: true, node: <BasicEducationIdCard data={demo.basicStaffCard} options={DEFAULT_BASIC_CARD_OPTIONS} /> };
        },
      },
    ],
  },
]);
