import { compareSemver } from './compareSemver';

// Client-side update check (Wave 3 contract, "Client-side update check").
//
// Runs entirely in the renderer: `GET /api/v1/platform/app-versions/` is a
// public, unauthenticated endpoint (see backend/apps/platform/app_version_views.py),
// so no IPC round trip through the main process is needed for it — this is
// exactly why vite.config.ts bakes the app's own version into the renderer
// bundle as `__APP_VERSION__` rather than wiring up a new IPC channel for it.
//
// Modeled on src/sync/syncClient.ts's shape (an injectable `fetchImpl` +
// `baseUrl` for testability, a default derived from
// `VITE_OFFLINE_API_BASE_URL`, and "never throws for ordinary network
// failures") even though this is a single GET with no session/chunking.
// Per the contract, ANY failure — offline, backend down, non-200, malformed
// JSON, missing app_key — resolves to "unknown, assume fine" (`status:
// 'none'`) rather than throwing or blocking app usage.

const APP_KEY = 'offline_desktop';

function defaultBaseUrl(): string {
  return import.meta.env.VITE_OFFLINE_API_BASE_URL || 'http://localhost:8000';
}

/** The camelCase shape returned per app_key by `GET .../app-versions/`. */
export interface AppVersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  downloadUrl: string;
  releaseNotes?: string | null;
}

export type UpdateCheckStatus = 'blocked' | 'available' | 'none';

export interface UpdateCheckResult {
  /** 'blocked' = below minSupportedVersion (must update to keep using the app).
   *  'available' = between minSupportedVersion and latestVersion (dismissible nudge).
   *  'none' = up to date, OR the check could not be completed/understood. */
  status: UpdateCheckStatus;
  currentVersion: string;
  /** Present whenever a usable app-versions row was read, even for `status: 'none'`
   *  (already up to date) — absent when the check failed or the app_key was missing. */
  info?: AppVersionInfo;
}

export interface UpdateCheckOptions {
  currentVersion: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  appKey?: string;
}

function noUpdate(currentVersion: string): UpdateCheckResult {
  return { status: 'none', currentVersion };
}

/**
 * Fetches the platform's public app-versions endpoint and decides which of
 * the three UI states applies for this app. NEVER throws — every failure
 * mode (network error, non-OK response, malformed JSON, missing/incomplete
 * app_key entry) resolves silently to `{ status: 'none' }`, matching this
 * product's "offline is a normal state" philosophy.
 */
export async function checkForUpdate(options: UpdateCheckOptions): Promise<UpdateCheckResult> {
  const { currentVersion } = options;
  const baseUrl = options.baseUrl ?? defaultBaseUrl();
  const fetchImpl = options.fetchImpl ?? fetch;
  const appKey = options.appKey ?? APP_KEY;

  try {
    const res = await fetchImpl(`${baseUrl}/api/v1/platform/app-versions/`);
    if (!res.ok) return noUpdate(currentVersion);

    const data = (await res.json()) as Record<string, AppVersionInfo | undefined>;
    const info = data?.[appKey];
    if (!info || !info.latestVersion || !info.minSupportedVersion) {
      return noUpdate(currentVersion);
    }

    if (compareSemver(currentVersion, info.minSupportedVersion) < 0) {
      return { status: 'blocked', currentVersion, info };
    }
    if (compareSemver(currentVersion, info.latestVersion) < 0) {
      return { status: 'available', currentVersion, info };
    }
    return { status: 'none', currentVersion, info };
  } catch {
    // Offline, backend down, malformed JSON, unexpected shape, etc. — fail
    // silently/open rather than throwing or blocking app usage.
    return noUpdate(currentVersion);
  }
}
