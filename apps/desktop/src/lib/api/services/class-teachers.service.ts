import { apiClient } from '../client';
import { API } from '../endpoints';
import { fetchAllPages } from '../fetch-all';
import type {
  AssignClassTeacherRequest,
  ClassTeacherAssignment,
  MyClassesResponse,
} from '../types';

export const classTeachersService = {
  async list(params?: { class_id?: string; teacher_id?: string }): Promise<ClassTeacherAssignment[]> {
    return fetchAllPages<ClassTeacherAssignment>(async (page, page_size) => (
      await apiClient.get(API.SCHOOLS.HIERARCHY_CLASS_TEACHERS, { params: { ...(params ?? {}), page, page_size } })
    ).data);
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
