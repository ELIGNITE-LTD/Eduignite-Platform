/**
 * Backend endpoint paths this app actually uses — a small slice of
 * `apps/mobile/src/lib/api/endpoints.ts`'s full map, kept in the same shape
 * so the request paths are trivially diffable against the shared backend.
 */
export const API = {
  AUTH: {
    LOGIN: "/auth/login/",
    REFRESH: "/auth/refresh/",
    LOGOUT: "/auth/logout/",
    ME: "/auth/me/",
  },
  OFFLINE_LICENSING: {
    // Wire contract (wave2-contract.md): activation + renewal challenges.
    REDEEM: "/offline-licensing/challenges/redeem/",
    // Wire contract: device-replacement has its own endpoint — same
    // challenge/response shape, purpose "device_replacement", extra
    // `previousDeviceId` field on the challenge.
    DEVICE_REPLACEMENT: "/offline-licensing/device-replacement/",
  },
  PLATFORM: {
    // Public, unauthenticated — see backend/apps/platform/app_version_views.py.
    APP_VERSIONS: "/platform/app-versions/",
  },
} as const;
