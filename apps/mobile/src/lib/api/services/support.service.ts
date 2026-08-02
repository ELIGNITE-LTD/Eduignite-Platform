import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  SupportContribution,
  PaginatedResponse,
  ListParams,
  PlatformStats,
} from '../types';

export const supportService = {
  async getSupportContributions(
    params?: ListParams
  ): Promise<PaginatedResponse<SupportContribution>> {
    const { data } = await apiClient.get(API.SUPPORT.BASE, { params });
    return data;
  },

  async getSupportContribution(id: string): Promise<SupportContribution> {
    const { data } = await apiClient.get(API.SUPPORT.DETAIL(id));
    return data;
  },

  async createSupport(supportData: Partial<SupportContribution>): Promise<SupportContribution> {
    const { data } = await apiClient.post(API.SUPPORT.BASE, supportData);
    return data;
  },

  async verifySupport(idOrPayload: string | { id: string }): Promise<SupportContribution> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const { data } = await apiClient.post(API.SUPPORT.VERIFY(id), {});
    return data;
  },

  async rejectSupport(
    idOrPayload: string | { id: string; reason?: string },
    reason?: string
  ): Promise<SupportContribution> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const payloadReason = typeof idOrPayload === 'string' ? reason : idOrPayload.reason;
    const { data } = await apiClient.post(API.SUPPORT.REJECT(id), { reason: payloadReason });
    return data;
  },

  async getSupportStats(): Promise<PlatformStats> {
    const { data } = await apiClient.get(API.SUPPORT.STATS);
    return data;
  },

  // Charge a support contribution via PayUnit mobile money, then poll its status.
  async collectSupport(payload: { amount: number | string; phone: string; operator?: string; message?: string }): Promise<any> {
    const { data } = await apiClient.post(API.SUPPORT.COLLECT, payload);
    return data;
  },

  async supportPaymentStatus(transactionId: string): Promise<any> {
    const { data } = await apiClient.get(API.SUPPORT.PAYMENT_STATUS(transactionId));
    return data;
  },
};
