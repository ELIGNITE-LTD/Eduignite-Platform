import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { Notice } from '../shared/types';
import { enqueueChange } from './syncQueueRepository';

// Login-screen notice board (schema landed in Phase A; full Settings-area
// authoring UI is Phase B/C per the build contract — this repository is the
// complete data layer the login screen and that later UI both need).

export type NoticeInput = Pick<Notice, 'school_id' | 'title' | 'body' | 'published_by'>;

export function listPublishedNotices(db: Database.Database, schoolId: string): Notice[] {
  return db
    .prepare(
      'SELECT * FROM notices WHERE school_id = ? AND is_published = 1 ORDER BY created_at DESC'
    )
    .all(schoolId) as Notice[];
}

export function listAllNotices(db: Database.Database, schoolId: string): Notice[] {
  return db
    .prepare('SELECT * FROM notices WHERE school_id = ? ORDER BY created_at DESC')
    .all(schoolId) as Notice[];
}

export function getNotice(db: Database.Database, id: string): Notice | null {
  const row = db.prepare('SELECT * FROM notices WHERE id = ?').get(id) as Notice | undefined;
  return row ?? null;
}

export function createNotice(db: Database.Database, input: NoticeInput): Notice {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO notices (id, school_id, title, body, published_by, is_published, created_at, updated_at)
     VALUES (@id, @school_id, @title, @body, @published_by, 0, @created_at, @updated_at)`
  ).run({ id, ...input, created_at: now, updated_at: now });
  const created = getNotice(db, id) as Notice;
  enqueueChange(db, 'notices', id, 'insert', created);
  return created;
}

export function setNoticePublished(db: Database.Database, id: string, isPublished: boolean): Notice {
  const existing = getNotice(db, id);
  if (!existing) throw new Error(`Notice ${id} not found.`);
  db.prepare('UPDATE notices SET is_published = ?, updated_at = ? WHERE id = ?').run(
    isPublished ? 1 : 0,
    nowIso(),
    id
  );
  const updated = getNotice(db, id) as Notice;
  enqueueChange(db, 'notices', id, 'update', updated);
  return updated;
}
