import { apiClient } from '../client';
import type { ClassLevel, HierarchyClass } from '../types';

export interface HubStep {
  key: 'sections' | 'levels' | 'classes' | 'subjects' | 'teachers' | 'fees' | 'pupils';
  done: boolean;
  count: number;
  total: number | null;
  unsectioned?: number;
}

export interface HubSummary {
  education_category: string;
  steps: HubStep[];
  next_step: HubStep['key'] | null;
  complete: boolean;
  teachers: Array<{ id: string; name: string; classes: string[]; class_ids?: string[]; load: number; multiple_classes?: boolean }>;
  unsectioned_classes: Array<{ id: string; name: string }>;
  levels?: Array<ClassLevel & { classes: number; pupils: number }>;
  unleveled_classes?: Array<{ id: string; name: string }>;
  counts: { sections: number; levels?: number; classes: number; pupils: number; subject_links: number };
}

export interface BulkSubjectsResult {
  created: number;
  existing: number;
}

export interface QuickSetupPayload {
  languages: Array<'en' | 'fr'>;
  nursery: boolean;
  primary: boolean;
}

export interface QuickSetupResult {
  sections: Array<{ id: string; name: string }>;
  classes_created: string[];
  classes_existing: string[];
  summary: HubSummary;
}

export interface SecondaryStep {
  key: 'sections' | 'classes' | 'subjects' | 'teachers' | 'class_masters' | 'fees' | 'pupils';
  done: boolean;
  count: number;
  total: number | null;
  optional?: boolean;
  unsectioned?: number;
}

export interface SecondaryClassRow {
  id: string;
  name: string;
  cycle: 'first' | 'second' | 'nursery' | 'primary';
  sub_school: string | null;
  class_master: string | null;
  class_master_name: string;
  subjects: number;
  without_teacher: number;
  pupils: number;
  has_fees: boolean;
}

/** Secondary / higher schools: the checklist and counts behind the Hierarchy & Sections overview. */
export interface SecondarySummary {
  education_category: string;
  steps: SecondaryStep[];
  next_step: SecondaryStep['key'] | null;
  complete: boolean;
  classes: SecondaryClassRow[];
  teachers: Array<{ id: string; name: string; subject_links: number; classes: number; class_master_of: string[]; assigned: boolean }>;
  unsectioned_classes: Array<{ id: string; name: string }>;
  counts: {
    sections: number; classes: number; first_cycle: number; second_cycle: number; subjects: number; subject_links: number;
    teachers: number; teachers_assigned: number; teachers_unassigned: number; pupils: number;
  };
}

export type BulkClassesPayload =
  | { names: string[]; sub_school?: string }
  | { level: string; streams?: string[]; count?: number; sub_school?: string };

const BASE = '/schools/hierarchy';

