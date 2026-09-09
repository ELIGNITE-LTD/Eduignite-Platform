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
  | 'staffSettings';

/**
 * Per spec: Teacher role sees only assigned-classes/attendance/marks; School
 * Admin (and, pending further product decisions, Sub Admin) sees everything.
 * Bursar/Librarian are recognized roles today but have no offline screens of
 * their own yet — deferred to a later phase, so they fall back to the same
 * narrow default as Teacher rather than silently getting full access.
 */
const FULL_ACCESS_ROLES: readonly UserRoleValue[] = ['SCHOOL_ADMIN', 'SUB_ADMIN'];

const TEACHER_SECTIONS: readonly AppSection[] = [
  'students',
  'classes',
  'subjects',
  'attendance',
  'academics',
  'reportCards',
];

const ALL_SECTIONS: readonly AppSection[] = [
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
];

export function sectionsForRole(role: UserRoleValue): readonly AppSection[] {
  return FULL_ACCESS_ROLES.includes(role) ? ALL_SECTIONS : TEACHER_SECTIONS;
}

export function canAccessSection(role: UserRoleValue, section: AppSection): boolean {
  return sectionsForRole(role).includes(section);
}
