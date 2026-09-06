import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { ClassSubjectTeacher, Subject } from '../shared/types';
import { enqueueChange } from './syncQueueRepository';

// Subject Management (spec module 5): curriculum catalog + per-class-stream
// subject/teacher/coefficient mapping used by grading (domain/grading.ts).

export type SubjectInput = Omit<Subject, 'id' | 'is_active' | 'created_at' | 'updated_at'>;
export type ClassSubjectTeacherInput = Omit<
  ClassSubjectTeacher,
  'id' | 'is_active' | 'created_at' | 'updated_at'
>;

export function listSubjects(db: Database.Database, schoolId: string): Subject[] {
  return db.prepare('SELECT * FROM subjects WHERE school_id = ? ORDER BY name').all(schoolId) as Subject[];
}

export function getSubject(db: Database.Database, id: string): Subject | null {
  const row = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id) as Subject | undefined;
  return row ?? null;
}

export function createSubject(db: Database.Database, input: SubjectInput): Subject {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO subjects (id, school_id, name, code, is_active, created_at, updated_at)
     VALUES (@id, @school_id, @name, @code, 1, @created_at, @updated_at)`
  ).run({ id, ...input, created_at: now, updated_at: now });
  const created = getSubject(db, id) as Subject;
  enqueueChange(db, 'subjects', id, 'insert', created);
  return created;
}

export interface ClassSubjectAssignmentRow extends ClassSubjectTeacher {
  subject_name: string;
  subject_code: string;
}

/** Every subject assigned to a class stream for a given year, with the subject's name/code joined in. */
export function listAssignmentsForStream(
  db: Database.Database,
  classStreamId: string,
  academicYear: string
): ClassSubjectAssignmentRow[] {
  return db
    .prepare(
      `SELECT cst.*, s.name as subject_name, s.code as subject_code
       FROM class_subject_teacher cst
       JOIN subjects s ON s.id = cst.subject_id
       WHERE cst.class_stream_id = ? AND cst.academic_year = ? AND cst.is_active = 1
       ORDER BY s.name`
    )
    .all(classStreamId, academicYear) as ClassSubjectAssignmentRow[];
}

export function getAssignment(db: Database.Database, id: string): ClassSubjectTeacher | null {
  const row = db.prepare('SELECT * FROM class_subject_teacher WHERE id = ?').get(id) as
    | ClassSubjectTeacher
    | undefined;
  return row ?? null;
}

export function assignSubjectToStream(
  db: Database.Database,
  input: ClassSubjectTeacherInput
): ClassSubjectTeacher {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO class_subject_teacher (
      id, class_stream_id, subject_id, teacher_id, academic_year, coefficient, is_compulsory, is_active,
      created_at, updated_at
    ) VALUES (@id, @class_stream_id, @subject_id, @teacher_id, @academic_year, @coefficient, @is_compulsory, 1,
      @created_at, @updated_at)
    ON CONFLICT(class_stream_id, subject_id, academic_year) DO UPDATE SET
      teacher_id = excluded.teacher_id, coefficient = excluded.coefficient,
      is_compulsory = excluded.is_compulsory, is_active = 1, updated_at = excluded.updated_at`
  ).run({ id, ...input, created_at: now, updated_at: now });

  const created = db
    .prepare(
      'SELECT * FROM class_subject_teacher WHERE class_stream_id = ? AND subject_id = ? AND academic_year = ?'
    )
    .get(input.class_stream_id, input.subject_id, input.academic_year) as ClassSubjectTeacher;
  enqueueChange(db, 'class_subject_teacher', created.id, 'insert', created);
  return created;
}

export function updateAssignment(
  db: Database.Database,
  id: string,
  input: Partial<Pick<ClassSubjectTeacherInput, 'teacher_id' | 'coefficient' | 'is_compulsory'>>
): ClassSubjectTeacher {
  const existing = getAssignment(db, id);
  if (!existing) throw new Error(`Class-subject assignment ${id} not found.`);
  const merged = { ...existing, ...input, updated_at: nowIso() };
  db.prepare(
    `UPDATE class_subject_teacher SET
      teacher_id = @teacher_id, coefficient = @coefficient, is_compulsory = @is_compulsory,
      updated_at = @updated_at
    WHERE id = @id`
  ).run(merged);
  const updated = getAssignment(db, id) as ClassSubjectTeacher;
  enqueueChange(db, 'class_subject_teacher', id, 'update', updated);
  return updated;
}
