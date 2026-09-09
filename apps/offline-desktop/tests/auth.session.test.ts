import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { getCurrentSession, login, logout, setSessionForTesting } from '../src/auth/session';
import { upsertSchool } from '../src/repositories/schoolRepository';
import { createUser } from '../src/repositories/userRepository';

describe('login', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
    setSessionForTesting(null);
  });

  afterEach(() => {
    handle.close();
    setSessionForTesting(null);
  });

  it('throws a clear error when the installation has not been set up yet', async () => {
    await expect(login(handle.db, 'someone', 'password123')).rejects.toThrow(/not been set up/i);
  });

  async function seedSchoolAndAdmin() {
    const school = upsertSchool(handle.db, {
      id: 'SCH-TEST',
      name: 'Test School',
      short_name: 'TS',
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
    await createUser(handle.db, {
      school_id: school.id,
      full_name: 'Ada Admin',
      email_or_username: 'ada.admin',
      password: 'correct-password-1',
      role: 'SCHOOL_ADMIN',
    });
    return school;
  }

  it('accepts a correct username/password and returns a session', async () => {
    await seedSchoolAndAdmin();

    const session = await login(handle.db, 'ada.admin', 'correct-password-1');

    expect(session.role).toBe('SCHOOL_ADMIN');
    expect(session.fullName).toBe('Ada Admin');
    expect(session.schoolId).toBe('SCH-TEST');
    // login() also sets the module-level "current session" for the IPC layer to read.
    expect(getCurrentSession()).toEqual(session);
  });

  it('rejects a wrong password with a generic (anti-enumeration) message', async () => {
    await seedSchoolAndAdmin();

    await expect(login(handle.db, 'ada.admin', 'totally-wrong-password')).rejects.toThrow(
      /incorrect username\/matricule or password/i
    );
    expect(getCurrentSession()).toBeNull();
  });

  it('rejects an unknown username with the SAME message as a wrong password (no enumeration)', async () => {
    await seedSchoolAndAdmin();

    await expect(login(handle.db, 'nobody-registered', 'whatever-password')).rejects.toThrow(
      /incorrect username\/matricule or password/i
    );
  });

  it('rejects login for a disabled account', async () => {
    const school = await seedSchoolAndAdmin();
    const disabled = await createUser(handle.db, {
      school_id: school.id,
      full_name: 'Disabled Staffer',
      email_or_username: 'disabled.staffer',
      password: 'some-password-1',
      role: 'TEACHER',
    });
    handle.db.prepare('UPDATE users SET status = ? WHERE id = ?').run('disabled', disabled.id);

    await expect(login(handle.db, 'disabled.staffer', 'some-password-1')).rejects.toThrow(
      /incorrect username\/matricule or password/i
    );
  });

  it('logout() clears the current session', async () => {
    await seedSchoolAndAdmin();
    await login(handle.db, 'ada.admin', 'correct-password-1');
    expect(getCurrentSession()).not.toBeNull();

    logout();
    expect(getCurrentSession()).toBeNull();
  });
});
