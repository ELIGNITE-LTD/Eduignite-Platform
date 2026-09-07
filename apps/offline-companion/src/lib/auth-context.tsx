"use client";

/**
 * Minimal session context for this small app — deliberately not the full
 * apps/mobile AuthProvider (no platform settings, i18n, data prefetch, etc,
 * none of which this app has). Just: who is logged in, and a way to log in
 * / out, backed by localStorage so the session survives an app restart.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authService } from "./api/services/auth.service";
import { getAccessToken, readStoredUser } from "./api/client";
import type { User } from "./api/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (matricule: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore the session from localStorage on startup. Do not block the UI
    // on a network round-trip to /auth/me/ — if the token is stale, the next
    // authenticated request will 401 and the api client redirects to /login/.
    const token = getAccessToken();
    const storedUser = readStoredUser<User>();
    if (token && storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  const login = async (matricule: string, password: string) => {
    const { user: loggedInUser } = await authService.login(matricule, password);
    setUser(loggedInUser);
    return loggedInUser;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, isAuthenticated: Boolean(user), login, logout }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
