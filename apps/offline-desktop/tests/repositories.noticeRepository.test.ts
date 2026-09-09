import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { upsertSchool } from '../src/repositories/schoolRepository';
import { createNotice, listAllNotices, listPublishedNotices, setNoticePublished } from '../src/repositories/noticeRepository';

describe('noticeRepository', () => {
  let handle: TestDbHandle;
  const SCHOOL_ID = 'SCH-NOTICE';

  beforeEach(() => {
    handle = createTestDb();
    upsertSchool(handle.db, {
      id: SCHOOL_ID,
      name: 'Notice Test School',
      short_name: 'NTS',
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

  it('a newly created notice is unpublished by default and does not appear in the login-screen (published) list', () => {
    const notice = createNotice(handle.db, {
      school_id: SCHOOL_ID,
      title: 'Staff meeting Friday',
      body: 'All staff please attend the 3pm meeting.',
      published_by: null,
    });

    expect(notice.is_published).toBe(0);
    expect(listPublishedNotices(handle.db, SCHOOL_ID)).toHaveLength(0);
    expect(listAllNotices(handle.db, SCHOOL_ID)).toHaveLength(1);
  });

  it('setNoticePublished flips a notice into the published list and back out', () => {
    const notice = createNotice(handle.db, {
      school_id: SCHOOL_ID,
      title: 'Term dates',
      body: 'Term 2 begins next Monday.',
      published_by: null,
    });

    setNoticePublished(handle.db, notice.id, true);
    expect(listPublishedNotices(handle.db, SCHOOL_ID).map((n) => n.id)).toEqual([notice.id]);

    setNoticePublished(handle.db, notice.id, false);
    expect(listPublishedNotices(handle.db, SCHOOL_ID)).toHaveLength(0);
  });

  it('setNoticePublished throws for an unknown notice id', () => {
    expect(() => setNoticePublished(handle.db, 'does-not-exist', true)).toThrow(/not found/);
  });
});
