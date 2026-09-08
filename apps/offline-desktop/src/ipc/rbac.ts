import { getCurrentSession, type SessionUser } from '../auth/session';
import type { UserRoleValue } from '../shared/roles';

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
export function requireRole(allowedRoles: UserRoleValue[]) {
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
