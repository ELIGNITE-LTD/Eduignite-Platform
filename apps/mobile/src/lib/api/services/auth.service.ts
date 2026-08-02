import { apiClient, clearTokens, setTokens } from "../client";
import { API } from "../endpoints";
import { normalizeUser } from "../normalizers";
import type {
  ActivateAccountRequest,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  TokenRefreshResponse,
  User,
} from "../types";

function normalizeLoginResponse(data: Record<string, any>): LoginResponse {
  const access = data.access ?? data.access_token ?? "";
  const refresh = data.refresh ?? data.refresh_token ?? "";

  return {
    ...data,
    access,
    refresh,
    access_token: access,
    refresh_token: refresh,
    user: normalizeUser(data.user),
  };
}

function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("eduignite_refresh_token") || localStorage.getItem("refresh_token");
}

export const authService = {
  async login(credentials: string | LoginRequest, password?: string): Promise<LoginResponse> {
    const payload =
      typeof credentials === "string"
        ? { matricule: credentials, password }
        : credentials;

    const { data } = await apiClient.post(API.AUTH.LOGIN, payload);
    const normalized = normalizeLoginResponse(data);

    if (normalized.access && normalized.refresh) {
      setTokens(normalized.access, normalized.refresh);
    }

    return normalized;
  },

  async firebaseLogin(idToken: string): Promise<LoginResponse> {
    const { data } = await apiClient.post(API.AUTH.FIREBASE_LOGIN, { id_token: idToken });
    const normalized = normalizeLoginResponse(data);

    if (normalized.access && normalized.refresh) {
      setTokens(normalized.access, normalized.refresh);
    }

    return normalized;
  },

  async logout(payload?: string | LogoutRequest): Promise<void> {
    const refreshToken =
      typeof payload === "string"
        ? payload
        : payload?.refreshToken ?? payload?.refresh ?? getStoredRefreshToken();

    try {
      if (refreshToken) {
        await apiClient.post(API.AUTH.LOGOUT, { refresh: refreshToken });
      }
    } finally {
      clearTokens();
    }
  },

  async refreshToken(refresh?: string): Promise<TokenRefreshResponse> {
    const refreshToken = refresh ?? getStoredRefreshToken();
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const { data } = await apiClient.post(API.AUTH.REFRESH, { refresh: refreshToken });
    const access = data.access ?? data.access_token ?? "";

    if (access) {
      setTokens(access, refreshToken);
    }

    return { ...data, access, access_token: access };
  },

  async getMe(): Promise<User> {
    const { data } = await apiClient.get(API.AUTH.ME);
    return normalizeUser(data);
  },

  async getCurrentUser(): Promise<User> {
    return this.getMe();
  },

  async activateAccount(
    payloadOrMatricule: ActivateAccountRequest | string,
    newPassword?: string,
    confirmPassword?: string
  ): Promise<LoginResponse> {
    const payload =
      typeof payloadOrMatricule === "string"
        ? {
            matricule: payloadOrMatricule,
            new_password: newPassword,
            confirm_password: confirmPassword,
          }
        : {
            matricule: payloadOrMatricule.matricule,
            new_password: payloadOrMatricule.new_password ?? payloadOrMatricule.newPassword,
            confirm_password:
              payloadOrMatricule.confirm_password ?? payloadOrMatricule.confirmPassword,
          };

    const { data } = await apiClient.post(API.AUTH.ACTIVATE, payload);
    return normalizeLoginResponse(data);
  },

  async changePassword(
    payloadOrOldPassword: ChangePasswordRequest | string,
    newPassword?: string,
    confirmPassword?: string
  ): Promise<{ detail: string }> {
    const payload =
      typeof payloadOrOldPassword === "string"
        ? {
            old_password: payloadOrOldPassword,
            new_password: newPassword,
            confirm_password: confirmPassword,
          }
        : {
            old_password: payloadOrOldPassword.old_password ?? payloadOrOldPassword.oldPassword,
            new_password: payloadOrOldPassword.new_password ?? payloadOrOldPassword.newPassword,
            confirm_password:
              payloadOrOldPassword.confirm_password ?? payloadOrOldPassword.confirmPassword,
          };

    const { data } = await apiClient.post(API.AUTH.CHANGE_PASSWORD, payload);
    return data;
  },

  async requestPasswordReset(matricule: string): Promise<{ detail: string }> {
    const { data } = await apiClient.post(API.AUTH.PASSWORD_RESET, { matricule });
    return data;
  },

  async confirmPasswordReset(token: string, newPassword: string): Promise<{ detail: string }> {
    const { data } = await apiClient.post(API.AUTH.PASSWORD_RESET_CONFIRM, {
      token,
      new_password: newPassword,
    });
    return data;
  },
};
