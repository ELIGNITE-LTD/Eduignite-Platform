import { apiClient } from "../client";

/**
 * Customer Care API (backend: /api/v1/customer-care/). Server-side permissions
 * are the source of truth; the UI only mirrors them. Errors from this app are
 * `{ code, detail }` (see `careErrorCode` / `careErrorDetail`).
 */

const BASE = "/customer-care/";

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type ConversationStatus =
  | "new"
  | "open"
  | "in_progress"
  | "awaiting_customer"
  | "awaiting_internal"
  | "resolved"
  | "closed";
export type Channel = "in_app" | "email" | "whatsapp";
export type WhatsappOutcome = "opened_delivery_unconfirmed" | "sent_manually" | "not_sent" | "follow_up_required";

export interface CareMe {
  has_access: boolean;
  is_founder: boolean;
  can_manage: boolean;
  module?: string;
}

export interface Sender {
  name: string;
  role_label: string;
  avatar: string | null;
  official_label: string | null;
  is_customer: boolean;
}

export interface CareMessage {
  id: number;
  conversation_id: string | number;
  direction: "inbound" | "outbound";
  channel: Channel | string;
  body: string;
  created_at: string;
  sender: Sender;
  // Staff-only fields:
  delivery_status?: string;
  delivery_source?: string;
  is_manual_status?: boolean;
  sender_id?: string | null;
  provider?: string;
  recipient?: string;
  error_code?: string;
  attempts?: number;
}

export interface CustomerConversation {
  id: string;
  subject: string;
  category: string;
  status: ConversationStatus;
  created_at: string;
  last_activity_at: string;
  unread_count: number;
  resolution_summary: string;
  is_closed: boolean;
}

export interface PersonRef {
  id: string;
  name: string;
  role: string;
  role_label: string;
}

export interface StaffConversation {
  id: string;
  subject: string;
  category: string;
  status: ConversationStatus;
  customer: PersonRef & { email: string; phone: string; whatsapp: string };
  school: { id: string; name: string } | null;
  group: { id: string; slug: string; name: string } | null;
  assigned_to: PersonRef | null;
  primary_channel: Channel | string;
  channels: string[];
  follow_up_at: string | null;
  follow_up_note: string;
  is_follow_up_overdue: boolean;
  resolution_summary: string;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  last_activity_at: string;
  unread_count: number;
}

export interface CareNote {
  id: number | string;
  body: string;
  created_at: string;
  author: PersonRef | null;
}

export interface TimelineEntry {
  id: number | string;
  kind: string;
  data: Record<string, any>;
  actor: PersonRef | null;
  created_at: string;
}

export interface StaffConversationDetail extends StaffConversation {
  notes: CareNote[];
  timeline: TimelineEntry[];
  assignment_history: Array<Record<string, any>>;
}

export interface CareOverview {
  total: number;
  new: number;
  unassigned: number;
  open: number;
  awaiting_customer: number;
  awaiting_internal: number;
  resolved: number;
  closed: number;
  unread: number;
  overdue_follow_ups: number;
  active_executives: number;
}

export interface ConversationFilters {
  status?: string;
  group?: string;
  assignee?: string;
  channel?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  overdue?: 1;
  unread?: 1;
  page?: number;
  page_size?: number;
}

export interface CareGroup {
  id: string;
  slug: string;
  name: string;
  description: string;
  rule_roles: string[];
  is_active: boolean;
  sort_order: number;
  executives?: Array<{ assignment_id: string; executive: PersonRef | null; assigned_at: string | null }>;
}

export interface CareExecutive {
  id: string;
  name: string;
  role: string;
  role_label: string;
  open_conversations: number;
  /** Ids of the groups this executive is assigned to. */
  groups: string[];
}

export interface AuditEntry {
  id: number | string;
  action: string;
  actor: PersonRef | null;
  target_type: string;
  target_id: string;
  data: Record<string, any>;
  created_at: string;
}

export interface ConfigStatus {
  email: {
    configured: boolean;
    state: string;
    problems: string[];
    api_key_set: boolean;
    sender_address: string;
    logo_url: string;
    delivery_tracking: string | boolean;
  };
  whatsapp: {
    click_to_chat: { state: string; available: boolean; note: string };
    official_api: { state: string; note: string; webhook_path: string };
  };
}

