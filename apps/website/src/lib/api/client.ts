import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  isOfflineError,
  readCache,
  writeCache,
  enqueue,
  newIdempotencyKey,
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

  // Every write carries a key from its very first attempt, not only from the
  // replay. The dangerous case is a request that reaches the server and whose
  // answer is lost: the device sees a timeout, cannot tell that from a request
  // that never arrived, and queues it. Carrying the key from the start means
  // the server recognises that replay and returns the original result rather
  // than taking the payment a second time.
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get' && !config.headers['Idempotency-Key']) {
    config.headers['Idempotency-Key'] = newIdempotencyKey();
  }

  return config;
});

/**
 * Work that must never be queued and replayed later.
 *
 * Almost everything is safe to record now and send later: a payment already
 * taken in cash, a register, marks. These are not. A mobile money collection
 * asks a gateway to take money from someone's phone right now; replaying it
 * three days later would charge a parent out of nowhere, for a transaction
 * nobody is standing in front of any more. Signing in and one-time codes only
 * mean anything against a live server too.
 *
 * These fail as they always did, and the person is told to try again when
 * there is a connection.
 */
function mustNotBeQueued(url: string): boolean {
  return (
    url.includes('/fapshi/') ||
    url.includes('/payunit/') ||
    url.includes('/auth/') ||
    url.includes('/otp') ||
    url.includes('/ai/') ||
    url.includes('/ai_features/')
  );
}

/**
 * A file upload cannot be queued.
 *
 * FormData cannot be stored in IndexedDB - it is not structured-cloneable - so
 * a queued upload would come back empty and replay as a request with no file
 * in it. Failing now, visibly, is far better than appearing to save someone's
 * photo or document and sending nothing days later.
 */
function carriesAFile(data: unknown): boolean {
  return typeof FormData !== 'undefined' && data instanceof FormData;
}

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
    const isLiveOnly =
      mustNotBeQueued(originalRequest?.url || '') || carriesAFile(originalRequest?.data);
    if (originalRequest && !isReplay && !isLiveOnly && isOfflineError(error)) {
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
