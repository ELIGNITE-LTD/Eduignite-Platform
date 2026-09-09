import type Database from 'better-sqlite3-multiple-ciphers';

// Resolves which class_streams a TEACHER-role `users` account is allowed to
// touch, so IPC handlers can scope reads/writes without a teacher needing
// their own copy of every list/filter query. A teacher's assignments come
// from two existing (0001) tables — no schema change needed here:
//   - class_streams.class_teacher_id (their homeroom stream, if any)
//   - class_subject_teacher.teacher_id (every stream they teach a subject in)
// `users.teacher_id` (0003) is the bridge from a login account to the
// records-only `teachers` row these two tables key off of.

/** class_stream ids a teacher (by their `teachers.id`, via `users.teacher_id`) is assigned to in any way. */
export function getAssignedClassStreamIds(db: Database.Database, teacherId: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT id FROM class_streams WHERE class_teacher_id = ?
       UNION
       SELECT class_stream_id AS id FROM class_subject_teacher WHERE teacher_id = ? AND is_active = 1`
    )
    .all(teacherId, teacherId) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/** True if the class stream is one the given teacher is assigned to (homeroom or subject). */
export function isTeacherAssignedToStream(
  db: Database.Database,
  teacherId: string,
  classStreamId: string
): boolean {
  return getAssignedClassStreamIds(db, teacherId).has(classStreamId);
}
