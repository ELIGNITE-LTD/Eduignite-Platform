import { apiClient } from "../client";

/** Authorised pick-up: the people who may collect a child (nursery schools). Backend: /students/pickups/. */

export interface Pickup {
  id: string;
  student: string;
  student_name: string;
  full_name: string;
  relationship: string;
  phone: string;
  id_note: string;
  is_active: boolean;
}

export interface PickupInput {
  full_name: string;
  relationship: string;
  phone: string;
  id_note: string;
}

const BASE = "/students/pickups/";

export const pickupService = {
  async list(student: string): Promise<Pickup[]> {
    const { data } = await apiClient.get(BASE, { params: { student } });
    return Array.isArray(data) ? data : data?.results ?? [];
  },
  async create(student: string, input: PickupInput): Promise<Pickup> {
    const { data } = await apiClient.post(BASE, { student, ...input });
    return data;
  },
  async update(id: string, input: Partial<PickupInput>): Promise<Pickup> {
    const { data } = await apiClient.patch(`${BASE}${id}/`, input);
    return data;
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(`${BASE}${id}/`);
  },
};
