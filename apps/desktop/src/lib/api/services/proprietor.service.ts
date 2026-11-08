import { apiClient } from '../client';

/**
 * Proprietor accounts.
 *
 * Two audiences, one file:
 *  - founders (CEO / CTO) create proprietors and decide which schools each one owns
 *    (`/users/proprietors/...`);
 *  - the proprietor reads statistics of his own schools and resets the login details
 *    of their administrators (`/proprietor/...`).
 *
 * Every response is the server's; nothing here is invented or cached by hand.
 * Identical in the website, mobile and desktop apps.
 */

export type ProprietorSchoolRow = {
  id: string;
  name: string;
  short_name?: string;
  location?: string;
  education_category: 'basic' | 'secondary' | 'higher' | string;
  school_type?: string;
  subsystem?: string;
  status?: string;
};

export type Proprietor = {
  id: string;
  matricule: string;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  date_joined: string;
  school_count: number;
  schools: ProprietorSchoolRow[];
};

export type ProprietorCredentials = {
  matricule: string;
  temporary_password: string;
  must_change_password: boolean;
};

export type PickerSchool = ProprietorSchoolRow & {
  proprietor_count: number;
  linked: boolean;
};

export type PickerFilters = {
  education_category?: string;
  school_type?: string;
  subsystem?: string;
  level?: string;
  status?: string;
  q?: string;
  proprietor?: string;
};

export type Rate = { rate: number | null; records: number };
export type FeesSummary = {
  billed: string;
  collected: string;
  outstanding: string;
  collection_rate: number | null;
};
export type PlatformBilling = {
  state: 'free' | 'paid' | 'unpaid' | string;
  status?: string;
  expires_on?: string | null;
  free_until?: string | null;
  amount?: string | null;
  currency?: string | null;
};

export type OverviewSchool = {
  id: string;
  name: string;
  short_name?: string;
  location?: string;
  logo: string | null;
  education_category: string;
  school_type?: string;
  subsystem?: string;
  status?: string;
  students: number;
  staff: number;
  classes: number;
  attendance_today: Rate;
  attendance_week: Rate;
  fees: FeesSummary;
  platform_billing: PlatformBilling;
  admin_count: number;
};

export type ProprietorOverview = {
  proprietor: { id: string; name: string; matricule: string };
  generated_at: string;
  totals: {
    schools: number;
    students: number;
    students_male: number;
    students_female: number;
    staff: number;
    classes: number;
    attendance_today: Rate;
    attendance_week: Rate;
    fees: FeesSummary;
    platform_billing: { paid: number; free: number; unpaid: number };
  };
  schools: OverviewSchool[];
};

export type ManagedAdmin = {
  id: string;
  matricule: string;
  name: string;
  role: string;
  display_role: string;
  email: string;
  phone: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
};

export type ClassGender = {
  class_id: string | null;
  class_name: string;
  male: number;
  female: number;
  other: number;
  total: number;
};

export type SchoolDetail = {
  school: {
    id: string;
    name: string;
    short_name?: string;
    location?: string;
    logo: string | null;
    motto?: string;
    email?: string;
    phone?: string;
    principal?: string;
    education_category: string;
    school_type?: string;
    subsystem?: string;
    status?: string;
    region?: string;
    division?: string;
  };
  students: { total: number; male: number; female: number; other: number; by_class: ClassGender[] };
  staff: { total: number; by_role: Record<string, number> };
  classes: number;
  attendance: {
    today: Rate;
    week: Rate;
    trend: { date: string; rate: number | null; records: number }[];
  };
  marks: {
    max_score: number;
    by_class_term: {
      class_name: string;
      academic_year: string;
      term: number | string;
      average: number | null;
      marks: number;
    }[];
  };
  fees: FeesSummary;
  platform_billing: PlatformBilling;
  announcements: { id: string; title: string; target: string; created_at: string; is_pinned: boolean }[];
  admins: ManagedAdmin[];
};

export type CredentialsRequest = {
  matricule: string;
  password: string;
  new_password: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
  require_password_change?: boolean;
};

