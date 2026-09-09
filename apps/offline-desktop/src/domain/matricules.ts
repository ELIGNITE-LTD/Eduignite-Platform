// Pure, framework-agnostic port of the cloud's school-scoped user matricule
// format (backend/apps/users/matricules.py's `generate_school_user_matricule`,
// `school_user_role_code`, and `school_user_id_width`). No database or
// Electron imports here on purpose — this file is unit tested directly (see
// tests/domain.matricules.test.ts) and is deliberately dumb about where
// `existingMatriculesWithPrefix` comes from; the repository layer owns the
// SQL query, this module owns only the format.
//
// WHY THIS HAS TO MATCH BYTE-FOR-BYTE: the cloud's own migration importer
// (backend/apps/offline_licensing/migration/transform.py) calls the cloud's
// `generate_school_user_matricule` as a fallback ONLY for offline rows that
// arrive with no matricule at all — it has no code path to remap a
// differently-shaped offline matricule into the cloud's format. So an
// offline-generated matricule must either already be in this exact shape, or
// be absent. Do not "improve" the algorithm here (no randomness, no
// checksum, no extra padding) even though the plain sequential counter is a
// known weakness on the cloud side — matching the existing format exactly is
// the whole point of this module.
//
// Ported logic, confirmed against backend/apps/users/matricules.py:
//   - SCHOOL_USER_ROLE_CODES: SUB_ADMIN -> SA, BURSAR -> BU, LIBRARIAN -> LB,
//     TEACHER -> TE, STUDENT -> ST, PARENT -> PA.
//   - SCHOOL_ADMIN is a special case: `generate_school_user_matricule`
//     returns the school's own matricule verbatim — no role suffix, no
//     counter, so it is intentionally excluded from ROLE_CODES below.
//   - Format for every other role: `{schoolMatricule}{ROLE_CODE}{seq}`,
//     e.g. `GBHS0126TE001` for a teacher at school matricule `GBHS0126`.
//   - Sequence width: 4 digits for STUDENT/PARENT (HIGH_VOLUME_SCHOOL_ROLES
//     on the cloud, high-volume roles), 3 digits for every other role.
//     Zero-padded (Python's `f'{counter:0{width}d}'`).
//   - The counter is per-school-per-role: it is one more than the highest
//     numeric suffix found among `existingMatriculesWithPrefix` (matricules
//     that already start with `{schoolMatricule}{ROLE_CODE}`), mirroring the
//     cloud's `_max_numeric_suffix` helper exactly (regex `^{prefix}(\d+)$`,
//     `max(..., default=0) + 1`). No randomness, no gap-filling, no reuse of
//     a freed number — purely sequential, same as the cloud.
//
// WHERE THIS SHOULD BE WIRED IN ONCE PR #16 (feature/offline-v2-setup-and-auth)
// LANDS — that branch was not merged into `main` as of this file's authorship,
// so nothing below is imported from it; this is a note for whoever merges
// first, not code:
//   1. `src/repositories/userRepository.ts`'s `createUser` (and any future
//      "add staff" flow beyond the wizard's first admin) should compute
//      `input.matricule` by calling `generateSchoolUserMatricule` with the
//      school's `matricule` (see #3 below) and the row's `role`, using
//      `existingMatriculesWithPrefix` fetched via a query shaped like:
//        SELECT matricule FROM users WHERE matricule LIKE '{prefix}%'
//      before insert — the repository owns that query, this module only
//      formats the result. `setupService.ts`'s `createFirstAdmin` forces
//      role to SCHOOL_ADMIN, so per the special case above that call site
//      should set `matricule = school.matricule` directly rather than
//      calling this generator at all.
//   2. `src/repositories/schoolRepository.ts`'s `upsertSchool` currently
//      never writes a `matricule` column (the `School` shared type and the
//      `schools` table both lack one) even though
//      `src/setup/setupClient.ts`'s `SchoolSearchResult.matricule` already
//      carries the cloud's real school matricule back from the search step
//      and `src/setup/setupService.ts`'s `confirmSchoolShell` currently only
//      uses it as a `short_name` fallback, dropping the actual value. Once
//      the `schools.matricule` column exists (see #3), `upsertSchool`'s
//      `SchoolInput` should accept it and `confirmSchoolShell` should pass
//      `result.matricule` straight through instead of discarding it — this
//      is the ONLY correct source for the school matricule offline; nothing
//      offline should ever invent one (see `generateSchoolUserMatricule`
//      below, which throws rather than guessing).
//   3. The `schools.matricule` column itself: added by this same change in
//      `src/db/migrations/0004_school_matricule.sql` (nullable, additive —
//      see that file's header for why it wasn't already present in 0001/0003).

/**
 * Every role the cloud's `generate_school_user_matricule` recognizes for a
 * school-scoped user. Deliberately broader than the offline app's own
 * `UserRoleValue` (src/shared/roles.ts on PR #16, which has no STUDENT/PARENT
 * since those don't get offline logins) — STUDENT and PARENT are kept here
 * because the migration importer's fallback path (see file header) can also
 * need matricules generated for student/parent rows, and format parity must
 * hold for every role the cloud table defines, not just the ones the offline
 * `users` table happens to use today.
 */
