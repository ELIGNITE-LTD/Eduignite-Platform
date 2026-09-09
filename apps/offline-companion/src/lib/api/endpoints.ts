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
  ANNOUNCEMENTS: {
    // Same backend as apps/mobile — see backend/apps/announcements.
    MY_FEED: "/announcements/announcements/my_announcements/",
    MARK_READ: (id: string) => `/announcements/announcements/${id}/mark_read/`,
  },
  COMMUNITY: {
    // Testimonies — see backend/apps/community. List is AllowAny (used by
    // the public website too); create requires auth + the school's
    // "community" app entitlement.
    TESTIMONIES: "/community/testimonies/",
  },
  FEEDBACK: {
    // See backend/apps/feedback. Requires the school's "feedback" app
    // entitlement (RequiresApp('feedback')) same as apps/mobile.
    BASE: "/feedback/feedback/",
    MY_FEEDBACK: "/feedback/feedback/my_feedback/",
  },
  CHAT: {
    // See backend/apps/chat. Requires the school's "chat" app entitlement
    // (RequiresApp('chat')). "Chat with EduIgnite" is implemented as a
    // normal direct conversation with a related user whose role is CEO or
    // CTO — apps/chat/relations.py already puts both founders in a
    // SCHOOL_ADMIN's related-users list (equal parity, no favoritism).
    RELATED_USERS: "/chat/conversations/related-users/",
    GET_OR_CREATE_DIRECT: "/chat/conversations/get-or-create-direct/",
    CONVERSATION_DETAIL: (id: string) => `/chat/conversations/${id}/`,
    MESSAGES: "/chat/messages/",
    MARK_READ: (id: string) => `/chat/conversations/${id}/mark-read/`,
  },
  SURVEYS: {
    // See backend/apps/surveys. IsAuthenticated only, no app entitlement.
    BASE: "/surveys/",
    DETAIL: (id: string | number) => `/surveys/${id}/`,
    RESPOND: (id: string | number) => `/surveys/${id}/respond/`,
  },
} as const;