export type CredentialsResult = {
  detail: string;
  admin: ManagedAdmin;
  changed: string[];
  sessions_revoked: boolean;
  notification_queued: boolean;
};

const F = '/users/proprietors/';
const P = '/proprietor/';

const clean = <T extends Record<string, unknown>>(params?: T) => {
  const out: Record<string, unknown> = {};
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  });
  return out;
};

export const proprietorService = {
  // ---- Founders (CEO / CTO) -------------------------------------------------
  async list(params?: { q?: string; is_active?: 'true' | 'false' | '' }) {
    const { data } = await apiClient.get(F, { params: clean(params) });
    return data as { count: number; results: Proprietor[] };
  },
  async get(id: string) {
    const { data } = await apiClient.get(`${F}${id}/`);
    return data as Proprietor;
  },
  async create(body: { name: string; email: string; phone?: string }) {
    const { data } = await apiClient.post(F, body);
    return data as { proprietor: Proprietor; credentials: ProprietorCredentials; email_sent: boolean };
  },
  async update(id: string, body: Partial<Pick<Proprietor, 'name' | 'email' | 'phone' | 'is_active'>>) {
    const { data } = await apiClient.patch(`${F}${id}/`, body);
    return data as Proprietor;
  },
  async activate(id: string) {
    const { data } = await apiClient.post(`${F}${id}/activate/`);
    return data as Proprietor;
  },
  async deactivate(id: string) {
    const { data } = await apiClient.post(`${F}${id}/deactivate/`);
    return data as Proprietor;
  },
  async resetPassword(id: string) {
    const { data } = await apiClient.post(`${F}${id}/reset-password/`);
    return data as { proprietor: Proprietor; credentials: ProprietorCredentials };
  },
  async linkedSchools(id: string) {
    const { data } = await apiClient.get(`${F}${id}/schools/`);
    return (data?.schools ?? []) as ProprietorSchoolRow[];
  },
  async replaceSchools(id: string, schoolIds: string[]) {
    const { data } = await apiClient.put(`${F}${id}/schools/`, { school_ids: schoolIds });
    return data as { schools: ProprietorSchoolRow[]; added: string[]; removed: string[] };
  },
  async pickerSchools(params?: PickerFilters) {
    const { data } = await apiClient.get(`${F}schools/`, { params: clean(params) });
    return data as { count: number; results: PickerSchool[] };
  },

  // ---- The proprietor himself ----------------------------------------------
  async overview() {
    const { data } = await apiClient.get(`${P}overview/`);
    return data as ProprietorOverview;
  },
  async school(schoolId: string) {
    const { data } = await apiClient.get(`${P}schools/${encodeURIComponent(schoolId)}/`);
    return data as SchoolDetail;
  },
  async admins(schoolId: string) {
    const { data } = await apiClient.get(`${P}schools/${encodeURIComponent(schoolId)}/admins/`);
    return data as { school: { id: string; name: string }; admins: ManagedAdmin[] };
  },
  async changeAdminCredentials(schoolId: string, userId: string, body: CredentialsRequest) {
    const { data } = await apiClient.post(
      `${P}schools/${encodeURIComponent(schoolId)}/admins/${encodeURIComponent(userId)}/credentials/`,
      body,
    );
    return data as CredentialsResult;
  },
};

/** Server error envelope: `{ code, message, errors }`. */
export type ProprietorApiError = {
  status: number;
  code: string;
  message: string;
  errors: Record<string, string[]>;
};

export function readApiError(error: any): ProprietorApiError {
  const data = error?.response?.data;
  const errors: Record<string, string[]> = {};
  if (data?.errors && typeof data.errors === 'object') {
    Object.entries(data.errors).forEach(([field, value]) => {
      errors[field] = (Array.isArray(value) ? value : [value]).map(String);
    });
  }
  return {
    status: Number(error?.response?.status || 0),
    code: String(data?.code || ''),
    message: String(data?.message || data?.detail || ''),
    errors,
  };
}
