/**
 * Offline storage for uploaded apps.
 *
 * These schools lose power and network routinely, so an app that only works
 * online is an app they cannot rely on. Three things are kept locally:
 *
 * - **screen payloads** (shim + bundle), keyed by app version, so a screen
 *   opens with no network at all;
 * - **reads**, so a list still shows yesterday's data rather than an error;
 * - **writes**, queued and replayed when the connection returns.
 *
 * Cache Storage is used rather than localStorage: bundles are far larger than
 * localStorage's few megabytes, and Cache Storage is available in the browser,
 * in Electron's renderer and in the Android WebView, so one implementation
 * covers all three clients.
 */

const CACHE_NAME = "eduignite-apps-v1";
const QUEUE_KEY = "eduignite:app-write-queue";

/** Cache Storage needs a secure context; it is absent in some embedded views. */
function cacheAvailable(): boolean {
  return typeof caches !== "undefined" && typeof window !== "undefined";
}

async function openCache(): Promise<Cache | null> {
  if (!cacheAvailable()) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** A cache entry is addressed by a URL, so keys are shaped like one. */
function key(parts: string[]): string {
  return `https://eduignite.local/${parts.map(encodeURIComponent).join("/")}`;
}

async function readJson<T>(url: string): Promise<T | null> {
  const cache = await openCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(url);
    return hit ? ((await hit.json()) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(url: string, value: unknown): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.put(
      url,
      new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json" },
      })
    );
  } catch {
    // A full or unavailable cache must never break the running app.
  }
}

// ---------------------------------------------------------------- payloads

export type ScreenPayload = {
  version: string;
  app_key: string;
  screen_id: string;
  title: string;
  shim: string;
  bundle: string;
  csp: string;
};

export async function getCachedPayload(
  appKey: string,
  screenId: string
): Promise<ScreenPayload | null> {
  return readJson<ScreenPayload>(key(["payload", appKey, screenId]));
}

export async function cachePayload(payload: ScreenPayload): Promise<void> {
  await writeJson(key(["payload", payload.app_key, payload.screen_id]), payload);
}

/**
 * Drop everything belonging to an app.
 *
 * Called when an app is removed or updated: a stale bundle paired with a new
 * data shape is worse than no cache, because it fails in ways nobody can
 * reproduce.
 */
export async function forgetApp(appKey: string): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    const keys = await cache.keys();
    const prefix = `https://eduignite.local/payload/${encodeURIComponent(appKey)}/`;
    const readPrefix = `https://eduignite.local/read/${encodeURIComponent(appKey)}/`;
    await Promise.all(
      keys
        .filter((r) => r.url.startsWith(prefix) || r.url.startsWith(readPrefix))
        .map((r) => cache.delete(r))
    );
  } catch {
    /* nothing to do */
  }
}

// ------------------------------------------------------------------- reads

export async function getCachedRead<T>(
  appKey: string,
  signature: string
): Promise<T | null> {
  return readJson<T>(key(["read", appKey, signature]));
}

export async function cacheRead(
  appKey: string,
  signature: string,
  value: unknown
): Promise<void> {
  await writeJson(key(["read", appKey, signature]), value);
}

// ------------------------------------------------------------------ writes

export type QueuedWrite = {
  id: string;
  appKey: string;
  url: string;
  body: unknown;
  queuedAt: number;
  attempts: number;
};

/**
 * The write queue lives in localStorage rather than Cache Storage.
 *
 * It is small, and it must be readable synchronously at startup so nothing can
 * begin before we know there is unsent work — a queue you have to await is a
 * queue you can race.
 */
export function readQueue(): QueuedWrite[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedWrite[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Bounded: a device offline for weeks should not fill its storage and
    // lose the ability to queue anything at all.
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-500)));
  } catch {
    /* storage full; the caller already has its error */
  }
}

export function enqueueWrite(entry: Omit<QueuedWrite, "id" | "queuedAt" | "attempts">): QueuedWrite {
  const item: QueuedWrite = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
    attempts: 0,
  };
  saveQueue([...readQueue(), item]);
  return item;
}

export function removeFromQueue(id: string): void {
  saveQueue(readQueue().filter((item) => item.id !== id));
}

export function markAttempted(id: string): void {
  saveQueue(
    readQueue().map((item) =>
      item.id === id ? { ...item, attempts: item.attempts + 1 } : item
    )
  );
}

/**
 * Replay queued writes.
 *
 * Order is preserved: a create followed by an update on the same record has to
 * arrive that way round, so a failure stops the run rather than skipping ahead
 * and applying the second without the first.
 */
export async function flushQueue(
  send: (item: QueuedWrite) => Promise<void>
): Promise<{ sent: number; failed: number }> {
  const items = readQueue();
  let sent = 0;

  for (const item of items) {
    try {
      await send(item);
      removeFromQueue(item.id);
      sent += 1;
    } catch (error: any) {
      const statusCode = error?.response?.status;
      // A rejected write will be rejected again forever, so it is dropped
      // rather than blocking everything behind it. Anything else is likely
      // the network, so stop and keep the order intact.
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        removeFromQueue(item.id);
        continue;
      }
      markAttempted(item.id);
      return { sent, failed: items.length - sent };
    }
  }
  return { sent, failed: 0 };
}
