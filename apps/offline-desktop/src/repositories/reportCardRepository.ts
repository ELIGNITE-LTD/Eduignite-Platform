import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { ReportCard } from '../shared/types';
import { calculateTermResult, DEFAULT_PROMOTION_AVERAGE, type TermResult } from '../domain/grading';
import { buildSubjectMarksForStudentTerm } from './academicsRepository';
import { enqueueChange } from './syncQueueRepository';

// Report Cards (spec module 8): compiles a student's term result (via
// domain/grading.ts) into an immutable snapshot row, and offers historical
// lookup for the renderer / PDF export. `report_cards` has a
// UNIQUE(student_id, term, academic_year) constraint, so recompiling a term
// (e.g. after a late mark correction) replaces the previous snapshot rather
// than accumulating duplicates.

export interface CompileReportCardInput {
  studentId: string;
  classStreamId: string;
  term: string;
  academicYear: string;
  promotionAverage?: number;
}

export interface CompiledReportCard extends ReportCard {
  result: TermResult;
}

/**
 * Compiles one student's term report card and persists it. Also updates the
 * student's `annual_average` / `is_on_honour_roll` fields so downstream
 * workflows (Student Management promotion) can use the latest figure without
 * recomputing grading themselves.
 */
export function compileReportCard(db: Database.Database, input: CompileReportCardInput): CompiledReportCard {
  const subjectMarks = buildSubjectMarksForStudentTerm(
    db,
    input.studentId,
    input.classStreamId,
    input.term,
    input.academicYear
  );
  const result = calculateTermResult(subjectMarks, input.promotionAverage ?? DEFAULT_PROMOTION_AVERAGE);

  const id = newId();
  const now = nowIso();

  db.prepare(
    `INSERT INTO report_cards (
      id, student_id, class_stream_id, term, academic_year, total_score, total_coefficient,
      average_score, grade_range, class_rank, class_size, promotional_eligible, subjects_snapshot_json,
      pdf_path, generated_at, created_at, updated_at
    ) VALUES (@id, @student_id, @class_stream_id, @term, @academic_year, @total_score, @total_coefficient,
      @average_score, @grade_range, NULL, NULL, @promotional_eligible, @subjects_snapshot_json,
      NULL, @generated_at, @created_at, @updated_at)
    ON CONFLICT(student_id, term, academic_year) DO UPDATE SET
      class_stream_id = excluded.class_stream_id, total_score = excluded.total_score,
      total_coefficient = excluded.total_coefficient, average_score = excluded.average_score,
      grade_range = excluded.grade_range, promotional_eligible = excluded.promotional_eligible,
      subjects_snapshot_json = excluded.subjects_snapshot_json, generated_at = excluded.generated_at,
      updated_at = excluded.updated_at`
  ).run({
    id,
    student_id: input.studentId,
    class_stream_id: input.classStreamId,
    term: input.term,
    academic_year: input.academicYear,
    total_score: result.totalScore,
    total_coefficient: result.totalCoefficient,
    average_score: result.averageScore,
    grade_range: result.gradeRange,
    promotional_eligible: result.promotionalEligible ? 1 : 0,
    subjects_snapshot_json: JSON.stringify(result.subjects),
    generated_at: now,
    created_at: now,
    updated_at: now,
  });

  db.prepare('UPDATE students SET annual_average = ?, is_on_honour_roll = ?, updated_at = ? WHERE id = ?').run(
    result.averageScore,
    result.gradeRange === 'Excellent' ? 1 : 0,
    now,
    input.studentId
  );

  const saved = db
    .prepare('SELECT * FROM report_cards WHERE student_id = ? AND term = ? AND academic_year = ?')
    .get(input.studentId, input.term, input.academicYear) as ReportCard;
  enqueueChange(db, 'report_cards', saved.id, 'update', saved);
  enqueueChange(db, 'students', input.studentId, 'update', {
    annual_average: result.averageScore,
    is_on_honour_roll: result.gradeRange === 'Excellent',
  });

  return { ...saved, result };
}

/** Compiles report cards for every active student in a class stream, then assigns class_rank/class_size. */
export function compileReportCardsForStream(
  db: Database.Database,
  classStreamId: string,
  term: string,
  academicYear: string,
  promotionAverage?: number
): CompiledReportCard[] {
  const students = db
    .prepare("SELECT id FROM students WHERE class_stream_id = ? AND status = 'active'")
    .all(classStreamId) as { id: string }[];

  const compiled = students.map((s) =>
    compileReportCard(db, { studentId: s.id, classStreamId, term, academicYear, promotionAverage })
  );

  const ranked = [...compiled].sort((a, b) => b.average_score - a.average_score);
  const classSize = ranked.length;
  const now = nowIso();
  ranked.forEach((card, index) => {
    const rank = index + 1;
    db.prepare('UPDATE report_cards SET class_rank = ?, class_size = ?, updated_at = ? WHERE id = ?').run(
      rank,
      classSize,
      now,
      card.id
    );
    card.class_rank = rank;
    card.class_size = classSize;
  });

  return compiled;
}

export function getReportCard(db: Database.Database, id: string): ReportCard | null {
  const row = db.prepare('SELECT * FROM report_cards WHERE id = ?').get(id) as ReportCard | undefined;
  return row ?? null;
}

export interface ReportCardFilters {
  studentId?: string;
  classStreamId?: string;
  term?: string;
  academicYear?: string;
}

export function listReportCards(db: Database.Database, filters: ReportCardFilters): ReportCard[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.studentId) {
    clauses.push('student_id = @studentId');
    params.studentId = filters.studentId;
  }
  if (filters.classStreamId) {
    clauses.push('class_stream_id = @classStreamId');
    params.classStreamId = filters.classStreamId;
  }
  if (filters.term) {
    clauses.push('term = @term');
    params.term = filters.term;
  }
  if (filters.academicYear) {
    clauses.push('academic_year = @academicYear');
    params.academicYear = filters.academicYear;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM report_cards ${where} ORDER BY generated_at DESC`)
    .all(params) as ReportCard[];
}

export function setReportCardPdfPath(db: Database.Database, id: string, pdfPath: string): void {
  db.prepare('UPDATE report_cards SET pdf_path = ?, updated_at = ? WHERE id = ?').run(
    pdfPath,
    nowIso(),
    id
  );
}
