import axios from "axios";
import { APP_VERSION, compareVersions } from "@/lib/app-version";

/**
 * Update notifications for the shipped app: on startup, fetch the
 * platform's public, no-auth app-versions endpoint and compare this app's
 * own baked-in version against its `mobile` entry.
 *
 * This deliberately does NOT go through `@/lib/api/client` (that client is
 * pinned to api.eduignite.online and wired for JWT + the offline outbox —
 * none of which applies to this public, unauthenticated, different-host
 * endpoint). It also never throws and never blocks the app on a failed or
 * offline request — a missed check just means no banner this session, the
 * same "offline is a normal state" handling as the rest of this app.
 */

const APP_KEY = "mobile" as const;

const VERSIONS_URL = `${(process.env.NEXT_PUBLIC_APP_URL || "https://eduignite.online").replace(
  /\/+$/,
  ""
)}/api/v1/platform/app-versions/`;

export interface AppVersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  downloadUrl: string;
  releaseNotes?: string;
}

export type UpdateStatus = "checking" | "up-to-date" | "update-available" | "update-required";

export async function fetchAppVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    const { data } = await axios.get(VERSIONS_URL, { timeout: 8000 });
    const entry = data?.[APP_KEY];
    if (!entry?.latestVersion || !entry?.minSupportedVersion || !entry?.downloadUrl) return null;
    return {
      latestVersion: String(entry.latestVersion),
      minSupportedVersion: String(entry.minSupportedVersion),
      downloadUrl: String(entry.downloadUrl),
      releaseNotes: entry.releaseNotes ? String(entry.releaseNotes) : undefined,
    };
  } catch {
    // Offline, backend down, CORS hiccup, malformed payload — fail silently.
    // This check is a courtesy notification, never a gate on app usage.
    return null;
  }
}

export function resolveUpdateStatus(info: AppVersionInfo | null): UpdateStatus {
  if (!info) return "up-to-date"; // fail-open: no info means no nagging
  if (compareVersions(APP_VERSION, info.minSupportedVersion) < 0) return "update-required";
  if (compareVersions(APP_VERSION, info.latestVersion) < 0) return "update-available";
  return "up-to-date";
}
