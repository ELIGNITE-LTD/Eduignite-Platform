import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ReportCard, School, Student } from '../shared/types';
import type { SubjectResult } from '../domain/grading';

export interface ReportCardPdfInput {
  school: School;
  student: Student;
  reportCard: ReportCard;
  subjects: SubjectResult[];
}

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(2));

export function buildReportCardDocDefinition(input: ReportCardPdfInput): TDocumentDefinitions {
  const { school, student, reportCard, subjects } = input;

  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    content: [
      { text: school.name, style: 'header' },
      { text: [school.location, school.address].filter(Boolean).join(' — '), style: 'muted' },
      { text: ' ' },
      { text: `Report Card — ${reportCard.term} — ${reportCard.academic_year}`, style: 'subheader' },
      {
        columns: [
          { text: `Student: ${student.first_name} ${student.last_name}`, width: '*' },
          { text: `Admission No: ${student.admission_number}`, width: 'auto' },
        ],
      },
      { text: ' ' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Subject', style: 'tableHeader' },
              { text: 'Coef', style: 'tableHeader' },
              { text: 'CAT Avg', style: 'tableHeader' },
              { text: 'Exam', style: 'tableHeader' },
              { text: 'Weighted', style: 'tableHeader' },
            ],
            ...subjects.map((s) => [
              s.subjectName,
              String(s.coefficient),
              fmt(s.catAverage),
              fmt(s.examScore),
              fmt(s.weightedScore),
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: ' ' },
      { text: `Total: ${reportCard.total_score.toFixed(2)} / ${(reportCard.total_coefficient * 20).toFixed(2)}` },
      { text: `Average: ${reportCard.average_score.toFixed(2)} / 20 — ${reportCard.grade_range}`, style: 'subheader' },
      {
        text: `Class Rank: ${reportCard.class_rank ?? '—'} of ${reportCard.class_size ?? '—'}`,
      },
      {
        text: `Promotion status: ${reportCard.promotional_eligible ? 'Eligible for promotion' : 'Not yet eligible'}`,
        margin: [0, 4, 0, 0],
      },
      { text: `Generated: ${reportCard.generated_at}`, style: 'muted', margin: [0, 20, 0, 0] },
    ],
    styles: {
      header: { fontSize: 16, bold: true },
      subheader: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] },
      muted: { fontSize: 8, color: '#666666' },
      tableHeader: { bold: true, fillColor: '#264D73', color: '#ffffff' },
    },
  };
}
