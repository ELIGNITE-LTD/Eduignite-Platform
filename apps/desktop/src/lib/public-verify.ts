/**
 * Shared client logic for the PUBLIC QR verification pages under /verify/**.
 *
 * Every printed QR (student ID card, report card, fee receipt) opens one of
 * those pages on a phone, with no login. The page asks the public verification
 * endpoint of the API and shows a clear Valid / Not valid / Revoked answer.
 *
 * The base URL a QR points at is decided by the backend (core/verification.py,
 * env FRONTEND_URL). Nothing here builds a QR.
 */
import { BASE_URL } from "@/lib/api/client";

export type VerifyState = "valid" | "not_valid" | "revoked" | "unavailable";

export interface VerifyOutcome {
  state: VerifyState;
  detail: string;
  data: Record<string, any>;
}

const OFFLINE_MESSAGE = "We could not reach the verification service. Please check your connection and scan again.";

/**
 * A phone camera opens the site on whatever domain was printed, so a build-time
 * API URL cannot be trusted: try same-origin /api/v1, then the api. sub-domain,
 * then the configured base.
 */
export function candidateBases(): string[] {
  const bases: string[] = [];
  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      bases.push(`${origin}/api/v1`);
      const root = hostname.replace(/^www\./, "").replace(/^(admin|dashboard|app)\./, "");
      bases.push(`https://api.${root}/api/v1`);
    }
  }
  if (BASE_URL) bases.push(BASE_URL);
  return Array.from(new Set(bases));
}

/** GET a public verification endpoint and turn any answer into a VerifyOutcome. */
export async function fetchVerification(path: string): Promise<VerifyOutcome> {
  for (const base of candidateBases()) {
    try {
      const res = await fetch(`${base}${path}`, { cache: "no-store" });
      // A non-JSON answer means this origin is the website, not the API.
      if (!(res.headers.get("content-type") || "").includes("application/json")) continue;
      const payload = (await res.json()) as Record<string, any>;
      if (res.status === 429) {
        return { state: "unavailable", detail: "Too many checks in a short time. Please wait a minute and scan again.", data: {} };
      }
      const state: VerifyState =
        payload?.result === "valid" || payload?.result === "revoked" || payload?.result === "not_valid"
          ? payload.result
          : res.ok && payload?.valid !== false
            ? "valid"
            : "not_valid";
      return { state, detail: String(payload?.detail || ""), data: payload || {} };
    } catch {
      /* network or CORS error for this base: try the next one */
    }
  }
  return { state: "unavailable", detail: OFFLINE_MESSAGE, data: {} };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Read the segments after /verify/report-card/.
 *
 * Current codes are  <admission>/<2025-2026>/<seq-ID | term-N>.
 * Older printed codes carried the year as "2025/2026", which adds a segment and
 * used to end on "Page Not Found": the two year halves are joined back here.
 */
export function parseReportCardSegments(raw: string[] | string | undefined) {
  const parts = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(safeDecode).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const admission = parts[0];
  const key = parts[parts.length - 1];
  const year = parts.slice(1, -1).join("-");
  if (!/^(seq-[0-9a-fA-F-]+|term-[1-3]|[1-3])$/.test(key)) return null;
  return { admission, year, key: /^[1-3]$/.test(key) ? `term-${key}` : key };
}

export function schoolQuery(): string {
  if (typeof window === "undefined") return "";
  const school = new URLSearchParams(window.location.search).get("school");
  return school ? `?school=${encodeURIComponent(school)}` : "";
}
