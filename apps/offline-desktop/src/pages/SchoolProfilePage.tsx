import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { School } from '../shared/types';

// `matricule` is excluded on purpose: it's the school's real cloud identity,
// set once by the setup wizard (see src/setup/setupService.ts's
// confirmSchoolShell) and never user-editable here. onSubmit merges the
// current value back in explicitly so saving this form can never blank it.
type FormState = Omit<School, 'id' | 'created_at' | 'updated_at' | 'setup_completed' | 'matricule'>;

const EMPTY: FormState = {
  name: '',
  short_name: '',
  principal: '',
  motto: '',
  location: '',
  division: '',
  sub_division: '',
  city_village: '',
  address: '',
  postal_code: '',
  academic_year: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
  active_term: 'TERM_1',
  locale: 'en',
  subscription_currency: 'XAF',
};

export default function SchoolProfilePage({ onSaved }: { onSaved?: () => void } = {}) {
  const { school, refresh } = useSchool();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (school) {
      const { id: _id, created_at: _c, updated_at: _u, setup_completed: _sc, matricule: _m, ...rest } = school;
      setForm(rest);
    }
  }, [school]);

  const update = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Preserve the cloud matricule across ordinary profile edits -- this
      // form never lets a user change it (see FormState's comment above).
      await window.api.school.upsert({ ...form, matricule: school?.matricule ?? null });
      await refresh();
      setSavedAt(new Date().toLocaleTimeString());
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">School Profile</h1>
      <form className="card max-w-3xl space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="School name" value={form.name} onChange={update('name')} required />
          <Field label="Short name / code" value={form.short_name} onChange={update('short_name')} />
          <Field label="Principal" value={form.principal} onChange={update('principal')} />
          <Field label="Motto" value={form.motto} onChange={update('motto')} />
          <Field label="Region / Location" value={form.location} onChange={update('location')} />
          <Field label="Division" value={form.division} onChange={update('division')} />
          <Field label="Sub-division" value={form.sub_division} onChange={update('sub_division')} />
          <Field label="City / Village" value={form.city_village} onChange={update('city_village')} />
          <Field label="Address" value={form.address} onChange={update('address')} />
          <Field label="Postal code" value={form.postal_code ?? ''} onChange={update('postal_code')} />
          <Field label="Academic year" value={form.academic_year} onChange={update('academic_year')} required />
          <div>
            <label className="text-sm font-medium block mb-1">Active term</label>
            <select className="input-field" value={form.active_term} onChange={update('active_term')}>
              <option value="TERM_1">Term 1</option>
              <option value="TERM_2">Term 2</option>
              <option value="TERM_3">Term 3</option>
            </select>
          </div>
          <Field label="Currency" value={form.subscription_currency} onChange={update('subscription_currency')} />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save school profile'}
          </button>
          {savedAt && <span className="text-xs text-muted-foreground">Saved at {savedAt}</span>}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <input className="input-field" value={value} onChange={onChange} required={required} />
    </div>
  );
}
