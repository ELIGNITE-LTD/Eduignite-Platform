import { apiClient } from '../client';
import { API } from '../endpoints';
import type {
  CreditBalance,
  CreditEstimate,
  CreditPurchase,
  CreditQuote,
  CreditTransaction,
  CreditUsageSummary,
} from '@/lib/ai-credits';
import type { PaginatedResponse } from '../types';

export const aiCreditsService = {
  async getBalance(): Promise<CreditBalance> {
    const { data } = await apiClient.get(API.AI_CREDITS.BALANCE);
    return data;
  },

  async estimate(payload: {
    feature?: string;
    message?: string;
    history?: { role: string; content: string }[];
    documents?: number;
  }): Promise<{ estimate: CreditEstimate; balance: CreditBalance; can_afford: boolean; needs_confirmation: boolean }> {
    const { data } = await apiClient.post(API.AI_CREDITS.ESTIMATE, payload);
    return data;
  },

  async getHistory(params?: { page?: number; page_size?: number; kind?: string }): Promise<PaginatedResponse<CreditTransaction>> {
    const { data } = await apiClient.get(API.AI_CREDITS.HISTORY, { params });
    return data;
  },

  async getUsage(days = 30): Promise<CreditUsageSummary> {
    const { data } = await apiClient.get(API.AI_CREDITS.USAGE, { params: { days } });
    return data;
  },

  /** The price of a number of credits. The server's figure is the only one. */
  async getQuote(credits?: number): Promise<CreditQuote> {
    const { data } = await apiClient.get(API.AI_CREDITS.PRICING, {
      params: credits ? { credits } : undefined,
      // A price that fails validation comes back as a 400 with a message;
      // the page shows the message rather than treating it as an error.
      validateStatus: (status) => status === 200 || status === 400,
    });
    return data;
  },

  async startPurchase(payload: { credits: number; phone: string; operator?: string }): Promise<CreditPurchase> {
    const { data } = await apiClient.post(API.AI_CREDITS.PURCHASE, payload);
    return data;
  },

  async getPurchase(transactionId: string): Promise<CreditPurchase> {
    const { data } = await apiClient.get(API.AI_CREDITS.PURCHASE_STATUS(transactionId));
    return data;
  },

  // ---- Executives --------------------------------------------------------

  async getConfig(): Promise<Record<string, any>> {
    const { data } = await apiClient.get(API.AI_CREDITS.ADMIN_CONFIG);
    return data;
  },

  async updateConfig(payload: Record<string, any>): Promise<Record<string, any>> {
    const { data } = await apiClient.patch(API.AI_CREDITS.ADMIN_CONFIG, payload);
    return data;
  },

  async getEconomics(days = 30): Promise<any> {
    const { data } = await apiClient.get(API.AI_CREDITS.ADMIN_ECONOMICS, { params: { days } });
    return data;
  },

  async lookupAccount(user: string): Promise<{ user: any; balance: CreditBalance; history: CreditTransaction[] }> {
    const { data } = await apiClient.get(API.AI_CREDITS.ADMIN_ACCOUNT, { params: { user } });
    return data;
  },

  async adjust(payload: { user: string; amount: number; kind: string; reason: string }): Promise<{
    transaction: CreditTransaction;
    balance: CreditBalance;
  }> {
    const { data } = await apiClient.post(API.AI_CREDITS.ADMIN_ADJUST, payload);
    return data;
  },
};
