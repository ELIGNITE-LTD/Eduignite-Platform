"use client";

/**
 * Partner API client + session.
 *
 * Partners sign in with the same platform JWT as any account, but the partner
 * area keeps its own token and axios instance so it never touches the main
 * matricule auth used by the school apps.
 */

import axios from "axios";
import { BASE_URL } from "@/lib/api/client";

const SESSION_KEY = "eduignite_partner_session";

export type PartnerSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string; name: string; email: string; role: string; referral_code: string };
};

export type PartnerType = { id: string; name: string; slug: string; description: string; instructions: string };

export type ReferralStats = {
  code: string; link: string; clicks: number; leads: number; applications: number;
  approved_schools: number; active_schools: number; conversion_rate: number;
};

export type PortalData = {
  partner: {
    display_name: string; partner_type: string; status: string; is_public: boolean;
    public_name: string; public_description: string; public_website: string; logo_url: string; public_slug: string | null;
  };
  referral: ReferralStats;
  timeline: { month: string; schools: number }[];
  lifecycle: { stage: string; label: string; blurb: string; count: number }[];
  schools: {
    school_name: string; region: string; status: string; date: string;
    stage: string; stage_label: string; stage_blurb: string;
    step: number | null; total_steps: number; is_final: boolean; counts: boolean;
  }[];
};

export type PublicPartner = {
  public_slug: string; public_name: string; public_description: string;
  public_website: string; logo_url: string; type: string; applicant_kind: string;
};

export function getPartnerSession(): PartnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PartnerSession) : null;
  } catch {
    return null;
  }
}

export function setPartnerSession(s: PartnerSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearPartnerSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

const api = axios.create({ baseURL: BASE_URL });
api.interceptors.request.use((config) => {
  const s = getPartnerSession();
  if (s?.access_token) (config.headers as any).Authorization = `Bearer ${s.access_token}`;
  return config;
});

export function partnerError(error: any, fallback: string): string {
  const data = error?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (data && typeof data === "object") {
    const first = Object.values(data)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}

// ── Public ──────────────────────────────────────────────────────────────────
export async function getPartnerTypes(): Promise<PartnerType[]> {
  const { data } = await api.get("/partners/types/");
  return Array.isArray(data) ? data : [];
}

export async function submitApplication(payload: Record<string, any>): Promise<{ id: string; status: string }> {
  const { data } = await api.post("/partners/applications/", payload);
  return data;
}

export async function getPublicPartners(): Promise<PublicPartner[]> {
  const { data } = await api.get("/partners/public/");
  return Array.isArray(data) ? data : [];
}

export async function getPublicPartner(slug: string): Promise<PublicPartner> {
  const { data } = await api.get(`/partners/public/${encodeURIComponent(slug)}/`);
  return data;
}

export async function trackReferralClick(ref: string, path = "") {
  try { await api.post("/partners/track-click/", { ref, path }); } catch { /* best effort */ }
}

// ── Account / auth ────────────────────────────────────────────────────────────
export async function checkAccountToken(token: string): Promise<{ email: string; name: string }> {
  const { data } = await api.get(`/partners/account/check/?token=${encodeURIComponent(token)}`);
  return data;
}

export async function createAccount(token: string, password: string, confirm_password: string): Promise<PartnerSession> {
  const { data } = await api.post("/partners/account/", { token, password, confirm_password });
  setPartnerSession(data);
  return data;
}

export async function loginPartner(email: string, password: string): Promise<PartnerSession> {
  const { data } = await api.post("/partners/login/", { email, password });
  setPartnerSession(data);
  return data;
}

export async function requestPasswordReset(email: string): Promise<{ detail: string }> {
  const { data } = await api.post("/partners/password-reset/", { email });
  return data;
}

export async function confirmPasswordReset(uid: string, token: string, password: string, confirm_password: string): Promise<{ detail: string }> {
  const { data } = await api.post("/partners/password-reset/confirm/", { uid, token, password, confirm_password });
  return data;
}

// ── Portal (own data) ─────────────────────────────────────────────────────────
export async function getPortal(): Promise<PortalData> {
  const { data } = await api.get("/partners/me/");
  return data;
}

export async function updatePublicProfile(payload: { public_name?: string; public_description?: string; public_website?: string; logo_url?: string }) {
  const { data } = await api.patch("/partners/me/profile/", payload);
  return data;
}
