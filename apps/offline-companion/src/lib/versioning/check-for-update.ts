/**
 * Update-check for the standalone Companion app.
 *
 * On startup (and optionally periodically while running), the app fetches
 * the platform's PUBLIC, unauthenticated `GET /api/v1/platform/app-versions/`
 * endpoint and reads the `offline_companion` key — see wave3-contract.md for
 * why this goes through the platform's own backend rather than GitHub's API
 * directly (this is a private repo; a shipped APK can't safely embed a
 * GitHub token).
 *
 * Never throws: offline, a slow/unreachable backend, or a malformed response
 * are all just "no update info available right now", exactly like the rest
 * of this product's "offline is a normal state" philosophy. Callers should
 * never block app usage on this failing.
 */

import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { compareSemver } from "./compare-semver";
import type { AppVersionInfo, AppVersionsResponse, UpdateCheckResult } from "./types";

/** This app's own app_key in the AppVersion table. */
export const APP_KEY = "offline_companion";

/** A minimal fetch contract so this stays testable without mocking axios. */
export interface AppVersionsFetcher {
  (): Promise<AppVersionsResponse>;
}

const defaultFetcher: AppVersionsFetcher = async () => {
  const { data } = await apiClient.get<AppVersionsResponse>(API.PLATFORM.APP_VERSIONS);
  return data ?? {};
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidAppVersionInfo(value: unknown): value is AppVersionInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Record<string, unknown>;
  return isNonEmptyString(info.latestVersion) && isNonEmptyString(info.minSupportedVersion);
}

/**
 * Resolves the update status for `currentVersion` given already-fetched
 * version info. Pure and synchronous — split out from `checkForUpdate` so
 * the decision logic itself is trivially unit-testable.
 */
export function resolveUpdateStatus(
  currentVersion: string,
  info: AppVersionInfo | undefined
): UpdateCheckResult {
  if (!info || !isValidAppVersionInfo(info)) {
    return { status: "unknown", currentVersion };
  }

  const base: UpdateCheckResult = {
    status: "unknown",
    currentVersion,
    latestVersion: info.latestVersion,
    minSupportedVersion: info.minSupportedVersion,
    downloadUrl: info.downloadUrl,
    releaseNotes: info.releaseNotes,
  };

  if (compareSemver(currentVersion, info.minSupportedVersion) < 0) {
    return { ...base, status: "blocked" };
  }

  if (compareSemver(currentVersion, info.latestVersion) < 0) {
    return { ...base, status: "update-available" };
  }

  return { ...base, status: "up-to-date" };
}

/**
 * Fetches the current version table and resolves this app's update status.
 * Never rejects — any failure (network, malformed body, missing app_key)
 * resolves to `{ status: "unknown" }` instead.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetcher: AppVersionsFetcher = defaultFetcher
): Promise<UpdateCheckResult> {
  try {
    const versions = await fetcher();
    return resolveUpdateStatus(currentVersion, versions?.[APP_KEY]);
  } catch {
    return { status: "unknown", currentVersion };
  }
}
