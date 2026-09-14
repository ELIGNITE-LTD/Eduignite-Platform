import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { completeSetup, confirmSchoolShell, createFirstAdmin } from '../src/setup/setupService';
import { getSchool, upsertSchool } from '../src/repositories/schoolRepository';
import { verifyLogin } from '../src/repositories/userRepository';
import type { SchoolSearchResult } from '../src/setup/setupClient';

const REAL_CLOUD_SCHOOL: SchoolSearchResult = {
  id: 'GBHS-D',
  name: 'Government Bilingual High School Douala',
  shortName: 'GBHS Douala',
  matricule: 'GBHS0125',
  region_or_town: 'Littoral',
};

describe('confirmSchoolShell — schools.id regression guard', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.close();
  });

  /**
   * This is the regression test the build contract calls out explicitly:
   * before the installer wizard existed, the ONLY way anything ever wrote a
   * `schools` row was schoolRepository.upsertSchool() called with no `id`
   * (see the old SchoolProfilePage flow, still exercised by the second test
   * below), which falls back to `newId()` -- a random local UUID that the
   * cloud backend (`ChallengeRedeemView`, keyed on the real human-assigned
   * School.id like "GBHS-D") would never recognize, so the very first real
   * licensing challenge against production would 404.
   *
   * confirmSchoolShell is the fix: it is the ONE place in the whole app that
   * threads a real, externally-supplied cloud id into upsertSchool. This
   * test asserts the local row ends up keyed EXACTLY on that real id, not a
   * generated one.
   */
  it('writes the REAL cloud School.id into schools.id, not a randomly generated local UUID', () => {
    const created = confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);

    expect(created.id).toBe('GBHS-D');
    expect(getSchool(handle.db)!.id).toBe('GBHS-D');
  });

  /**
   * Proves the above is a genuine regression guard: exercising the
   * pre-wizard code path (upsertSchool with no id, exactly as the old
   * unauthenticated SchoolProfilePage flow always called it) demonstrably
   * does NOT produce the real cloud id -- so this test would have failed
   * (or rather, could never have passed) against the pre-existing code,
   * because there was no code path that even accepted an external id.
   */
  it('demonstrates the bug: the pre-wizard upsertSchool(no id) path never produces the real cloud id', () => {
    const created = upsertSchool(handle.db, {
      name: REAL_CLOUD_SCHOOL.name,
      short_name: REAL_CLOUD_SCHOOL.shortName,
      principal: '',
      motto: '',
      location: '',
      division: '',
      sub_division: '',
      city_village: '',
      address: '',
      postal_code: null,
      academic_year: '2026-2027',
      active_term: 'TERM_1',
      locale: 'en',
      subscription_currency: 'XAF',
    });

    expect(created.id).not.toBe('GBHS-D');
    // A UUID v4, not a human-assigned matricule-shaped PK.
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  /**
   * Regression guard for the matricule wiring gap: `confirmSchoolShell`
   * previously only used `result.matricule` as a `short_name` fallback and
   * silently dropped the actual value, leaving `schools.matricule` (0004
   * migration) permanently null on every real installation -- with nothing
   * for src/domain/matricules.ts's generateSchoolUserMatricule to build
   * staff matricules from. This asserts the real cloud matricule actually
   * lands in the local row.
   */
  it('writes the REAL cloud school matricule into schools.matricule, not just as a short_name fallback', () => {
    const created = confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);

    expect(created.matricule).toBe('GBHS0125');
    expect(getSchool(handle.db)!.matricule).toBe('GBHS0125');
  });

  it('is idempotent when re-confirming the same school (navigating back/forward in the wizard)', () => {
    const first = confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);
    const second = confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);
    expect(second.id).toBe(first.id);
    expect(getSchool(handle.db)!.id).toBe('GBHS-D');
  });

  it('replaces the shell row if the wizard operator picks a different school before setup completes', () => {
    confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);
    const different: SchoolSearchResult = {
      id: 'LYC-BAF',
      name: 'Lycee Bilingue de Bafoussam',
      shortName: 'LBB',
      matricule: null,
      region_or_town: 'Ouest',
    };
    const replaced = confirmSchoolShell(handle.db, different);

    expect(replaced.id).toBe('LYC-BAF');
    expect(getSchool(handle.db)!.id).toBe('LYC-BAF');
  });

  it('refuses to re-confirm a different school once setup is already complete', async () => {
    confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);
    await createFirstAdmin(handle.db, {
      fullName: 'Ada Admin',
      emailOrUsername: 'ada.admin',
      password: 'a-strong-password-1',
      securityQuestion: 'First school?',
      securityAnswer: 'Test Academy',
    });
    completeSetup(handle.db);

    expect(() => confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL)).toThrow(/already set up/);
  });
});

