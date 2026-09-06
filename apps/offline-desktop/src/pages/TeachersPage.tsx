import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { Teacher } from '../shared/types';

const EMPTY = {
  teacher_number: '',
  first_name: '',
  last_name: '',
  gender: 'other' as Teacher['gender'],
  phone: '',
  email: '',
  date_of_joining: '',
};

export default function TeachersPage() {
  const { school } = useSchool();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!school) return;
    setTeachers(await window.api.teachers.list(school.id));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school]);

  function update(key: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    setSaving(true);
    try {
      await window.api.teachers.create({
        school_id: school.id,
        teacher_number: form.teacher_number,
        first_name: form.first_name,
        last_name: form.last_name,
        gender: form.gender,
        phone: form.phone,
        email: form.email,
        date_of_joining: form.date_of_joining || null,
      });
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: Teacher) {
    await window.api.teachers.setActive(t.id, !t.is_active);
    await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Teachers</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'Register teacher'}
        </button>
      </div>

      {showForm && (
        <form className="card mb-6 grid grid-cols-3 gap-4" onSubmit={onCreate}>
          <Field label="Teacher number" value={form.teacher_number} onChange={update('teacher_number')} required />
          <Field label="First name" value={form.first_name} onChange={update('first_name')} required />
          <Field label="Last name" value={form.last_name} onChange={update('last_name')} required />
          <div>
            <label className="text-sm font-medium block mb-1">Gender</label>
            <select className="input-field" value={form.gender} onChange={update('gender')}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Field label="Phone" value={form.phone} onChange={update('phone')} />
          <Field label="Email" value={form.email} onChange={update('email')} />
          <Field label="Date of joining" type="date" value={form.date_of_joining} onChange={update('date_of_joining')} />
          <div className="col-span-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save teacher'}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id}>
                <td>{t.teacher_number}</td>
                <td>
                  {t.first_name} {t.last_name}
                </td>
                <td>{t.phone}</td>
                <td>{t.email}</td>
                <td>{t.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                  <button className="text-primary underline text-sm" onClick={() => toggleActive(t)}>
                    {t.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-6">
                  No teachers registered yet.
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
