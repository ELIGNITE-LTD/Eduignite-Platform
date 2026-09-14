import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import { useAuth } from '../context/AuthContext';
import { roleLabel, type UserRoleValue } from '../shared/roles';
import type { PublicUser, Teacher } from '../shared/types';

const CREATABLE_ROLES: UserRoleValue[] = ['SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN', 'SCHOOL_ADMIN'];

const EMPTY_FORM = {
  full_name: '',
  email_or_username: '',
  password: '',
  role: 'TEACHER' as UserRoleValue,
  teacher_id: '',
  security_question: '',
  security_answer: '',
};

/**
 * Lets a SCHOOL_ADMIN create additional staff logins (SUB_ADMIN/TEACHER/
 * BURSAR/LIBRARIAN, or another SCHOOL_ADMIN) — the setup wizard only ever
 * creates the first one. Optionally links the new login to an existing
 * `teachers` record (so a TEACHER account picks up teacherScopeRepository
 * scoping automatically). A SUB_ADMIN can view the roster but the creation
 * form and disable/enable controls are hidden for anyone but SCHOOL_ADMIN,
 * matching the users:create/users:setStatus IPC gate (src/ipc/handlers.ts).
 */
export default function StaffSettingsPage() {
  const { school } = useSchool();
  const { session } = useAuth();
  const canManage = session?.role === 'SCHOOL_ADMIN';

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!school) return;
    const [userRows, teacherRows] = await Promise.all([
      window.api.users.list(school.id),
      window.api.teachers.list(school.id),
    ]);
    setUsers(userRows);
    setTeachers(teacherRows);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school]);

  function update<K extends keyof typeof EMPTY_FORM>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    setError(null);
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await window.api.users.create({
        school_id: school.id,
        teacher_id: form.teacher_id || null,
        full_name: form.full_name,
        email_or_username: form.email_or_username,
        password: form.password,
        role: form.role,
        security_question: form.security_question || undefined,
        security_answer: form.security_answer || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError((err as Error).message || 'Could not create the account.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user: PublicUser) {
    await window.api.users.setStatus(user.id, user.status === 'active' ? 'disabled' : 'active');
    await load();
  }

  const teacherName = (id: string | null) => {
    if (!id) return '—';
    const t = teachers.find((tt) => tt.id === id);
    return t ? `${t.first_name} ${t.last_name}` : id;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Staff Settings</h1>
        {canManage && (
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Add staff account'}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Every staff login for this school — administrators, teachers, and other roles. Linking an account to a
        teacher record lets that person sign in and only see the classes they're assigned to.
      </p>

      {showForm && canManage && (
        <form className="card mb-6 grid grid-cols-2 md:grid-cols-3 gap-4" onSubmit={onCreate}>
          {error && (
            <div className="col-span-2 md:col-span-3 rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-medium block mb-1">Full name</label>
            <input className="input-field" value={form.full_name} onChange={update('full_name')} required />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Email or username</label>
            <input
              className="input-field"
              value={form.email_or_username}
              onChange={update('email_or_username')}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Password</label>
            <input
              type="password"
              className="input-field"
              value={form.password}
              onChange={update('password')}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Role</label>
            <select className="input-field" value={form.role} onChange={update('role')}>
              {CREATABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Link to teacher record (optional)</label>
            <select className="input-field" value={form.teacher_id} onChange={update('teacher_id')}>
              <option value="">None</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name} ({t.teacher_number})
                </option>
              ))}
            </select>
          </div>
          <div />
          <div>
            <label className="text-sm font-medium block mb-1">Security question (optional)</label>
            <input
              className="input-field"
              value={form.security_question}
              onChange={update('security_question')}
              placeholder="For password recovery"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Answer</label>
            <input className="input-field" value={form.security_answer} onChange={update('security_answer')} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login</th>
              <th>Role</th>
              <th>Linked teacher</th>
              <th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email_or_username}</td>
                <td>{roleLabel(u.role)}</td>
                <td>{teacherName(u.teacher_id)}</td>
                <td>{u.status === 'active' ? 'Active' : 'Disabled'}</td>
                {canManage && (
                  <td>
                    {u.id !== session?.userId && (
                      <button className="text-primary underline text-sm" onClick={() => toggleStatus(u)}>
                        {u.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-6">
                  No staff accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
