import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  Announcement,
  PaginatedResponse,
  ListParams,
  CreateAnnouncementRequest,
} from '../types';

export const announcementsService = {
  async getAnnouncements(params?: ListParams): Promise<PaginatedResponse<Announcement>> {
    const { data } = await apiClient.get(API.ANNOUNCEMENTS.BASE, { params });
    return data;
  },

  async getAnnouncement(id: string): Promise<Announcement> {
    const { data } = await apiClient.get(API.ANNOUNCEMENTS.DETAIL(id));
    return data;
  },

  async getMyAnnouncementFeed(params?: ListParams): Promise<PaginatedResponse<Announcement>> {
    const { data } = await apiClient.get(API.ANNOUNCEMENTS.MY_FEED, { params });
    return data;
  },

  async getPinnedAnnouncements(params?: ListParams): Promise<PaginatedResponse<Announcement>> {
    const { data } = await apiClient.get(API.ANNOUNCEMENTS.PINNED, { params });
    return data;
  },

  async createAnnouncement(announcementData: CreateAnnouncementRequest): Promise<Announcement> {
    const { data } = await apiClient.post(API.ANNOUNCEMENTS.BASE, announcementData);
    return data;
  },

  async updateAnnouncement(
    id: string,
    announcementData: Partial<CreateAnnouncementRequest>
  ): Promise<Announcement> {
    const { data } = await apiClient.patch(API.ANNOUNCEMENTS.DETAIL(id), announcementData);
    return data;
  },

  async markRead(id: string): Promise<Announcement> {
    const { data } = await apiClient.post(API.ANNOUNCEMENTS.MARK_READ(id), {});
    return data;
  },

  async markAnnouncementRead(id: string): Promise<Announcement> {
    return this.markRead(id);
  },

  async deleteAnnouncement(id: string): Promise<void> {
    await apiClient.delete(API.ANNOUNCEMENTS.DETAIL(id));
  },

  async getPlatformWideAnnouncements(
    params?: ListParams
  ): Promise<PaginatedResponse<Announcement>> {
    const { data } = await apiClient.get(API.ANNOUNCEMENTS.PLATFORM_WIDE, { params });
    return data;
  },

  async getPlatformAnnouncements(
    params?: ListParams
  ): Promise<PaginatedResponse<Announcement>> {
    return this.getPlatformWideAnnouncements(params);
  },

  /** The audiences the signed-in person may address, decided by the server. */
  async getAudiences(): Promise<AnnouncementAudiences> {
    const { data } = await apiClient.get(`${API.ANNOUNCEMENTS.BASE}audiences/`);
    return data;
  },

  /** CEO only: audiences granted to other executives. */
  async getAudienceGrants(): Promise<AnnouncementAudienceGrant[]> {
    const { data } = await apiClient.get('/announcements/audience-grants/');
    return Array.isArray(data) ? data : (data?.results ?? []);
  },

  async grantAudience(user: string, audience: string): Promise<AnnouncementAudienceGrant> {
    const { data } = await apiClient.post('/announcements/audience-grants/', { user, audience });
    return data;
  },

  async revokeAudienceGrant(id: number | string): Promise<void> {
    await apiClient.delete(`/announcements/audience-grants/${id}/`);
  },
};

export type AnnouncementAudiences = {
  can_publish: boolean;
  scope: 'platform' | 'school';
  targets: { value: string; label: string }[];
  default_target: string | null;
  show_audience_picker: boolean;
  can_choose_target_school: boolean;
};

export type AnnouncementAudienceGrant = {
  id: number;
  user: string;
  user_name: string;
  user_role: string;
  audience: string;
  granted_by: string | null;
  granted_by_name: string | null;
  created_at: string;
};
