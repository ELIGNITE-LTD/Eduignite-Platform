import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { ClassStream, Subject, Teacher } from '../shared/types';
import type { ClassSubjectAssignmentRow } from '../repositories/subjectRepository';

export default function SubjectsPage() {
  const { school } = useSchool();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [streams, setStreams] = useState<ClassStream[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<ClassSubjectAssignmentRow[]>([]);

  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');

  const [selectedStream, setSelectedStream] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [coefficient, setCoefficient] = useState('2');

  async function loadBase() {
    if (!school) return;
    const [s, st, t] = await Promise.all([
      window.api.subjects.list(school.id),
      window.api.classes.listStreams(),
      window.api.teachers.list(school.id),
    ]);
    setSubjects(s);
    setStreams(st);
    setTeachers(t);
  }

  async function loadAssignments(streamId: string) {
    if (!school || !streamId) {
      setAssignments([]);
      return;
    }
    setAssignments(await window.api.subjects.listForStream(streamId, school.academic_year));
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school]);

  useEffect(() => {
    loadAssignments(selectedStream);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStream, school]);

  async function onCreateSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !subjectName) return;
    await window.api.subjects.create({ school_id: school.id, name: subjectName, code: subjectCode });
    setSubjectName('');
    setSubjectCode('');
    await loadBase();
  }

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !selectedStream || !assignSubjectId) return;
    await window.api.subjects.assign({
      class_stream_id: selectedStream,
      subject_id: assignSubjectId,
      teacher_id: assignTeacherId || null,
      academic_year: school.academic_year,
      coefficient: Number(coefficient) || 1,
      is_compulsory: 1,
    });
    setAssignSubjectId('');
    setAssignTeacherId('');
    setCoefficient('2');
    await loadAssignments(selectedStream);
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Subjects</h1>

      <section className="card">
        <h2 className="font-semibold mb-3">Curriculum subjects</h2>
        <form className="flex gap-3 items-end mb-4" onSubmit={onCreateSubject}>
          <div>
            <label className="text-sm font-medium block mb-1">Subject name</label>
            <input className="input-field" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Code</label>
            <input className="input-field" value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit">
            Add subject
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <span key={s.id} className="px-2 py-1 rounded bg-muted text-sm">
              {s.name} {s.code && `(${s.code})`}
            </span>
          ))}
          {subjects.length === 0 && <span className="text-sm text-muted-foreground">No subjects yet.</span>}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Class-subject-teacher assignment</h2>
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

        {selectedStream && (
          <>
            <form className="flex gap-3 items-end flex-wrap mb-4" onSubmit={onAssign}>
              <div>
                <label className="text-sm font-medium block mb-1">Subject</label>
                <select className="input-field" value={assignSubjectId} onChange={(e) => setAssignSubjectId(e.target.value)} required>
                  <option value="">Select subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Teacher</label>
                <select className="input-field" value={assignTeacherId} onChange={(e) => setAssignTeacherId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Coefficient</label>
                <input
                  className="input-field w-24"
                  type="number"
                  min={1}
                  value={coefficient}
                  onChange={(e) => setCoefficient(e.target.value)}
                />
              </div>
              <button className="btn-primary" type="submit">
                Assign
              </button>
            </form>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Coefficient</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.subject_name}</td>
                    <td>{teachers.find((t) => t.id === a.teacher_id)?.first_name ?? '—'}</td>
                    <td>{a.coefficient}</td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-muted-foreground py-4">
                      No subjects assigned to this stream yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
