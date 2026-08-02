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
};
