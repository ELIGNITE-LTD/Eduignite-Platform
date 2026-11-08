import { apiClient } from "../client";

/**
 * Management API for a school's public website (/schools/public-site/).
 * Server-side permissions are the source of truth; the UI only mirrors them.
 */

export type PublicationStatus = "draft" | "published" | "unpublished";

export interface SocialLinks {
  [platform: string]: string;
}

export interface CoreValue {
  en: string;
  fr: string;
}

export interface PublicSiteProfile {
  vision_en: string; vision_fr: string;
  mission_en: string; mission_fr: string;
  history_en: string; history_fr: string;
  hero_title_en: string; hero_title_fr: string;
  hero_subtitle_en: string; hero_subtitle_fr: string;
  cta_primary_label_en: string; cta_primary_label_fr: string;
  cta_secondary_label_en: string; cta_secondary_label_fr: string;
  meta_title_en: string; meta_title_fr: string;
  meta_description_en: string; meta_description_fr: string;
  core_values: CoreValue[];
  theme_accent: string;
  show_email: boolean;
  show_phone: boolean;
  show_principal: boolean;
  enrollment_enabled: boolean;
  og_image: string;
  social_links: SocialLinks;
  publication_status: PublicationStatus;
  published_at: string | null;
  locked_by_founder: boolean;
  preview_token: string;
  is_live: boolean;
  /** Field -> message for everything still missing before the site can be published. */
  publish_blockers: Record<string, string>;
  school: {
    id: string; slug: string | null; name: string; short_name: string; motto: string;
    description: string; email: string; phone: string; address: string;
    has_logo: boolean; has_banner: boolean; status: string;
  };
  updated_at: string;
}

export interface AuditRow {
  id: string;
  action: string;
  actor_name: string;
  changes: Record<string, { before: string; after: string }>;
  ip_address: string | null;
  created_at: string;
}

export interface FounderSchoolRow {
  id: string;
  name: string;
  slug: string | null;
  publication_status: PublicationStatus;
  published_at: string | null;
  locked_by_founder: boolean;
  kill_switch_on: boolean;
  is_live: boolean;
}

export interface MySiteStatus {
  slug: string | null;
  is_live: boolean;
  publication_status: PublicationStatus | null;
}

const BASE = "/schools/public-site";

export const publicSiteService = {
  async getProfile(): Promise<PublicSiteProfile> {
    return (await apiClient.get(`${BASE}/profile/`)).data;
  },
  async updateProfile(patch: Partial<PublicSiteProfile>): Promise<PublicSiteProfile> {
    return (await apiClient.patch(`${BASE}/profile/`, patch)).data;
  },
  async publish(): Promise<PublicSiteProfile> {
    return (await apiClient.post(`${BASE}/publish/`)).data;
  },
  async unpublish(): Promise<PublicSiteProfile> {
    return (await apiClient.post(`${BASE}/unpublish/`)).data;
  },
  async rotatePreviewToken(): Promise<{ preview_token: string }> {
    return (await apiClient.post(`${BASE}/preview-token/rotate/`)).data;
  },
  async getAudit(limit: number, offset: number): Promise<{ count: number; results: AuditRow[] }> {
    return (await apiClient.get(`${BASE}/audit/`, { params: { limit, offset } })).data;
  },
  async mine(): Promise<MySiteStatus> {
    return (await apiClient.get(`${BASE}/mine/`)).data;
  },
  async founderList(params: { status?: string; limit: number; offset: number }): Promise<{ count: number; results: FounderSchoolRow[] }> {
    return (await apiClient.get(`${BASE}/schools/`, { params })).data;
  },
  async forceUnpublish(schoolId: string) {
    return (await apiClient.post(`${BASE}/schools/${encodeURIComponent(schoolId)}/force-unpublish/`)).data;
  },
  async unlock(schoolId: string) {
    return (await apiClient.post(`${BASE}/schools/${encodeURIComponent(schoolId)}/unlock/`)).data;
  },
};

/** { field: message } from a DRF 400 (field errors, or the publish `errors` map). */
export function extractFieldErrors(error: unknown): Record<string, string> {
  const data = (error as { response?: { data?: any } })?.response?.data;
  if (!data || typeof data !== "object") return {};
  const source = data.errors && typeof data.errors === "object" ? data.errors : data;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "detail") continue;
    const text = Array.isArray(value) ? String(value[0] ?? "") : typeof value === "string" ? value : "";
    if (text) out[key] = text;
  }
  return out;
}
