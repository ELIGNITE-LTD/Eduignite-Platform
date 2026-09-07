"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAppVersionInfo,
  resolveUpdateStatus,
  type AppVersionInfo,
  type UpdateStatus,
} from "@/lib/update-check";

// Persists the last `latestVersion` the user dismissed the update banner
// for, so it does not reappear until a newer version is published. Same
// `eduignite_`-prefixed localStorage convention used elsewhere in this app
// (see @/lib/auth-context, @/lib/i18n-context).
const DISMISSED_KEY = "eduignite_dismissed_update_version";

export function useAppUpdate() {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("checking");
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    try {
      setDismissedVersion(window.localStorage.getItem(DISMISSED_KEY));
    } catch {
      /* localStorage unavailable (private mode, etc.) — banner just won't persist dismissal */
    }

    fetchAppVersionInfo().then((result) => {
      if (cancelled) return;
      setInfo(result);
      setStatus(resolveUpdateStatus(result));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    if (!info) return;
    try {
      window.localStorage.setItem(DISMISSED_KEY, info.latestVersion);
    } catch {
      /* best-effort only */
    }
    setDismissedVersion(info.latestVersion);
  }, [info]);

  const bannerDismissed = Boolean(info && dismissedVersion === info.latestVersion);

  return { status, info, dismiss, bannerDismissed };
}
