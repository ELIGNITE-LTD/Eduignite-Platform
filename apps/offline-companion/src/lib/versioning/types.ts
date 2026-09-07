/**
 * Shape returned by `GET /api/v1/platform/app-versions/` for one app_key.
 * Field names are camelCase on the wire (see backend/apps/platform/
 * app_version_views.py's `_serialize`) — no snake_case translation needed.
 */
export interface AppVersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  downloadUrl: string;
  releaseNotes?: string;
  updatedAt?: string;
}

/** Full response body: a flat object keyed by app_key. An app_key with no
 * row yet is simply absent — never treat a missing key as an error. */
export type AppVersionsResponse = Partial<Record<string, AppVersionInfo>>;

export type UpdateStatus =
  /** currentVersion < minSupportedVersion — block usage, not dismissible. */
  | "blocked"
  /** minSupportedVersion <= currentVersion < latestVersion — dismissible banner. */
  | "update-available"
  /** currentVersion >= latestVersion — no UI. */
  | "up-to-date"
  /** The version-check request failed, or this app_key has no row yet —
   * never treated as an error, just "nothing to show". */
  | "unknown";

export interface UpdateCheckResult {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  minSupportedVersion?: string;
  downloadUrl?: string;
  releaseNotes?: string;
}
