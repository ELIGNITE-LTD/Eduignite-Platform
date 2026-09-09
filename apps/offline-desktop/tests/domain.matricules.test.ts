import { describe, expect, it } from 'vitest';
import {
  generateSchoolUserMatricule,
  schoolUserIdWidth,
  schoolUserMatriculePrefix,
  schoolUserRoleCode,
} from '../src/domain/matricules';

describe('generateSchoolUserMatricule — format parity with backend/apps/users/matricules.py', () => {
  it('matches the worked example from the Python source: GBHS0126 + TEACHER + no existing -> GBHS0126TE001', () => {
    // Hand-computed from generate_school_user_matricule / school_user_role_code /
    // school_user_id_width: prefix = 'GBHS0126' + 'TE' = 'GBHS0126TE', width = 3
    // (TEACHER is not in HIGH_VOLUME_SCHOOL_ROLES), counter = max([], default=0) + 1 = 1.
    expect(generateSchoolUserMatricule('GBHS0126', 'TEACHER', [])).toBe('GBHS0126TE001');
  });

  it('produces the documented role code for every school-scoped role', () => {
    expect(schoolUserRoleCode('SUB_ADMIN')).toBe('SA');
    expect(schoolUserRoleCode('BURSAR')).toBe('BU');
    expect(schoolUserRoleCode('LIBRARIAN')).toBe('LB');
    expect(schoolUserRoleCode('TEACHER')).toBe('TE');
    expect(schoolUserRoleCode('STUDENT')).toBe('ST');
    expect(schoolUserRoleCode('PARENT')).toBe('PA');
  });

  it('increments the counter based on the highest existing numeric suffix for that exact prefix', () => {
    expect(
      generateSchoolUserMatricule('GBHS0126', 'TEACHER', ['GBHS0126TE001', 'GBHS0126TE002'])
    ).toBe('GBHS0126TE003');

    // Order in the input array must not matter — only the max suffix does.
    expect(
      generateSchoolUserMatricule('GBHS0126', 'TEACHER', ['GBHS0126TE005', 'GBHS0126TE002', 'GBHS0126TE004'])
    ).toBe('GBHS0126TE006');
  });

  it('ignores matricules that do not match this exact prefix (different role or different school)', () => {
    expect(
      generateSchoolUserMatricule('GBHS0126', 'TEACHER', [
        'GBHS0126BU009', // different role code, same school
        'LYBAM0227TE009', // different school, same role code
        'GBHS0126TEACHER', // no trailing digits at all — must not match
      ])
    ).toBe('GBHS0126TE001');
  });

  it('uses a 4-digit counter for the high-volume roles (STUDENT, PARENT) and 3 digits for every other role', () => {
    expect(schoolUserIdWidth('STUDENT')).toBe(4);
    expect(schoolUserIdWidth('PARENT')).toBe(4);
    expect(schoolUserIdWidth('TEACHER')).toBe(3);
    expect(schoolUserIdWidth('SUB_ADMIN')).toBe(3);
    expect(schoolUserIdWidth('BURSAR')).toBe(3);
    expect(schoolUserIdWidth('LIBRARIAN')).toBe(3);

    expect(generateSchoolUserMatricule('GBHS0126', 'STUDENT', [])).toBe('GBHS0126ST0001');
    expect(generateSchoolUserMatricule('GBHS0126', 'PARENT', [])).toBe('GBHS0126PA0001');
    expect(generateSchoolUserMatricule('GBHS0126', 'BURSAR', [])).toBe('GBHS0126BU001');
    expect(generateSchoolUserMatricule('GBHS0126', 'LIBRARIAN', [])).toBe('GBHS0126LB001');
    expect(generateSchoolUserMatricule('GBHS0126', 'SUB_ADMIN', [])).toBe('GBHS0126SA001');
  });

  it('rolls a 3-digit counter over into a 4th digit rather than truncating (matches Python f-string padding, which never truncates)', () => {
    expect(generateSchoolUserMatricule('GBHS0126', 'TEACHER', ['GBHS0126TE999'])).toBe('GBHS0126TE1000');
  });

  it('the SCHOOL_ADMIN special case returns the school matricule verbatim — no role code, no counter suffix', () => {
    expect(generateSchoolUserMatricule('GBHS0126', 'SCHOOL_ADMIN', [])).toBe('GBHS0126');
    // Existing matricules with any prefix must be completely ignored for this role.
    expect(generateSchoolUserMatricule('GBHS0126', 'SCHOOL_ADMIN', ['GBHS0126SA001', 'GBHS0126TE001'])).toBe(
      'GBHS0126'
    );
  });

  it('throws when schoolMatricule is missing, since nothing offline may invent one', () => {
    expect(() => generateSchoolUserMatricule('', 'TEACHER', [])).toThrow();
    expect(() => generateSchoolUserMatricule('', 'SCHOOL_ADMIN', [])).toThrow();
  });
});

describe('schoolUserMatriculePrefix', () => {
  it('builds the {schoolMatricule}{ROLE_CODE} prefix a repository should query by', () => {
    expect(schoolUserMatriculePrefix('GBHS0126', 'TEACHER')).toBe('GBHS0126TE');
    expect(schoolUserMatriculePrefix('GBHS0126', 'STUDENT')).toBe('GBHS0126ST');
  });

  it('throws when schoolMatricule is missing', () => {
    expect(() => schoolUserMatriculePrefix('', 'TEACHER')).toThrow();
  });
});
