import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { Student, StudentPromotion } from '../shared/types';
import { DEFAULT_PROMOTION_AVERAGE } from '../domain/grading';
import { planClassPromotion, summarizePromotionPlan, type PromotionCandidate } from '../domain/promotion';
import { enqueueChange } from './syncQueueRepository';

// Student Management (spec module 2): registration, profiles, enrollment,
// and the automated class-promotion workflow (domain/promotion.ts owns the
// pure decision logic; this module applies it to real rows transactionally).

export type StudentInput = Omit<
  Student,
  'id' | 'annual_average' | 'is_on_honour_roll' | 'status' | 'created_at' | 'updated_at'
> & { status?: Student['status'] };

export interface StudentFilters {
  schoolId: string;
  classStreamId?: string;
  status?: Student['status'];
  search?: string;
}

export function listStudents(db: Database.Database, filters: StudentFilters): Student[] {
  const clauses = ['school_id = @schoolId'];
  const params: Record<string, unknown> = { schoolId: filters.schoolId };

  if (filters.classStreamId) {
    clauses.push('class_stream_id = @classStreamId');
    params.classStreamId = filters.classStreamId;
  }
  if (filters.status) {
    clauses.push('status = @status');
    params.status = filters.status;
  }
  if (filters.search) {
    clauses.push(
      "(first_name LIKE @search OR last_name LIKE @search OR admission_number LIKE @search)"
    );
    params.search = `%${filters.search}%`;
  }

  return db
    .prepare(`SELECT * FROM students WHERE ${clauses.join(' AND ')} ORDER BY last_name, first_name`)
    .all(params) as Student[];
}

export function getStudent(db: Database.Database, id: string): Student | null {
  const row = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as Student | undefined;
  return row ?? null;
}

export function createStudent(db: Database.Database, input: StudentInput): Student {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO students (
      id, school_id, class_stream_id, admission_number, first_name, last_name, date_of_birth,
      place_of_birth, gender, guardian_name, guardian_phone, guardian_whatsapp, admission_date,
      annual_average, is_on_honour_roll, status, created_at, updated_at
    ) VALUES (@id, @school_id, @class_stream_id, @admission_number, @first_name, @last_name, @date_of_birth,
      @place_of_birth, @gender, @guardian_name, @guardian_phone, @guardian_whatsapp, @admission_date,
      NULL, 0, @status, @created_at, @updated_at)`
  ).run({ id, status: 'active', ...input, created_at: now, updated_at: now });
  const created = getStudent(db, id) as Student;
  enqueueChange(db, 'students', id, 'insert', created);
  return created;
}

export function updateStudent(db: Database.Database, id: string, input: Partial<StudentInput>): Student {
  const existing = getStudent(db, id);
  if (!existing) throw new Error(`Student ${id} not found.`);
  const merged = { ...existing, ...input, updated_at: nowIso() };
  db.prepare(
    `UPDATE students SET
      class_stream_id = @class_stream_id, admission_number = @admission_number, first_name = @first_name,
      last_name = @last_name, date_of_birth = @date_of_birth, place_of_birth = @place_of_birth,
      gender = @gender, guardian_name = @guardian_name, guardian_phone = @guardian_phone,
      guardian_whatsapp = @guardian_whatsapp, admission_date = @admission_date, status = @status,
      updated_at = @updated_at
    WHERE id = @id`
  ).run(merged);
  const updated = getStudent(db, id) as Student;
  enqueueChange(db, 'students', id, 'update', updated);
  return updated;
}

export function listPromotionsForStudent(db: Database.Database, studentId: string): StudentPromotion[] {
  return db
    .prepare('SELECT * FROM student_promotions WHERE student_id = ? ORDER BY created_at DESC')
    .all(studentId) as StudentPromotion[];
}

export interface PromoteClassStreamInput {
  fromClassStreamId: string;
  /** Target stream for students who are promoted. Ignored for repeaters, who stay in fromClassStreamId. */
  toClassStreamId: string;
  academicYear: string;
  promotionAverage?: number;
}

export interface PromoteClassStreamResult {
  promotedCount: number;
  repeatedCount: number;
  total: number;
  decisions: { studentId: string; outcome: 'promoted' | 'repeated'; averageScore: number | null; reason: string }[];
}

/**
 * Bulk-promotes every active student currently in `fromClassStreamId`,
 * using each student's `annual_average` (populated by
 * reportCardRepository.compileReportCard) as the promotion candidate score.
 * Runs as a single DB transaction: either every student's decision is
 * recorded and applied, or none are (never leaves a class half-promoted).
 */
export function promoteClassStream(
  db: Database.Database,
  input: PromoteClassStreamInput
): PromoteClassStreamResult {
  const promotionAverage = input.promotionAverage ?? DEFAULT_PROMOTION_AVERAGE;
  const students = db
    .prepare("SELECT * FROM students WHERE class_stream_id = ? AND status = 'active'")
    .all(input.fromClassStreamId) as Student[];

  const candidates: PromotionCandidate[] = students.map((s) => ({
    studentId: s.id,
    averageScore: s.annual_average,
  }));
  const decisions = planClassPromotion(candidates, promotionAverage);
  const summary = summarizePromotionPlan(decisions);

  const applyAll = db.transaction(() => {
    for (const decision of decisions) {
      const promotionId = newId();
      const now = nowIso();
      const targetStreamId =
        decision.outcome === 'promoted' ? input.toClassStreamId : input.fromClassStreamId;

      db.prepare(
        `INSERT INTO student_promotions (
          id, student_id, academic_year, from_class_stream_id, to_class_stream_id, average_score,
          status, remarks, decided_at, created_at, updated_at
        ) VALUES (@id, @student_id, @academic_year, @from_class_stream_id, @to_class_stream_id, @average_score,
          @status, @remarks, @decided_at, @created_at, @updated_at)`
      ).run({
        id: promotionId,
        student_id: decision.studentId,
        academic_year: input.academicYear,
        from_class_stream_id: input.fromClassStreamId,
        to_class_stream_id: targetStreamId,
        average_score: decision.averageScore,
        status: decision.outcome,
        remarks: decision.reason,
        decided_at: now,
        created_at: now,
        updated_at: now,
      });
      enqueueChange(db, 'student_promotions', promotionId, 'insert', {
        studentId: decision.studentId,
        outcome: decision.outcome,
      });

      db.prepare('UPDATE students SET class_stream_id = ?, updated_at = ? WHERE id = ?').run(
        targetStreamId,
        now,
        decision.studentId
      );
      enqueueChange(db, 'students', decision.studentId, 'update', { class_stream_id: targetStreamId });
    }
  });
  applyAll();

  return { ...summary, decisions };
}
