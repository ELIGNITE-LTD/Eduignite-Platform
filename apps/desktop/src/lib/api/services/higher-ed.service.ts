import { apiClient } from '../client';

/** One step of the institution setup, as reported by the backend. */
export interface HigherSetupStep {
  key: string;
  done: boolean;
  /** How many records exist for this step (departments, programmes, ...). */
  count?: number;
}

export interface HigherSetupStatus {
  steps: HigherSetupStep[];
  complete: boolean;
}

/**
 * Result of asking the backend how far the setup is. `available` is false
 * while the higher-education service has not been switched on (404), so the
 * screens can still show the checklist instead of an error.
 */
export interface HigherSetupResult {
  available: boolean;
  status: HigherSetupStatus;
}

const EMPTY_STATUS: HigherSetupStatus = { steps: [], complete: false };

function normalizeStatus(raw: unknown): HigherSetupStatus {
  const data = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(data.steps) ? (data.steps as Array<Record<string, unknown>>) : [];
  const steps: HigherSetupStep[] = list
    .filter((s) => typeof s?.key === 'string')
    .map((s) => ({
      key: String(s.key),
      done: Boolean(s.done),
      count: typeof s.count === 'number' ? s.count : undefined,
    }));
  const complete =
    typeof data.complete === 'boolean' ? data.complete : steps.length > 0 && steps.every((s) => s.done);
  return { steps, complete };
}

export const higherEdService = {
  async setupStatus(): Promise<HigherSetupResult> {
    try {
      const { data } = await apiClient.get('/higher-ed/setup-status/');
      return { available: true, status: normalizeStatus(data) };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) return { available: false, status: EMPTY_STATUS };
      throw error;
    }
  },
};

// ---------------------------------------------------------------------------
// Institution structure: departments, programmes, calendar, grading
// ---------------------------------------------------------------------------

export type UnitType = 'faculty' | 'school' | 'institute' | 'department' | 'campus';

export interface HigherUnit {
  id: string;
  unit_type: UnitType;
  name: string;
  code: string;
  parent: string | null;
  parent_name: string | null;
  is_active: boolean;
}

export type AwardLevel = 'licence' | 'master' | 'doctorat' | 'hnd' | 'bts' | 'diploma' | 'certificate' | 'other';

export interface HigherProgrammeYear {
  id: string;
  programme: string;
  number: number;
  label: string;
}

export interface HigherProgramme {
  id: string;
  name: string;
  code: string;
  award_level: AwardLevel;
  duration_years: number;
  required_credits: number;
  department: string;
  department_name: string;
  is_active: boolean;
  years: HigherProgrammeYear[];
}

export interface HigherProgrammeInput {
  name: string;
  award_level: AwardLevel;
  duration_years: number;
  required_credits: number;
  department: string;
}

export interface HigherAcademicYear {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface HigherAcademicPeriod {
  id: string;
  academic_year: string;
  period_type: string;
  name: string;
  order: number;
  start_date: string;
  end_date: string;
}

export interface GradingThresholds {
  max_score: number;
  pass_mark: number;
  max_points?: number;
  grades?: Array<{ letter: string; min: number; points: number }>;
  classes?: Array<{ label: string; min: number }>;
  mentions?: Array<{ label: string; min: number }>;
  resit?: { allowed: boolean; max_attempts: number; cap_score: number };
  [key: string]: unknown;
}

export interface GradingPreset extends GradingThresholds {
  key: 'gpa_4' | 'scale_20';
  name: string;
  kind: string;
}

export interface GradingPolicy {
  id: string;
  preset_key: 'gpa_4' | 'scale_20';
  thresholds: GradingThresholds;
}

/** DRF lists may or may not be paginated; accept both. */
function rows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const results = (data as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? (results as T[]) : [];
}

/** Turn a DRF error body into one short sentence for the screen. */
export function higherEdErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  const pick = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(pick).filter(Boolean).join(' ') || null;
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).map(pick).filter(Boolean).join(' ') || null;
    }
    return null;
  };
  return pick(data) || fallback;
}

