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
  teachers: Array<{ id: string; name: string; classes: string[]; load: number }>;
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

  async setClassTeacher(classId: string, teacher: string | null): Promise<HierarchyClass> {
    const { data } = await apiClient.post(`${BASE}/classes/${classId}/class-teacher/`, { teacher });
    return data;
  },
};
