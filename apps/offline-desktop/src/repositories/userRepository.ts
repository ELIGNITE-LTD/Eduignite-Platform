import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { PublicUser, UserRow } from '../shared/types';
import type { UserRoleValue } from '../shared/roles';
import { hashPassword, hashSecurityAnswer, verifyPassword, verifySecurityAnswer } from '../domain/passwords';
import { enqueueChange } from './syncQueueRepository';

// Staff accounts (auth) — Phase A #3. `teachers` (0001) stays records-only;
// this table is the actual login identity. Every function here that returns
// a user to a caller outside this file strips `password_hash` (see
// `toPublicUser`) — the raw row (with the hash) never leaves this module
// except inside `verifyLogin`'s internal lookup.

function toPublicUser(row: UserRow): PublicUser {
  const { password_hash: _password_hash, security_answer_hash: _security_answer_hash, ...rest } = row;
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

export function getUserRowByLogin(db: Database.Database, schoolId: string, emailOrUsername: string): UserRow | null {
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
  /** Both required together for this account to ever be recoverable — see getSecurityQuestion/resetPasswordWithSecurityAnswer. */
  security_question?: string | null;
  security_answer?: string | null;
}

/**
 * Creates a new staff login account. Used by the installer wizard's Step 4
 * (first SCHOOL_ADMIN) and by the Staff Settings page (SCHOOL_ADMIN only) to
 * create additional TEACHER/SUB_ADMIN/BURSAR/LIBRARIAN logins. Throws on a
 * duplicate (school_id, email_or_username) pair (unique index) or a weak
 * password.
 */
export async function createUser(db: Database.Database, input: CreateUserInput): Promise<PublicUser> {
  const existing = getUserRowByLogin(db, input.school_id, input.email_or_username);
  if (existing) {
    throw new Error(`An account with username/email "${input.email_or_username}" already exists at this school.`);
  }

  const passwordHash = await hashPassword(input.password);
  const securityAnswerHash = input.security_answer ? await hashSecurityAnswer(input.security_answer) : null;
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, school_id, teacher_id, matricule, full_name, email_or_username, password_hash, role, status, security_question, security_answer_hash, created_at, updated_at)
     VALUES (@id, @school_id, @teacher_id, @matricule, @full_name, @email_or_username, @password_hash, @role, 'active', @security_question, @security_answer_hash, @created_at, @updated_at)`
  ).run({
    id,
    school_id: input.school_id,
    teacher_id: input.teacher_id ?? null,
    matricule: input.matricule ?? null,
    full_name: input.full_name,
    email_or_username: input.email_or_username,
    password_hash: passwordHash,
    role: input.role,
    security_question: input.security_question || null,
    security_answer_hash: securityAnswerHash,
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

// -- Password recovery (security question) -----------------------------
// Anti-enumeration + brute-force throttling, mirroring verifyLogin's own
// "never say which part was wrong" stance above. A lockout is per-account
// (failed_recovery_attempts/recovery_locked_until on the users row, added by
// migration 0005), not global, so one locked-out account can't be used to
// deny recovery to every other account at the school.

const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_LOCKOUT_MINUTES = 15;

/** Shown for an account that has no recovery question configured, so its absence can't be distinguished from a wrong username. */
const FALLBACK_SECURITY_QUESTION = 'What is the name of the first school you attended?';

export interface RecoveryQuestionResult {
  /** False for an unknown account OR one with no security question set — both render identically in the UI. */
  available: boolean;
  question: string;
}

export function getSecurityQuestion(
  db: Database.Database,
  schoolId: string,
  emailOrUsername: string
): RecoveryQuestionResult {
  const row = getUserRowByLogin(db, schoolId, emailOrUsername);
  if (!row || row.status !== 'active' || !row.security_question || !row.security_answer_hash) {
    return { available: false, question: FALLBACK_SECURITY_QUESTION };
  }
  return { available: true, question: row.security_question };
}

function isLocked(row: UserRow): boolean {
  return !!row.recovery_locked_until && new Date(row.recovery_locked_until).getTime() > Date.now();
}

/**
 * Verifies the security answer and, on success, sets a new password.
 * Throws the same generic message for an unknown account, a missing
 * question, or a wrong answer — never revealing which. Throws a distinct
 * (still generic) lockout message once MAX_RECOVERY_ATTEMPTS is exceeded,
 * clearing the counter on any successful reset.
 */
export async function resetPasswordWithSecurityAnswer(
  db: Database.Database,
  schoolId: string,
  emailOrUsername: string,
  securityAnswer: string,
  newPassword: string
): Promise<void> {
  const genericError = () => new Error('Incorrect account details or security answer.');

  const row = getUserRowByLogin(db, schoolId, emailOrUsername);
  if (!row || row.status !== 'active' || !row.security_question || !row.security_answer_hash) {
    throw genericError();
  }
  if (isLocked(row)) {
    throw new Error('Too many recovery attempts for this account. Please try again in a few minutes.');
  }

  const ok = await verifySecurityAnswer(securityAnswer, row.security_answer_hash);
  if (!ok) {
    const attempts = row.failed_recovery_attempts + 1;
    const lockedUntil =
      attempts >= MAX_RECOVERY_ATTEMPTS
        ? new Date(Date.now() + RECOVERY_LOCKOUT_MINUTES * 60_000).toISOString()
        : null;
    db.prepare('UPDATE users SET failed_recovery_attempts = ?, recovery_locked_until = ? WHERE id = ?').run(
      attempts,
      lockedUntil,
      row.id
    );
    throw lockedUntil ? new Error('Too many recovery attempts for this account. Please try again in a few minutes.') : genericError();
  }

  const passwordHash = await hashPassword(newPassword);
  db.prepare(
    'UPDATE users SET password_hash = ?, failed_recovery_attempts = 0, recovery_locked_until = NULL, updated_at = ? WHERE id = ?'
  ).run(passwordHash, nowIso(), row.id);
  enqueueChange(db, 'users', row.id, 'update', toPublicUser(getUserRowById(db, row.id) as UserRow));
}
