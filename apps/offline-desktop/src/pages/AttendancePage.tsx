import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { AttendanceRecord, AttendanceStatus, ClassStream, Student } from '../shared/types';
import type { AttendanceRateReportRow } from '../domain/attendance';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

export default function AttendancePage() {
  const { school } = useSchool();
  const [tab, setTab] = useState<'entry' | 'history' | 'rates'>('entry');
  const [streams, setStreams] = useState<ClassStream[]>([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Student[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [rateRows, setRateRows] = useState<AttendanceRateReportRow[]>([]);

  useEffect(() => {
    if (!school) return;
    window.api.classes.listStreams().then(setStreams);
  }, [school]);

  useEffect(() => {
    if (!selectedStream || !school) {
      setStudents([]);
      return;
    }
    window.api.students.list({ schoolId: school.id, classStreamId: selectedStream, status: 'active' }).then((rows) => {
      setStudents(rows);
      setStatuses((prev) => {
        const next: Record<string, AttendanceStatus> = {};
        for (const s of rows) next[s.id] = prev[s.id] ?? 'present';
        return next;
      });
    });
  }, [selectedStream, school]);

  useEffect(() => {
    if (tab === 'history' && selectedStream) {
      window.api.attendance.history({ classStreamId: selectedStream }).then(setHistory);
    }
    if (tab === 'rates' && selectedStream && school) {
      window.api.attendance.rateReport(selectedStream, school.active_term, school.academic_year).then(setRateRows);
    }
  }, [tab, selectedStream, school]);

  async function onSubmitEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !selectedStream) return;
    setSaving(true);
    try {
      await window.api.attendance.recordDay({
        classStreamId: selectedStream,
        attendanceDate: date,
        term: school.active_term,
        academicYear: school.academic_year,
        entries: students.map((s) => ({ studentId: s.id, status: statuses[s.id] ?? 'present' })),
      });
      setSavedMessage(`Saved attendance for ${students.length} students on ${date}.`);
    } finally {
      setSaving(false);
    }
  }

  const studentName = (id: string) => {
    const s = students.find((st) => st.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  return (
    <div>
      <h1 className="page-title">Attendance</h1>

      <div className="flex gap-2 mb-4">
        {(['entry', 'history', 'rates'] as const).map((t) => (
          <button
            key={t}
            className={`px-3 py-1.5 rounded-md text-sm ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            onClick={() => setTab(t)}
          >
            {t === 'entry' ? 'Daily entry' : t === 'history' ? 'History' : 'Rate report'}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium block mb-1">Class stream</label>
        <select className="input-field max-w-xs" value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)}>
          <option value="">Select stream</option>
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {tab === 'entry' && selectedStream && (
        <form className="card" onSubmit={onSubmitEntry}>
          <div className="mb-4">
            <label className="text-sm font-medium block mb-1">Date</label>
            <input className="input-field max-w-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <table className="data-table mb-4">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.first_name} {s.last_name}
                  </td>
                  <td>
                    <select
                      className="input-field"
                      value={statuses[s.id] ?? 'present'}
                      onChange={(e) =>
                        setStatuses((prev) => ({ ...prev, [s.id]: e.target.value as AttendanceStatus }))
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center text-muted-foreground py-4">
                    No active students in this stream.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <button className="btn-primary" type="submit" disabled={saving || students.length === 0}>
            {saving ? 'Saving…' : 'Save attendance'}
          </button>
          {savedMessage && <p className="text-sm text-muted-foreground mt-2">{savedMessage}</p>}
        </form>
      )}

      {tab === 'history' && (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.attendance_date}</td>
                  <td>{studentName(h.student_id)}</td>
                  <td className="capitalize">{h.status}</td>
                  <td>{h.notes}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-6">
                    {selectedStream ? 'No attendance history yet.' : 'Select a class stream first.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rates' && (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Late</th>
                <th>Excused</th>
                <th>Total days</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {rateRows.map((r) => (
                <tr key={r.studentId}>
                  <td>{studentName(r.studentId)}</td>
                  <td>{r.tally.present}</td>
                  <td>{r.tally.absent}</td>
                  <td>{r.tally.late}</td>
                  <td>{r.tally.excused}</td>
                  <td>{r.totalDays}</td>
                  <td>{r.attendanceRate.toFixed(1)}%</td>
                </tr>
              ))}
              {rateRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-6">
                    {selectedStream ? 'No attendance recorded for this term yet.' : 'Select a class stream first.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
