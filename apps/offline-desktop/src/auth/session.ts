import type Database from 'better-sqlite3-multiple-ciphers';
import { getSchool } from '../repositories/schoolRepository';
import { verifyLogin } from '../repositories/userRepository';
import type { PublicUser } from '../shared/types';
import type { UserRoleValue } from '../shared/roles';

// Session concept for the Electron app (Phase A #3). Deliberately the
// simplest safe approach the contract allows: a single in-memory
// "currently logged in user" held in the MAIN process (this module-level
// variable), never persisted to a plain file or localStorage. The app is a
// single-window, single-school-per-installation desktop app, so one process-
// wide session is enough — every subsequent IPC call re-reads this value
// (see src/ipc/rbac.ts) rather than trusting anything the renderer sends.
//
// This is intentionally NOT a token: there is nothing for the renderer to
// hold, forge, or replay. Closing the app (or calling auth:logout) clears it.

export interface SessionUser {
  userId: string;
  schoolId: string;
  role: UserRoleValue;
  fullName: string;
  teacherId: string | null;
}

let currentSession: SessionUser | null = null;

function toSessionUser(user: PublicUser): SessionUser {
  return {
    userId: user.id,
    schoolId: user.school_id,
    role: user.role,
    fullName: user.full_name,
    teacherId: user.teacher_id,
  };
}

/**
 * Attempts a login for the school configured on this installation (there is
 * only ever one — see schoolRepository). Returns the session on success,
 * throws a user-safe error message otherwise. Does not distinguish "unknown
 * user" from "wrong password" in the thrown message, matching
 * userRepository.verifyLogin's anti-enumeration behavior.
 */
export async function login(
  db: Database.Database,
  emailOrUsername: string,
  password: string
): Promise<SessionUser> {
  const school = getSchool(db);
  if (!school) {
    throw new Error('This installation has not been set up yet.');
  }

  const user = await verifyLogin(db, school.id, emailOrUsername, password);
  if (!user) {
    throw new Error('Incorrect username/matricule or password.');
  }

  currentSession = toSessionUser(user);
  return currentSession;
}

export function logout(): void {
  currentSession = null;
}

export function getCurrentSession(): SessionUser | null {
  return currentSession;
}

/** Test-only escape hatch — mirrors the pattern used by licensing/fingerprint.ts's setMarkerFilePathForTesting. */
export function setSessionForTesting(session: SessionUser | null): void {
  currentSession = session;
}
