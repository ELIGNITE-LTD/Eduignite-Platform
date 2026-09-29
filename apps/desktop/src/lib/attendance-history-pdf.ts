/**
 * The attendance history report as an official school document.
 *
 * The server decides which records a person may see (see the attendance app's
 * history_report.py); this only lays them out: the school's letterhead and
 * contact line, the filters as facts under the title, one group per date with
 * the register numbered inside it, the totals in a summary, and a signature.
 * Landscape A4, header row repeated on every page, "Page X of Y".
 *
 * This file is identical in the website, mobile and desktop apps.
 */
import { generateBrandedTablePdf, type BrandedTableOptions } from "@/lib/pdf-branded";
import type { OfficialChip, OfficialGroupRow } from "@/lib/pdf-official";

export type AttendanceHistoryRow = {
  date: string;
  class_name: string;
  subject: string;
  period: string;
  student_name: string;
  admission_number: string;
  status: string;
  remarks: string;
};

export type AttendanceHistoryReport = {
  kind: "school" | "subject";
  school: { name: string; motto: string; logo: string; principal: string; address: string; phone: string; email: string };
  teacher_name: string;
  filters: {
    academic_year: string;
    term: string;
    start_date: string;
    end_date: string;
    sub_school?: string;
    class?: string;
    subject?: string;
  };
  summary: {
    students_on_roll: number;
    students_recorded: number;
    sessions: number;
    records: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendance_rate: number | null;
  };
  rows: AttendanceHistoryRow[];
};

export type AttendanceHistoryOptions = {
  kind: "school" | "subject";
  calendar: {
    academic_year: string;
    start_date: string;
    end_date: string;
    terms: { term: number; label: string; start_date: string; end_date: string }[];
  }[];
  classes?: { id: string; name: string; sub_school_id: string | null }[];
  sub_schools?: { id: string; name: string }[];
  assignments?: { class_id: string; class_name: string; subject_id: string; subject_name: string }[];
};

function parseDay(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

export function formatReportDate(iso: string) {
  return parseDay(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function groupHeading(iso: string) {
  return parseDay(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function attendanceRateLabel(rate: number | null) {
  return rate === null ? "-" : `${rate}%`;
}

export function reportTitle(kind: AttendanceHistoryReport["kind"]) {
  return kind === "subject" ? "Subject Attendance History Report" : "Attendance History Report";
}

/** The document, as options for the official table layout. */
export function attendanceHistoryDocument(report: AttendanceHistoryReport): BrandedTableOptions {
  const { filters, summary, kind } = report;
  const isSubject = kind === "subject";

  const chips: OfficialChip[] = [
    { label: "Academic Year", value: filters.academic_year || "-" },
    ...(filters.term ? [{ label: "Term", value: filters.term }] : []),
    ...(filters.sub_school ? [{ label: "Section", value: filters.sub_school }] : []),
    { label: "Class", value: filters.class || "All classes" },
    ...(filters.subject ? [{ label: "Subject", value: filters.subject }] : []),
    ...(isSubject && report.teacher_name ? [{ label: "Teacher", value: report.teacher_name }] : []),
    { label: "Period", value: `${formatReportDate(filters.start_date)} to ${formatReportDate(filters.end_date)}` },
    { label: "Generated", value: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) },
  ];

  // Each date is a group; within it the register is numbered from 1, and a
  // school-wide report names the class and the session of every line.
  const columns = isSubject
    ? ["No.", "Student Name", "Admission No.", "Class", "Status", "Remarks"]
    : ["No.", "Student Name", "Admission No.", "Class", "Session", "Status", "Remarks"];
  const rows: ((string | number)[] | OfficialGroupRow)[] = [];
  let currentDate = "";
  let number = 0;
  for (const row of report.rows) {
    if (row.date !== currentDate) {
      currentDate = row.date;
      number = 0;
      rows.push({ group: groupHeading(row.date) });
    }
    number += 1;
    const session = row.subject || row.period;
    rows.push(
      isSubject
        ? [number, row.student_name, row.admission_number, row.class_name, row.status, row.remarks]
        : [number, row.student_name, row.admission_number, row.class_name, session, row.status, row.remarks],
    );
  }

  const scope = (filters.class || filters.sub_school || filters.subject || "school").replace(/[^a-z0-9]+/gi, "-");
  return {
    title: reportTitle(kind),
    school: report.school,
    chips,
    columns,
    rows,
    landscape: true,
    monoColumns: [2],
    centerColumns: isSubject ? [4] : [5],
    summary: {
      title: "Summary",
      items: [
        { label: "Students on roll", value: summary.students_on_roll },
        { label: "Students recorded", value: summary.students_recorded },
        { label: "Sessions", value: summary.sessions },
        { label: "Attendance records", value: summary.records },
        { label: "Present", value: summary.present },
        { label: "Absent", value: summary.absent },
        { label: "Late", value: summary.late },
        { label: "Excused", value: summary.excused },
        { label: "Attendance rate", value: attendanceRateLabel(summary.attendance_rate) },
      ],
      note:
        "Attendance rate = (present + late) / attendance records. A student recorded in several sessions counts once per session.",
    },
    compact: true,
    issuingOffice: isSubject ? "Subject Attendance Record" : "Office of the Principal",
    signatoryName: isSubject ? report.teacher_name : undefined,
    signatoryTitle: isSubject ? "Subject Teacher" : undefined,
    footerSchoolName: true,
    fileName: `attendance-history-${scope}-${filters.start_date}-to-${filters.end_date}`.toLowerCase(),
  };
}

export async function downloadAttendanceHistoryPdf(report: AttendanceHistoryReport, options: { print?: boolean } = {}) {
  await generateBrandedTablePdf({ ...attendanceHistoryDocument(report), print: options.print });
}