export const higherEdStructureService = {
  async listUnits(unitType?: UnitType): Promise<HigherUnit[]> {
    const { data } = await apiClient.get('/higher-ed/units/', { params: unitType ? { unit_type: unitType } : undefined });
    return rows<HigherUnit>(data);
  },
  async createUnit(input: { unit_type: UnitType; name: string; parent?: string | null }): Promise<HigherUnit> {
    const { data } = await apiClient.post('/higher-ed/units/', input);
    return data;
  },
  async updateUnit(id: string, input: Partial<Pick<HigherUnit, 'name' | 'parent'>>): Promise<HigherUnit> {
    const { data } = await apiClient.patch(`/higher-ed/units/${id}/`, input);
    return data;
  },
  async deleteUnit(id: string): Promise<void> {
    await apiClient.delete(`/higher-ed/units/${id}/`);
  },

  async listProgrammes(): Promise<HigherProgramme[]> {
    const { data } = await apiClient.get('/higher-ed/programmes/');
    return rows<HigherProgramme>(data);
  },
  async createProgramme(input: HigherProgrammeInput): Promise<HigherProgramme> {
    const { data } = await apiClient.post('/higher-ed/programmes/', input);
    return data;
  },
  async updateProgramme(id: string, input: Partial<HigherProgrammeInput>): Promise<HigherProgramme> {
    const { data } = await apiClient.patch(`/higher-ed/programmes/${id}/`, input);
    return data;
  },
  async deleteProgramme(id: string): Promise<void> {
    await apiClient.delete(`/higher-ed/programmes/${id}/`);
  },
  async renameProgrammeYear(id: string, label: string): Promise<HigherProgrammeYear> {
    const { data } = await apiClient.patch(`/higher-ed/programme-years/${id}/`, { label });
    return data;
  },

  async listAcademicYears(): Promise<HigherAcademicYear[]> {
    const { data } = await apiClient.get('/higher-ed/academic-years/');
    return rows<HigherAcademicYear>(data);
  },
  async createAcademicYear(input: { label: string; start_date: string; end_date: string; is_current?: boolean }) {
    const { data } = await apiClient.post('/higher-ed/academic-years/', input);
    return data as HigherAcademicYear;
  },
  async updateAcademicYear(id: string, input: Partial<HigherAcademicYear>) {
    const { data } = await apiClient.patch(`/higher-ed/academic-years/${id}/`, input);
    return data as HigherAcademicYear;
  },
  async deleteAcademicYear(id: string): Promise<void> {
    await apiClient.delete(`/higher-ed/academic-years/${id}/`);
  },
  async listAcademicPeriods(): Promise<HigherAcademicPeriod[]> {
    const { data } = await apiClient.get('/higher-ed/academic-periods/');
    return rows<HigherAcademicPeriod>(data);
  },
  async createAcademicPeriod(input: Omit<HigherAcademicPeriod, 'id'>) {
    const { data } = await apiClient.post('/higher-ed/academic-periods/', input);
    return data as HigherAcademicPeriod;
  },
  async deleteAcademicPeriod(id: string): Promise<void> {
    await apiClient.delete(`/higher-ed/academic-periods/${id}/`);
  },

  async gradingPresets(): Promise<GradingPreset[]> {
    const { data } = await apiClient.get('/higher-ed/grading-presets/');
    return rows<GradingPreset>(data);
  },
  async gradingPolicy(): Promise<GradingPolicy | null> {
    const { data } = await apiClient.get('/higher-ed/grading-policy/');
    return data || null;
  },
  async saveGradingPolicy(input: { preset_key: string; thresholds?: GradingThresholds }): Promise<GradingPolicy> {
    const { data } = await apiClient.put('/higher-ed/grading-policy/', input);
    return data;
  },
};

// ---------------------------------------------------------------------------
// Course units, curriculum, lecturers and course offerings
// ---------------------------------------------------------------------------

export interface HigherCourseUnit {
  id: string;
  code: string;
  title: string;
  description?: string;
  credits: number;
  department: string;
  department_name: string;
  is_active: boolean;
}

export interface HigherCourseUnitInput {
  code: string;
  title: string;
  credits: number;
  department: string;
}

export type CurriculumCategory = 'core' | 'elective';

export interface HigherCurriculumEntry {
  id: string;
  programme: string;
  programme_year: string;
  programme_year_label: string;
  period_type: string;
  period_number: number;
  course_unit: string;
  course_code: string;
  course_title: string;
  credits_override: number | null;
  credits: number;
  category: CurriculumCategory;
  credit_warning: string | null;
}

export interface HigherCurriculumInput {
  programme: string;
  programme_year: string;
  period_type: string;
  period_number: number;
  course_unit: string;
  category: CurriculumCategory;
}

export interface HigherCreditRow {
  year_number: number;
  year_label: string;
  period_type: string;
  period_number: number;
  total_credits: number;
  core_credits: number;
  target_credits: number | null;
  warning: string | null;
}

export interface HigherCreditSummary {
  programme: string;
  required_credits: number;
  periods: HigherCreditRow[];
}

export interface HigherOffering {
  id: string;
  course_unit: string;
  course_code: string;
  course_title: string;
  academic_period: string;
  period_name: string;
  lecturers: string[];
  lecturer_names: string[];
}

export interface HigherLecturer {
  id: string;
  matricule: string;
  name: string;
  job_title?: string;
  /** Only returned to the institution administrator. */
  email?: string;
  phone?: string;
  is_active: boolean;
  headed_units: string[];
}

export interface HigherLecturerInput {
  name: string;
  email?: string;
  phone?: string;
}

export interface HigherDepartmentHead {
  id: string;
  unit: string;
  unit_name: string;
  user: string;
  user_name: string;
}

