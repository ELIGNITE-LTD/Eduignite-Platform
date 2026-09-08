import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { SessionUser } from '../auth/session';

interface AuthContextValue {
  session: SessionUser | null;
  loading: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Mirrors the (main-process, in-memory) session tracked by src/auth/session.ts.
 * Loads the current session once at startup -- `auth:currentSession` -- so a
 * hot-reload or window refresh during dev doesn't spuriously bounce a logged
 * in user back to the login screen while the check is in flight (see
 * `loading`, consumed by src/App.tsx's gating).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.auth.currentSession();
      setSession(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (emailOrUsername: string, password: string) => {
    const result = await window.api.auth.login(emailOrUsername, password);
    setSession(result);
  }, []);

  const logout = useCallback(async () => {
    await window.api.auth.logout();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within an <AuthProvider>.');
  return ctx;
}
