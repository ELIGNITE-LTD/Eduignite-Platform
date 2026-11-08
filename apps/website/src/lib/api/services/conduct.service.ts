import { apiClient } from '../client';

export type ConductKind = 'warning' | 'praise' | 'note' | 'late';

export interface ConductEntry {
  id: string;
  student: string;
  student_name: string;
  kind: ConductKind;
  note: string;
  date: string;
  recorded_by_name: string;
  is_mine: boolean;
  created: string;
}

export type ConductCounts = Record<string, Record<ConductKind, number>>;

const BASE = '/grades/conduct/';

export const conductService = {
  async list(params: { student?: string; class_id?: string }): Promise<ConductEntry[]> {
    const { data } = await apiClient.get(BASE, { params });
    return data?.results ?? data ?? [];
  },

  async counts(params: { class_id: string }): Promise<ConductCounts> {
    const { data } = await apiClient.get(`${BASE}counts/`, { params });
    return data ?? {};
  },

  async add(payload: { student: string; kind: ConductKind; note?: string; date?: string }): Promise<ConductEntry> {
    const { data } = await apiClient.post(BASE, payload);
    return data;
  },

  async lateToday(student: string): Promise<ConductEntry> {
    const { data } = await apiClient.post(`${BASE}late-today/`, { student });
    return data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`${BASE}${id}/`);
  },
};