export type ContactKind =
  | "email"
  | "phone"
  | "whatsapp"
  | "address"
  | "website"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "other";
export type DisplayMode = "icon_only" | "icon_text";

export interface ContactItem {
  id: string | number;
  kind: ContactKind;
  label: string;
  value: string;
  href?: string;
  display_mode: DisplayMode;
  is_active?: boolean;
  sort_order?: number;
}

export interface IntegrationSecretsStatus {
  [key: string]: any;
}

const list = <T>(data: any): T[] => (Array.isArray(data) ? data : data?.results ?? []);

/** The `{code, detail}` the Customer Care API answers errors with. */
export function careErrorCode(error: any): string {
  return error?.response?.data?.code || "";
}
export function careErrorDetail(error: any, fallback = ""): string {
  const d = error?.response?.data;
  if (typeof d?.detail === "string" && d.detail) return d.detail;
  if (d && typeof d === "object") {
    for (const v of Object.values(d)) {
      const m = Array.isArray(v) ? v[0] : v;
      if (typeof m === "string" && m) return m;
    }
  }
  return fallback;
}

/** A client-generated id so a retried POST is recognised, never duplicated. */
export function newClientMessageId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export const customerCareService = {
  // ----- access -----
  async me(): Promise<CareMe> {
    const { data } = await apiClient.get(`${BASE}me/`);
    return data;
  },

  // ----- customer side -----
  async myConversations(params: { status?: string } = {}): Promise<CustomerConversation[]> {
    const { data } = await apiClient.get(`${BASE}my/conversations/`, { params: { page_size: 100, ...params } });
    return list<CustomerConversation>(data);
  },
  async myStart(payload: { subject: string; body: string; category?: string; client_message_id: string }): Promise<CustomerConversation> {
    const { data } = await apiClient.post(`${BASE}my/conversations/`, payload);
    return data;
  },
  async myConversation(id: string): Promise<CustomerConversation> {
    const { data } = await apiClient.get(`${BASE}my/conversations/${id}/`);
    return data;
  },
  async myMessages(id: string, sinceId?: number): Promise<CareMessage[]> {
    const { data } = await apiClient.get(`${BASE}my/conversations/${id}/messages/`, {
      params: { page_size: 200, ...(sinceId ? { since_id: sinceId } : {}) },
    });
    return list<CareMessage>(data);
  },
  async mySend(id: string, payload: { body: string; client_message_id: string }): Promise<CareMessage> {
    const { data } = await apiClient.post(`${BASE}my/conversations/${id}/messages/`, payload);
    return data;
  },
  async myRead(id: string): Promise<void> {
    await apiClient.post(`${BASE}my/conversations/${id}/read/`);
  },
  async myUnread(): Promise<{ unread_total: number; conversations_with_unread: number }> {
    const { data } = await apiClient.get(`${BASE}my/unread/`);
    return data;
  },

  // ----- staff side -----
  async overview(): Promise<CareOverview> {
    const { data } = await apiClient.get(`${BASE}overview/`);
    return data;
  },
  async conversations(params: ConversationFilters): Promise<Paginated<StaffConversation>> {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "all"));
    const { data } = await apiClient.get(`${BASE}conversations/`, { params: { page_size: 50, ...clean } });
    return Array.isArray(data) ? { count: data.length, next: null, previous: null, results: data } : data;
  },
  async conversation(id: string): Promise<StaffConversationDetail> {
    const { data } = await apiClient.get(`${BASE}conversations/${id}/`);
    return data;
  },
  async messages(id: string, sinceId?: number): Promise<CareMessage[]> {
    const { data } = await apiClient.get(`${BASE}conversations/${id}/messages/`, {
      params: { page_size: 200, ...(sinceId ? { since_id: sinceId } : {}) },
    });
    return list<CareMessage>(data);
  },
  async reply(id: string, payload: { body: string; channel: "in_app" | "email"; client_message_id: string }): Promise<CareMessage> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/messages/`, payload);
    return data;
  },
  async retryEmail(id: string, mid: number): Promise<CareMessage> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/messages/${mid}/retry-email/`);
    return data;
  },
  async whatsappPrepare(id: string, payload: { body: string; client_message_id: string }): Promise<{ message: CareMessage; whatsapp_url: string; status_note: string }> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/whatsapp/prepare/`, payload);
    return data;
  },
  async whatsappOutcome(id: string, mid: number, payload: { outcome: WhatsappOutcome; note?: string }): Promise<CareMessage> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/messages/${mid}/whatsapp-outcome/`, payload);
    return data;
  },
  async setStatus(id: string, payload: { status: ConversationStatus; resolution_summary?: string }): Promise<StaffConversation> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/status/`, payload);
    return data;
  },
  async resolve(id: string, resolution_summary: string): Promise<StaffConversation> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/resolve/`, { resolution_summary });
    return data;
  },
  async reopen(id: string): Promise<StaffConversation> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/reopen/`);
    return data;
  },
  async followUp(id: string, payload: { follow_up_at: string | null; note?: string }): Promise<StaffConversation> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/follow-up/`, payload);
    return data;
  },
  async notes(id: string): Promise<CareNote[]> {
    const { data } = await apiClient.get(`${BASE}conversations/${id}/notes/`);
    return list<CareNote>(data);
  },
  async addNote(id: string, body: string): Promise<CareNote> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/notes/`, { body });
    return data;
  },
  async markRead(id: string): Promise<void> {
    await apiClient.post(`${BASE}conversations/${id}/read/`);
  },
  async claim(id: string): Promise<StaffConversation> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/claim/`);
    return data;
  },
  async assign(id: string, payload: { executive_id: string | null; reason?: string }): Promise<StaffConversation> {
    const { data } = await apiClient.post(`${BASE}conversations/${id}/assign/`, payload);
    return data;
  },

  // ----- founders: groups, executives, audit, config -----
  async groups(): Promise<CareGroup[]> {
    const { data } = await apiClient.get(`${BASE}groups/`);
    return list<CareGroup>(data);
  },
  async createGroup(payload: Partial<CareGroup>): Promise<CareGroup> {
    const { data } = await apiClient.post(`${BASE}groups/`, payload);
    return data;
  },
  async updateGroup(id: string, payload: Partial<CareGroup>): Promise<CareGroup> {
    const { data } = await apiClient.patch(`${BASE}groups/${id}/`, payload);
    return data;
  },
  async assignGroup(groupId: string, executive_id: string): Promise<void> {
    await apiClient.post(`${BASE}groups/${groupId}/assignments/`, { executive_id });
  },
  async unassignGroup(groupId: string, assignmentId: string): Promise<void> {
    await apiClient.delete(`${BASE}groups/${groupId}/assignments/${assignmentId}/`);
  },
  async executives(): Promise<CareExecutive[]> {
    const { data } = await apiClient.get(`${BASE}executives/`);
    return list<CareExecutive>(data);
  },
  async audit(params: { action?: string; page?: number } = {}): Promise<Paginated<AuditEntry>> {
    const { data } = await apiClient.get(`${BASE}audit/`, { params: { page_size: 25, ...params } });
    return Array.isArray(data) ? { count: data.length, next: null, previous: null, results: data } : data;
  },
  async configStatus(): Promise<ConfigStatus> {
    const { data } = await apiClient.get(`${BASE}config-status/`);
    return data;
  },

  // ----- contact information -----
  async contactItems(): Promise<ContactItem[]> {
    const { data } = await apiClient.get(`${BASE}contact-info/`);
    return list<ContactItem>(data?.items ?? data);
  },
  async createContact(payload: Partial<ContactItem>): Promise<ContactItem> {
    const { data } = await apiClient.post(`${BASE}contact-info/`, payload);
    return data;
  },
  async updateContact(id: string | number, payload: Partial<ContactItem>): Promise<ContactItem> {
    const { data } = await apiClient.patch(`${BASE}contact-info/${id}/`, payload);
    return data;
  },
  async deleteContact(id: string | number): Promise<void> {
    await apiClient.delete(`${BASE}contact-info/${id}/`);
  },

  // ----- write-only integration secrets (existing founders endpoint) -----
  async integrationStatus(): Promise<IntegrationSecretsStatus> {
    const { data } = await apiClient.get("/platform/integration-secrets/");
    return data;
  },
  async saveIntegrationSecrets(payload: Record<string, string>): Promise<IntegrationSecretsStatus> {
    const { data } = await apiClient.patch("/platform/integration-secrets/", payload);
    return data;
  },
};
