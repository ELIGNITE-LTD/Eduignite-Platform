"use client";

import { useEffect, useState } from "react";
import {
  fetchAppVersionInfo,
  resolveUpdateStatus,
  type AppVersionInfo,
  type UpdateStatus,
} from "@/lib/update-check";

// Only ever used for AppUpdateGate's hard `update-required` floor now --
// the soft "update available" banner this used to also drive was replaced
// by a real in-app download + install flow (see
// @/components/layout/android-update-dialog.tsx, which reads this same
// hook itself and owns its own dismissal state), so the dismissal state
// this hook used to expose was removed along with it.
export function useAppUpdate() {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    fetchAppVersionInfo().then((result) => {
      if (cancelled) return;
      setInfo(result);
      setStatus(resolveUpdateStatus(result));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, info };
}
