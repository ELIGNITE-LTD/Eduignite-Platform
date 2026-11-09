import { apiClient } from "../client";

/**
 * Management API for a school's public events and gallery
 * (/schools/public-site/events|albums|media). Permissions are enforced by the
 * server; the UI only mirrors them.
 */

export type ContentStatus = "draft" | "published";

export const EVENT_CATEGORIES = ["academic", "cultural", "sports", "ceremony", "meeting", "holiday", "other"] as const;
export const ALBUM_CATEGORIES = ["campus", "classrooms", "labs", "sports", "cultural", "events", "other"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type AlbumCategory = (typeof ALBUM_CATEGORIES)[number];

export interface SiteEvent {
  id: string;
  slug: string;
  title_en: string;
  title_fr: string;
  description_en: string;
  description_fr: string;
  start_at: string;
  end_at: string | null;
  location: string;
  category: EventCategory;
  cover_url: string | null;
  status: ContentStatus;
  published_at: string | null;
  bucket: "upcoming" | "ongoing" | "past";
  linked_event: string | null;
  created_at: string;
  updated_at: string;
}

export type SiteEventInput = Partial<
  Pick<SiteEvent, "title_en" | "title_fr" | "description_en" | "description_fr" | "start_at" | "end_at" | "location" | "category">
>;

export interface SiteAlbum {
  id: string;
  title_en: string;
  title_fr: string;
  category: AlbumCategory;
  order: number;
  status: ContentStatus;
  published_at: string | null;
  cover_url: string | null;
  cover_thumb_url: string | null;
  media_count: number;
}

export type SiteAlbumInput = Partial<Pick<SiteAlbum, "title_en" | "title_fr" | "category">>;

export interface SiteMedia {
  id: string;
  album: string;
  url: string;
  thumb_url: string;
  width: number;
  height: number;
  caption_en: string;
  caption_fr: string;
  alt_en: string;
  alt_fr: string;
  order: number;
}

export interface ImageQuota {
  used: number;
  limit: number;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Client-side pre-check so people get an instant message; the server re-validates everything. */
export function imageProblem(file: File): "type" | "size" | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return null;
}

const BASE = "/schools/public-site";

// Let the browser build the multipart boundary header itself.
const MULTIPART = { headers: { "Content-Type": undefined } } as const;

function imageForm(file: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("image", file);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return form;
}

export const publicSiteContentService = {
  async listEvents(): Promise<{ results: SiteEvent[]; quota: ImageQuota }> {
    return (await apiClient.get(`${BASE}/events/`)).data;
  },
  async createEvent(input: SiteEventInput): Promise<SiteEvent> {
    return (await apiClient.post(`${BASE}/events/`, input)).data;
  },
  async updateEvent(id: string, input: SiteEventInput): Promise<SiteEvent> {
    return (await apiClient.patch(`${BASE}/events/${id}/`, input)).data;
  },
  async deleteEvent(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/events/${id}/`);
  },
  async setEventPublished(id: string, published: boolean): Promise<SiteEvent> {
    return (await apiClient.post(`${BASE}/events/${id}/${published ? "publish" : "unpublish"}/`)).data;
  },
  async uploadEventCover(id: string, file: File, onProgress?: (percent: number) => void): Promise<SiteEvent> {
    return (
      await apiClient.post(`${BASE}/events/${id}/cover/`, imageForm(file), {
        ...MULTIPART,
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      })
    ).data;
  },
  async removeEventCover(id: string): Promise<SiteEvent> {
    return (await apiClient.delete(`${BASE}/events/${id}/cover/`)).data;
  },

  async listAlbums(): Promise<{ results: SiteAlbum[]; quota: ImageQuota }> {
    return (await apiClient.get(`${BASE}/albums/`)).data;
  },
  async createAlbum(input: SiteAlbumInput): Promise<SiteAlbum> {
    return (await apiClient.post(`${BASE}/albums/`, input)).data;
  },
  async updateAlbum(id: string, input: SiteAlbumInput): Promise<SiteAlbum> {
    return (await apiClient.patch(`${BASE}/albums/${id}/`, input)).data;
  },
  async deleteAlbum(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/albums/${id}/`);
  },
  async setAlbumPublished(id: string, published: boolean): Promise<SiteAlbum> {
    return (await apiClient.post(`${BASE}/albums/${id}/${published ? "publish" : "unpublish"}/`)).data;
  },
  async reorderAlbums(ids: string[]): Promise<void> {
    await apiClient.post(`${BASE}/albums/reorder/`, { ids });
  },
  async setAlbumCover(id: string, mediaId: string): Promise<SiteAlbum> {
    return (await apiClient.post(`${BASE}/albums/${id}/cover/`, { media_id: mediaId })).data;
  },

  async listMedia(albumId: string): Promise<{ results: SiteMedia[] }> {
    return (await apiClient.get(`${BASE}/albums/${albumId}/media/`)).data;
  },
  async uploadMedia(
    albumId: string,
    file: File,
    fields: { caption_en?: string; caption_fr?: string; alt_en?: string; alt_fr?: string },
    onProgress?: (percent: number) => void,
  ): Promise<SiteMedia> {
    return (
      await apiClient.post(`${BASE}/albums/${albumId}/media/`, imageForm(file, fields as Record<string, string>), {
        ...MULTIPART,
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      })
    ).data;
  },
  async updateMedia(id: string, input: Partial<Pick<SiteMedia, "caption_en" | "caption_fr" | "alt_en" | "alt_fr">>): Promise<SiteMedia> {
    return (await apiClient.patch(`${BASE}/media/${id}/`, input)).data;
  },
  async deleteMedia(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/media/${id}/`);
  },
  async reorderMedia(albumId: string, ids: string[]): Promise<void> {
    await apiClient.post(`${BASE}/albums/${albumId}/media/reorder/`, { ids });
  },
};

export const CONTENT_KEYS = {
  events: ["public-site", "events"] as const,
  albums: ["public-site", "albums"] as const,
  media: (albumId: string) => ["public-site", "media", albumId] as const,
};
