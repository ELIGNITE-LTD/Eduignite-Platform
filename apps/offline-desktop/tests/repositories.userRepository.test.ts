import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { upsertSchool } from '../src/repositories/schoolRepository';
import { createUser, listUsers, setUserStatus, verifyLogin } from '../src/repositories/userRepository';

describe('userRepository', () => {
  let handle: TestDbHandle;
  const SCHOOL_ID = 'SCH-USER';

  beforeEach(() => {
    handle = createTestDb();
    upsertSchool(handle.db, {
      id: SCHOOL_ID,
      name: 'User Test School',
      short_name: 'UTS',
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
  });

  afterEach(() => {
    handle.close();
  });

  it('createUser never returns password_hash to the caller', async () => {
    const user = await createUser(handle.db, {
      school_id: SCHOOL_ID,
      full_name: 'Ada Admin',
      email_or_username: 'ada.admin',
      password: 'a-strong-password-1',
      role: 'SCHOOL_ADMIN',
    });
    expect(user).not.toHaveProperty('password_hash');
    expect(listUsers(handle.db, SCHOOL_ID)[0]).not.toHaveProperty('password_hash');
  });

  it('rejects a duplicate (school_id, email_or_username) pair', async () => {
    await createUser(handle.db, {
      school_id: SCHOOL_ID,
      full_name: 'Ada Admin',
      email_or_username: 'ada.admin',
      password: 'a-strong-password-1',
      role: 'SCHOOL_ADMIN',
    });

    await expect(
      createUser(handle.db, {
        school_id: SCHOOL_ID,
        full_name: 'Someone Else',
        email_or_username: 'ada.admin',
        password: 'another-password-1',
        role: 'TEACHER',
      })
    ).rejects.toThrow(/already exists/);
  });

  it('verifyLogin succeeds only with the correct password and an active account', async () => {
    await createUser(handle.db, {
      school_id: SCHOOL_ID,
      full_name: 'Tariq Teacher',
      email_or_username: 'tariq.teacher',
      password: 'teacher-password-1',
      role: 'TEACHER',
    });

    const ok = await verifyLogin(handle.db, SCHOOL_ID, 'tariq.teacher', 'teacher-password-1');
    expect(ok?.role).toBe('TEACHER');

    const bad = await verifyLogin(handle.db, SCHOOL_ID, 'tariq.teacher', 'wrong-password');
    expect(bad).toBeNull();
  });

  it('setUserStatus disables an account so verifyLogin stops accepting it', async () => {
    const user = await createUser(handle.db, {
      school_id: SCHOOL_ID,
      full_name: 'Tariq Teacher',
      email_or_username: 'tariq.teacher',
      password: 'teacher-password-1',
      role: 'TEACHER',
    });

    setUserStatus(handle.db, user.id, 'disabled');

    expect(await verifyLogin(handle.db, SCHOOL_ID, 'tariq.teacher', 'teacher-password-1')).toBeNull();
  });
});
