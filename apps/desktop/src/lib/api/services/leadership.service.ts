import { apiClient } from "../client";

/** EduIgnite leadership records kept by the CEO and CTO; the EduIgnite AI reads them. Backend: /users/leadership/. */

export interface LeadershipEntry {
  id: string;
  person_name: string;
  title: string;
  department: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  note: string;
}

export type LeadershipInput = Omit<LeadershipEntry, "id">;

const BASE = "/users/leadership/";

export const leadershipService = {
  async list(): Promise<LeadershipEntry[]> {
    const { data } = await apiClient.get(BASE);
    return Array.isArray(data) ? data : data?.results ?? [];
  },
  async create(input: LeadershipInput): Promise<LeadershipEntry> {
    const { data } = await apiClient.post(BASE, input);
    return data;
  },
  async update(id: string, input: Partial<LeadershipInput>): Promise<LeadershipEntry> {
    const { data } = await apiClient.patch(`${BASE}${id}/`, input);
    return data;
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(`${BASE}${id}/`);
  },
};
