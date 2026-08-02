import { apiClient } from '../client';
import { API } from '../endpoints';

export interface NotificationPayload {
  title: string;
  message: string;
  notification_type?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  icon?: string;
  url?: string;
  recipient_ids?: string[];
  role_targets?: string[];
}

export const notificationsService = {
  async listNotifications(params?: Record<string, string | boolean | undefined>) {
    const { data } = await apiClient.get(API.NOTIFICATIONS.BASE, { params });
    return data;
  },
  async createNotification(payload: NotificationPayload) {
    const { data } = await apiClient.post(API.NOTIFICATIONS.BASE, payload);
    return data;
  },
  async markRead(id: string) {
    const { data } = await apiClient.post(API.NOTIFICATIONS.MARK_READ(id));
    return data;
  },
  async markAllRead() {
    const { data } = await apiClient.post(API.NOTIFICATIONS.MARK_ALL_READ);
    return data;
  },
  async unreadCount() {
    const { data } = await apiClient.get(API.NOTIFICATIONS.UNREAD_COUNT);
    return data;
  },
};
