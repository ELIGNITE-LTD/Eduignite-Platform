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
// by electron-updater's own real in-app flow (see
// @/components/layout/electron-update-dialog.tsx), so the dismissal state
// that banner needed was removed along with it.
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
