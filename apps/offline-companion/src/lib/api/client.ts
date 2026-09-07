import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

/**
 * Same backend, same env var name as every other EduIgnite app
 * (`NEXT_PUBLIC_API_URL`, baked in at build time — see .github/workflows/
 * offline-companion.yml and apps/mobile's equivalent).
 */
export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const ACCESS_TOKEN_KEY = "eduignite_companion_access_token";
const REFRESH_TOKEN_KEY = "eduignite_companion_refresh_token";
const USER_KEY = "eduignite_companion_user";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// This app has no offline read/write queue (unlike apps/mobile) — every
// screen it has (login, activate, device-replacement) requires a live
// connection to the backend to mean anything, so a failed request here is
// just a failed request, surfaced via getApiErrorMessage. The only place
// "offline is fine" applies in this product is the version-check
// (src/lib/versioning), which never throws on its own.
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string | null) => void; reject: (error: unknown) => void }> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isBrowser = typeof window !== "undefined";
    const refresh = isBrowser ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
    const access = isBrowser ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const isAuthEndpoint = Boolean(originalRequest?.url?.includes("/auth/"));

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (!refresh || !access || isAuthEndpoint) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
        const newAccess = data.access;
        localStorage.setItem(ACCESS_TOKEN_KEY, newAccess);
        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        clearTokens();
        if (isBrowser && window.location.pathname !== "/login/") {
          window.location.href = "/login/";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const setTokens = (access: string, refresh: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
};

export const clearTokens = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getAccessToken = (): string | null =>
  typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;

export const storeUser = (user: unknown) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const readStoredUser = <T,>(): T | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};
