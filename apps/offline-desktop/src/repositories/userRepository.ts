import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { PublicUser, UserRow } from '../shared/types';
import type { UserRoleValue } from '../shared/roles';
import { hashPassword, verifyPassword } from '../domain/passwords';
import { enqueueChange } from './syncQueueRepository';

// Staff accounts (auth) — Phase A #3. `teachers` (0001) stays records-only;
// this table is the actual login identity. Every function here that returns
// a user to a caller outside this file strips `password_hash` (see
// `toPublicUser`) — the raw row (with the hash) never leaves this module
// except inside `verifyLogin`'s internal lookup.

function toPublicUser(row: UserRow): PublicUser {
  const { password_hash: _password_hash, ...rest } = row;
  return rest;
}

export function getUserRowById(db: Database.Database, id: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ?? null;
}

export function getUserById(db: Database.Database, id: string): PublicUser | null {
  const row = getUserRowById(db, id);
  return row ? toPublicUser(row) : null;
}

function getUserRowByLogin(db: Database.Database, schoolId: string, emailOrUsername: string): UserRow | null {
  const row = db
    .prepare('SELECT * FROM users WHERE school_id = ? AND email_or_username = ?')
    .get(schoolId, emailOrUsername) as UserRow | undefined;
  return row ?? null;
}

export function listUsers(db: Database.Database, schoolId: string): PublicUser[] {
  return (
    db.prepare('SELECT * FROM users WHERE school_id = ? ORDER BY full_name').all(schoolId) as UserRow[]
  ).map(toPublicUser);
}

export interface CreateUserInput {
  school_id: string;
  teacher_id?: string | null;
  matricule?: string | null;
  full_name: string;
  email_or_username: string;
  password: string;
  role: UserRoleValue;
}

/**
 * Creates a new staff login account. Used by the installer wizard's Step 4
 * (first SCHOOL_ADMIN) and, later, the Settings-area staff management UI
 * (Phase B/C, not built yet — create additional staff via this function
 * directly until that UI exists). Throws on a duplicate
 * (school_id, email_or_username) pair (unique index) or a weak password.
 */
export async function createUser(db: Database.Database, input: CreateUserInput): Promise<PublicUser> {
  const existing = getUserRowByLogin(db, input.school_id, input.email_or_username);
  if (existing) {
    throw new Error(`An account with username/email "${input.email_or_username}" already exists at this school.`);
  }

  const passwordHash = await hashPassword(input.password);
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, school_id, teacher_id, matricule, full_name, email_or_username, password_hash, role, status, created_at, updated_at)
     VALUES (@id, @school_id, @teacher_id, @matricule, @full_name, @email_or_username, @password_hash, @role, 'active', @created_at, @updated_at)`
  ).run({
    id,
    school_id: input.school_id,
    teacher_id: input.teacher_id ?? null,
    matricule: input.matricule ?? null,
    full_name: input.full_name,
    email_or_username: input.email_or_username,
    password_hash: passwordHash,
    role: input.role,
    created_at: now,
    updated_at: now,
  });

  const created = getUserRowById(db, id) as UserRow;
  enqueueChange(db, 'users', id, 'insert', toPublicUser(created));
  return toPublicUser(created);
}

export function setUserStatus(db: Database.Database, id: string, status: 'active' | 'disabled'): PublicUser {
  const existing = getUserRowById(db, id);
  if (!existing) throw new Error(`User ${id} not found.`);
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
  const updated = getUserRowById(db, id) as UserRow;
  enqueueChange(db, 'users', id, 'update', toPublicUser(updated));
  return toPublicUser(updated);
}

/**
 * Verifies matricule/email + password against the stored hash. Returns the
 * public user on success, or null on ANY failure (unknown username, wrong
 * password, disabled account) — deliberately not distinguishing which, so
 * the login screen can't be used to enumerate valid usernames.
 */
export async function verifyLogin(
  db: Database.Database,
  schoolId: string,
  emailOrUsername: string,
  password: string
): Promise<PublicUser | null> {
  const row = getUserRowByLogin(db, schoolId, emailOrUsername);
  if (!row) return null;
  if (row.status !== 'active') return null;

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;

  return toPublicUser(row);
}
