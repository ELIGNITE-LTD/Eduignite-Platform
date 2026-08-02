// Never surface raw HTML (e.g. a server error page) to a user.
function looksLikeHtml(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || (t.startsWith("<") && /<\/?(html|body|head|div|p|h1|title|pre|span)\b/i.test(t));
}

// Depth-first: first human-readable string inside a value (string | array | dict).
function firstMessage(value: any): string | null {
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
    for (const k of Object.keys(value)) {
      const m = firstMessage(value[k]);
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

function normalizeMessage(msg: string): string {
  if (/invalid credentials/i.test(msg)) {
    return "Wrong password or matricule does not exist. Check both fields and try again.";
  }
  return msg;
}

const META_KEYS = new Set(["status", "code", "errors", "message", "detail", "error", "success"]);

export function getApiErrorMessage(error: any, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;

  if (error.code === "ERR_NETWORK" || !error.response) {
    return "You appear to be offline. Your changes are saved and will sync automatically once you're back online.";
  }

  const status = error.response?.status;
  const data = error.response?.data;

  // Raw string body — could be an HTML error page. Never show markup.
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed || looksLikeHtml(trimmed) || trimmed.length > 280) {
      return statusFallback(status) || fallback;
    }
    return normalizeMessage(trimmed);
  }

  if (data && typeof data === "object") {
    // 1. Specific field errors from the API's error envelope: { errors: {field: [...] } }.
    const fieldMsg = firstMessage((data as any).errors);
    if (fieldMsg) return normalizeMessage(fieldMsg);

    // 2. A specific top-level message (ignore the generic "Validation error." placeholder).
    const direct = (data as any).detail ?? (data as any).message ?? (data as any).error;
    if (typeof direct === "string" && direct.trim() && !/^validation error\.?$/i.test(direct.trim())) {
      return normalizeMessage(direct.trim());
    }

    // 3. Raw DRF field errors at the top level: { email: ["already exists"] }.
    for (const key of Object.keys(data)) {
      if (META_KEYS.has(key)) continue;
      const m = firstMessage((data as any)[key]);
      if (m) return normalizeMessage(m);
    }

    // 4. Fall back to the generic message if that's all there is.
    if (typeof direct === "string" && direct.trim()) return normalizeMessage(direct.trim());
  }

  return statusFallback(status) || error.message || fallback;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected image file."));
    reader.readAsDataURL(file);
  });
}
