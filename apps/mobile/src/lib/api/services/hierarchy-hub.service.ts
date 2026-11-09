import { apiClient } from '../client';
import type { HierarchyClass } from '../types';

export interface HubStep {
  key: 'sections' | 'classes' | 'subjects' | 'teachers' | 'fees' | 'pupils';
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
  counts: { sections: number; classes: number; pupils: number; subject_links: number };
}

export interface BulkSubjectsResult {
  created: number;
  existing: number;
  skipped_nursery?: string[];
}

export interface QuickSetupPayload {
  languages: Array<'en' | 'fr'>;
  nursery: boolean;
  primary: boolean;
  subjects: boolean;
}

export interface QuickSetupResult {
  sections: Array<{ id: string; name: string }>;
  classes_created: string[];
  classes_existing: string[];
  subjects_created: number;
  subjects_existing: number;
  summary: HubSummary;
}

const BASE = '/schools/hierarchy';

/** Guided-setup endpoints of the nursery/primary "Hierarchy & Sections" hub. */
export const hierarchyHubService = {
  async summary(): Promise<HubSummary> {
    const { data } = await apiClient.get(`${BASE}/setup-summary/`);
    return data;
  },

  async bulkClasses(payload: { names: string[]; sub_school?: string }): Promise<{ created: HierarchyClass[]; existing: HierarchyClass[] }> {
    const { data } = await apiClient.post(`${BASE}/classes/bulk/`, payload);
    return data;
  },

  async applySubjects(
    payload:
      | { mode: 'template'; classes?: string[]; all?: boolean }
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
};
