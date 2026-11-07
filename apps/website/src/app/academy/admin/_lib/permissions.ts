/**
 * Client-side UX gating for the Academy admin CMS ONLY.
 *
 * This decides which nav links/sections are *shown* to a signed-in user so
 * the CMS doesn't dangle controls someone will just get a 403 from. It is
 * NOT the real authorization boundary — every one of these actions is
 * re-checked server-side against the real, revocable `AcademyPermission`
 * scope grants (see `backend/apps/academy/permissions.py`), regardless of
 * what this file decides to render. A mis-gate here is a UX bug, not a
 * security bug.
 *
 * Governance note (do not "fix" this by special-casing CEO): the platform's
 * two real founders, CEO and CTO, hold identical scopes (COURSE_ASSIGN +
 * COURSE_APPROVE) per the bootstrap migration. Nothing in this file — or
 * anywhere else in this admin surface — should ever gate a capability to
 * "CEO only". CEO and CTO are always treated as equally authorized. COO
 * keeps its own, smaller, separate scope (ACM_READ + ANALYTICS_VIEW) and is
 * never merged into or confused with the CEO/CTO tier.
 */

type RoleLike = string | null | undefined;

/** The two founder roles — always equally authorized, never one-only. */
export const isAcademyFounder = (role: RoleLike) => role === "CEO" || role === "CTO";

/** COO's own, smaller, separate governance scope (ACM_READ + ANALYTICS_VIEW). */
export const isAcademyCOO = (role: RoleLike) => role === "COO";

/**
 * "Academy Admin" (ACM_WRITE + COURSE_PUBLISH + PROFILE_EDIT per the spec's
 * Section 6 table) is a *scope bundle*, not a platform `UserRole` — there is
 * no such role in `users.UserRole`. There is also no "list my Academy
 * scopes" endpoint to check precisely client-side, so this approximates
 * "plausibly holds Academy Admin/CMS scopes" with the platform's existing
 * executive-tier roles for the purpose of deciding what to *show*. The real
 * gate is always the server's per-endpoint `HasAcademyScope` check.
 */
export const canSeeAcademyCms = (role: RoleLike) =>
  Boolean(role) && ["SUPER_ADMIN", "CEO", "CTO", "COO", "SYSTEM_DEV"].includes(role as string);

/** Course governance review queue: CEO/CTO (COURSE_APPROVE) or Super Admin. */
export const canSeeReviewQueue = (role: RoleLike) =>
  isAcademyFounder(role) || role === "SUPER_ADMIN";

/** Reporting/analytics surfaces (ACM_READ / ANALYTICS_VIEW territory). */
export const canSeeAnalytics = (role: RoleLike) =>
  isAcademyFounder(role) || isAcademyCOO(role) || role === "SUPER_ADMIN";

/**
 * The Course Creator "my courses" workspace: COURSE_CREATE can be granted to
 * *any* platform role (a teacher, a designer, anyone the CEO/CTO assigns —
 * it is a per-user grant, never derived from `role`). So this stays visible
 * to every authenticated user; an account with no grants just sees an empty
 * "no courses yet, ask a founder to assign you one" state, and the create
 * form's real POST will surface the server's real rejection if they lack
 * the grant.
 */
export const canSeeMyCourses = (_role: RoleLike) => true;
