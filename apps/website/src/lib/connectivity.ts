/**
 * Telling apart the three very different reasons a request can fail without
 * the server giving an answer.
 *
 * "The browser reports a network error" covers a device with no connection,
 * a server that is down or restarting, a proxy answering 502/503/504 (the
 * browser hides those behind a CORS error), DNS/TLS trouble and timeouts. They
 * must not all be reported as "you are offline": most of the time the person
 * is online and the fault is on our side, and they need to know that.
 *
 * Pure functions only (no React, no axios import) so they are easy to test.
 */

export type ConnectivityKind =
  /** The device itself has no connection (navigator.onLine === false). */
  | "device-offline"
  /** The device is online but EduIgnite's server could not be reached. */
  | "server-unreachable"
  /** The write was really stored in the offline outbox and will be sent later. */
  | "queued"
  /** Anything else: a real answer from the server, a validation error, etc. */
  | "other";

export interface ConnectivityInfo {
  kind: ConnectivityKind;
  /** HTTP status or error code, for small diagnostic text. */
  detail?: string;
}

export type UiLanguage = "en" | "fr";

const LANGUAGE_KEY = "eduignite_lang";

export function getUiLanguage(): UiLanguage {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      if (stored === "fr" || stored === "en") return stored;
    }
    if (typeof navigator !== "undefined" && /^fr/i.test(navigator.language || "")) return "fr";
  } catch {
    /* storage can be blocked */
  }
  return "en";
}

function deviceIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Classify a failed request. Never throws.
 *
 * - A request that the offline outbox really stored is "queued".
 * - A 502/503/504 is the proxy telling us the application is not answering.
 * - No response at all: offline device, otherwise the server is unreachable.
 * - A deliberately aborted request is "other" (nobody should be told the
 *   server is down because they navigated away).
 */
export function classifyError(error: any): ConnectivityInfo {
  if (!error) return { kind: "other" };

  if (error._offlineQueued === true || error?.data?._offlineQueued === true) {
    return { kind: "queued" };
  }

  const status: number | undefined = error?.response?.status;
  if (status !== undefined) {
    if (GATEWAY_STATUSES.has(status)) return { kind: "server-unreachable", detail: `HTTP ${status}` };
    return { kind: "other", detail: `HTTP ${status}` };
  }

  const code: string | undefined = error?.code;
  if (code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError") {
    return { kind: "other" };
  }

  // Only transport failures qualify. A plain Error thrown by our own code
  // ("No refresh token") has no code and is not an axios error.
  const isTransportFailure = Boolean(error?.isAxiosError) || Boolean(code) || error?.request !== undefined;
  if (!isTransportFailure) return { kind: "other" };

  if (deviceIsOffline() || code === "ERR_INTERNET_DISCONNECTED") {
    return { kind: "device-offline", detail: code };
  }

  const timedOut = code === "ECONNABORTED" || code === "ETIMEDOUT";
  return { kind: "server-unreachable", detail: timedOut ? `${code} (timeout)` : code || "network error" };
}

const MESSAGES: Record<Exclude<ConnectivityKind, "other">, Record<UiLanguage, string>> = {
  "device-offline": {
    en: "You are offline. Check your internet connection.",
    fr: "Vous êtes hors ligne. Vérifiez votre connexion Internet.",
  },
  "server-unreachable": {
    en: "We can't reach EduIgnite right now. This is usually temporary: please try again in a moment.",
    fr: "Impossible de joindre EduIgnite pour le moment. C'est généralement temporaire : veuillez réessayer dans un instant.",
  },
  // Only ever used when the request really sits in the outbox.
  queued: {
    en: "You appear to be offline. Your changes are saved and will sync automatically once you're back online.",
    fr: "Vous semblez hors ligne. Vos modifications sont enregistrées et seront synchronisées automatiquement dès le retour de la connexion.",
  },
};

/** The user-facing sentence for a connectivity failure, or null for "other". */
export function connectivityMessage(info: ConnectivityInfo, language: UiLanguage = getUiLanguage()): string | null {
  if (info.kind === "other") return null;
  return MESSAGES[info.kind][language];
}

/** Root of the API host (without /api/v1), e.g. https://api.eduignite.online */
export function apiRootUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return base.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

/**
 * Can the browser reach EduIgnite's server right now?
 *
 * Asks GET /api/v1/health/ and, if that route does not exist (404), falls
 * back to the API root: any answer below 500 proves the application is up.
 * A 5xx, a CORS-hidden proxy error, a timeout or a thrown fetch all mean "no".
 */
export async function checkServerReachable(timeoutMs = 8000): Promise<boolean> {
  const root = apiRootUrl();

  const probe = async (url: string): Promise<number | null> => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller?.signal,
      });
      return response.status;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const health = await probe(`${root}/api/v1/health/`);
  if (health === null) return false;
  if (health >= 200 && health < 400) return true;
  if (health === 404) {
    const fallback = await probe(`${root}/`);
    return fallback !== null && fallback < 500;
  }
  return false;
}
