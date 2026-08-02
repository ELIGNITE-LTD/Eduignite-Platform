import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  isOfflineError,
  readCache,
  writeCache,
  enqueue,
  initOfflineSync,
} from '@/lib/offline';

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request interceptor: attach JWT access token from localStorage
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('eduignite_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: on 401, attempt token refresh, then retry
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((p) => { error ? p.reject(error) : p.resolve(token); });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => {
    // Cache successful GET reads so they are available offline (WhatsApp-style).
    try {
      const cfg = response.config as InternalAxiosRequestConfig;
      const method = (cfg.method || 'get').toLowerCase();
      if (
        method === 'get' &&
        response.data &&
        typeof response.data === 'object' &&
        !cfg.url?.includes('/auth/')
      ) {
        void writeCache(cfg, response.data);
      }
    } catch {
      /* caching is best-effort */
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      headers?: any;
    };

    // ---- Offline handling ----------------------------------------------
    // When the request never reached the server, serve cached reads and queue
    // writes for automatic replay on reconnect. Auth calls and outbox replays
    // are never intercepted.
    const isReplay = Boolean(originalRequest?.headers?.['x-eduignite-replay']);
    const isAuthCall = Boolean(originalRequest?.url?.includes('/auth/'));
    if (originalRequest && !isReplay && !isAuthCall && isOfflineError(error)) {
      const method = (originalRequest.method || 'get').toLowerCase();
      if (method === 'get') {
        const cached = await readCache(originalRequest);
        if (cached !== undefined) {
          return {
            data: cached,
            status: 200,
            statusText: 'OK (offline cache)',
            headers: {},
            config: originalRequest,
            request: null,
          };
        }
      } else {
        await enqueue(originalRequest);
        let optimistic: any = {};
        try {
          optimistic =
            typeof originalRequest.data === 'string'
              ? JSON.parse(originalRequest.data)
              : originalRequest.data || {};
        } catch {
          optimistic = {};
        }
        return {
          data: { ...optimistic, _offlineQueued: true },
          status: 202,
          statusText: 'Queued offline',
          headers: {},
          config: originalRequest,
          request: null,
        };
      }
    }

    const isBrowser = typeof window !== 'undefined';
    const currentPath = isBrowser ? window.location.pathname : '';
    const refresh = isBrowser ? localStorage.getItem('eduignite_refresh_token') : null;
    const access = isBrowser ? localStorage.getItem('eduignite_access_token') : null;
    const isAuthEndpoint = Boolean(originalRequest?.url?.includes('/auth/'));

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Public pages can make unauthenticated requests; do not force a reload loop
      // when there is no active session to refresh.
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
        if (!refresh) throw new Error('No refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
        const newAccess = data.access;
        localStorage.setItem('eduignite_access_token', newAccess);
        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        localStorage.removeItem('eduignite_access_token');
        localStorage.removeItem('eduignite_refresh_token');
        localStorage.removeItem('eduignite_user');
        if (isBrowser && currentPath !== '/login') {
          window.location.href = '/login';
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
  localStorage.setItem('eduignite_access_token', access);
  localStorage.setItem('eduignite_refresh_token', refresh);
};

export const clearTokens = () => {
  localStorage.removeItem('eduignite_access_token');
  localStorage.removeItem('eduignite_refresh_token');
  localStorage.removeItem('eduignite_user');
};

export const getAccessToken = () =>
  typeof window !== 'undefined'
    ? localStorage.getItem('eduignite_access_token') || localStorage.getItem('access_token')
    : null;

// Start the offline outbox sync engine (flushes queued writes on reconnect).
if (typeof window !== 'undefined') {
  initOfflineSync(apiClient);
}
