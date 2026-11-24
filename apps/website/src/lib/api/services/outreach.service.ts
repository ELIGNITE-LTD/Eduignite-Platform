import { apiClient } from "../client";
import { fetchAllPages } from "../fetch-all";

/**
 * Outreach API (backend: /api/v1/outreach/). Founders (and executives granted
 * the "outreach" module) email schools about EduIgnite. The server enforces
 * access; the UI only mirrors it.
 */

const BASE = "/outreach/";

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type OutreachRegion =
  | "adamawa" | "centre" | "east" | "far_north" | "littoral"
  | "north" | "north_west" | "south" | "south_west" | "west" | "unknown";
export type OutreachLevel = "nursery" | "primary" | "secondary" | "technical" | "higher" | "other";
export type OutreachChannel = "email" | "whatsapp";
export type OutreachStatus = "new" | "queued" | "sent" | "failed" | "bounced" | "unsubscribed";

export interface OutreachContact {
  id: string;
  school_name: string;
  level: OutreachLevel;
  level_label: string;
  region: OutreachRegion;
  region_label: string;
  town: string;
  email: string;
  phone: string;
  website: string;
  source_url: string;
  language: string;
  notes: string;
  status: OutreachStatus;
  contacted: boolean;
  sent_count: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
  last_error: string;
  created_at: string;
  whatsapp_sent_count: number;
  last_whatsapp_at: string | null;
  whatsapp_contacted: boolean;
}

export interface OutreachRegionStat {
  region: OutreachRegion;
  label: string;
  total: number;
  contacted: number;
  not_contacted: number;
  queued: number;
}

export interface OutreachSummary {
  totals: { total: number; contacted: number; not_contacted: number; queued: number; unsubscribed: number; bounced: number };
  regions: OutreachRegionStat[];
  daily_cap: number;
  sent_today: number;
  queued: number;
  whatsapp: { configured: boolean; uses_template: boolean; daily_cap: number; sent_today: number; queued: number; with_number: number; contacted: number };
}

export interface OutreachFilters {
  region?: string;
  level?: string;
  sent?: "yes" | "no";
  q?: string;
  page?: number;
  page_size?: number;
}

export interface OutreachContactInput {
  school_name: string;
  email?: string;
  level?: OutreachLevel;
  region?: OutreachRegion;
  town?: string;
  phone?: string;
  website?: string;
  source_url?: string;
}

export interface OutreachMessage {
  subject: string;
  body: string;
  channel?: OutreachChannel;
}

export interface OutreachSendResult {
  queued: number;
  added: number;
  invalid: string[];
  already_contacted: number;
  unsubscribed: number;
  bounced: number;
  already_queued: number;
  no_address?: number;
  channel?: OutreachChannel;
  sent_now: number;
  campaign: string | null;
  daily_cap: number;
}

export interface OutreachImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface OutreachCampaign {
  id: string;
  subject: string;
  channel?: OutreachChannel;
  status: string;
  created_at: string;
  sent_by: string;
  total: number;
  sent: number;
  queued: number;
  failed: number;
}

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "all"));

export const outreachService = {
  async summary(): Promise<OutreachSummary> {
    const { data } = await apiClient.get(`${BASE}summary/`);
    return data;
  },
  async contacts(filters: OutreachFilters = {}): Promise<Paginated<OutreachContact>> {
    const { data } = await apiClient.get(`${BASE}contacts/`, { params: clean({ ...filters }) });
    return data;
  },
  /** Every contact matching the filters, across all pages (used by "Select all"). */
  allContacts(filters: OutreachFilters = {}): Promise<OutreachContact[]> {
    return fetchAllPages<OutreachContact>(
      (page, page_size) => outreachService.contacts({ ...filters, page, page_size }),
      { pageSize: 1000 },
    );
  },
  async createContact(payload: OutreachContactInput): Promise<OutreachContact> {
    const { data } = await apiClient.post(`${BASE}contacts/`, payload);
    return data;
  },
  async updateContact(id: string, payload: Partial<OutreachContactInput>): Promise<OutreachContact> {
    const { data } = await apiClient.patch(`${BASE}contacts/${id}/`, payload);
    return data;
  },
  async deleteContact(id: string): Promise<void> {
    await apiClient.delete(`${BASE}contacts/${id}/`);
  },
  async importCsv(file: File): Promise<OutreachImportResult> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await apiClient.post(`${BASE}contacts/import/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
  /** Send to the typed addresses (any separator); the server creates the contacts. */
  async send(payload: OutreachMessage & { emails?: string; phones?: string; resend?: boolean }): Promise<OutreachSendResult> {
    const { data } = await apiClient.post(`${BASE}send/`, payload);
    return data;
  },
  async sendTest(payload: OutreachMessage): Promise<{ sent_to: string }> {
    const { data } = await apiClient.post(`${BASE}send/test/`, payload);
    return data;
  },
  async cancelWaiting(channel?: OutreachChannel): Promise<{ cancelled: number }> {
    const { data } = await apiClient.post(`${BASE}send/cancel/`, channel ? { channel } : {});
    return data;
  },
  async campaigns(): Promise<OutreachCampaign[]> {
    const { data } = await apiClient.get(`${BASE}campaigns/`);
    return Array.isArray(data) ? data : data?.results ?? [];
  },
};
