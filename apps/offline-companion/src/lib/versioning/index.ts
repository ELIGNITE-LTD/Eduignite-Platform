export { compareSemver } from "./compare-semver";
export type { SemverComparison } from "./compare-semver";
export { checkForUpdate, resolveUpdateStatus, APP_KEY } from "./check-for-update";
export type { AppVersionsFetcher } from "./check-for-update";
export type {
  AppVersionInfo,
  AppVersionsResponse,
  UpdateStatus,
  UpdateCheckResult,
} from "./types";

/** This app's own version, baked in at build time from package.json (see
 * next.config.ts's `env` block). Read once, at module load. */
export const CURRENT_APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
