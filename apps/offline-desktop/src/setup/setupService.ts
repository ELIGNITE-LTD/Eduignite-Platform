import type Database from 'better-sqlite3-multiple-ciphers';
import { getSchool, setSetupCompleted, upsertSchool } from '../repositories/schoolRepository';
import { createUser } from '../repositories/userRepository';
import { generateSchoolUserMatricule } from '../domain/matricules';
import type { PublicUser, School } from '../shared/types';
import type { SchoolSearchResult } from './setupClient';

// Local (no-network) write operations for the installer wizard's Steps 2-5
// (Phase A #4). Kept separate from setupClient.ts, which is network-only (see
// its own header comment) -- this module only ever touches the local DB.

const DEFAULT_ACADEMIC_YEAR = () => {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
};

/**
 * Step 2 (confirm school): creates the local `schools` row using the REAL
 * cloud School.id returned by the search endpoint -- this is what fixes the
 * bug described in the build contract, where `schoolRepository.upsertSchool`
 * previously had no path to ever receive anything but a randomly generated
 * local UUID. Only `id`/`name`/`short_name` come from the confirmed search
 * result; every other field is left at a sane blank default for Step 3
 * (which reuses SchoolProfilePage's own form/logic) to fill in.
 *
 * Idempotent for the common case of navigating back/forward within the
 * wizard before setup is complete. If a different school was already
 * confirmed earlier in this same wizard run, the stale shell row (and any
 * cascade-linked rows under it) is replaced rather than left orphaned. Once
 * setup is complete, re-confirming a school is refused -- changing schools
 * on an already-set-up installation is out of scope for this phase.
 */
export function confirmSchoolShell(db: Database.Database, result: SchoolSearchResult): School {
  const existing = getSchool(db);
  if (existing && existing.setup_completed) {
    throw new Error('This installation is already set up for a school. Contact support to change schools.');
  }
  if (existing && existing.id !== result.id) {
    db.prepare('DELETE FROM schools WHERE id = ?').run(existing.id);
  }

  return upsertSchool(db, {
    id: result.id,
    matricule: result.matricule || null,
    name: result.name,
    short_name: result.shortName || result.matricule || '',
    principal: '',
    motto: '',
    location: result.region_or_town || '',
    division: '',
    sub_division: '',
    city_village: '',
    address: '',
    postal_code: null,
    academic_year: DEFAULT_ACADEMIC_YEAR(),
    active_term: 'TERM_1',
    locale: 'en',
    subscription_currency: 'XAF',
  });
}

export interface CreateFirstAdminInput {
  fullName: string;
  emailOrUsername: string;
  password: string;
  /**
   * Required, not optional: this is the ONLY account created with nobody
   * already logged in to help recover it later, so it must leave the
   * installation with a working password-recovery path from day one.
   */
  securityQuestion: string;
  securityAnswer: string;
}

/**
 * Step 4: creates the installation's first SCHOOL_ADMIN staff login. Role is
 * always forced to SCHOOL_ADMIN here regardless of caller input -- this is
 * the one moment in the whole app where a staff account is created with no
 * one already logged in to authorize it, so it must not be parameterizable.
 */
export async function createFirstAdmin(
  db: Database.Database,
  input: CreateFirstAdminInput
): Promise<PublicUser> {
  const school = getSchool(db);
  if (!school) {
    throw new Error('Confirm your school (Step 2) before creating an administrator account.');
  }
  if (!input.securityQuestion?.trim() || !input.securityAnswer?.trim()) {
    throw new Error('A security question and answer are required so this account can be recovered later.');
  }
  // generateSchoolUserMatricule's SCHOOL_ADMIN special case returns the
  // school's own matricule verbatim (no role suffix, no counter) -- see its
  // doc comment. Left null (rather than blocking admin creation) if the
  // school has no matricule yet, e.g. an installation set up before this
  // field existed, or a search result that came back without one.
  const matricule = school.matricule ? generateSchoolUserMatricule(school.matricule, 'SCHOOL_ADMIN') : null;
  return createUser(db, {
    school_id: school.id,
    matricule,
    full_name: input.fullName,
    email_or_username: input.emailOrUsername,
    password: input.password,
    role: 'SCHOOL_ADMIN',
    security_question: input.securityQuestion,
    security_answer: input.securityAnswer,
  });
}

/** Step 5: flips `schools.setup_completed`, handing control back to the normal (now auth-gated) app. */
export function completeSetup(db: Database.Database): School {
  const school = getSchool(db);
  if (!school) throw new Error('No school configured yet.');
  return setSetupCompleted(db, school.id);
}
