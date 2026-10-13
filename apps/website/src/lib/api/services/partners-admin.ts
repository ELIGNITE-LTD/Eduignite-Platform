import { apiClient } from "@/lib/api/client";

/**
 * Executive (CEO/CTO) partner management. Uses the main dashboard apiClient, so
 * it carries the signed-in executive's JWT; the backend enforces IsCEOOrCTO.
 */

export type PartnerTypeAdmin = {
  id: string; name: string; slug: string; description: string;
  instructions: string; is_active: boolean; order: number; application_count: number;
};

export type PartnerApplicationAdmin = {
  id: string; partner_type: string | null; partner_type_name: string; applicant_kind: string;
  full_name: string; email: string; phone: string; country: string; region_city: string; website: string;
  organization_name: string; organization_type: string; contact_person_position: string;
  proposed_partnership: string; contribution: string; answers: Record<string, any>; documents: any[];
  status: string; status_display: string; ceo_message: string; reviewed_by_name: string | null;
  reviewed_at: string | null; approved_at: string | null; created_at: string;
};

export type PartnerAdmin = {
  id: string; name: string; email: string; display_name: string; applicant_kind: string;
  partner_type: string | null; partner_type_name: string; status: string; status_display: string;
  is_public: boolean; public_slug: string | null; public_name: string; public_description: string;
  public_website: string; logo_url: string; referral_code: string;
  account_created_at: string; last_login_at: string | null; last_activity_at: string | null; created_at: string;
  referral?: any; timeline?: { month: string; schools: number }[];
};

export type PartnerOverview = {
  total_partners: number; active_partners: number; suspended_partners: number; inactive_partners: number;
  account_pending: number; individual_partners: number; organization_partners: number;
  new_partners_this_month: number; pending_applications: number; active_referring_partners: number;
};

export type PerformanceRow = {
  rank: number; id: string; name: string; partner_type: string; clicks: number;
  applications: number; approved_schools: number; active_schools: number; conversion_rate: number;
  last_activity_at: string | null;
};

const partnersAdmin = {
  overview: async (): Promise<PartnerOverview> => (await apiClient.get("/partners/admin/overview/")).data,

  listTypes: async (): Promise<PartnerTypeAdmin[]> => (await apiClient.get("/partners/admin/types/")).data,
  createType: async (payload: Partial<PartnerTypeAdmin>) => (await apiClient.post("/partners/admin/types/", payload)).data,
  updateType: async (id: string, payload: Partial<PartnerTypeAdmin>) => (await apiClient.patch(`/partners/admin/types/${id}/`, payload)).data,
  deleteType: async (id: string) => (await apiClient.delete(`/partners/admin/types/${id}/`)).data,

  listApplications: async (params?: Record<string, string>): Promise<PartnerApplicationAdmin[]> =>
    (await apiClient.get("/partners/admin/applications/", { params })).data,
  getApplication: async (id: string): Promise<PartnerApplicationAdmin> => (await apiClient.get(`/partners/admin/applications/${id}/`)).data,
  reviewApplication: async (id: string, action: string, message = "") =>
    (await apiClient.post(`/partners/admin/applications/${id}/review/`, { action, message })).data,

  listPartners: async (params?: Record<string, string>): Promise<PartnerAdmin[]> =>
    (await apiClient.get("/partners/admin/partners/", { params })).data,
  getPartner: async (id: string): Promise<PartnerAdmin> => (await apiClient.get(`/partners/admin/partners/${id}/`)).data,
  updatePartner: async (id: string, payload: Partial<PartnerAdmin>) => (await apiClient.patch(`/partners/admin/partners/${id}/`, payload)).data,
  partnerAction: async (id: string, action: string, reason = "") =>
    (await apiClient.post(`/partners/admin/partners/${id}/action/`, { action, reason })).data,

  performance: async (): Promise<{ totals: any; leaderboard: PerformanceRow[] }> => (await apiClient.get("/partners/admin/performance/")).data,
};

export default partnersAdmin;
