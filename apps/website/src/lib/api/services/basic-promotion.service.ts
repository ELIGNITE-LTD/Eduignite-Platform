import { apiClient } from '../client';

export interface PromotionClassRef {
  id: string;
  name: string;
  level: string;
}

export interface PromotionRow {
  student: string;
  name: string;
  gender: string;
  admission_number: string;
  from_class: PromotionClassRef | null;
  decision: 'promote' | 'repeat' | 'graduate' | 'hold' | 'already_applied' | 'blocked';
  target_class: PromotionClassRef | null;
  reason: string;
  average: number | null;
  no_average: boolean;
  overridden: boolean;
  blocker: string;
}

export interface PromotionPreview {
  academic_year: string;
  pass_average: number;
  school_pass_average: number;
  rows: PromotionRow[];
  by_target: Array<PromotionClassRef & { male: number; female: number; other: number; total: number }>;
  blockers: Array<{ level: string; next_level: string; code: string; message: string }>;
  summary: { total: number; promote: number; repeat: number; graduate: number; hold: number; already_applied: number; blocked: number };
  can_confirm: boolean;
}

export interface RepeaterRow {
  student: string;
  name: string;
  gender: string;
  class: PromotionClassRef | null;
  final: boolean;
  average: number | null;
  pass_average: number | null;
}

export interface PromotionOverride {
  student: string;
  action?: 'promote' | 'repeat';
  target_class?: string;
}

export interface MoveResult {
  requires_confirmation: boolean;
  moved: number;
  unchanged?: number;
  detail: string;
  crossing?: Array<{ student: string; name: string; from_class: string; from_level: string }>;
  target_class: PromotionClassRef;
}

export interface PickerPupil {
  id: string;
  full_name: string;
  admission_number: string;
  school_class_id: string | null;
  class_name: string;
}

const BASE = '/students/students';

/** Level based year-end promotion and the "Move pupils" tool of nursery/primary schools. */
export const basicPromotionService = {
  /** `passAverage` (0 to 20) is the head's average for the whole school; the preview shows its effect without saving it. */
  async preview(academicYear: string, passAverage?: number): Promise<PromotionPreview> {
    const { data } = await apiClient.get(`${BASE}/basic-promotion/preview/`, {
      params: { academic_year: academicYear, ...(passAverage != null ? { pass_average: passAverage } : {}) },
    });
    return data;
  },

  async confirm(academicYear: string, passAverage: number): Promise<{ promoted: number; repeated: number; graduated: number; held: number; already_applied: number; detail: string }> {
    const { data } = await apiClient.post(`${BASE}/basic-promotion/confirm/`, { academic_year: academicYear, overrides: [], pass_average: passAverage });
    return data;
  },

  /** Pupils held back this year, so the head can promote some or all of them afterwards. */
  async repeaters(academicYear: string): Promise<RepeaterRow[]> {
    const { data } = await apiClient.get(`${BASE}/basic-promotion/repeaters/`, { params: { academic_year: academicYear } });
    return Array.isArray(data?.rows) ? data.rows : [];
  },

  async promoteRepeaters(academicYear: string, studentIds: string[] | "all"): Promise<{ promoted: number; graduated: number; detail: string }> {
    const body = studentIds === "all" ? { academic_year: academicYear, all: true } : { academic_year: academicYear, student_ids: studentIds };
    const { data } = await apiClient.post(`${BASE}/basic-promotion/promote-repeaters/`, body);
    return data;
  },

  /** One click for the commonest blocker: create the classes pupils are about to move into. */
  async createMissingClasses(): Promise<{ created: string[]; detail: string }> {
    const { data } = await apiClient.post(`${BASE}/basic-promotion/create-missing-classes/`, {});
    return data;
  },

  async pupilsOfClass(classId: string): Promise<PickerPupil[]> {
    const { data } = await apiClient.get(`${BASE}/picker/`, { params: { school_class: classId } });
    return Array.isArray(data) ? data : [];
  },

  /** A 409 answer means "crossing levels, please confirm": it is returned, not thrown. */
  async movePupils(studentIds: string[], targetClass: string, acknowledgeLevelChange = false): Promise<MoveResult> {
    const { data } = await apiClient.post(
      `${BASE}/bulk-move/`,
      { student_ids: studentIds, target_class: targetClass, acknowledge_level_change: acknowledgeLevelChange },
      { validateStatus: (status) => status === 200 || status === 409 },
    );
    return data;
  },
};
