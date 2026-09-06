import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { School } from '../shared/types';
import { enqueueChange } from './syncQueueRepository';

// School Profile Management (spec module 1). The desktop app manages exactly
// one school per installation, so `schools` is a single-row config table —
// getSchool() returns that row (or null before first-run setup) and
// upsertSchool() creates it on first save, updating in place afterwards.

export type SchoolInput = Omit<School, 'id' | 'created_at' | 'updated_at'> & { id?: string };

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
        id, name, short_name, principal, motto, location, division, sub_division,
        city_village, address, postal_code, academic_year, active_term, locale,
        subscription_currency, created_at, updated_at
      ) VALUES (@id, @name, @short_name, @principal, @motto, @location, @division, @sub_division,
        @city_village, @address, @postal_code, @academic_year, @active_term, @locale,
        @subscription_currency, @created_at, @updated_at)`
    ).run({
      id,
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
      name = @name, short_name = @short_name, principal = @principal, motto = @motto,
      location = @location, division = @division, sub_division = @sub_division,
      city_village = @city_village, address = @address, postal_code = @postal_code,
      academic_year = @academic_year, active_term = @active_term, locale = @locale,
      subscription_currency = @subscription_currency, updated_at = @updated_at
    WHERE id = @id`
  ).run({
    id: existing.id,
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
