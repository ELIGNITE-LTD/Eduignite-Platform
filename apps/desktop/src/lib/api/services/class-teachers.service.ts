import { apiClient } from '../client';
import { API } from '../endpoints';
import type {
  AssignClassTeacherRequest,
  ClassTeacherAssignment,
  MyClassesResponse,
} from '../types';

export const classTeachersService = {
  async list(params?: { class_id?: string; teacher_id?: string }): Promise<ClassTeacherAssignment[]> {
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_CLASS_TEACHERS, { params });
    return data?.results ?? data ?? [];
  },

  async assign(payload: AssignClassTeacherRequest): Promise<ClassTeacherAssignment> {
    const { data } = await apiClient.post(API.SCHOOLS.HIERARCHY_CLASS_TEACHERS, payload);
    return data;
  },

  async unassign(id: string): Promise<void> {
    await apiClient.delete(API.SCHOOLS.HIERARCHY_CLASS_TEACHER_DETAIL(id));
  },

  async myClasses(): Promise<MyClassesResponse> {
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_MY_CLASSES);
    return {
      class_centred: Boolean(data?.class_centred),
      classes: data?.classes ?? [],
    };
  },
};
