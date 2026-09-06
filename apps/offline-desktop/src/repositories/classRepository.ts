import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { ClassStream, SchoolClass } from '../shared/types';
import { enqueueChange } from './syncQueueRepository';

// Class Management (spec module 4): class levels ("Form 5") + enrollable
// streams within them ("Form 5 A"), and per-stream enrollment counts.

export type ClassInput = Omit<SchoolClass, 'id' | 'is_active' | 'created_at' | 'updated_at'>;
export type ClassStreamInput = Omit<ClassStream, 'id' | 'is_active' | 'created_at' | 'updated_at'>;

export function listClasses(db: Database.Database, schoolId: string): SchoolClass[] {
  return db
    .prepare('SELECT * FROM classes WHERE school_id = ? ORDER BY display_order, name')
    .all(schoolId) as SchoolClass[];
}

export function getClass(db: Database.Database, id: string): SchoolClass | null {
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as SchoolClass | undefined;
  return row ?? null;
}

export function createClass(db: Database.Database, input: ClassInput): SchoolClass {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO classes (id, school_id, name, cycle, display_order, is_active, created_at, updated_at)
     VALUES (@id, @school_id, @name, @cycle, @display_order, 1, @created_at, @updated_at)`
  ).run({ id, ...input, created_at: now, updated_at: now });
  const created = getClass(db, id) as SchoolClass;
  enqueueChange(db, 'classes', id, 'insert', created);
  return created;
}

export function listStreams(db: Database.Database, classId?: string): ClassStream[] {
  if (classId) {
    return db
      .prepare('SELECT * FROM class_streams WHERE class_id = ? ORDER BY name')
      .all(classId) as ClassStream[];
  }
  return db.prepare('SELECT * FROM class_streams ORDER BY name').all() as ClassStream[];
}

export function getStream(db: Database.Database, id: string): ClassStream | null {
  const row = db.prepare('SELECT * FROM class_streams WHERE id = ?').get(id) as ClassStream | undefined;
  return row ?? null;
}

export function createStream(db: Database.Database, input: ClassStreamInput): ClassStream {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO class_streams (
      id, class_id, name, academic_year, class_teacher_id, capacity, is_active, created_at, updated_at
    ) VALUES (@id, @class_id, @name, @academic_year, @class_teacher_id, @capacity, 1, @created_at, @updated_at)`
  ).run({ id, ...input, created_at: now, updated_at: now });
  const created = getStream(db, id) as ClassStream;
  enqueueChange(db, 'class_streams', id, 'insert', created);
  return created;
}

export function updateStream(
  db: Database.Database,
  id: string,
  input: Partial<ClassStreamInput>
): ClassStream {
  const existing = getStream(db, id);
  if (!existing) throw new Error(`Class stream ${id} not found.`);
  const merged = { ...existing, ...input, updated_at: nowIso() };
  db.prepare(
    `UPDATE class_streams SET
      name = @name, academic_year = @academic_year, class_teacher_id = @class_teacher_id,
      capacity = @capacity, updated_at = @updated_at
    WHERE id = @id`
  ).run(merged);
  const updated = getStream(db, id) as ClassStream;
  enqueueChange(db, 'class_streams', id, 'update', updated);
  return updated;
}

/** Active-enrollment count per stream — used by the Class Management screen. */
export function countEnrollmentByStream(db: Database.Database, classStreamId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as n FROM students WHERE class_stream_id = ? AND status = 'active'")
    .get(classStreamId) as { n: number };
  return row.n;
}
