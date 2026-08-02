import { apiClient } from '../client';
import { API } from '../endpoints';
import { normalizeSchool } from '../normalizers';
import { resolveMediaUrl } from '@/lib/media';
import {
  School,
  SchoolSettings,
  PaginatedResponse,
  ListParams,
  CreateSchoolRequest,
  UpdateSchoolRequest,
  PlatformStats,
  HierarchySubSchool,
  HierarchySubAdmin,
  HierarchyClass,
  HierarchyClassExplore,
  HierarchyClassSubject,
  TimetableEntry,
  CreateTimetableEntryRequest,
  User,
} from '../types';

function shouldUseSettingsFallback(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 405;
}

function shouldUseTimetableFallback(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 405;
}

async function withTimetableFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (shouldUseTimetableFallback(error)) {
      return fallback();
    }
    throw error;
  }
}

export const schoolsService = {
  async getSchools(params?: ListParams): Promise<PaginatedResponse<School>> {
    const { data } = await apiClient.get(API.SCHOOLS.BASE, { params });
    return {
      ...data,
      results: (data?.results ?? []).map(normalizeSchool).filter(Boolean) as School[],
    };
  },

  async getDraftSchools(params?: ListParams): Promise<PaginatedResponse<School>> {
    return this.getSchools({ ...params, draft: 'true' } as ListParams);
  },

  async getSchool(id: string): Promise<School> {
    const { data } = await apiClient.get(API.SCHOOLS.DETAIL(id));
    return normalizeSchool(data) as School;
  },

  async getMySchool(): Promise<School> {
    const { data } = await apiClient.get(API.SCHOOLS.MY_SCHOOL);
    return normalizeSchool(data) as School;
  },

  async createSchool(schoolData: CreateSchoolRequest): Promise<School> {
    const { data } = await apiClient.post(API.SCHOOLS.BASE, schoolData);
    return normalizeSchool(data) as School;
  },

  async updateSchool(id: string, schoolData: UpdateSchoolRequest): Promise<School> {
    const { data } = await apiClient.patch(API.SCHOOLS.DETAIL(id), schoolData);
    return normalizeSchool(data) as School;
  },

  async uploadLogo(id: string, file: File): Promise<{ logo_url: string; logo: string }> {
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await apiClient.post(`/schools/schools/${id}/upload-logo/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return {
      ...data,
      logo_url: resolveMediaUrl(data?.logo_url),
      logo: resolveMediaUrl(data?.logo),
    };
  },

  async uploadBanner(id: string, file: File): Promise<{ banner_url: string; banner: string }> {
    const formData = new FormData();
    formData.append('banner', file);
    const { data } = await apiClient.post(`/schools/schools/${id}/upload-banner/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return {
      ...data,
      banner_url: resolveMediaUrl(data?.banner_url),
      banner: resolveMediaUrl(data?.banner),
    };
  },

  async deleteSchool(id: string, confirmation?: { matricule: string; password: string; deletion_reason?: string; reason?: string }): Promise<void> {
    await apiClient.delete(API.SCHOOLS.DETAIL(id), { data: confirmation ?? {} });
  },

  async restoreSchool(id: string): Promise<School> {
    const { data } = await apiClient.post(API.SCHOOLS.RESTORE(id));
    return normalizeSchool(data) as School;
  },

  // CEO/CTO only: irreversibly erase a school and all of its data.
  async permanentDeleteSchool(id: string, confirmation: { matricule: string; password: string }): Promise<void> {
    await apiClient.post(`/schools/schools/${id}/permanent-delete/`, confirmation);
  },

  async toggleSchoolStatus(id: string, body?: Record<string, unknown>): Promise<School> {
    const { data } = await apiClient.post(API.SCHOOLS.TOGGLE_STATUS(id), body ?? {});
    return normalizeSchool(data) as School;
  },

  // --- One-time school subscription (founders) ---------------------------
  async getSchoolSubscription(id: string): Promise<SchoolSubscription> {
    const { data } = await apiClient.get(`/schools/schools/${id}/subscription/`);
    return data;
  },
  // Set the yearly fee, on its own.
  async setSchoolSubscriptionAmount(id: string, amount: number, currency?: string): Promise<SchoolSubscription> {
    const { data } = await apiClient.post(`/schools/schools/${id}/subscription/amount/`, { amount, currency });
    return data;
  },
  // Change the status, on its own — no amount needed.
  async setSchoolSubscriptionStatus(
    id: string,
    body: { status: string; free_until?: string | null; expires_on?: string | null }
  ): Promise<SchoolSubscription> {
    const { data } = await apiClient.post(`/schools/schools/${id}/subscription/status/`, body);
    return data;
  },
  async getSchoolDetailCounts(id: string): Promise<SchoolDetailCounts> {
    const { data } = await apiClient.get(`/schools/schools/${id}/details/`);
    return data;
  },
  // The school admin pays the one-time subscription for the whole school.
  async paySchoolSubscription(phone: string, operator?: string): Promise<any> {
    const { data } = await apiClient.post("/fees/payunit/school-subscription/", { phone, operator });
    return data;
  },

  async getSchoolStats(): Promise<PlatformStats> {
    const { data } = await apiClient.get(API.SCHOOLS.STATS);
    return data;
  },

  async getSchoolSettings(id: string): Promise<SchoolSettings> {
    const { data } = await apiClient.get(API.SCHOOLS.SETTINGS(id));
    return data;
  },

  async updateSchoolSettings(id: string, settings: Partial<SchoolSettings>): Promise<SchoolSettings> {
    const { data } = await apiClient.patch(API.SCHOOLS.SETTINGS(id), settings);
    return data;
  },

  async getHonourRollThreshold(id: string): Promise<number> {
    try {
      const { data } = await apiClient.get(API.SCHOOLS.HONOUR_ROLL_THRESHOLD(id));
      const value = Number(data?.honour_roll_threshold ?? data?.honourRollThreshold);
      return Number.isFinite(value) ? value : 12;
    } catch (error) {
      if (!shouldUseSettingsFallback(error)) throw error;
      const settings = await this.getSchoolSettings(id);
      const value = Number(settings.honour_roll_threshold ?? settings.honourRollThreshold);
      return Number.isFinite(value) ? value : 12;
    }
  },

  async updateHonourRollThreshold(id: string, threshold: number): Promise<SchoolSettings> {
    try {
      const { data } = await apiClient.patch(API.SCHOOLS.HONOUR_ROLL_THRESHOLD(id), {
        honour_roll_threshold: threshold,
      });
      return data;
    } catch (error) {
      if (!shouldUseSettingsFallback(error)) throw error;
      return this.updateSchoolSettings(id, { honour_roll_threshold: threshold } as Partial<SchoolSettings>);
    }
  },

  async getHierarchyStaff(schoolId?: string): Promise<User[]> {
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_STAFF, { params: schoolId ? { school_id: schoolId } : undefined });
    return data?.results ?? data ?? [];
  },

  async getSubSchools(schoolId?: string): Promise<HierarchySubSchool[]> {
    if (schoolId) {
      const { data } = await apiClient.get(API.SCHOOLS.SUB_SCHOOLS(schoolId));
      return data?.results ?? data ?? [];
    }
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_SUB_SCHOOLS, { params: schoolId ? { school_id: schoolId } : undefined });
    return data?.results ?? data ?? [];
  },

  async getSchoolSubSchools(schoolId: string): Promise<HierarchySubSchool[]> {
    const { data } = await apiClient.get(API.SCHOOLS.SUB_SCHOOLS(schoolId));
    return data?.results ?? data ?? [];
  },

  async createSubSchool(payload: Partial<HierarchySubSchool> & { school_id?: string }): Promise<HierarchySubSchool> {
    if (payload.school_id) {
      const { data } = await apiClient.post(API.SCHOOLS.SUB_SCHOOLS(payload.school_id), payload);
      return data;
    }
    const { data } = await apiClient.post(API.SCHOOLS.HIERARCHY_SUB_SCHOOLS, payload);
    return data;
  },

  async updateSubSchool(id: string, payload: Partial<HierarchySubSchool> & { school_id?: string }): Promise<HierarchySubSchool> {
    if (payload.school_id) {
      const { data } = await apiClient.patch(API.SCHOOLS.SUB_SCHOOL_DETAIL(payload.school_id, id), payload);
      return data;
    }
    const { data } = await apiClient.patch(API.SCHOOLS.HIERARCHY_SUB_SCHOOL_DETAIL(id), payload);
    return data;
  },

  async assignVicePrincipal(schoolId: string, subSchoolId: string, vicePrincipalId: string | null): Promise<HierarchySubSchool> {
    const { data } = await apiClient.patch(API.SCHOOLS.SUB_SCHOOL_DETAIL(schoolId, subSchoolId), {
      vice_principal: vicePrincipalId,
    });
    return data;
  },

  async deleteSubSchool(id: string): Promise<void> {
    await apiClient.delete(API.SCHOOLS.HIERARCHY_SUB_SCHOOL_DETAIL(id));
  },

  async getSubAdmins(schoolId?: string): Promise<HierarchySubAdmin[]> {
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_SUB_ADMINS, { params: schoolId ? { school_id: schoolId } : undefined });
    return data?.results ?? data ?? [];
  },

  async assignSubAdmin(payload: { staff: string; sub_school: string; school_id?: string }): Promise<HierarchySubAdmin> {
    const { data } = await apiClient.post(API.SCHOOLS.HIERARCHY_SUB_ADMINS, payload);
    return data;
  },

  async updateSubAdmin(id: string, payload: { sub_school: string; school_id?: string }): Promise<HierarchySubAdmin> {
    const { data } = await apiClient.patch(API.SCHOOLS.HIERARCHY_SUB_ADMIN_DETAIL(id), payload);
    return data;
  },

  async unassignSubAdmin(id: string): Promise<void> {
    await apiClient.delete(API.SCHOOLS.HIERARCHY_SUB_ADMIN_DETAIL(id));
  },

  async getHierarchyClasses(params?: { school_id?: string; sub_school?: string }): Promise<HierarchyClass[]> {
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_CLASSES, { params });
    return data?.results ?? data ?? [];
  },

  async getSchoolClasses(schoolId: string, params?: { active?: boolean; sub_school?: string }): Promise<HierarchyClass[]> {
    const { data } = await apiClient.get(API.SCHOOLS.CLASSES(schoolId), { params });
    return data?.results ?? data ?? [];
  },

  async createHierarchyClass(payload: Partial<HierarchyClass> & { school_id?: string }): Promise<HierarchyClass> {
    if (payload.school_id) {
      const { data } = await apiClient.post(API.SCHOOLS.CLASSES(payload.school_id), payload);
      return data;
    }
    const { data } = await apiClient.post(API.SCHOOLS.HIERARCHY_CLASSES, payload);
    return data;
  },

  async createSchoolStaff(schoolId: string, payload: Partial<User> & Record<string, unknown>): Promise<User> {
    const { data } = await apiClient.post(API.SCHOOLS.STAFF(schoolId), payload);
    return data;
  },

  async bulkImportStudents(schoolId: string, payload: FormData | Record<string, unknown>): Promise<any> {
    if (payload instanceof FormData) {
      const { data } = await apiClient.post(API.SCHOOLS.STUDENTS_BULK(schoolId), payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    }
    const { data } = await apiClient.post(API.SCHOOLS.STUDENTS_BULK(schoolId), payload);
    return data;
  },

  async updateHierarchyClass(id: string, payload: Partial<HierarchyClass> & { school_id?: string }): Promise<HierarchyClass> {
    const { data } = await apiClient.patch(API.SCHOOLS.HIERARCHY_CLASS_DETAIL(id), payload);
    return data;
  },

  async deleteHierarchyClass(id: string): Promise<void> {
    await apiClient.delete(API.SCHOOLS.HIERARCHY_CLASS_DETAIL(id));
  },

  async exploreHierarchyClass(id: string, schoolId?: string): Promise<HierarchyClassExplore> {
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_CLASS_EXPLORE(id), { params: schoolId ? { school_id: schoolId } : undefined });
    return data;
  },

  async getHierarchySubjects(params?: { school_id?: string; sub_school?: string; class_id?: string; type?: string }): Promise<HierarchyClassSubject[]> {
    const { data } = await apiClient.get(API.SCHOOLS.HIERARCHY_SUBJECTS, { params });
    return data?.results ?? data ?? [];
  },

  async createHierarchySubject(payload: Partial<HierarchyClassSubject> & { school_id?: string }): Promise<HierarchyClassSubject> {
    const { data } = await apiClient.post(API.SCHOOLS.HIERARCHY_SUBJECTS, payload);
    return data;
  },

  async updateHierarchySubject(id: string, payload: Partial<HierarchyClassSubject> & { school_id?: string }): Promise<HierarchyClassSubject> {
    const { data } = await apiClient.patch(API.SCHOOLS.HIERARCHY_SUBJECT_DETAIL(id), payload);
    return data;
  },

  async deleteHierarchySubject(id: string): Promise<void> {
    await apiClient.delete(API.SCHOOLS.HIERARCHY_SUBJECT_DETAIL(id));
  },

  async getTimetable(params?: {
    school_id?: string;
    school_class?: string;
    class_id?: string;
    academic_year?: string;
    term?: string;
    status?: string;
    day_of_week?: number | string;
  }): Promise<TimetableEntry[]> {
    const { data } = await withTimetableFallback(
      () => apiClient.get(API.SCHOOLS.TIMETABLE, { params }),
      () => apiClient.get(API.SCHOOLS.TIMETABLE_LEGACY, { params })
    );
    return data?.results ?? data ?? [];
  },

  async createTimetableEntry(payload: CreateTimetableEntryRequest): Promise<TimetableEntry> {
    const { data } = await withTimetableFallback(
      () => apiClient.post(API.SCHOOLS.TIMETABLE, payload),
      () => apiClient.post(API.SCHOOLS.TIMETABLE_LEGACY, payload)
    );
    return data;
  },

  async updateTimetableEntry(id: string, payload: Partial<CreateTimetableEntryRequest>): Promise<TimetableEntry> {
    const { data } = await withTimetableFallback(
      () => apiClient.patch(API.SCHOOLS.TIMETABLE_DETAIL(id), payload),
      () => apiClient.patch(API.SCHOOLS.TIMETABLE_LEGACY_DETAIL(id), payload)
    );
    return data;
  },

  async deleteTimetableEntry(id: string): Promise<void> {
    await withTimetableFallback(
      () => apiClient.delete(API.SCHOOLS.TIMETABLE_DETAIL(id)),
      () => apiClient.delete(API.SCHOOLS.TIMETABLE_LEGACY_DETAIL(id))
    );
  },

  async publishTimetableEntry(id: string): Promise<TimetableEntry> {
    const { data } = await withTimetableFallback(
      () => apiClient.post(API.SCHOOLS.TIMETABLE_PUBLISH(id)),
      () => apiClient.post(API.SCHOOLS.TIMETABLE_LEGACY_PUBLISH(id))
    );
    return data;
  },

  async unpublishTimetableEntry(id: string): Promise<TimetableEntry> {
    const { data } = await withTimetableFallback(
      () => apiClient.post(API.SCHOOLS.TIMETABLE_UNPUBLISH(id)),
      () => apiClient.post(API.SCHOOLS.TIMETABLE_LEGACY_UNPUBLISH(id))
    );
    return data;
  },

  async publishTimetable(params?: { academic_year?: string; term?: string; school_id?: string }): Promise<{ published_count: number }> {
    const { data } = await withTimetableFallback(
      () => apiClient.post(API.SCHOOLS.TIMETABLE_PUBLISH_ALL, params ?? {}),
      () => apiClient.post(API.SCHOOLS.TIMETABLE_LEGACY_PUBLISH_ALL, params ?? {})
    );
    return data;
  },
};

export type SchoolSubscription = {
  status: "free" | "paid" | "unpaid";
  effective_state: "free" | "paid" | "unpaid";
  amount: number;
  currency: string;
  free_until: string | null;
  expires_on?: string | null;
  paid_at?: string | null;
  note?: string;
};

export type SchoolDetailCounts = {
  school: { id: string; name: string };
  total_users: number;
  students: number;
  parents: number;
  staff: number;
  by_role: Record<string, number>;
  active_users: number;
  subscription: SchoolSubscription;
};
