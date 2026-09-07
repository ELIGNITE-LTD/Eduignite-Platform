import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { checkForUpdate, type UpdateCheckResult } from '../update/checkForUpdate';

// Runs the update check once at app startup and again every few hours while
// the app stays open (contract: "on startup, and optionally every N hours
// while running"), mirroring how src/components/LicenseStatusBanner.tsx
// polls window.api.licensing.getStatus(). A single provider at the App root
// means the blocking notice and the dismissible banner share one fetch
// instead of each polling the backend independently.
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface UpdateContextValue {
  result: UpdateCheckResult | null;
  dismissed: boolean;
  dismiss: () => void;
}

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // checkForUpdate() never throws — no try/catch needed here.
      const next = await checkForUpdate({ currentVersion: __APP_VERSION__ });
      if (!cancelled) setResult(next);
    }

    run();
    const interval = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  return <UpdateContext.Provider value={{ result, dismissed, dismiss }}>{children}</UpdateContext.Provider>;
}

export function useUpdateCheck(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdateCheck() must be used within an <UpdateProvider>.');
  return ctx;
}
