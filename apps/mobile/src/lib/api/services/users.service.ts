import { apiClient } from '../client';
import { API } from '../endpoints';
import { normalizePaginatedResponse } from '../normalize';
import { normalizeFounder, normalizeUser } from '../normalizers';
import { resolveMediaUrl } from '@/lib/media';
import {
  User,
  FounderProfile,
  PaginatedResponse,
  ListParams,
  CreateUserRequest,
  UpdateUserRequest,
  PlatformStats,
  CreateFounderRequest,
  UpdateFounderRequest,
  AddFounderSharesRequest,
} from '../types';

export const usersService = {
  async getUsers(params?: ListParams): Promise<PaginatedResponse<User>> {
    const { data } = await apiClient.get(API.USERS.BASE, { params });
    const normalized = normalizePaginatedResponse(data);
    return {
      ...normalized,
      results: normalized.results.map(normalizeUser),
    };
  },

  async getUser(id: string): Promise<User> {
    const { data } = await apiClient.get(API.USERS.DETAIL(id));
    return normalizeUser(data);
  },

  async getMe(): Promise<User> {
    const { data } = await apiClient.get(API.USERS.ME);
    return normalizeUser(data);
  },

  async updateProfile(idOrData: string | UpdateUserRequest, data?: UpdateUserRequest): Promise<User> {
    const payload = typeof idOrData === 'string' ? data ?? {} : idOrData;
    const { data: response } = await apiClient.patch(API.USERS.ME, payload);
    return normalizeUser(response);
  },

  async uploadAvatar(file: File): Promise<{ avatar_url: string }> {
    const formData = new FormData();
    formData.append('avatar', file);
    const { data } = await apiClient.post(API.USERS.UPLOAD_AVATAR, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return {
      ...data,
      avatar_url: resolveMediaUrl(data?.avatar_url),
    };
  },

  async updateRole(id: string, roleOrPayload: string | { role: string }): Promise<User> {
    const role = typeof roleOrPayload === 'string' ? roleOrPayload : roleOrPayload.role;
    const { data } = await apiClient.post(API.USERS.UPDATE_ROLE(id), { role });
    return normalizeUser(data);
  },

  async toggleLicense(id: string, payload?: { is_license_paid?: boolean; isLicensePaid?: boolean }): Promise<User> {
    const { data } = await apiClient.post(API.USERS.TOGGLE_LICENSE(id), {
      is_license_paid: payload?.is_license_paid ?? payload?.isLicensePaid ?? true,
    });
    return normalizeUser(data);
  },

  async getStats(): Promise<PlatformStats> {
    const { data } = await apiClient.get(API.USERS.STATS);
    return data;
  },

  async getUserStats(): Promise<PlatformStats> {
    return this.getStats();
  },

  async getExecutives(params?: ListParams): Promise<PaginatedResponse<User>> {
    const { data } = await apiClient.get(API.USERS.EXECUTIVES, { params });
    if (Array.isArray(data)) {
      return {
        count: data.length,
        next: null,
        previous: null,
        results: data.map(normalizeUser),
      };
    }
    return {
      ...data,
      results: (data?.results ?? []).map(normalizeUser),
    };
  },

  async getUsersBySchool(schoolId: string, params?: ListParams): Promise<PaginatedResponse<User>> {
    const { data } = await apiClient.get(API.USERS.BY_SCHOOL(schoolId), { params });
    const normalized = normalizePaginatedResponse(data);
    return {
      ...normalized,
      results: normalized.results.map(normalizeUser),
    };
  },

  async getDraftUsers(params?: ListParams): Promise<PaginatedResponse<User>> {
    return this.getUsers({ ...params, draft: 'true' } as ListParams);
  },

  async getAllUsersBySchool(schoolId: string, params?: ListParams): Promise<PaginatedResponse<User>> {
    const pageSize = Number(params?.page_size || 100);
    const firstPage = await this.getUsersBySchool(schoolId, { ...params, page: 1, page_size: pageSize });
    const results = [...firstPage.results];
    const total = Number(firstPage.count || results.length);
    let page = 2;

    while (firstPage.next && results.length < total && page <= 200) {
      const response = await this.getUsersBySchool(schoolId, { ...params, page, page_size: pageSize });
      results.push(...response.results);
      if (!response.next || response.results.length === 0) break;
      page += 1;
    }

    return {
      count: total,
      next: null,
      previous: null,
      results,
    };
  },

  async createUser(userData: CreateUserRequest): Promise<User> {
    const { data } = await apiClient.post(API.USERS.BASE, userData);
    return normalizeUser(data);
  },

  async getFounders(): Promise<FounderProfile[]> {
    const { data } = await apiClient.get(API.USERS.FOUNDERS);
    return (data ?? []).map(normalizeFounder);
  },

  async createFounder(payload: CreateFounderRequest): Promise<FounderProfile> {
    const { data } = await apiClient.post(API.USERS.FOUNDERS, payload);
    return normalizeFounder(data);
  },

  async updateFounder(id: string, payload: UpdateFounderRequest): Promise<FounderProfile> {
    const { data } = await apiClient.patch(API.USERS.FOUNDER_DETAIL(id), payload);
    return normalizeFounder(data);
  },

  async addFounderShares(id: string, payload: AddFounderSharesRequest): Promise<FounderProfile> {
    const { data } = await apiClient.post(API.USERS.ADD_FOUNDER_SHARES(id), payload);
    return normalizeFounder(data);
  },

  async renewFounderShares(id: string): Promise<FounderProfile> {
    const { data } = await apiClient.post(API.USERS.RENEW_FOUNDER_SHARES(id));
    return normalizeFounder(data);
  },

  async removeShareAdjustment(founderId: string, adjustmentId: string): Promise<FounderProfile> {
    const { data } = await apiClient.delete(
      API.USERS.REMOVE_SHARE_ADJUSTMENT(founderId, adjustmentId)
    );
    return normalizeFounder(data);
  },

  async deleteFounder(id: string, confirmation?: { matricule: string; password: string; deletion_reason?: string; reason?: string }): Promise<void> {
    await apiClient.delete(API.USERS.FOUNDER_DETAIL(id), { data: confirmation ?? {} });
  },

  async deleteUser(id: string, confirmation?: { matricule: string; password: string; deletion_reason?: string; reason?: string }): Promise<void> {
    await apiClient.delete(API.USERS.DETAIL(id), { data: confirmation ?? {} });
  },

  async restoreUser(id: string): Promise<User> {
    const { data } = await apiClient.post(API.USERS.RESTORE(id));
    return normalizeUser(data);
  },

  async suspendUser(id: string, payload: { days?: number; reason?: string; suspended_until?: string }): Promise<User> {
    const { data } = await apiClient.post(API.USERS.SUSPEND(id), payload);
    return normalizeUser(data);
  },

  async unsuspendUser(id: string): Promise<User> {
    const { data } = await apiClient.post(API.USERS.UNSUSPEND(id));
    return normalizeUser(data);
  },

  async hardDeleteUser(id: string, confirmation: { matricule: string; password: string }): Promise<void> {
    await apiClient.post(API.USERS.HARD_DELETE(id), confirmation);
  },

  /**
   * Issue a student a new password when they have forgotten theirs.
   *
   * Stored passwords are hashed, so the old one cannot be looked up - a reset
   * is the only way to help. Leave `newPassword` empty and the server generates
   * one. The response carries the value to hand to the student; it cannot be
   * retrieved again afterwards.
   */
  async adminResetStudentPassword(
    id: string,
    newPassword?: string,
  ): Promise<{ password: string; detail: string }> {
    const { data } = await apiClient.post(
      API.USERS.ADMIN_RESET_PASSWORD(id),
      newPassword ? { new_password: newPassword } : {},
    );
    return data;
  },
};
