// Offline-first layer for the app (WhatsApp-style).
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
//
// Two rules matter more than the rest, because this queue carries money:
//
//   1. A replay must never record the same work twice. Every write carries an
//      idempotency key from the moment it is first attempted, so if the answer
//      is lost on the way back - a timeout is the ordinary case, and the
//      device cannot tell a lost answer from a lost request - the server
//      recognises the repeat and returns the original result instead of taking
//      the payment again.
//
//   2. Queued work is never thrown away. A request the server refuses is kept
//      and shown to someone, not deleted. An afternoon of receipts is not ours
//      to discard quietly because the server answered 400 once.

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

/** A key that survives a replay, so the server can recognise a repeat. */
export function newIdempotencyKey(): string {
  const source: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (source?.randomUUID) return source.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Cached reads belong to the account that made them. Keying by user means a
// different person signing in on the same device is never served the
// previous account's announcements, messages or records, even offline.
function cacheOwner(): string {
  if (typeof window === 'undefined') return 'anon';
  try {
    const raw = localStorage.getItem('eduignite_user');
    const id = raw ? JSON.parse(raw)?.id : '';
    return id ? String(id) : 'anon';
  } catch {
    return 'anon';
  }
}

export function cacheKey(config: AxiosRequestConfig): string {
  const base = config.baseURL || '';
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${cacheOwner()}|${(config.method || 'get').toLowerCase()}:${base}${url}?${params}`;
}

/** Forget every cached read, e.g. on sign-out. */
export async function clearOfflineCache(): Promise<void> {
  const s = stores();
  if (!s) return;
  try {
    await s.cacheStore.clear();
  } catch {
    /* ignore */
  }
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

/** When the cached answer for this request was stored, so a screen can say. */
export async function cachedAt(config: AxiosRequestConfig): Promise<number | undefined> {
  const s = stores();
  if (!s) return undefined;
  try {
    const entry = await s.cacheStore.getItem<{ data: any; at: number }>(cacheKey(config));
    return entry?.at;
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
export type OutboxStatus = 'pending' | 'failed';

export interface OutboxItem {
  id: string;
  method: string;
  url: string;
  baseURL?: string;
  data?: any;
  params?: any;
  headers?: Record<string, string>;
  createdAt: number;
  /** Repeated on every attempt so the server can recognise a replay. */
  idempotencyKey: string;
  /** What this was, in words, for the person waiting on it. */
  label: string;
  status: OutboxStatus;
  attempts: number;
  /** Why the server refused it, kept so someone can see and decide. */
  lastError?: string;
}

type OutboxListener = (items: OutboxItem[]) => void;
const outboxListeners = new Set<OutboxListener>();

export function onOutboxChange(listener: OutboxListener): () => void {
  outboxListeners.add(listener);
  void listOutbox().then(listener);
  return () => {
    outboxListeners.delete(listener);
  };
}

async function announceOutbox(): Promise<void> {
  if (outboxListeners.size === 0) return;
  const items = await listOutbox();
  outboxListeners.forEach((listener) => listener(items));
}

/** Oldest first: work reaches the server in the order it was done. */
export async function listOutbox(): Promise<OutboxItem[]> {
  const s = stores();
  if (!s) return [];
  try {
    const items: OutboxItem[] = [];
    await s.outboxStore.iterate<OutboxItem, void>((value) => {
      if (value) items.push(value);
    });
    return items.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/**
 * Says what a queued request was, from its address and body, so the person who
 * made it recognises it in a list. Falls back to the path, which is still
 * better than an opaque id.
 */
export function describeRequest(config: AxiosRequestConfig): string {
  const url = config.url || '';
  let body: any = {};
  try {
    body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  } catch {
    body = {};
  }

  if (url.includes('/fees/payments')) {
    const amount = body?.amount ? `${body.amount} ${body.currency || 'XAF'}` : 'a payment';
    return `Payment of ${amount}`;
  }
  if (url.includes('/attendance/')) {
    const count = Array.isArray(body?.records) ? body.records.length : 0;
    return count ? `Register for ${count} ${count === 1 ? 'student' : 'students'}` : 'Attendance';
  }
  if (url.includes('/grades/') || url.includes('/exams/')) return 'Marks entry';
  if (url.includes('/students/')) return 'Student record';
  if (url.includes('/assignments/')) return 'Assignment';
  if (url.includes('/announcements/')) return 'Announcement';
  if (url.includes('/staff-remarks/')) return 'Staff remark';
  if (url.includes('/library/')) return 'Library record';

  const method = (config.method || 'post').toUpperCase();
  return `${method} ${url.split('?')[0]}`;
}

export async function enqueue(config: AxiosRequestConfig): Promise<OutboxItem> {
  const s = stores();
  const headers = (config.headers || {}) as Record<string, string>;
  const item: OutboxItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    method: (config.method || 'post').toLowerCase(),
    url: config.url || '',
    baseURL: config.baseURL,
    data: config.data,
    params: config.params,
    createdAt: Date.now(),
    // The key the first attempt already carried, so the server sees the replay
    // and the original as one piece of work. Generated here only if the
    // request somehow arrived without one.
    idempotencyKey:
      headers['Idempotency-Key'] || headers['idempotency-key'] || newIdempotencyKey(),
    label: describeRequest(config),
    status: 'pending',
    attempts: 0,
  };
  if (s) {
    try {
      await s.outboxStore.setItem(item.id, item);
      await announceOutbox();
    } catch {
      /* ignore */
    }
  }
  return item;
}

/** How many pieces of work are still waiting to reach the server. */
export async function pendingCount(): Promise<number> {
  const items = await listOutbox();
  return items.filter((item) => item.status !== 'failed').length;
}

/** Work the server refused, which needs a person to look at it. */
export async function failedCount(): Promise<number> {
  const items = await listOutbox();
  return items.filter((item) => item.status === 'failed').length;
}

async function updateItem(item: OutboxItem, changes: Partial<OutboxItem>): Promise<void> {
  const s = stores();
  if (!s) return;
  try {
    await s.outboxStore.setItem(item.id, { ...item, ...changes });
    await announceOutbox();
  } catch {
    /* ignore */
  }
}

/** Puts a refused item back in the queue, for the retry button. */
export async function retryItem(id: string): Promise<void> {
  const s = stores();
  if (!s) return;
  try {
    const item = await s.outboxStore.getItem<OutboxItem>(id);
    if (!item) return;
    await s.outboxStore.setItem(id, {
      ...item,
      status: 'pending',
      attempts: 0,
      lastError: undefined,
    });
    await announceOutbox();
  } catch {
    /* ignore */
  }
}

/** Removes an item for good. Only ever on a person's explicit instruction. */
export async function discardItem(id: string): Promise<void> {
  const s = stores();
  if (!s) return;
  try {
    await s.outboxStore.removeItem(id);
    await announceOutbox();
  } catch {
    /* ignore */
  }
}

type SyncListener = (state: { running: boolean; lastSyncedAt: number | null }) => void;
const syncListeners = new Set<SyncListener>();
let syncState = { running: false, lastSyncedAt: null as number | null };

export function onSyncChange(listener: SyncListener): () => void {
  syncListeners.add(listener);
  listener(syncState);
  return () => {
    syncListeners.delete(listener);
  };
}

function setSyncState(changes: Partial<typeof syncState>) {
  syncState = { ...syncState, ...changes };
  syncListeners.forEach((listener) => listener(syncState));
}

function describeServerError(error: any): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  const status = error?.response?.status;
  return status ? `The server answered ${status}.` : 'The server could not be reached.';
}

/** A 5xx is the server having a bad day, not a refusal. It is worth retrying. */
function isWorthRetrying(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status >= 500) return true;
  return status === 408 || status === 409 || status === 425 || status === 429;
}

let flushing = false;

export async function flushOutbox(client: AxiosInstance): Promise<void> {
  const s = stores();
  if (!s || flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  setSyncState({ running: true });
  try {
    const items = await listOutbox();
    for (const item of items) {
      // Something the server already refused waits for a person to look at it
      // rather than being sent again and again.
      if (item.status === 'failed') continue;

      try {
        await client.request({
          method: item.method as any,
          url: item.url,
          data: item.data,
          params: item.params,
          headers: {
            'x-eduignite-replay': '1',
            // The same key the first attempt used. If that attempt did reach
            // the server, this returns its result instead of recording the
            // work a second time.
            'Idempotency-Key': item.idempotencyKey,
            'X-Offline-Recorded-At': new Date(item.createdAt).toISOString(),
          },
        });
        await s.outboxStore.removeItem(item.id);
        await announceOutbox();
      } catch (error: any) {
        if (isOfflineError(error)) {
          // Still offline: stop, keep the order, try again on reconnect.
          break;
        }

        const status = error?.response?.status;
        if (isWorthRetrying(status)) {
          // The server did not refuse the work, it just could not deal with it
          // now. Keep it and stop, because later items may depend on it.
          await updateItem(item, {
            attempts: item.attempts + 1,
            lastError: describeServerError(error),
          });
          break;
        }

        // A refusal. The work stays in the queue, marked, so whoever recorded
        // it can see what happened and decide. It is never deleted for them.
        await updateItem(item, {
          status: 'failed',
          attempts: item.attempts + 1,
          lastError: describeServerError(error),
        });
      }
    }
  } finally {
    flushing = false;
    setSyncState({ running: false, lastSyncedAt: Date.now() });
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
