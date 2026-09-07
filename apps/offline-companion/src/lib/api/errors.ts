/**
 * Turns an axios error into a short, human-readable message. Trimmed down
 * from `apps/mobile/src/lib/api/errors.ts` (same idea, this app only ever
 * hits three endpoints so the DRF-error-envelope unwrapping stays generic).
 */

function looksLikeHtml(s: string): boolean {
  const t = s.trim().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    (t.startsWith("<") && /<\/?(html|body|head|div|p|h1|title|pre|span)\b/i.test(t))
  );
}

function firstMessage(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const m = firstMessage(v);
      if (m) return m;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const m = firstMessage((value as Record<string, unknown>)[key]);
      if (m) return m;
    }
  }
  return null;
}

function statusFallback(status?: number): string | null {
  if (status === 400) return "The request was rejected. Please check the required fields and try again.";
  if (status === 401) return "Authentication failed: wrong matricule or password.";
  if (status === 403) return "You are not allowed to carry out this operation.";
  if (status === 404) return "The requested record does not exist.";
  if (status === 409) return "This conflicts with existing data. Please review and try again.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status && status >= 500) return "We couldn't complete that just now. Please try again in a moment.";
  return null;
}

const META_KEYS = new Set(["status", "code", "errors", "message", "detail", "error", "success"]);

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const err = error as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: unknown };
  } | null;

  if (!err) return fallback;

  if (err.code === "ERR_NETWORK" || !err.response) {
    return "Could not reach the EduIgnite server. Check your internet connection and try again.";
  }

  const status = err.response?.status;
  const data = err.response?.data;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed || looksLikeHtml(trimmed) || trimmed.length > 280) {
      return statusFallback(status) || fallback;
    }
    return trimmed;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const fieldMsg = firstMessage(record.errors);
    if (fieldMsg) return fieldMsg;

    const direct = record.detail ?? record.message ?? record.error;
    if (typeof direct === "string" && direct.trim() && !/^validation error\.?$/i.test(direct.trim())) {
      return direct.trim();
    }

    for (const key of Object.keys(record)) {
      if (META_KEYS.has(key)) continue;
      const m = firstMessage(record[key]);
      if (m) return m;
    }

    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }

  return statusFallback(status) || err.message || fallback;
}
