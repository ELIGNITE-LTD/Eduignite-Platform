import { apiClient } from '../client';
import { API } from '../endpoints';
import { normalizePlatformSettings } from '../normalizers';
import { resolveMediaUrl } from '@/lib/media';
import {
  PlatformSettings,
  PublicEvent,
  PlatformStats,
  ListParams,
  PaginatedResponse,
} from '../types';

const isFormDataPayload = (value: unknown): value is FormData =>
  typeof FormData !== 'undefined' && value instanceof FormData;

const normalizePublicEvent = (event: PublicEvent): PublicEvent => ({
  ...event,
  url: resolveMediaUrl(event?.url) || event?.url,
  like_count: Number(event?.like_count ?? 0),
  comment_count: Number(event?.comment_count ?? 0),
  liked_by_me: Boolean(event?.liked_by_me),
  comments: Array.isArray(event?.comments) ? event.comments : [],
});

export type PublicSiteStatus = {
  testimonials: { live: number; awaiting_review: number };
  blog: { live: number; drafts: number };
  gallery: { photos: number; videos: number };
  cache_seconds: number;
};

export const platformService = {
  /** What is currently live on the public marketing website. */
  async getPublicSiteStatus(): Promise<PublicSiteStatus> {
    const { data } = await apiClient.get(API.PLATFORM.PUBLIC_SITE);
    return data;
  },

  /** Push approved/published changes to the public site immediately. */
  async refreshPublicSite(): Promise<{ detail: string }> {
    const { data } = await apiClient.post(API.PLATFORM.PUBLIC_SITE, {});
    return data;
  },

  async getPlatformSettings(): Promise<PlatformSettings> {
    const { data } = await apiClient.get(API.PLATFORM.SETTINGS);
    return normalizePlatformSettings(data);
  },

  async updatePlatformSettings(settings: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const { data } = await apiClient.patch(API.PLATFORM.SETTINGS, settings);
    return normalizePlatformSettings(data);
  },

  async uploadLogo(file: File): Promise<{ logo_url: string }> {
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await apiClient.post(API.PLATFORM.UPLOAD_LOGO, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return {
      ...data,
      logo_url: resolveMediaUrl(data?.logo_url),
    };
  },

  async uploadEventMedia(file: File): Promise<{ media_url: string; media_type: "video" | "image" }> {
    const formData = new FormData();
    formData.append('media', file);
    const { data } = await apiClient.post(API.PLATFORM.UPLOAD_EVENT_MEDIA, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return {
      ...data,
      media_url: resolveMediaUrl(data?.media_url),
    };
  },

  async getPlatformFees(params?: ListParams): Promise<PaginatedResponse<any>> {
    const { data } = await apiClient.get(API.PLATFORM.FEES, { params });
    return data;
  },

  async updateFee(id: string, feeData: any): Promise<any> {
    const { data } = await apiClient.patch(`${API.PLATFORM.FEES}${id}/`, feeData);
    return data;
  },

  async createFee(feeData: { role: string; amount: number; currency?: string }): Promise<any> {
    const { data } = await apiClient.post(API.PLATFORM.FEES, feeData);
    return data;
  },

  async getPublicEvents(params?: ListParams): Promise<PaginatedResponse<PublicEvent>> {
    const { data } = await apiClient.get(API.PLATFORM.EVENTS, { params });
    if (Array.isArray(data)) {
      return {
        count: data.length,
        next: null,
        previous: null,
        results: data.map(normalizePublicEvent),
      } as PaginatedResponse<PublicEvent>;
    }
    return {
      ...data,
      results: (data?.results ?? []).map(normalizePublicEvent),
    };
  },

  async createEvent(eventData: Partial<PublicEvent> | FormData): Promise<PublicEvent> {
    const config = isFormDataPayload(eventData)
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : undefined;
    const { data } = await apiClient.post(API.PLATFORM.EVENTS, eventData, config);
    return normalizePublicEvent(data);
  },

  async createPublicEvent(eventData: Partial<PublicEvent> | FormData): Promise<PublicEvent> {
    return this.createEvent(eventData);
  },

  async updateEvent(id: string, eventData: Partial<PublicEvent> | FormData): Promise<PublicEvent> {
    const config = isFormDataPayload(eventData)
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : undefined;
    const { data } = await apiClient.patch(API.PLATFORM.EVENT_DETAIL(id), eventData, config);
    return normalizePublicEvent(data);
  },

  async updatePublicEvent(id: string, eventData: Partial<PublicEvent> | FormData): Promise<PublicEvent> {
    return this.updateEvent(id, eventData);
  },

  async deleteEvent(id: string): Promise<void> {
    await apiClient.delete(API.PLATFORM.EVENT_DETAIL(id));
  },

  async deletePublicEvent(id: string): Promise<void> {
    return this.deleteEvent(id);
  },

  async likeEvent(id: string): Promise<PublicEvent> {
    const { data } = await apiClient.post(API.PLATFORM.EVENT_LIKE(id), {});
    return normalizePublicEvent(data);
  },

  async unlikeEvent(id: string): Promise<PublicEvent> {
    const { data } = await apiClient.post(API.PLATFORM.EVENT_UNLIKE(id), {});
    return normalizePublicEvent(data);
  },

  async createEventComment(id: string, content: string) {
    const { data } = await apiClient.post(API.PLATFORM.EVENT_COMMENTS(id), { content });
    return data;
  },

  async getPlatformStats(): Promise<PlatformStats> {
    const { data } = await apiClient.get(API.PLATFORM.STATS);
    return data;
  },

  async getTutorials(): Promise<Record<string, string>> {
    const { data } = await apiClient.get(API.PLATFORM.TUTORIALS);
    return data;
  },

  // Messages sent from the public website contact form (founders only).
  async getContactMessages(): Promise<ContactMessage[]> {
    const { data } = await apiClient.get(API.PLATFORM.CONTACT_MESSAGES);
    return Array.isArray(data) ? data : (data?.results ?? []);
  },
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};
