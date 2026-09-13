import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { APP_VERSION, compareVersions } from "@/lib/app-version";

/**
 * Update notifications for the shipped app: on startup, fetch the
 * platform's public, no-auth app-versions endpoint and compare this app's
 * own baked-in version against its `desktop` entry.
 *
 * Goes through `@/lib/api/client`, which is pinned to api.eduignite.online
 * (NEXT_PUBLIC_API_URL) -- this previously hand-rolled its own axios call
 * against NEXT_PUBLIC_APP_URL (eduignite.online, the Next.js website
 * domain), which does not proxy /api/* to the real backend and only ever
 * returns a redirect for that path. That silently 404/redirected on every
 * single load, always resolving to `null` below and permanently disabling
 * this app's own update banner -- the exact same wrong-domain bug already
 * found and fixed in .github/workflows/{mobile,desktop}.yml's CI notify
 * step. apiClient is safe to use unauthenticated here: this endpoint needs
 * no auth, and a 401 it will never see can't trigger apiClient's
 * refresh/redirect-to-login handling. It also never throws and never
 * blocks the app on a failed or offline request — a missed check just
 * means no banner this session, the same "offline is a normal state"
 * handling as the rest of this app.
 */

const APP_KEY = "desktop" as const;

export interface AppVersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  downloadUrl: string;
  releaseNotes?: string;
}

export type UpdateStatus = "checking" | "up-to-date" | "update-available" | "update-required";

export async function fetchAppVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    const { data } = await apiClient.get(API.PLATFORM.APP_VERSIONS, { timeout: 8000 });
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
