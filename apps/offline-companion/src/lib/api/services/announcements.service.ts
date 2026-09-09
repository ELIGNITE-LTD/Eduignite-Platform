import { apiClient } from "../client";
import { API } from "../endpoints";
import type { Announcement, PaginatedResponse } from "../types";

/**
 * Trimmed down from apps/mobile/src/lib/api/services/announcements.service.ts
 * to the one call this app needs: the caller's own feed (EduIgnite office ->
 * this school). Requires the school's "announcements" app entitlement, same
 * as apps/mobile (see backend/apps/registry/permissions.RequiresApp).
 */
export const announcementsService = {
  async getMyFeed(): Promise<PaginatedResponse<Announcement>> {
    const { data } = await apiClient.get(API.ANNOUNCEMENTS.MY_FEED);
    return data;
  },

  async markRead(id: string): Promise<Announcement> {
    const { data } = await apiClient.post(API.ANNOUNCEMENTS.MARK_READ(id), {});
    return data;
  },
};
