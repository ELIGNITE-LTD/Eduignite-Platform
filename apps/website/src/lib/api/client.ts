import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

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
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
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
