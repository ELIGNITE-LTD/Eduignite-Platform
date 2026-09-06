import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { Teacher } from '../shared/types';
import { enqueueChange } from './syncQueueRepository';

// Teacher Management (spec module 3): registration + active/inactive status.
// Class-stream and subject assignment live in classRepository/subjectRepository
// (they own the class_streams.class_teacher_id / class_subject_teacher rows).

export type TeacherInput = Omit<Teacher, 'id' | 'is_active' | 'created_at' | 'updated_at'>;

export function listTeachers(db: Database.Database, schoolId: string): Teacher[] {
  return db
    .prepare('SELECT * FROM teachers WHERE school_id = ? ORDER BY last_name, first_name')
    .all(schoolId) as Teacher[];
}

export function getTeacher(db: Database.Database, id: string): Teacher | null {
  const row = db.prepare('SELECT * FROM teachers WHERE id = ?').get(id) as Teacher | undefined;
  return row ?? null;
}

export function createTeacher(db: Database.Database, input: TeacherInput): Teacher {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO teachers (
      id, school_id, teacher_number, first_name, last_name, gender, phone, email,
      date_of_joining, is_active, created_at, updated_at
    ) VALUES (@id, @school_id, @teacher_number, @first_name, @last_name, @gender, @phone, @email,
      @date_of_joining, 1, @created_at, @updated_at)`
  ).run({ id, ...input, created_at: now, updated_at: now });
  const created = getTeacher(db, id) as Teacher;
  enqueueChange(db, 'teachers', id, 'insert', created);
  return created;
}

export function updateTeacher(db: Database.Database, id: string, input: Partial<TeacherInput>): Teacher {
  const existing = getTeacher(db, id);
  if (!existing) throw new Error(`Teacher ${id} not found.`);
  const merged = { ...existing, ...input, updated_at: nowIso() };
  db.prepare(
    `UPDATE teachers SET
      teacher_number = @teacher_number, first_name = @first_name, last_name = @last_name,
      gender = @gender, phone = @phone, email = @email, date_of_joining = @date_of_joining,
      updated_at = @updated_at
    WHERE id = @id`
  ).run(merged);
  const updated = getTeacher(db, id) as Teacher;
  enqueueChange(db, 'teachers', id, 'update', updated);
  return updated;
}

export function setTeacherActive(db: Database.Database, id: string, isActive: boolean): Teacher {
  const existing = getTeacher(db, id);
  if (!existing) throw new Error(`Teacher ${id} not found.`);
  db.prepare('UPDATE teachers SET is_active = ?, updated_at = ? WHERE id = ?').run(
    isActive ? 1 : 0,
    nowIso(),
    id
  );
  const updated = getTeacher(db, id) as Teacher;
  enqueueChange(db, 'teachers', id, 'update', updated);
  return updated;
}