describe('createFirstAdmin', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.close();
  });

  it('throws if no school has been confirmed yet', async () => {
    await expect(
      createFirstAdmin(handle.db, {
        fullName: 'Ada Admin',
        emailOrUsername: 'ada.admin',
        password: 'a-strong-password-1',
        securityQuestion: 'First school?',
        securityAnswer: 'Test Academy',
      })
    ).rejects.toThrow(/confirm your school/i);
  });

  it('creates a SCHOOL_ADMIN account scoped to the confirmed school, regardless of any other role requested', async () => {
    confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);

    const admin = await createFirstAdmin(handle.db, {
      fullName: 'Ada Admin',
      emailOrUsername: 'ada.admin',
      password: 'a-strong-password-1',
      securityQuestion: 'First school?',
      securityAnswer: 'Test Academy',
    });

    expect(admin.role).toBe('SCHOOL_ADMIN');
    expect(admin.school_id).toBe('GBHS-D');

    const verified = await verifyLogin(handle.db, 'GBHS-D', 'ada.admin', 'a-strong-password-1');
    expect(verified?.id).toBe(admin.id);
  });

  /**
   * Regression guard for the matricule wiring gap: nothing ever called
   * generateSchoolUserMatricule, so the wizard's own first admin account
   * always had matricule = null. Per SCHOOL_ADMIN's special case (see
   * src/domain/matricules.ts), the admin's matricule must equal the
   * school's own matricule verbatim -- no role suffix, no counter.
   */
  it("sets the first admin's matricule to the school's own matricule verbatim (SCHOOL_ADMIN special case)", async () => {
    confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);

    const admin = await createFirstAdmin(handle.db, {
      fullName: 'Ada Admin',
      emailOrUsername: 'ada.admin',
      password: 'a-strong-password-1',
      securityQuestion: 'First school?',
      securityAnswer: 'Test Academy',
    });

    expect(admin.matricule).toBe('GBHS0125');
  });

  it('leaves the matricule null (rather than throwing) if the confirmed school has none yet', async () => {
    confirmSchoolShell(handle.db, {
      id: 'LYC-BAF',
      name: 'Lycee Bilingue de Bafoussam',
      shortName: 'LBB',
      matricule: null,
      region_or_town: 'Ouest',
    });

    const admin = await createFirstAdmin(handle.db, {
      fullName: 'Ada Admin',
      emailOrUsername: 'ada.admin',
      password: 'a-strong-password-1',
      securityQuestion: 'First school?',
      securityAnswer: 'Test Academy',
    });

    expect(admin.matricule).toBeNull();
  });
});

describe('completeSetup', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.close();
  });

  it('throws if no school has been confirmed yet', () => {
    expect(() => completeSetup(handle.db)).toThrow(/no school configured/i);
  });

  it('flips setup_completed to 1 on the confirmed school', () => {
    confirmSchoolShell(handle.db, REAL_CLOUD_SCHOOL);
    expect(getSchool(handle.db)!.setup_completed).toBe(0);

    const completed = completeSetup(handle.db);

    expect(completed.setup_completed).toBe(1);
    expect(getSchool(handle.db)!.setup_completed).toBe(1);
  });
});
