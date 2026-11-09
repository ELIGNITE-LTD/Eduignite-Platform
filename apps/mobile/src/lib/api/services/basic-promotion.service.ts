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
  rows: PromotionRow[];
  by_target: Array<PromotionClassRef & { male: number; female: number; other: number; total: number }>;
  blockers: Array<{ level: string; next_level: string; code: string; message: string }>;
  summary: { total: number; promote: number; repeat: number; graduate: number; hold: number; already_applied: number; blocked: number };
  can_confirm: boolean;
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
  async preview(academicYear: string): Promise<PromotionPreview> {
    const { data } = await apiClient.get(`${BASE}/basic-promotion/preview/`, { params: { academic_year: academicYear } });
    return data;
  },

  async confirm(academicYear: string, overrides: PromotionOverride[]): Promise<{ promoted: number; repeated: number; graduated: number; held: number; already_applied: number; detail: string }> {
    const { data } = await apiClient.post(`${BASE}/basic-promotion/confirm/`, { academic_year: academicYear, overrides });
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
