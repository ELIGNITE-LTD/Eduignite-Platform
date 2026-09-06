import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { AttendanceRecord, AttendanceStatus } from '../shared/types';
import { buildAttendanceRateReport, type AttendanceRateReportRow } from '../domain/attendance';
import { enqueueChange } from './syncQueueRepository';

// Attendance Tracking (spec module 6): daily entry, history, and automated
// rate reports. `attendance_records` has a UNIQUE(student_id, attendance_date)
// constraint, so re-recording the same day for the same student overwrites
// (upserts) rather than duplicating.

export interface AttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface RecordDayInput {
  classStreamId: string;
  attendanceDate: string; // 'YYYY-MM-DD'
  term: string;
  academicYear: string;
  recordedBy?: string | null;
  entries: AttendanceEntry[];
}

/** Records (or overwrites) one day's attendance for every listed student, in one transaction. */
export function recordDay(db: Database.Database, input: RecordDayInput): AttendanceRecord[] {
  const now = nowIso();
  const upsert = db.transaction((entries: AttendanceEntry[]) => {
    for (const entry of entries) {
      const id = newId();
      db.prepare(
        `INSERT INTO attendance_records (
          id, student_id, class_stream_id, attendance_date, status, term, academic_year,
          recorded_by, notes, created_at, updated_at
        ) VALUES (@id, @student_id, @class_stream_id, @attendance_date, @status, @term, @academic_year,
          @recorded_by, @notes, @created_at, @updated_at)
        ON CONFLICT(student_id, attendance_date) DO UPDATE SET
          status = excluded.status, notes = excluded.notes, recorded_by = excluded.recorded_by,
          class_stream_id = excluded.class_stream_id, term = excluded.term,
          academic_year = excluded.academic_year, updated_at = excluded.updated_at`
      ).run({
        id,
        student_id: entry.studentId,
        class_stream_id: input.classStreamId,
        attendance_date: input.attendanceDate,
        status: entry.status,
        term: input.term,
        academic_year: input.academicYear,
        recorded_by: input.recordedBy ?? null,
        notes: entry.notes ?? '',
        created_at: now,
        updated_at: now,
      });
      const saved = db
        .prepare('SELECT * FROM attendance_records WHERE student_id = ? AND attendance_date = ?')
        .get(entry.studentId, input.attendanceDate) as AttendanceRecord;
      enqueueChange(db, 'attendance_records', saved.id, 'update', saved);
    }
  });
  upsert(input.entries);

  return db
    .prepare('SELECT * FROM attendance_records WHERE class_stream_id = ? AND attendance_date = ?')
    .all(input.classStreamId, input.attendanceDate) as AttendanceRecord[];
}

export interface AttendanceHistoryFilters {
  studentId?: string;
  classStreamId?: string;
  dateFrom?: string;
  dateTo?: string;
  term?: string;
  academicYear?: string;
}

export function listHistory(db: Database.Database, filters: AttendanceHistoryFilters): AttendanceRecord[] {
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
  if (filters.dateFrom) {
    clauses.push('attendance_date >= @dateFrom');
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    clauses.push('attendance_date <= @dateTo');
    params.dateTo = filters.dateTo;
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
    .prepare(`SELECT * FROM attendance_records ${where} ORDER BY attendance_date DESC`)
    .all(params) as AttendanceRecord[];
}

/** Attendance-rate report for every student in a class stream over a term/year. */
export function rateReportForStream(
  db: Database.Database,
  classStreamId: string,
  term: string,
  academicYear: string
): AttendanceRateReportRow[] {
  const rows = db
    .prepare(
      `SELECT student_id, status FROM attendance_records
       WHERE class_stream_id = ? AND term = ? AND academic_year = ?`
    )
    .all(classStreamId, term, academicYear) as { student_id: string; status: AttendanceStatus }[];

  const byStudent = new Map<string, AttendanceStatus[]>();
  for (const row of rows) {
    const list = byStudent.get(row.student_id) ?? [];
    list.push(row.status);
    byStudent.set(row.student_id, list);
  }
  return buildAttendanceRateReport(byStudent);
}
