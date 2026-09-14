// Role constants + route-permission map shared by the main process
// (src/ipc/rbac.ts's requireRole wrapper) and the renderer (App.tsx's route
// gating, Layout.tsx's nav filtering). No Node/Electron imports here so it is
// safe to import from either side of the contextIsolation boundary.
//
// Values are the offline-relevant subset of the cloud's UserRole enum
// (backend/apps/users/models.py) — reused verbatim so a future migration
// importer needs no role-mapping table. Do not invent new role names; if the
// offline app needs to recognize a role the cloud doesn't have, that's a
// product decision, not something to patch around here.

export const USER_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'] as const;

export type UserRoleValue = (typeof USER_ROLES)[number];

export function isValidRole(value: string): value is UserRoleValue {
  return (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Named route/section keys used by both the React Router route gating
 * (src/App.tsx) and the nav item filtering (src/components/Layout.tsx). Kept
 * separate from the actual URL paths so a path can change without touching
 * the permission table.
 */
export type AppSection =
  | 'schoolHome'
  | 'schoolProfile'
  | 'students'
  | 'teachers'
  | 'classes'
  | 'subjects'
  | 'attendance'
  | 'academics'
  | 'reportCards'
  | 'finance'
  | 'licensing'
  | 'structure'
  | 'staffSettings'
  | 'backup'
  | 'notices'
  | 'noticesManage'
  | 'help';

/**
 * Per spec: Teacher role sees only assigned-classes/attendance/marks; School
 * Admin (and, pending further product decisions, Sub Admin) sees everything.
 * Bursar/Librarian are recognized roles today but have no offline screens of
 * their own yet — deferred to a later phase, so they fall back to the same
 * narrow default as Teacher rather than silently getting full access.
 */
export const FULL_ACCESS_ROLES: readonly UserRoleValue[] = ['SCHOOL_ADMIN', 'SUB_ADMIN'];

/**
 * General-staff content every authenticated role can reach regardless of
 * full-access status: the School Home landing page, the read-only Notice
 * Board list (the same published notices already shown unauthenticated on
 * LoginPage — just reachable again post-login), and the offline Help Center.
 * None of these expose admin-only data or writes.
 */
const COMMON_SECTIONS: readonly AppSection[] = ['schoolHome', 'notices', 'help'];

const TEACHER_SECTIONS: readonly AppSection[] = [
  ...COMMON_SECTIONS,
  'students',
  'classes',
  'subjects',
  'attendance',
  'academics',
  'reportCards',
];

const ALL_SECTIONS: readonly AppSection[] = [
  ...COMMON_SECTIONS,
  'schoolProfile',
  'students',
  'teachers',
  'classes',
  'subjects',
  'attendance',
  'academics',
  'reportCards',
  'finance',
  'licensing',
  'structure',
  'staffSettings',
  'backup',
];

/**
 * Notice authoring (`noticesManage`) is layered on top of the full-access
 * set for SCHOOL_ADMIN only — deliberately narrower than every other
 * admin-facing section above, which SUB_ADMIN shares. This mirrors
 * notices:create/notices:setPublished/notices:listAll's existing
 * `requireRole(['SCHOOL_ADMIN'])` IPC guard (src/ipc/handlers.ts) exactly, so
 * the nav/route layer doesn't offer a screen whose writes the backend would
 * reject anyway.
 */
const SCHOOL_ADMIN_ONLY_SECTIONS: readonly AppSection[] = ['noticesManage'];

export function sectionsForRole(role: UserRoleValue): readonly AppSection[] {
  const base = FULL_ACCESS_ROLES.includes(role) ? ALL_SECTIONS : TEACHER_SECTIONS;
  return role === 'SCHOOL_ADMIN' ? [...base, ...SCHOOL_ADMIN_ONLY_SECTIONS] : base;
}

export function canAccessSection(role: UserRoleValue, section: AppSection): boolean {
  return sectionsForRole(role).includes(section);
}

/** Friendly, role-neutral display label for a signed-in user's role — used
 * by SchoolHomePage's welcome line so it never hardcodes "Principal" for a
 * session that might actually be a teacher/bursar/etc. */
const ROLE_LABELS: Record<UserRoleValue, string> = {
  SCHOOL_ADMIN: 'Principal / Administrator',
  SUB_ADMIN: 'Assistant Administrator',
  TEACHER: 'Teacher',
  BURSAR: 'Bursar',
  LIBRARIAN: 'Librarian',
};

export function roleLabel(role: UserRoleValue): string {
  return ROLE_LABELS[role] ?? role;
}
