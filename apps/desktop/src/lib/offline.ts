// Offline-first layer for the desktop app (WhatsApp-style).
//
// Every API call goes through the single axios client, so we add offline
// behaviour there (see api/client.ts):
//   • GET responses are cached to IndexedDB and served when the network is
//     unavailable, so the whole app is browsable offline after one online use.
//   • Writes (POST/PUT/PATCH/DELETE) made while offline are appended to a
//     durable outbox and replayed, in order, as soon as connectivity returns.
//
// This module owns the persistent stores and the sync engine. It is a no-op
// on the server (SSR) and only runs in the browser/renderer.

import type { AxiosInstance, AxiosRequestConfig } from 'axios';

let cacheStore: LocalForage | null = null;
let outboxStore: LocalForage | null = null;

function stores() {
  if (typeof window === 'undefined') return null;
  if (!cacheStore || !outboxStore) {
    // Require lazily so SSR never touches IndexedDB.
    const localforage = require('localforage') as typeof import('localforage');
    cacheStore = localforage.createInstance({ name: 'eduignite', storeName: 'api_cache' });
    outboxStore = localforage.createInstance({ name: 'eduignite', storeName: 'outbox' });
  }
  return { cacheStore: cacheStore!, outboxStore: outboxStore! };
}

export function isOfflineError(error: any): boolean {
  // Axios sets no `response` when the request never reached the server
  // (DNS failure, offline, connection refused) — that is our "offline" signal.
  if (error?.response) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = error?.code;
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ERR_INTERNET_DISCONNECTED' ||
    !error?.response
  );
}

export function cacheKey(config: AxiosRequestConfig): string {
  const base = config.baseURL || '';
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${(config.method || 'get').toLowerCase()}:${base}${url}?${params}`;
}

// Keep the offline cache lean and fresh: don't serve data older than this, and
// cap how many responses we retain so IndexedDB never bloats the app.
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const CACHE_MAX_ENTRIES = 600;

// ---------------------------------------------------------------- read cache
export async function readCache(config: AxiosRequestConfig): Promise<any | undefined> {
  const s = stores();
  if (!s) return undefined;
  try {
    const entry = await s.cacheStore.getItem<{ data: any; at: number }>(cacheKey(config));
    if (!entry) return undefined;
    // Never serve very stale offline data.
    if (entry.at && Date.now() - entry.at > CACHE_MAX_AGE_MS) {
      await s.cacheStore.removeItem(cacheKey(config));
      return undefined;
    }
    return entry.data;
  } catch {
    return undefined;
  }
}

// Evict expired entries and cap the total, so the offline store stays small
// and quick. Cheap and safe to call periodically.
export async function pruneCache(): Promise<void> {
  const s = stores();
  if (!s) return;
  try {
    const entries: { key: string; at: number }[] = [];
    await s.cacheStore.iterate<{ data: any; at: number }, void>((value, key) => {
      entries.push({ key, at: value?.at || 0 });
    });
    const now = Date.now();
    const fresh: { key: string; at: number }[] = [];
    for (const e of entries) {
      if (now - e.at > CACHE_MAX_AGE_MS) {
        await s.cacheStore.removeItem(e.key);
      } else {
        fresh.push(e);
      }
    }
    if (fresh.length > CACHE_MAX_ENTRIES) {
      fresh.sort((a, b) => a.at - b.at); // oldest first
      for (const e of fresh.slice(0, fresh.length - CACHE_MAX_ENTRIES)) {
        await s.cacheStore.removeItem(e.key);
      }
    }
  } catch {
    /* ignore */
  }
}

export async function writeCache(config: AxiosRequestConfig, data: any): Promise<void> {
  const s = stores();
  if (!s) return;
  try {
    await s.cacheStore.setItem(cacheKey(config), { data, at: Date.now() });
  } catch {
    /* quota / serialization — ignore */
  }
}

// -------------------------------------------------------------------- outbox
export interface OutboxItem {
  id: string;
  method: string;
  url: string;
  baseURL?: string;
  data?: any;
  params?: any;
  headers?: Record<string, string>;
  createdAt: number;
}

export async function enqueue(config: AxiosRequestConfig): Promise<OutboxItem> {
  const s = stores();
  const item: OutboxItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    method: (config.method || 'post').toLowerCase(),
    url: config.url || '',
    baseURL: config.baseURL,
    data: config.data,
    params: config.params,
    createdAt: Date.now(),
  };
  if (s) {
    try {
      await s.outboxStore.setItem(item.id, item);
    } catch {
      /* ignore */
    }
  }
  return item;
}

export async function pendingCount(): Promise<number> {
  const s = stores();
  if (!s) return 0;
  try {
    return await s.outboxStore.length();
  } catch {
    return 0;
  }
}

let flushing = false;

export async function flushOutbox(client: AxiosInstance): Promise<void> {
  const s = stores();
  if (!s || flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    const keys = await s.outboxStore.keys();
    // Preserve FIFO order (ids are time-prefixed).
    keys.sort();
    for (const key of keys) {
      const item = await s.outboxStore.getItem<OutboxItem>(key);
      if (!item) {
        await s.outboxStore.removeItem(key);
        continue;
      }
      try {
        await client.request({
          method: item.method as any,
          url: item.url,
          data: item.data,
          params: item.params,
          headers: { 'x-eduignite-replay': '1' },
        });
        await s.outboxStore.removeItem(key);
      } catch (error: any) {
        if (isOfflineError(error)) {
          // Still offline — stop and retry on the next reconnect.
          break;
        }
        // A real server rejection (4xx/5xx): drop it so the queue never wedges.
        await s.outboxStore.removeItem(key);
      }
    }
  } finally {
    flushing = false;
  }
}

let initialised = false;

export function initOfflineSync(client: AxiosInstance): void {
  if (typeof window === 'undefined' || initialised) return;
  initialised = true;
  const trigger = () => flushOutbox(client);
  window.addEventListener('online', trigger);
  window.addEventListener('focus', trigger);
  // Periodic safety net.
  window.setInterval(trigger, 30000);
  // Attempt once on startup.
  setTimeout(trigger, 2000);
  // Keep the offline cache lean: prune on startup and hourly.
  setTimeout(() => { void pruneCache(); }, 5000);
  window.setInterval(() => { void pruneCache(); }, 60 * 60 * 1000);
}
