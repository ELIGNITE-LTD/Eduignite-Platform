import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { EducationCategory, School } from '../shared/types';
import { enqueueChange } from './syncQueueRepository';

// School Profile Management (spec module 1). The desktop app manages exactly
// one school per installation, so `schools` is a single-row config table —
// getSchool() returns that row (or null before first-run setup) and
// upsertSchool() creates it on first save, updating in place afterwards.
//
// `setup_completed` (0003 migration) is deliberately excluded from this
// input type: upsertSchool() never writes that column (it defaults to 0 at
// the DB level and is flipped exclusively by setSetupCompleted(), below,
// once the installer wizard's Step 5 finishes) -- see src/setup/setupService.ts.
//
// `matricule` is optional (not just nullable) on purpose, unlike every other
// field here: it's genuinely unknown at the point most callers build this
// input (any installation created before the 0004 migration, or a school
// search result that came back without one) -- see src/domain/matricules.ts's
// header comment for why offline never invents one. Omitting it is
// equivalent to passing null, not an error.
export type SchoolInput = Omit<School, 'id' | 'created_at' | 'updated_at' | 'setup_completed' | 'matricule' | 'education_category'> & {
  id?: string;
  matricule?: string | null;
  /** Defaults to 'secondary' (and keeps the stored value on update when omitted). */
  education_category?: EducationCategory;
};

export function getSchool(db: Database.Database): School | null {
  const row = db.prepare('SELECT * FROM schools LIMIT 1').get() as School | undefined;
  return row ?? null;
}

export function upsertSchool(db: Database.Database, input: SchoolInput): School {
  const existing = getSchool(db);
  const now = nowIso();

  if (!existing) {
    const id = input.id ?? newId();
    db.prepare(
      `INSERT INTO schools (
        id, matricule, education_category, name, short_name, principal, motto, location, division, sub_division,
        city_village, address, postal_code, academic_year, active_term, locale,
        subscription_currency, created_at, updated_at
      ) VALUES (@id, @matricule, @education_category, @name, @short_name, @principal, @motto, @location, @division, @sub_division,
        @city_village, @address, @postal_code, @academic_year, @active_term, @locale,
        @subscription_currency, @created_at, @updated_at)`
    ).run({
      id,
      matricule: input.matricule ?? null,
      education_category: input.education_category ?? 'secondary',
      name: input.name,
      short_name: input.short_name,
      principal: input.principal,
      motto: input.motto,
      location: input.location,
      division: input.division,
      sub_division: input.sub_division,
      city_village: input.city_village,
      address: input.address,
      postal_code: input.postal_code,
      academic_year: input.academic_year,
      active_term: input.active_term,
      locale: input.locale,
      subscription_currency: input.subscription_currency,
      created_at: now,
      updated_at: now,
    });
    const created = getSchool(db) as School;
    enqueueChange(db, 'schools', id, 'insert', created);
    return created;
  }

  db.prepare(
    `UPDATE schools SET
      matricule = @matricule, education_category = @education_category, name = @name, short_name = @short_name, principal = @principal, motto = @motto,
      location = @location, division = @division, sub_division = @sub_division,
      city_village = @city_village, address = @address, postal_code = @postal_code,
      academic_year = @academic_year, active_term = @active_term, locale = @locale,
      subscription_currency = @subscription_currency, updated_at = @updated_at
    WHERE id = @id`
  ).run({
    id: existing.id,
    matricule: input.matricule ?? null,
    education_category: input.education_category ?? existing.education_category,
    name: input.name,
    short_name: input.short_name,
    principal: input.principal,
    motto: input.motto,
    location: input.location,
    division: input.division,
    sub_division: input.sub_division,
    city_village: input.city_village,
    address: input.address,
    postal_code: input.postal_code,
    academic_year: input.academic_year,
    active_term: input.active_term,
    locale: input.locale,
    subscription_currency: input.subscription_currency,
    updated_at: now,
  });

  const updated = getSchool(db) as School;
  enqueueChange(db, 'schools', existing.id, 'update', updated);
  return updated;
}

/**
 * Flips the installer wizard's completion flag (0003 migration) once Step 5
 * finishes. This is the single source of truth src/App.tsx uses to decide
 * whether to show the setup wizard or the normal (now auth-gated) app — see
 * src/setup/setupService.ts's completeSetup.
 */
export function setSetupCompleted(db: Database.Database, schoolId: string): School {
  db.prepare('UPDATE schools SET setup_completed = 1, updated_at = ? WHERE id = ?').run(nowIso(), schoolId);
  const updated = getSchool(db) as School;
  enqueueChange(db, 'schools', schoolId, 'update', updated);
  return updated;
}
