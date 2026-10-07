"use client";

/**
 * Self-contained partner session + API client.
 *
 * Partners sign in with email + password and get the same platform JWT as any
 * other account, but the partner area keeps its own token in localStorage and
 * its own axios instance, so it never touches — and can never break — the main
 * matricule login/auth-context used by the school apps.
 */

import axios from "axios";
import { BASE_URL } from "@/lib/api/client";

const SESSION_KEY = "eduignite_partner_session";

export type PartnerUser = {
  id: string;
  name: string;
  email: string;
  matricule: string;
  role: string;
  referral_code: string;
};

export type PartnerSession = {
  access_token: string;
  refresh_token: string;
  user: PartnerUser;
};

export type PartnerProfile = {
  id: string;
  name: string;
  email: string;
  matricule: string;
  organization: string;
  phone: string;
  country: string;
  payout_momo_number: string;
};

export type ReferralStats = {
  code: string;
  link: string;
  total: number;
  pending: number;
  contacted: number;
  processed: number;
  reward_per_school: number;
  currency: string;
  earned: number;
  in_progress: number;
  in_progress_value: number;
  year: number;
  paid_after: string;
};

export type InvestmentInterest = {
  id: string;
  amount: string;
  currency: string;
  message: string;
  status: string;
  created_at: string;
};

export function getPartnerSession(): PartnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PartnerSession) : null;
  } catch {
    return null;
  }
}

function setPartnerSession(session: PartnerSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage blocked — session lives only in memory for this page */
  }
}

export function clearPartnerSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const partnerApi = axios.create({ baseURL: BASE_URL });
partnerApi.interceptors.request.use((config) => {
  const session = getPartnerSession();
  if (session?.access_token) {
    (config.headers as any).Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

function friendlyError(error: any, fallback: string): string {
  const data = error?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (data && typeof data === "object") {
    const first = Object.values(data)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return fallback;
}

export async function registerPartner(payload: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  organization?: string;
  country?: string;
}): Promise<PartnerSession> {
  try {
    const { data } = await partnerApi.post("/partners/register/", payload);
    setPartnerSession(data);
    return data;
  } catch (error: any) {
    throw new Error(friendlyError(error, "We could not create your partner account."));
  }
}

export async function loginPartner(email: string, password: string): Promise<PartnerSession> {
  try {
    const { data } = await partnerApi.post("/partners/login/", { email, password });
    setPartnerSession(data);
    return data;
  } catch (error: any) {
    throw new Error(friendlyError(error, "The email address or password is incorrect."));
  }
}

export async function getPartnerProfile(): Promise<PartnerProfile> {
  const { data } = await partnerApi.get("/partners/me/");
  return data;
}

export async function updatePartnerProfile(payload: Partial<PartnerProfile>): Promise<PartnerProfile> {
  const { data } = await partnerApi.patch("/partners/me/", payload);
  return data;
}

export async function getReferralStats(): Promise<ReferralStats> {
  const { data } = await partnerApi.get("/orders/orders/my-referral/");
  return data;
}

export async function listInvestments(): Promise<InvestmentInterest[]> {
  const { data } = await partnerApi.get("/partners/investments/");
  return Array.isArray(data) ? data : [];
}

export async function createInvestment(amount: number, message: string): Promise<InvestmentInterest> {
  try {
    const { data } = await partnerApi.post("/partners/investments/", { amount, message });
    return data;
  } catch (error: any) {
    throw new Error(friendlyError(error, "We could not record your interest. Please try again."));
  }
}
