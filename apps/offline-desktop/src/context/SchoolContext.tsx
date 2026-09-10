import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  // Tracks whether the *first* load has ever resolved. App.tsx's AppGate
  // renders <SetupWizard /> only while `!loading && (!school ||
  // !school.setup_completed)`, so flipping `loading` back to true on every
  // refresh() call unmounts the wizard entirely (wiping its local step
  // state) and remounts it once the refresh resolves -- confirmed as the
  // exact cause of a real reported bug: SetupWizard's own onConfirmed
  // handler calls refresh() right after confirming a school at Step 2 (so
  // Step 3 sees the freshly-written school row), and that refresh's
  // loading=true briefly unmounted <SetupWizard/>, silently bouncing the
  // user back to Step 1 instead of advancing to Step 3. Only the genuine
  // first load (nothing known yet -- a real "which screen do we even show"
  // question) should gate rendering; every later refresh already has a
  // screen correctly on-screen and must not tear it down mid-flow.
  const hasLoadedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const result = await window.api.school.get();
      setSchool(result);
    } finally {
      setLoading(false);
      hasLoadedOnceRef.current = true;
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
