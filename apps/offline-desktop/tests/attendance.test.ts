import { describe, expect, it } from 'vitest';
import { buildAttendanceRateReport, calculateAttendanceRate, tallyAttendance } from '../src/domain/attendance';

describe('tallyAttendance', () => {
  it('counts each status', () => {
    const tally = tallyAttendance(['present', 'present', 'absent', 'late', 'excused', 'present']);
    expect(tally).toEqual({ present: 3, absent: 1, late: 1, excused: 1 });
  });

  it('returns all zeros for an empty list', () => {
    expect(tallyAttendance([])).toEqual({ present: 0, absent: 0, late: 0, excused: 0 });
  });
});

describe('calculateAttendanceRate', () => {
  it('counts present + late as attendance out of all recorded days', () => {
    // 6 present + 2 late out of 10 total = 80%
    const rate = calculateAttendanceRate({ present: 6, absent: 1, late: 2, excused: 1 });
    expect(rate).toBe(80);
  });

  it('is 0 when there are zero recorded days (avoids division by zero)', () => {
    expect(calculateAttendanceRate({ present: 0, absent: 0, late: 0, excused: 0 })).toBe(0);
  });

  it('is 100 when every day is present', () => {
    expect(calculateAttendanceRate({ present: 5, absent: 0, late: 0, excused: 0 })).toBe(100);
  });
});

describe('buildAttendanceRateReport', () => {
  it('builds one row per student, sorted by rate descending', () => {
    const byStudent = new Map<string, ('present' | 'absent' | 'late' | 'excused')[]>([
      ['low', ['absent', 'absent', 'present']],
      ['high', ['present', 'present', 'present']],
    ]);
    const rows = buildAttendanceRateReport(byStudent);
    expect(rows).toHaveLength(2);
    expect(rows[0].studentId).toBe('high');
    expect(rows[0].attendanceRate).toBe(100);
    expect(rows[1].studentId).toBe('low');
    expect(rows[1].totalDays).toBe(3);
  });
});
