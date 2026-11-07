/**
 * Teacher workspace for principals.
 *
 * A school admin can run a real, separate teacher account (a "twin") and switch
 * into it from their profile with no password. Switching backs up the admin's
 * tokens and signs in as the twin; "Back to admin" restores them. The twin is a
 * genuine TEACHER account, so the whole teacher experience works and nothing is
 * mixed with the admin account.
 */

import { apiClient, setTokens } from "@/lib/api/client";

export type WorkspaceSubject = {
  class_subject_id: string;
  subject_name: string;
  mine: boolean;
  teacher_name: string;
};

export type WorkspaceClass = {
  id: string;
  name: string;
  is_class_master: boolean;
  subjects: WorkspaceSubject[];
};

export type TeacherWorkspaceState = {
  enabled: boolean;
  teacher: { id: string; name: string; matricule: string } | null;
  classes: WorkspaceClass[];
};

const BK_ACCESS = "eduignite_admin_access_token";
const BK_REFRESH = "eduignite_admin_refresh_token";

export function isActingAsTeacher(): boolean {
  try {
    return Boolean(localStorage.getItem(BK_ACCESS));
  } catch {
    return false;
  }
}

export async function getTeacherWorkspace(): Promise<TeacherWorkspaceState> {
  const { data } = await apiClient.get("/users/teacher-workspace/");
  return data as TeacherWorkspaceState;
}

export async function setupTeacherWorkspace(payload: {
  class_subject_ids: string[];
  class_master_ids: string[];
}): Promise<TeacherWorkspaceState> {
  const { data } = await apiClient.post("/users/teacher-workspace/setup/", payload);
  return data as TeacherWorkspaceState;
}

/** Sign in as the teacher twin (no password) and reload as a teacher. */
export async function switchToTeacher(): Promise<void> {
  const { data } = await apiClient.post("/users/teacher-workspace/switch/", {});
  try {
    const access = localStorage.getItem("eduignite_access_token") || "";
    const refresh = localStorage.getItem("eduignite_refresh_token") || "";
    localStorage.setItem(BK_ACCESS, access);
    localStorage.setItem(BK_REFRESH, refresh);
    localStorage.removeItem("eduignite_user");
  } catch {
    /* storage may be unavailable; the swap below still works for this tab */
  }
  setTokens(data.access, data.refresh);
  window.location.href = "/dashboard";
}

/** Return to the admin account using the backed-up admin tokens. */
export function backToAdmin(): void {
  try {
    const access = localStorage.getItem(BK_ACCESS);
    const refresh = localStorage.getItem(BK_REFRESH);
    if (access && refresh) setTokens(access, refresh);
    localStorage.removeItem(BK_ACCESS);
    localStorage.removeItem(BK_REFRESH);
    localStorage.removeItem("eduignite_user");
  } catch {
    /* ignore */
  }
  window.location.href = "/dashboard";
}
