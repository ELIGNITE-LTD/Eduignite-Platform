// Pure attendance-rate calculation logic (Attendance Tracking module).

import type { AttendanceStatus } from '../shared/types';

export interface AttendanceTally {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

const EMPTY_TALLY: AttendanceTally = { present: 0, absent: 0, late: 0, excused: 0 };

export function tallyAttendance(statuses: AttendanceStatus[]): AttendanceTally {
  return statuses.reduce<AttendanceTally>(
    (tally, status) => ({ ...tally, [status]: tally[status] + 1 }),
    { ...EMPTY_TALLY }
  );
}

/**
 * Attendance rate = (present + late) / total recorded days, expressed as a
 * percentage. "Late" counts toward attendance (the student did show up);
 * "excused" absences are counted as absent for the rate but are still worth
 * distinguishing in the UI/report since they are not misconduct.
 */
export function calculateAttendanceRate(tally: AttendanceTally): number {
  const total = tally.present + tally.absent + tally.late + tally.excused;
  if (total === 0) return 0;
  return ((tally.present + tally.late) / total) * 100;
}

export interface AttendanceRateReportRow {
  studentId: string;
  tally: AttendanceTally;
  totalDays: number;
  attendanceRate: number;
}

export function buildAttendanceRateReport(
  recordsByStudent: Map<string, AttendanceStatus[]>
): AttendanceRateReportRow[] {
  const rows: AttendanceRateReportRow[] = [];
  for (const [studentId, statuses] of recordsByStudent.entries()) {
    const tally = tallyAttendance(statuses);
    rows.push({
      studentId,
      tally,
      totalDays: statuses.length,
      attendanceRate: calculateAttendanceRate(tally),
    });
  }
  return rows.sort((a, b) => b.attendanceRate - a.attendanceRate);
}
