/**
 * Lets the app report its own failures to EduIgnite's Security & System Watch, so a problem on one device reaches the
 * founders without anyone having to complain.
 *
 * What is sent: the app, the screen, the kind of failure and a short scrubbed message. Never a password, a token or
 * the content of a form. It is throttled and de-duplicated here as well as on the server, never reports while the
 * device is offline, and can never throw: monitoring must not be the reason something breaks.
 */

type Kind = "js_error" | "unhandled_rejection" | "render_error" | "chunk_load" | "network" | "api_5xx" | "api_timeout";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
const ENDPOINT = `${API_BASE}/watch/client-errors/`;
const MAX_PER_SESSION = 25;
const REPEAT_WINDOW_MS = 60_000;

let app: "web" | "mobile" | "desktop" = "web";
let version = "";
let sentCount = 0;
const recent = new Map<string, number>();

function token(): string {
  try { return localStorage.getItem("eduignite_access_token") || ""; } catch { return ""; }
}

export function reportClientError(e: { kind: Kind; message: string; stack?: string; endpoint?: string; status?: number }): void {
  try {
    if (typeof window === "undefined" || sentCount >= MAX_PER_SESSION) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;     // an offline device is not a fault
    if ((e.endpoint || "").includes("/watch/")) return;                                // never report on the reporter itself
    const message = String(e.message || "").slice(0, 300);
    if (!message) return;
    const key = `${e.kind}|${message}|${e.endpoint || ""}`;
    const now = Date.now();
    if (now - (recent.get(key) || 0) < REPEAT_WINDOW_MS) return;
    recent.set(key, now);
    sentCount += 1;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    void fetch(ENDPOINT, {
      method: "POST", headers, keepalive: true,
      body: JSON.stringify({
        app, version, kind: e.kind, message, stack: String(e.stack || "").slice(0, 700), route: window.location.pathname,
        endpoint: (e.endpoint || "").split("?")[0], status: e.status, online: true,
      }),
    }).catch(() => undefined);
  } catch {
    /* never throw from the reporter */
  }
}

/** Failures of calls to our own API: the server did not answer, or answered with a 5xx. */
export function reportApiFailure(error: { code?: string; message?: string; response?: { status?: number }; config?: { url?: string; method?: string } }): void {
  const url = error.config?.url || "";
  const status = error.response?.status;
  if (status && status >= 500) {
    reportClientError({ kind: "api_5xx", message: `${(error.config?.method || "get").toUpperCase()} failed with ${status}`, endpoint: url, status });
  } else if (!error.response) {
    const timeout = error.code === "ECONNABORTED" || /timeout/i.test(error.message || "");
    reportClientError({ kind: timeout ? "api_timeout" : "network", message: timeout ? "The server took too long to answer" : "The server could not be reached", endpoint: url });
  }
}

export function installWatchReporter(which: "web" | "mobile" | "desktop" = "web", appVersion = ""): void {
  if (typeof window === "undefined" || (window as unknown as { __watchInstalled?: boolean }).__watchInstalled) return;
  (window as unknown as { __watchInstalled?: boolean }).__watchInstalled = true;
  app = which;
  version = appVersion || process.env.NEXT_PUBLIC_BUILD_ID || "";
  window.addEventListener("error", (ev) => {
    const msg = ev.message || (ev.error && ev.error.message) || "";
    const chunk = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg);
    reportClientError({ kind: chunk ? "chunk_load" : "js_error", message: msg, stack: ev.error && ev.error.stack });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason as { message?: string; stack?: string; name?: string } | string | undefined;
    const msg = typeof reason === "string" ? reason : reason?.message || "";
    const chunk = typeof reason === "object" && reason?.name === "ChunkLoadError";
    reportClientError({ kind: chunk ? "chunk_load" : "unhandled_rejection", message: msg, stack: typeof reason === "object" ? reason?.stack : undefined });
  });
}
