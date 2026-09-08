import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAuth, requireRole, requireSession } from '../src/ipc/rbac';
import { setSessionForTesting, type SessionUser } from '../src/auth/session';

// Unit tests for the RBAC IPC wrapper (Phase A #3) in complete isolation
// from Electron/IPC -- exactly what src/ipc/rbac.ts's own header comment
// says this file is for. No real ipcMain/db involved: these call the plain
// functions the wrapper produces directly.

const ADMIN: SessionUser = {
  userId: 'u-admin',
  schoolId: 'SCH-1',
  role: 'SCHOOL_ADMIN',
  fullName: 'Ada Admin',
  teacherId: null,
};

const TEACHER: SessionUser = {
  userId: 'u-teacher',
  schoolId: 'SCH-1',
  role: 'TEACHER',
  fullName: 'Tariq Teacher',
  teacherId: 't-1',
};

afterEach(() => {
  setSessionForTesting(null);
});

describe('requireAuth', () => {
  it('rejects when nobody is logged in', () => {
    setSessionForTesting(null);
    const handler = requireAuth(vi.fn());
    expect(() => handler({} as any)).toThrow(/not authenticated/i);
  });

  it('calls through to the wrapped handler for any logged-in role', () => {
    setSessionForTesting(TEACHER);
    const inner = vi.fn(() => 'ok');
    const handler = requireAuth(inner);
    expect(handler({} as any, 'arg1')).toBe('ok');
    expect(inner).toHaveBeenCalledWith({}, 'arg1');
  });
});

describe('requireRole', () => {
  it('rejects an unauthenticated call', () => {
    setSessionForTesting(null);
    const handler = requireRole(['SCHOOL_ADMIN'])(vi.fn());
    expect(() => handler({} as any)).toThrow(/not authenticated/i);
  });

  it('rejects a call from a session whose role is not in the allowed list (the actual RBAC block)', () => {
    setSessionForTesting(TEACHER);
    const inner = vi.fn();
    const handler = requireRole(['SCHOOL_ADMIN'])(inner);
    expect(() => handler({} as any)).toThrow(/forbidden/i);
    expect(() => handler({} as any)).toThrow(/TEACHER/);
    expect(inner).not.toHaveBeenCalled();
  });

  it('allows a call from a session whose role is in the allowed list', () => {
    setSessionForTesting(ADMIN);
    const inner = vi.fn(() => 'created');
    const handler = requireRole(['SCHOOL_ADMIN'])(inner);
    expect(handler({} as any, 'input')).toBe('created');
    expect(inner).toHaveBeenCalledWith({}, 'input');
  });

  it('allows any role in a multi-role allow-list', () => {
    setSessionForTesting(TEACHER);
    const inner = vi.fn(() => 'ok');
    const handler = requireRole(['SCHOOL_ADMIN', 'TEACHER'])(inner);
    expect(handler({} as any)).toBe('ok');
  });
});

describe('requireSession', () => {
  it('throws when nobody is logged in', () => {
    setSessionForTesting(null);
    expect(() => requireSession()).toThrow(/not authenticated/i);
  });

  it('returns the current session when logged in', () => {
    setSessionForTesting(ADMIN);
    expect(requireSession()).toEqual(ADMIN);
  });
});
