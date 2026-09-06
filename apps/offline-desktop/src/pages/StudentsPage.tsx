import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSchool } from '../context/SchoolContext';
import type { ClassStream, Student } from '../shared/types';

const EMPTY_FORM = {
  admission_number: '',
  first_name: '',
  last_name: '',
  date_of_birth: '',
  place_of_birth: '',
  gender: 'other' as Student['gender'],
  guardian_name: '',
  guardian_phone: '',
  guardian_whatsapp: '',
  admission_date: '',
  class_stream_id: '',
};

export default function StudentsPage() {
  const { school } = useSchool();
  const [students, setStudents] = useState<Student[]>([]);
  const [streams, setStreams] = useState<ClassStream[]>([]);
  const [search, setSearch] = useState('');
  const [classStreamFilter, setClassStreamFilter] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!school) return;
    const [studentRows, streamRows] = await Promise.all([
      window.api.students.list({
        schoolId: school.id,
        classStreamId: classStreamFilter || undefined,
        search: search || undefined,
      }),
      window.api.classes.listStreams(),
    ]);
    setStudents(studentRows);
    setStreams(streamRows);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school, classStreamFilter]);

  async function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    await load();
  }

  function update(key: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    setSaving(true);
    try {
      await window.api.students.create({
        school_id: school.id,
        class_stream_id: form.class_stream_id || null,
        admission_number: form.admission_number,
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth || null,
        place_of_birth: form.place_of_birth,
        gender: form.gender,
        guardian_name: form.guardian_name,
        guardian_phone: form.guardian_phone,
        guardian_whatsapp: form.guardian_whatsapp || null,
        admission_date: form.admission_date || null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const streamName = (id: string | null) => {
    const s = streams.find((st) => st.id === id);
    return s ? s.name : '—';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Students</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'Register student'}
        </button>
      </div>

      {showForm && (
        <form className="card mb-6 grid grid-cols-3 gap-4" onSubmit={onCreate}>
          <Field label="Admission number" value={form.admission_number} onChange={update('admission_number')} required />
          <Field label="First name" value={form.first_name} onChange={update('first_name')} required />
          <Field label="Last name" value={form.last_name} onChange={update('last_name')} required />
          <Field label="Date of birth" type="date" value={form.date_of_birth} onChange={update('date_of_birth')} />
          <Field label="Place of birth" value={form.place_of_birth} onChange={update('place_of_birth')} />
          <div>
            <label className="text-sm font-medium block mb-1">Gender</label>
            <select className="input-field" value={form.gender} onChange={update('gender')}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Field label="Guardian name" value={form.guardian_name} onChange={update('guardian_name')} />
          <Field label="Guardian phone" value={form.guardian_phone} onChange={update('guardian_phone')} />
          <Field label="Guardian WhatsApp" value={form.guardian_whatsapp} onChange={update('guardian_whatsapp')} />
          <Field label="Admission date" type="date" value={form.admission_date} onChange={update('admission_date')} />
          <div>
            <label className="text-sm font-medium block mb-1">Class stream</label>
            <select className="input-field" value={form.class_stream_id} onChange={update('class_stream_id')}>
              <option value="">Unassigned</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save student'}
            </button>
          </div>
        </form>
      )}

      <form className="flex gap-3 mb-4" onSubmit={onSearchSubmit}>
        <input
          className="input-field max-w-xs"
          placeholder="Search name or admission number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input-field max-w-xs" value={classStreamFilter} onChange={(e) => setClassStreamFilter(e.target.value)}>
          <option value="">All classes</option>
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Admission No</th>
              <th>Name</th>
              <th>Class</th>
              <th>Status</th>
              <th>Annual avg</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.admission_number}</td>
                <td>
                  {s.first_name} {s.last_name}
                </td>
                <td>{streamName(s.class_stream_id)}</td>
                <td className="capitalize">{s.status}</td>
                <td>{s.annual_average !== null ? s.annual_average.toFixed(2) : '—'}</td>
                <td>
                  <Link className="text-primary underline text-sm" to={`/students/${s.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-6">
                  No students found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <input className="input-field" type={type} value={value} onChange={onChange} required={required} />
    </div>
  );
}