/** Guided-setup endpoints of the nursery/primary "Hierarchy & Sections" hub. */
export const hierarchyHubService = {
  async summary(): Promise<HubSummary> {
    const { data } = await apiClient.get(`${BASE}/setup-summary/`);
    return data;
  },

  async bulkClasses(payload: BulkClassesPayload): Promise<{ created: HierarchyClass[]; existing: HierarchyClass[]; adopted?: HierarchyClass[]; conflicts?: string[] }> {
    const { data } = await apiClient.post(`${BASE}/classes/bulk/`, payload);
    return data;
  },

  /** There are no default subjects: the school types its own, or copies another class's list. */
  async applySubjects(
    payload:
      | { mode: 'custom'; classes?: string[]; all?: boolean; subjects: Array<{ name: string; code?: string; coefficient?: number | string }> }
      | { mode: 'copy'; from_class: string; classes?: string[]; all?: boolean },
  ): Promise<BulkSubjectsResult> {
    const { data } = await apiClient.post(`${BASE}/class-subjects/bulk/`, payload);
    return data;
  },

  async quickSetup(payload: QuickSetupPayload): Promise<QuickSetupResult> {
    const { data } = await apiClient.post(`${BASE}/setup/quick/`, payload);
    return data;
  },

  /** One class per teacher: a teacher who already holds another class is refused (409) unless `reassign` (admin confirmed the move). */
  async setClassTeacher(classId: string, teacher: string | null, reassign = false): Promise<HierarchyClass> {
    const { data } = await apiClient.post(`${BASE}/classes/${classId}/class-teacher/`, reassign ? { teacher, reassign: true } : { teacher });
    return data;
  },

  /** Put an unleveled class in a level without renaming it. */
  async assignLevel(classId: string, level: string, stream?: string): Promise<HierarchyClass> {
    const { data } = await apiClient.post(`${BASE}/classes/${classId}/assign-level/`, { level, ...(stream !== undefined ? { stream } : {}) });
    return data;
  },

  // ---- class levels (Class 1, Class 2 ...): the level decides where pupils go next
  async levels(): Promise<ClassLevel[]> {
    const { data } = await apiClient.get(`${BASE}/levels/`);
    return Array.isArray(data) ? data : [];
  },

  async createLevel(payload: Partial<Pick<ClassLevel, 'name' | 'cycle' | 'language' | 'is_final'>>): Promise<ClassLevel> {
    const { data } = await apiClient.post(`${BASE}/levels/`, payload);
    return data;
  },

  async updateLevel(id: string, payload: Partial<Pick<ClassLevel, 'name' | 'cycle' | 'language' | 'is_final'>>): Promise<ClassLevel> {
    const { data } = await apiClient.patch(`${BASE}/levels/${id}/`, payload);
    return data;
  },

  async deleteLevel(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/levels/${id}/`);
  },

  async reorderLevels(ids: string[]): Promise<ClassLevel[]> {
    const { data } = await apiClient.post(`${BASE}/levels/reorder/`, { ids });
    return data;
  },

  /** Adds the standard Nursery 1-3 / Class 1-6 (or Maternelle / SIL-CM2) levels that are missing. No subjects. */
  async seedLevels(payload: { languages?: Array<'en' | 'fr'>; nursery?: boolean; primary?: boolean } = {}): Promise<{ created: ClassLevel[]; existing: number }> {
    const { data } = await apiClient.post(`${BASE}/levels/seed/`, payload);
    return data;
  },

  // ---- secondary / higher schools (sections, cycles, class masters, a teacher per subject per class)
  async secondarySummary(schoolId?: string): Promise<SecondarySummary> {
    const { data } = await apiClient.get(`${BASE}/secondary-setup-summary/`, { params: schoolId ? { school_id: schoolId } : undefined });
    return data;
  },

  /** Optional and idempotent: adds the standard classes of a section (Form 1-5 + Sixth, or 6e-3e + 2nde-Tle). No subjects. */
  async secondaryQuickSetup(payload: { sub_school?: string; language?: 'en' | 'fr'; cycles?: Array<'first' | 'second'>; school_id?: string }): Promise<{ created: HierarchyClass[]; existing: HierarchyClass[] }> {
    const { data } = await apiClient.post(`${BASE}/secondary/quick-setup/`, payload);
    return data;
  },

  /** No default subjects: type them, or copy another class's list (optionally with its teachers). Existing links are never changed. */
  async secondaryApplySubjects(
    payload:
      | { mode: 'custom'; classes?: string[]; all?: boolean; subjects: Array<{ name: string; coefficient?: number | string; type?: 'mandatory' | 'optional' }>; school_id?: string }
      | { mode: 'copy'; from_class: string; classes?: string[]; all?: boolean; with_teachers?: boolean; school_id?: string },
  ): Promise<BulkSubjectsResult> {
    const { data } = await apiClient.post(`${BASE}/secondary/class-subjects/bulk/`, payload);
    return data;
  },

  /** The same subject taught by one teacher (or nobody) in every selected class that offers it. */
  async secondarySubjectTeacher(payload: { subject: string; teacher: string | null; classes?: string[]; all?: boolean; school_id?: string }): Promise<{ updated: number; unchanged: number; skipped: Array<{ id: string; name: string }> }> {
    const { data } = await apiClient.post(`${BASE}/secondary/subject-teacher/`, payload);
    return data;
  },
};
