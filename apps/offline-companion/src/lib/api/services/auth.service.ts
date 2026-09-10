import { apiClient, clearTokens, setTokens, storeUser } from "../client";
import { API } from "../endpoints";
import type { ChangePasswordRequest, LoginResponse, User } from "../types";

/**
 * Same backend auth endpoint every other EduIgnite app uses
 * (`POST /auth/login/` with `{matricule, password}` -> `{access, refresh,
 * user}`) — see apps/mobile/src/lib/api/services/auth.service.ts. A school
 * technician logs in with the same matricule/password every account on the
 * platform has; there is no separate "technician" auth flow.
 */
export const authService = {
  async login(matricule: string, password: string): Promise<LoginResponse> {
    const { data } = await apiClient.post(API.AUTH.LOGIN, { matricule, password });

    const access = data.access ?? data.access_token ?? "";
    const refresh = data.refresh ?? data.refresh_token ?? "";
    const user: User = data.user ?? {};

    if (access && refresh) {
      setTokens(access, refresh);
      storeUser(user);
    }

    return { access, refresh, user };
  },

  async logout(refreshToken?: string | null): Promise<void> {
    try {
      if (refreshToken) {
        await apiClient.post(API.AUTH.LOGOUT, { refresh: refreshToken });
      }
    } finally {
      clearTokens();
    }
  },

  async getMe(): Promise<User> {
    const { data } = await apiClient.get(API.AUTH.ME);
    return data;
  },

  /**
   * POST /auth/change-password/ — backend/apps/authentication ChangePasswordSerializer
   * requires all three fields and validates old_password server-side.
   */
  async changePassword(payload: ChangePasswordRequest): Promise<{ detail: string }> {
    const { data } = await apiClient.post(API.AUTH.CHANGE_PASSWORD, payload);
    return data;
  },

  /**
   * POST /auth/password-reset/ — request-only (see PasswordResetRequestView).
   * The confirm step happens outside this app (emailed link), so the login
   * screen only ever calls this and shows a confirmation message.
   */
  async requestPasswordReset(matricule: string): Promise<{ detail: string }> {
    const { data } = await apiClient.post(API.AUTH.PASSWORD_RESET, { matricule });
    return data;
  },
};
