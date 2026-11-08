/**
 * Linked school accounts.
 *
 * One person can run several schools. Each school keeps its own separate admin
 * account (own matricule and password); this only lets the owner switch between
 * them without retyping credentials, create a primary school from their
 * account, or link another existing school login after proving ownership once.
 *
 * Switching signs in as the other school's own admin account (the server issues
 * that account's tokens), then reloads so every cache and the auth store start
 * clean for the new school.
 */

import { apiClient, setTokens } from "@/lib/api/client";
import { pendingCount } from "@/lib/offline";

export type LinkedAccountStatus = "active" | "pending_activation" | "suspended" | "inactive";

export type LinkedAccount = {
  account_id: string;
  school_id: string | null;
  school_name: string;
  education_category: "basic" | "secondary" | "higher" | "";
  matricule: string;
  status: LinkedAccountStatus;
  is_current: boolean;
  can_switch: boolean;
};

export type LinkedSchools = {
  current_account_id: string;
  max_schools: number;
  accounts: LinkedAccount[];
};

export type CreatePrimarySchoolInput = {
  name: string;
  location: string;
  phone: string;
  principal: string;
  email?: string;
};

export type CreatedSchool = {
  school: { id: string; name: string; education_category: string; status: string };
  account: LinkedAccount;
  credentials: { matricule: string; temporary_password: string; must_change_password: boolean };
  message: string;
};

export const LINKED_SCHOOLS_QUERY_KEY = ["linked-schools"] as const;

export async function getLinkedSchools(): Promise<LinkedSchools> {
  const { data } = await apiClient.get("/users/linked-schools/");
  return data as LinkedSchools;
}

export async function createPrimarySchool(input: CreatePrimarySchoolInput): Promise<CreatedSchool> {
  const payload: Record<string, string> = { ...input } as Record<string, string>;
  if (!payload.email) delete payload.email;
  const { data } = await apiClient.post("/users/linked-schools/create-primary/", payload);
  return data as CreatedSchool;
}

export async function linkExistingSchool(matricule: string, password: string): Promise<LinkedSchools> {
  const { data } = await apiClient.post("/users/linked-schools/link/", { matricule: matricule.trim(), password });
  return data as LinkedSchools;
}

export async function unlinkSchool(accountId: string): Promise<LinkedSchools> {
  const { data } = await apiClient.post("/users/linked-schools/unlink/", { account_id: accountId });
  return data as LinkedSchools;
}

/** Thrown when work waiting to sync would be sent under the wrong school. */
export class UnsyncedWorkError extends Error {
  constructor() {
    super("unsynced");
    this.name = "UnsyncedWorkError";
  }
}

/**
 * Switch to another linked school (no password) and reload on its dashboard.
 * Refuses while offline work is waiting, because that work would otherwise be
 * replayed under the other school's account.
 */
export async function switchToSchool(accountId: string): Promise<void> {
  try {
    if ((await pendingCount()) > 0) throw new UnsyncedWorkError();
  } catch (error) {
    if (error instanceof UnsyncedWorkError) throw error;
    /* outbox unreadable: carry on, the server still enforces everything */
  }
  let refresh_token: string | undefined;
  try {
    refresh_token = localStorage.getItem("eduignite_refresh_token") || undefined;
  } catch {
    refresh_token = undefined;
  }
  const { data } = await apiClient.post("/users/linked-schools/switch/", { account_id: accountId, refresh_token });
  setTokens(data.access_token, data.refresh_token);
  try {
    localStorage.removeItem("eduignite_user");
    // A teacher-workspace backup belongs to the account being left.
    localStorage.removeItem("eduignite_admin_access_token");
    localStorage.removeItem("eduignite_admin_refresh_token");
  } catch {
    /* ignore */
  }
  window.location.href = "/dashboard";
}
