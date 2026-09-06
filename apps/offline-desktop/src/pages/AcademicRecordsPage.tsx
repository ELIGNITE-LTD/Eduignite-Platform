import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { CatMark, ClassStream, ExamMark, Student } from '../shared/types';
import type { ClassSubjectAssignmentRow } from '../repositories/subjectRepository';

export default function AcademicRecordsPage() {
  const { school } = useSchool();
  const [streams, setStreams] = useState<ClassStream[]>([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [assignments, setAssignments] = useState<ClassSubjectAssignmentRow[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [catNumber, setCatNumber] = useState('1');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('20');
  const [mode, setMode] = useState<'cat' | 'exam'>('cat');
  const [marks, setMarks] = useState<{ cats: CatMark[]; exams: ExamMark[] }>({ cats: [], exams: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!school) return;
    window.api.classes.listStreams().then(setStreams);
  }, [school]);

  useEffect(() => {
    if (!selectedStream || !school) {
      setAssignments([]);
      setStudents([]);
      return;
    }
    window.api.subjects.listForStream(selectedStream, school.academic_year).then(setAssignments);
    window.api.students.list({ schoolId: school.id, classStreamId: selectedStream, status: 'active' }).then(setStudents);
  }, [selectedStream, school]);

  async function loadMarks() {
    if (!selectedStudent || !school) return;
    setMarks(await window.api.academics.listForStudentTerm(selectedStudent, school.active_term, school.academic_year));
  }

  useEffect(() => {
    loadMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, school]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !selectedStream || !selectedSubject || !selectedStudent || score === '') return;
    setSaving(true);
    try {
      const base = {
        studentId: selectedStudent,
        subjectId: selectedSubject,
        classStreamId: selectedStream,
        term: school.active_term,
        academicYear: school.academic_year,
        score: Number(score),
        maxScore: Number(maxScore) || 20,
      };
      if (mode === 'cat') {
        await window.api.academics.recordCat({ ...base, catNumber: Number(catNumber) || 1 });
      } else {
        await window.api.academics.recordExam(base);
      }
      setScore('');
      await loadMarks();
    } finally {
      setSaving(false);
    }
  }

  const subjectName = (id: string) => assignments.find((a) => a.subject_id === id)?.subject_name ?? id;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Academic Records</h1>

      <div className="flex gap-4 flex-wrap">
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
        <div>
          <label className="text-sm font-medium block mb-1">Student</label>
          <select className="input-field" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedStream && selectedStudent && (
        <form className="card grid grid-cols-2 md:grid-cols-6 gap-3 items-end" onSubmit={onSubmit}>
          <div className="col-span-2">
            <label className="text-sm font-medium block mb-1">Subject</label>
            <select className="input-field" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} required>
              <option value="">Select subject</option>
              {assignments.map((a) => (
                <option key={a.subject_id} value={a.subject_id}>
                  {a.subject_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Type</label>
            <select className="input-field" value={mode} onChange={(e) => setMode(e.target.value as 'cat' | 'exam')}>
              <option value="cat">CAT</option>
              <option value="exam">Exam</option>
            </select>
          </div>
          {mode === 'cat' && (
            <div>
              <label className="text-sm font-medium block mb-1">CAT #</label>
              <input className="input-field" type="number" min={1} value={catNumber} onChange={(e) => setCatNumber(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-sm font-medium block mb-1">Score</label>
            <input className="input-field" type="number" step="0.1" value={score} onChange={(e) => setScore(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Max score</label>
            <input className="input-field" type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
          </div>
          <div>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record mark'}
            </button>
          </div>
        </form>
      )}

      {selectedStudent && (
        <div className="grid grid-cols-2 gap-4">
          <section className="card">
            <h2 className="font-semibold mb-2">CATs recorded (this term)</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>#</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {marks.cats.map((c) => (
                  <tr key={c.id}>
                    <td>{subjectName(c.subject_id)}</td>
                    <td>{c.cat_number}</td>
                    <td>
                      {c.score}/{c.max_score}
                    </td>
                  </tr>
                ))}
                {marks.cats.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-muted-foreground py-4">
                      No CATs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2 className="font-semibold mb-2">Exams recorded (this term)</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {marks.exams.map((ex) => (
                  <tr key={ex.id}>
                    <td>{subjectName(ex.subject_id)}</td>
                    <td>
                      {ex.score}/{ex.max_score}
                    </td>
                  </tr>
                ))}
                {marks.exams.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center text-muted-foreground py-4">
                      No exam marks yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
