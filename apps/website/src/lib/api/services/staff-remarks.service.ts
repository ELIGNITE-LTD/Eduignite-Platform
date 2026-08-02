import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  StaffRemark,
  PaginatedResponse,
  ListParams,
} from '../types';

export const staffRemarksService = {
  async getRemarks(params?: ListParams): Promise<PaginatedResponse<StaffRemark>> {
    const { data } = await apiClient.get(API.STAFF_REMARKS.BASE, { params });
    return data;
  },

  async getStaffRemarks(params?: ListParams): Promise<PaginatedResponse<StaffRemark>> {
    return this.getRemarks(params);
  },

  async getRemark(id: string): Promise<StaffRemark> {
    const { data } = await apiClient.get(API.STAFF_REMARKS.DETAIL(id));
    return data;
  },

  async getMyRemarks(params?: ListParams): Promise<PaginatedResponse<StaffRemark>> {
    const { data } = await apiClient.get(API.STAFF_REMARKS.MY_REMARKS, { params });
    return data;
  },

  async createRemark(remarkData: Partial<StaffRemark>): Promise<StaffRemark> {
    const { data } = await apiClient.post(API.STAFF_REMARKS.BASE, remarkData);
    return data;
  },

  async updateRemark(id: string, remarkData: Partial<StaffRemark>): Promise<StaffRemark> {
    const { data } = await apiClient.patch(API.STAFF_REMARKS.DETAIL(id), remarkData);
    return data;
  },

  async acknowledgeRemark(idOrPayload: string | { id: string }): Promise<StaffRemark> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const { data } = await apiClient.post(API.STAFF_REMARKS.ACKNOWLEDGE(id), {});
    return data;
  },

  async downloadReport(staffId: string): Promise<Blob> {
    const { data } = await apiClient.get(API.STAFF_REMARKS.REPORT(staffId), {
      responseType: 'blob',
    });
    return data;
  },
};
