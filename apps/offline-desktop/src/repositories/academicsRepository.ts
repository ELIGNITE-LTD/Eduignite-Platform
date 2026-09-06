import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { CatMark, ExamMark } from '../shared/types';
import type { SubjectMarks } from '../domain/grading';
import { listAssignmentsForStream } from './subjectRepository';
import { enqueueChange } from './syncQueueRepository';

// Academic Records (spec module 7): recording CATs + exam marks. Averaging,
// grade ranges and totals are computed by domain/grading.ts — this module
// only persists raw scores and assembles the SubjectMarks[] that grading and
// reportCardRepository need.

export interface CatInput {
  studentId: string;
  subjectId: string;
  classStreamId: string;
  term: string;
  academicYear: string;
  catNumber: number;
  score: number;
  maxScore?: number;
  recordedBy?: string | null;
}

export function recordCat(db: Database.Database, input: CatInput): CatMark {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO cats (
      id, student_id, subject_id, class_stream_id, term, academic_year, cat_number, score, max_score,
      recorded_by, created_at, updated_at
    ) VALUES (@id, @student_id, @subject_id, @class_stream_id, @term, @academic_year, @cat_number, @score,
      @max_score, @recorded_by, @created_at, @updated_at)
    ON CONFLICT(student_id, subject_id, term, academic_year, cat_number) DO UPDATE SET
      score = excluded.score, max_score = excluded.max_score, recorded_by = excluded.recorded_by,
      updated_at = excluded.updated_at`
  ).run({
    id,
    student_id: input.studentId,
    subject_id: input.subjectId,
    class_stream_id: input.classStreamId,
    term: input.term,
    academic_year: input.academicYear,
    cat_number: input.catNumber,
    score: input.score,
    max_score: input.maxScore ?? 20,
    recorded_by: input.recordedBy ?? null,
    created_at: now,
    updated_at: now,
  });
  const saved = db
    .prepare(
      'SELECT * FROM cats WHERE student_id = ? AND subject_id = ? AND term = ? AND academic_year = ? AND cat_number = ?'
    )
    .get(input.studentId, input.subjectId, input.term, input.academicYear, input.catNumber) as CatMark;
  enqueueChange(db, 'cats', saved.id, 'update', saved);
  return saved;
}

export interface ExamInput {
  studentId: string;
  subjectId: string;
  classStreamId: string;
  term: string;
  academicYear: string;
  score: number;
  maxScore?: number;
  recordedBy?: string | null;
}

export function recordExam(db: Database.Database, input: ExamInput): ExamMark {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO exam_marks (
      id, student_id, subject_id, class_stream_id, term, academic_year, score, max_score,
      recorded_by, created_at, updated_at
    ) VALUES (@id, @student_id, @subject_id, @class_stream_id, @term, @academic_year, @score, @max_score,
      @recorded_by, @created_at, @updated_at)
    ON CONFLICT(student_id, subject_id, term, academic_year) DO UPDATE SET
      score = excluded.score, max_score = excluded.max_score, recorded_by = excluded.recorded_by,
      updated_at = excluded.updated_at`
  ).run({
    id,
    student_id: input.studentId,
    subject_id: input.subjectId,
    class_stream_id: input.classStreamId,
    term: input.term,
    academic_year: input.academicYear,
    score: input.score,
    max_score: input.maxScore ?? 20,
    recorded_by: input.recordedBy ?? null,
    created_at: now,
    updated_at: now,
  });
  const saved = db
    .prepare('SELECT * FROM exam_marks WHERE student_id = ? AND subject_id = ? AND term = ? AND academic_year = ?')
    .get(input.studentId, input.subjectId, input.term, input.academicYear) as ExamMark;
  enqueueChange(db, 'exam_marks', saved.id, 'update', saved);
  return saved;
}

export function listCatsForStudentTerm(
  db: Database.Database,
  studentId: string,
  term: string,
  academicYear: string
): CatMark[] {
  return db
    .prepare('SELECT * FROM cats WHERE student_id = ? AND term = ? AND academic_year = ? ORDER BY cat_number')
    .all(studentId, term, academicYear) as CatMark[];
}

export function listExamsForStudentTerm(
  db: Database.Database,
  studentId: string,
  term: string,
  academicYear: string
): ExamMark[] {
  return db
    .prepare('SELECT * FROM exam_marks WHERE student_id = ? AND term = ? AND academic_year = ?')
    .all(studentId, term, academicYear) as ExamMark[];
}

/**
 * Assembles every subject assigned to the student's class stream, with that
 * student's CATs + exam mark for the term, ready for domain/grading.ts's
 * calculateTermResult(). Subjects with zero marks are still included (with
 * empty cats / null exam) so the report card can show them as ungraded.
 */
export function buildSubjectMarksForStudentTerm(
  db: Database.Database,
  studentId: string,
  classStreamId: string,
  term: string,
  academicYear: string
): SubjectMarks[] {
  const assignments = listAssignmentsForStream(db, classStreamId, academicYear);
  const cats = listCatsForStudentTerm(db, studentId, term, academicYear);
  const exams = listExamsForStudentTerm(db, studentId, term, academicYear);

  return assignments.map((assignment) => ({
    subjectId: assignment.subject_id,
    subjectName: assignment.subject_name,
    coefficient: assignment.coefficient,
    cats: cats
      .filter((c) => c.subject_id === assignment.subject_id)
      .map((c) => ({ score: c.score, max_score: c.max_score })),
    exam: (() => {
      const exam = exams.find((e) => e.subject_id === assignment.subject_id);
      return exam ? { score: exam.score, max_score: exam.max_score } : null;
    })(),
  }));
}
