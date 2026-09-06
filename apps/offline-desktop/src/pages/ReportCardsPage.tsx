import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { ClassStream, ReportCard, Student } from '../shared/types';

export default function ReportCardsPage() {
  const { school } = useSchool();
  const [streams, setStreams] = useState<ClassStream[]>([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [compiling, setCompiling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!school) return;
    window.api.classes.listStreams().then(setStreams);
  }, [school]);

  async function loadReportCards() {
    if (!selectedStream || !school) {
      setReportCards([]);
      return;
    }
    const [rc, st] = await Promise.all([
      window.api.reportCards.list({
        classStreamId: selectedStream,
        term: school.active_term,
        academicYear: school.academic_year,
      }),
      window.api.students.list({ schoolId: school.id, classStreamId: selectedStream }),
    ]);
    setReportCards(rc);
    setStudents(st);
  }

  useEffect(() => {
    loadReportCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStream, school]);

  async function onCompile() {
    if (!selectedStream || !school) return;
    setCompiling(true);
    setMessage(null);
    try {
      const compiled = await window.api.reportCards.compileForStream(
        selectedStream,
        school.active_term,
        school.academic_year
      );
      setMessage(`Compiled ${compiled.length} report card(s) for ${school.active_term} ${school.academic_year}.`);
      await loadReportCards();
    } finally {
      setCompiling(false);
    }
  }

  async function onExport(id: string) {
    setExporting(id);
    try {
      const { pdfPath } = await window.api.reportCards.exportPdf(id);
      setMessage(`PDF saved to ${pdfPath}`);
    } finally {
      setExporting(null);
    }
  }

  const studentName = (id: string) => {
    const s = students.find((st) => st.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Report Cards</h1>

      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="text-sm font-medium block mb-1">Class stream</label>
          <select className="input-field" value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)}>
            <option value="">Select stream</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={onCompile} disabled={!selectedStream || compiling}>
          {compiling ? 'Compiling…' : `Compile for ${school?.active_term ?? 'term'}`}
        </button>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Average</th>
              <th>Grade</th>
              <th>Rank</th>
              <th>Promotion eligible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reportCards.map((rc) => (
              <tr key={rc.id}>
                <td>{studentName(rc.student_id)}</td>
                <td>{rc.average_score.toFixed(2)}</td>
                <td>{rc.grade_range}</td>
                <td>
                  {rc.class_rank ?? '—'}/{rc.class_size ?? '—'}
                </td>
                <td>{rc.promotional_eligible ? 'Yes' : 'No'}</td>
                <td>
                  <button className="text-primary underline text-sm" onClick={() => onExport(rc.id)} disabled={exporting === rc.id}>
                    {exporting === rc.id ? 'Exporting…' : 'Export PDF'}
                  </button>
                </td>
              </tr>
            ))}
            {reportCards.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-6">
                  {selectedStream ? 'No report cards compiled for this term yet.' : 'Select a class stream first.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
