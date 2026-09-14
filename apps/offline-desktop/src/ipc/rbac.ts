import type Database from 'better-sqlite3-multiple-ciphers';
import { getCurrentSession, type SessionUser } from '../auth/session';
import { FULL_ACCESS_ROLES, type UserRoleValue } from '../shared/roles';
import { isTeacherAssignedToStream } from '../repositories/teacherScopeRepository';

// RBAC wrappers for ipcMain.handle channels (Phase A #3). These compose with
// the existing licensing gate wrapper (`registerWrite` in src/ipc/handlers.ts)
// instead of duplicating or replacing it — a handler that needs BOTH the
// license-write-gate and a role check gets wrapped by both, e.g.:
//
//   registerWrite('finance:createFeeTemplate', requireRole(['SCHOOL_ADMIN'])(handler))
//
// Order matters only in that requireRole should be the innermost wrapper
// around the raw handler and registerWrite the outermost, so an
// unauthenticated/wrong-role call fails with the RBAC error rather than
// first being told the app is read-only — but either order is safe
// functionally since both simply throw to reject the IPC call.

export type IpcHandler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown;

/** Throws unless a session is currently logged in. Wrap with this alone for "any authenticated staff member". */
export function requireAuth(handler: IpcHandler): IpcHandler {
  return (event, ...args) => {
    const session = getCurrentSession();
    if (!session) {
      throw new Error('Not authenticated. Please log in.');
    }
    return handler(event, ...args);
  };
}

/**
 * Throws unless a session is logged in AND its role is one of `allowedRoles`.
 * Exported separately from `requireAuth` (rather than only ever composed)
 * because a handler test wants to unit-test the role check on its own
 * without needing a real IPC/Electron runtime — see
 * tests/ipc.rbac.test.ts.
 */
export function requireRole(allowedRoles: readonly UserRoleValue[]) {
  return (handler: IpcHandler): IpcHandler =>
    (event, ...args) => {
      const session = getCurrentSession();
      if (!session) {
        throw new Error('Not authenticated. Please log in.');
      }
      if (!allowedRoles.includes(session.role)) {
        throw new Error(
          `Forbidden: this action requires role ${allowedRoles.join(' or ')}, but the current user is ${session.role}.`
        );
      }
      return handler(event, ...args);
    };
}

/** Exposed for handlers that need the session itself (e.g. to scope a query to the acting teacher). */
export function requireSession(): SessionUser {
  const session = getCurrentSession();
  if (!session) throw new Error('Not authenticated. Please log in.');
  return session;
}

/**
 * Throws unless the current session may act on `classStreamId`: full-access
 * roles (SCHOOL_ADMIN/SUB_ADMIN) always may; a TEACHER may only if
 * teacherScopeRepository says they're assigned to that stream (homeroom or
 * subject-teacher). Used to scope attendance/academics/report-card writes so
 * a teacher account can't record marks for a class they don't teach.
 */
export function requireStreamAccess(db: Database.Database, classStreamId: string): SessionUser {
  const session = requireSession();
  if (FULL_ACCESS_ROLES.includes(session.role)) return session;
  if (session.role === 'TEACHER' && session.teacherId && isTeacherAssignedToStream(db, session.teacherId, classStreamId)) {
    return session;
  }
  throw new Error('Forbidden: you are not assigned to this class stream.');
}