export const higherEdTeachingService = {
  async listCourseUnits(): Promise<HigherCourseUnit[]> {
    const { data } = await apiClient.get('/higher-ed/course-units/');
    return rows<HigherCourseUnit>(data);
  },
  async createCourseUnit(input: HigherCourseUnitInput): Promise<HigherCourseUnit> {
    const { data } = await apiClient.post('/higher-ed/course-units/', input);
    return data;
  },
  async updateCourseUnit(id: string, input: Partial<HigherCourseUnitInput>): Promise<HigherCourseUnit> {
    const { data } = await apiClient.patch(`/higher-ed/course-units/${id}/`, input);
    return data;
  },
  async deleteCourseUnit(id: string): Promise<void> {
    await apiClient.delete(`/higher-ed/course-units/${id}/`);
  },

  async listCurriculum(programme: string): Promise<HigherCurriculumEntry[]> {
    const { data } = await apiClient.get('/higher-ed/curriculum/', { params: { programme } });
    return rows<HigherCurriculumEntry>(data);
  },
  async curriculumSummary(programme: string): Promise<HigherCreditSummary> {
    const { data } = await apiClient.get('/higher-ed/curriculum/summary/', { params: { programme } });
    return data;
  },
  async addCurriculumEntry(input: HigherCurriculumInput): Promise<HigherCurriculumEntry> {
    const { data } = await apiClient.post('/higher-ed/curriculum/', input);
    return data;
  },
  async updateCurriculumEntry(id: string, input: { category: CurriculumCategory }): Promise<HigherCurriculumEntry> {
    const { data } = await apiClient.patch(`/higher-ed/curriculum/${id}/`, input);
    return data;
  },
  async removeCurriculumEntry(id: string): Promise<void> {
    await apiClient.delete(`/higher-ed/curriculum/${id}/`);
  },

  async listOfferings(academicPeriod?: string): Promise<HigherOffering[]> {
    const { data } = await apiClient.get('/higher-ed/offerings/', {
      params: academicPeriod ? { academic_period: academicPeriod } : undefined,
    });
    return rows<HigherOffering>(data);
  },
  async createOffering(input: { course_unit: string; academic_period: string; lecturers?: string[] }): Promise<HigherOffering> {
    const { data } = await apiClient.post('/higher-ed/offerings/', input);
    return data;
  },
  async setOfferingLecturers(id: string, lecturers: string[]): Promise<HigherOffering> {
    const { data } = await apiClient.patch(`/higher-ed/offerings/${id}/`, { lecturers });
    return data;
  },

  async listLecturers(): Promise<HigherLecturer[]> {
    const { data } = await apiClient.get('/higher-ed/lecturers/');
    return rows<HigherLecturer>(data);
  },
  async createLecturer(input: HigherLecturerInput): Promise<HigherLecturer> {
    const { data } = await apiClient.post('/higher-ed/lecturers/', input);
    return data;
  },

  async listDepartmentHeads(): Promise<HigherDepartmentHead[]> {
    const { data } = await apiClient.get('/higher-ed/department-heads/');
    return rows<HigherDepartmentHead>(data);
  },
  async setDepartmentHead(unit: string, user: string): Promise<HigherDepartmentHead> {
    const { data } = await apiClient.post('/higher-ed/department-heads/', { unit, user });
    return data;
  },
  async removeDepartmentHead(id: string): Promise<void> {
    await apiClient.delete(`/higher-ed/department-heads/${id}/`);
  },
};


// ---------------------------------------------------------------------------
// Students: admitted into a programme at a level, for an academic year.
// ---------------------------------------------------------------------------

export type EnrolmentStatus = 'active' | 'deferred' | 'suspended' | 'withdrawn' | 'graduated';

export interface HigherEnrolment {
  id: string;
  student_id: string;
  name: string;
  matricule: string;
  gender: string;
  date_of_birth: string | null;
  place_of_birth: string;
  admission_number: string;
  phone: string;
  /** True once the student has set their own password with their matricule. */
  activated: boolean;
  programme: string;
  programme_name: string;
  award_level: string;
  programme_year: string;
  year_label: string;
  year_number: number;
  academic_year: string;
  academic_year_label: string;
  status: EnrolmentStatus;
}

export interface HigherStudentInput {
  name: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth?: string;
  place_of_birth?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  guardian_name?: string;
  guardian_phone?: string;
  programme: string;
  programme_year: string;
  academic_year?: string;
}

export interface HigherStudentFilters {
  programme?: string;
  programme_year?: string;
  status?: string;
  academic_year?: string;
  q?: string;
}

export const higherEdStudentsService = {
  async list(filters: HigherStudentFilters = {}): Promise<HigherEnrolment[]> {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const { data } = await apiClient.get('/higher-ed/students/', { params });
    return rows<HigherEnrolment>(data);
  },
  async admit(input: HigherStudentInput): Promise<HigherEnrolment> {
    const { data } = await apiClient.post('/higher-ed/students/', input);
    return data;
  },
  async update(id: string, input: { programme_year?: string; status?: EnrolmentStatus }): Promise<HigherEnrolment> {
    const { data } = await apiClient.patch(`/higher-ed/students/${id}/`, input);
    return data;
  },
};
