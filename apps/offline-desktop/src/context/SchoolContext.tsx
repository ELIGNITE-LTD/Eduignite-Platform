import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { School } from '../shared/types';

interface SchoolContextValue {
  school: School | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SchoolContext = createContext<SchoolContextValue | undefined>(undefined);

/**
 * Loads the (single) school profile row once at app startup and makes it
 * available to every page — most modules need `school.id`,
 * `school.academic_year` and `school.active_term` as default filter values.
 */
export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.school.get();
      setSchool(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <SchoolContext.Provider value={{ school, loading, refresh }}>{children}</SchoolContext.Provider>;
}

export function useSchool(): SchoolContextValue {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool() must be used within a <SchoolProvider>.');
  return ctx;
}
