import type { AxiosRequestConfig } from 'axios';
import { apiClient } from '../client';
import { API } from '../endpoints';

export interface AppStorePayload {
  title: string;
  category: 'android' | 'iphone' | 'windows' | 'mac';
  short_description: string;
  full_description?: string;
  screenshots?: string[];
  download_link: string;
  download_url?: string;
  version?: string;
  youtube_video_link?: string;
  is_published?: boolean;
  featured?: boolean;
  active?: boolean;
  icon?: File | string;
  thumbnail?: File | string;
  apk_file?: File | string;
}

// When sending FormData we must let the browser build the
// `multipart/form-data; boundary=...` header itself. Forcing a bare
// `multipart/form-data` value (without a boundary) or leaving the client's
// default `application/json` makes the server unable to parse the upload.
const MULTIPART_CONFIG: AxiosRequestConfig = { headers: { 'Content-Type': undefined } };

export const appStoreService = {
  async listItems(params?: Record<string, string | boolean | undefined>) {
    const { data } = await apiClient.get(API.APP_STORE.BASE, { params });
    return data;
  },
  async getFeatured() {
    const { data } = await apiClient.get(API.APP_STORE.FEATURED);
    return data;
  },
  async createItem(payload: AppStorePayload | FormData) {
    if (payload instanceof FormData) {
      const { data } = await apiClient.post(API.APP_STORE.BASE, payload, MULTIPART_CONFIG);
      return data;
    }
    const { data } = await apiClient.post(API.APP_STORE.BASE, payload);
    return data;
  },
  async updateItem(id: string, payload: Partial<AppStorePayload> | FormData) {
    if (payload instanceof FormData) {
      const { data } = await apiClient.patch(API.APP_STORE.DETAIL(id), payload, MULTIPART_CONFIG);
      return data;
    }
    const { data } = await apiClient.patch(API.APP_STORE.DETAIL(id), payload);
    return data;
  },
  async archiveItem(id: string) {
    const { data } = await apiClient.post(API.APP_STORE.ARCHIVE(id));
    return data;
  },
  async publishItem(id: string, isPublished: boolean) {
    const { data } = await apiClient.patch(API.APP_STORE.PUBLISH(id), { is_published: isPublished });
    return data;
  },
  async deleteItem(id: string): Promise<void> {
    await apiClient.delete(API.APP_STORE.DETAIL(id));
  },
  async featureItem(id: string) {
    const { data } = await apiClient.post(API.APP_STORE.FEATURE(id));
    return data;
  },
  async unfeatureItem(id: string) {
    const { data } = await apiClient.post(API.APP_STORE.UNFEATURE(id));
    return data;
  },
  async uploadIcon(id: string, file: File) {
    const formData = new FormData();
    formData.append('icon', file);
    const { data } = await apiClient.patch(API.APP_STORE.DETAIL(id), formData, MULTIPART_CONFIG);
    return data;
  },
  async uploadThumbnail(id: string, file: File) {
    const formData = new FormData();
    formData.append('thumbnail', file);
    const { data } = await apiClient.patch(API.APP_STORE.DETAIL(id), formData, MULTIPART_CONFIG);
    return data;
  },
};
