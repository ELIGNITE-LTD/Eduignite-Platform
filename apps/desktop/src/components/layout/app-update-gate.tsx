"use client";

import type { ReactNode } from "react";
import { useAppUpdate } from "@/hooks/use-app-update";
import { UpdateRequiredScreen } from "@/components/layout/update-required-screen";
import { ElectronUpdateDialog } from "@/components/layout/electron-update-dialog";
import { UpdateInstalledDialog } from "@/components/layout/update-installed-dialog";

/**
 * App-wide update gate, mounted once in the root layout so it applies to
 * every screen (login included), not just the authenticated dashboard.
 *
 * - Below `minSupportedVersion`: replaces the whole app with a blocking,
 *   non-dismissible "must update" screen. This is a deliberate,
 *   human-controlled kill-switch (an admin can force everyone below some
 *   version to update via Django admin) and stays wired to
 *   src/lib/update-check.ts's backend check regardless of what electron-
 *   updater itself has found.
 * - Otherwise: renders the app normally. `ElectronUpdateDialog` (backed by
 *   electron-updater -- see electron/autoUpdate.js) independently pops its
 *   own "update available, want it now?" flow when running inside the
 *   Electron shell, replacing the old UpdateAvailableBanner's "opens a
 *   browser download page" behaviour with a real in-app download + restart
 *   flow.
 */
export function AppUpdateGate({ children }: { children: ReactNode }) {
  const { status, info } = useAppUpdate();

  if (status === "update-required" && info) {
    return <UpdateRequiredScreen downloadUrl={info.downloadUrl} />;
  }

  return (
    <>
      <ElectronUpdateDialog />
      {/* The other end of the same flow: says the update went through, and
          what the account signed in can do with it. */}
      <UpdateInstalledDialog />
      {children}
    </>
  );
}
