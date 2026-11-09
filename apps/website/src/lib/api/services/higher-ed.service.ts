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
  id: number;
  unit_type: UnitType;
  name: string;
  code: string;
  parent: number | null;
  parent_name: string | null;
  is_active: boolean;
}

export type AwardLevel = 'licence' | 'master' | 'doctorat' | 'hnd' | 'bts' | 'diploma' | 'certificate' | 'other';

export interface HigherProgrammeYear {
  id: number;
  programme: number;
  number: number;
  label: string;
}

export interface HigherProgramme {
  id: number;
  name: string;
  code: string;
  award_level: AwardLevel;
  duration_years: number;
  required_credits: number;
  department: number;
  department_name: string;
  is_active: boolean;
  years: HigherProgrammeYear[];
}

export interface HigherProgrammeInput {
  name: string;
  award_level: AwardLevel;
  duration_years: number;
  required_credits: number;
  department: number;
}

export interface HigherAcademicYear {
  id: number;
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface HigherAcademicPeriod {
  id: number;
  academic_year: number;
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
  id: number;
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
  async createUnit(input: { unit_type: UnitType; name: string; parent?: number | null }): Promise<HigherUnit> {
    const { data } = await apiClient.post('/higher-ed/units/', input);
    return data;
  },
  async updateUnit(id: number, input: Partial<Pick<HigherUnit, 'name' | 'parent'>>): Promise<HigherUnit> {
    const { data } = await apiClient.patch(`/higher-ed/units/${id}/`, input);
    return data;
  },
  async deleteUnit(id: number): Promise<void> {
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
  async updateProgramme(id: number, input: Partial<HigherProgrammeInput>): Promise<HigherProgramme> {
    const { data } = await apiClient.patch(`/higher-ed/programmes/${id}/`, input);
    return data;
  },
  async deleteProgramme(id: number): Promise<void> {
    await apiClient.delete(`/higher-ed/programmes/${id}/`);
  },
  async renameProgrammeYear(id: number, label: string): Promise<HigherProgrammeYear> {
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
  async updateAcademicYear(id: number, input: Partial<HigherAcademicYear>) {
    const { data } = await apiClient.patch(`/higher-ed/academic-years/${id}/`, input);
    return data as HigherAcademicYear;
  },
  async deleteAcademicYear(id: number): Promise<void> {
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
  async deleteAcademicPeriod(id: number): Promise<void> {
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
