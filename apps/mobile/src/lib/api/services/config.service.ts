import { apiClient } from '../client';
import { API } from '../endpoints';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CameroonRegion {
  name: string;
  divisions: string[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ClassLevel extends SelectOption {
  exam_year: boolean;
  national_exam: string | null;
}

export interface SubjectOption {
  name: string;
  code: string;
  coefficient: number;
}

export interface CameroonConfig {
  regions: CameroonRegion[];
  school_types: SelectOption[];
  subsystems: SelectOption[];
  class_levels: {
    francophone_general: ClassLevel[];
    anglophone_general: ClassLevel[];
    francophone_technical: ClassLevel[];
    anglophone_technical: ClassLevel[];
  };
  technical_specialisations: SelectOption[];
  subjects: Record<string, SubjectOption[]>;
  exam_types: SelectOption[];
  terms: Array<{ value: string; label_fr: string; label_en: string }>;
  fee_types: SelectOption[];
  staff_roles: SelectOption[];
  gender_options: SelectOption[];
  guardian_relationships: SelectOption[];
  subscription_plans: SelectOption[];
}

export interface SchoolClass {
  id: string;
  name: string;
  sub_school_id: string | null;
  sub_school_name: string | null;
  class_master_id: string | null;
}

export interface SchoolSubject {
  id: string;
  name: string;
  code: string;
  level: string;
  coefficient: number;
  teacher_id: string | null;
  teacher_name: string | null;
}

export interface ClassSubject {
  id: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  coefficient: number;
  teacher_id: string | null;
  teacher_name: string | null;
  type: string;
}

export interface StaffOption {
  id: string;
  name: string;
  email: string;
  role: string;
  matricule: string;
}

export interface ParentOption {
  id: string;
  name: string;
  email: string;
  phone: string;
  matricule: string;
}

export interface SchoolConfig {
  school: { id: string; name: string; short_name: string };
  sub_schools: Array<{ id: string; name: string }>;
  classes: SchoolClass[];
  subjects: SchoolSubject[];
  class_subjects: ClassSubject[];
  teachers: StaffOption[];
  all_staff: StaffOption[];
  parents: ParentOption[];
}

// ── Service ───────────────────────────────────────────────────────────────────

let cameroonConfigCache: CameroonConfig | null = null;

export const configService = {
  /**
   * Fetch static Cameroonian education system data.
   * Cached in memory after first call — never changes at runtime.
   */
  async getCameroonConfig(): Promise<CameroonConfig> {
    if (cameroonConfigCache) return cameroonConfigCache;
    const { data } = await apiClient.get('/config/cameroon/');
    cameroonConfigCache = data as CameroonConfig;
    return cameroonConfigCache;
  },

  /**
   * Fetch live school-scoped dropdown data for the authenticated admin.
   * Not cached — always fresh.
   */
  async getSchoolConfig(schoolId?: string): Promise<SchoolConfig> {
    const params = schoolId ? { school_id: schoolId } : undefined;
    const { data } = await apiClient.get('/config/school-data/', { params });
    return data as SchoolConfig;
  },

  /**
   * Helper — get class levels for a given subsystem + school type combination.
   */
  getClassLevels(
    config: CameroonConfig,
    subsystem: 'francophone' | 'anglophone' | 'bilingual',
    schoolType: 'general' | 'technical' | 'mixed'
  ): ClassLevel[] {
    const results: ClassLevel[] = [];

    if (subsystem === 'francophone' || subsystem === 'bilingual') {
      if (schoolType === 'general' || schoolType === 'mixed') {
        results.push(...config.class_levels.francophone_general);
      }
      if (schoolType === 'technical' || schoolType === 'mixed') {
        results.push(...config.class_levels.francophone_technical);
      }
    }

    if (subsystem === 'anglophone' || subsystem === 'bilingual') {
      if (schoolType === 'general' || schoolType === 'mixed') {
        results.push(...config.class_levels.anglophone_general);
      }
      if (schoolType === 'technical' || schoolType === 'mixed') {
        results.push(...config.class_levels.anglophone_technical);
      }
    }

    return results;
  },

  /**
   * Helper — get divisions for a given region name.
   */
  getDivisions(config: CameroonConfig, regionName: string): string[] {
    const region = config.regions.find((r) => r.name === regionName);
    return region ? region.divisions : [];
  },

  /**
   * Helper — get standard subjects for a subsystem (and optionally a specialisation).
   */
  getSubjects(
    config: CameroonConfig,
    subsystem: 'francophone' | 'anglophone',
    specialisation?: string
  ): SubjectOption[] {
    if (specialisation) {
      const key = `francophone_technical_${specialisation}`;
      if (config.subjects[key]) return config.subjects[key];
    }
    const key = `${subsystem}_general`;
    return config.subjects[key] || [];
  },
};
