import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  Order,
  PaginatedResponse,
  ListParams,
  CreateOrderRequest,
  PlatformStats,
} from '../types';

export const ordersService = {
  async getOrders(params?: ListParams): Promise<PaginatedResponse<Order>> {
    const { data } = await apiClient.get(API.ORDERS.BASE, { params });
    return data;
  },

  async getOrder(id: string): Promise<Order> {
    const { data } = await apiClient.get(API.ORDERS.DETAIL(id));
    return data;
  },

  async createOrder(orderData: CreateOrderRequest): Promise<Order> {
    const { data } = await apiClient.post(API.ORDERS.BASE, orderData);
    return data;
  },

  async processOrder(idOrPayload: string | { id: string; status?: string; notes?: string }): Promise<Order> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const payload = typeof idOrPayload === 'string' ? {} : { status: idOrPayload.status, notes: idOrPayload.notes };
    const { data } = await apiClient.post(API.ORDERS.PROCESS(id), payload);
    return data;
  },

  async updateOrder(id: string, orderData: Partial<CreateOrderRequest> & { status?: string; notes?: string }): Promise<Order> {
    const { data } = await apiClient.post(API.ORDERS.PROCESS(id), orderData);
    return data;
  },

  async getOrderStats(): Promise<PlatformStats> {
    const { data } = await apiClient.get(API.ORDERS.STATS);
    return data;
  },

  async getFlyerQr(url?: string): Promise<{ url: string; qr_data_url: string; format: string }> {
    const { data } = await apiClient.get(API.ORDERS.FLYER_QR, {
      params: url ? { url } : undefined,
    });
    return data;
  },
};