export type SchoolUserRole = 'SCHOOL_ADMIN' | 'SUB_ADMIN' | 'BURSAR' | 'LIBRARIAN' | 'TEACHER' | 'STUDENT' | 'PARENT';

/** Ported verbatim from `SCHOOL_USER_ROLE_CODES` in backend/apps/users/matricules.py. */
const ROLE_CODES: Record<Exclude<SchoolUserRole, 'SCHOOL_ADMIN'>, string> = {
  SUB_ADMIN: 'SA',
  BURSAR: 'BU',
  LIBRARIAN: 'LB',
  TEACHER: 'TE',
  STUDENT: 'ST',
  PARENT: 'PA',
};

/** Ported verbatim from `HIGH_VOLUME_SCHOOL_ROLES` in backend/apps/users/matricules.py. */
const HIGH_VOLUME_ROLES: ReadonlySet<SchoolUserRole> = new Set(['STUDENT', 'PARENT']);

/**
 * Role code used inside a school-scoped matricule. Mirrors the cloud's
 * `school_user_role_code`; SCHOOL_ADMIN has no role code of its own because
 * it never appears inside a matricule suffix (see the SCHOOL_ADMIN special
 * case on `generateSchoolUserMatricule`).
 */
export function schoolUserRoleCode(role: Exclude<SchoolUserRole, 'SCHOOL_ADMIN'>): string {
  return ROLE_CODES[role];
}

/**
 * Zero-padding width of the sequential counter for a role. Mirrors the
 * cloud's `school_user_id_width`: 4 digits for the high-volume roles
 * (STUDENT, PARENT), 3 digits for everyone else.
 */
export function schoolUserIdWidth(role: SchoolUserRole): number {
  return HIGH_VOLUME_ROLES.has(role) ? 4 : 3;
}

/**
 * Builds the `{schoolMatricule}{ROLE_CODE}` prefix a repository should use to
 * fetch `existingMatriculesWithPrefix` (e.g. `WHERE matricule LIKE
 * '<prefix>%'`) before calling `generateSchoolUserMatricule`. Not meaningful
 * for SCHOOL_ADMIN (see the special case below).
 */
export function schoolUserMatriculePrefix(
  schoolMatricule: string,
  role: Exclude<SchoolUserRole, 'SCHOOL_ADMIN'>
): string {
  if (!schoolMatricule) {
    throw new Error('schoolMatricule is required to build a school user matricule prefix.');
  }
  return `${schoolMatricule}${schoolUserRoleCode(role)}`;
}

/**
 * Highest numeric suffix among `values` that matches exactly `{prefix}{digits}`,
 * or 0 if none match. Ported verbatim from the cloud's `_max_numeric_suffix`
 * (regex `^{re.escape(prefix)}(\d+)$`, `max(counters, default=0)`).
 */
function maxNumericSuffix(values: readonly string[], prefix: string): number {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  let max = 0;
  for (const value of values) {
    const match = pattern.exec(value ?? '');
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates the next `{SCHOOL_MATRICULE}{ROLE_CODE}{seq}` matricule for a
 * school-scoped user, matching backend/apps/users/matricules.py's
 * `generate_school_user_matricule` byte-for-byte for a given input state.
 *
 * Pure and synchronous by design: unlike the Python original (which loops,
 * re-querying the DB, until it finds a matricule nobody has raced it to),
 * this function trusts `existingMatriculesWithPrefix` as a complete,
 * already-fetched snapshot and returns a single deterministic answer — the
 * caller (a repository, inside a transaction) is responsible for uniqueness
 * under concurrent writes, same as any other offline-desktop write path
 * (see e.g. schoolRepository.ts's single-row upsert pattern). There is no
 * offline equivalent of the cloud's race-and-retry loop because SQLite
 * writes on this app are single-writer already.
 *
 * @param schoolMatricule The school's own matricule (e.g. `GBHS0126`) as
 *   assigned by the cloud — never invented offline. Required even for the
 *   SCHOOL_ADMIN special case, since that case returns this value verbatim.
 * @param role The role the new user is being created with.
 * @param existingMatriculesWithPrefix Every matricule already in use at this
 *   school that starts with this role's prefix (i.e. the repository's
 *   `WHERE matricule LIKE '{schoolMatricule}{ROLE_CODE}%'` result) — ignored
 *   entirely for SCHOOL_ADMIN, which has no prefix or counter.
 */
export function generateSchoolUserMatricule(
  schoolMatricule: string,
  role: SchoolUserRole,
  existingMatriculesWithPrefix: readonly string[] = []
): string {
  if (!schoolMatricule) {
    throw new Error('schoolMatricule is required to generate a school user matricule.');
  }

  if (role === 'SCHOOL_ADMIN') {
    return schoolMatricule;
  }

  const prefix = schoolUserMatriculePrefix(schoolMatricule, role);
  const width = schoolUserIdWidth(role);
  const counter = maxNumericSuffix(existingMatriculesWithPrefix, prefix) + 1;
  return `${prefix}${String(counter).padStart(width, '0')}`;
}
