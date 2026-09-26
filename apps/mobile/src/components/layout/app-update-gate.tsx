"use client";

import type { ReactNode } from "react";
import { useAppUpdate } from "@/hooks/use-app-update";
import { UpdateRequiredScreen } from "@/components/layout/update-required-screen";
import { AndroidUpdateDialog } from "@/components/layout/android-update-dialog";
import { UpdateInstalledDialog } from "@/components/layout/update-installed-dialog";

/**
 * App-wide update gate, mounted once in the root layout so it applies to
 * every screen (login included), not just the authenticated dashboard.
 *
 * - Below `minSupportedVersion`: replaces the whole app with a blocking,
 *   non-dismissible "must update" screen.
 * - Otherwise: renders the app normally. `AndroidUpdateDialog` independently
 *   reads the same update status to drive its own real in-app
 *   download + install flow (see packages/capacitor-apk-installer),
 *   replacing the old UpdateAvailableBanner's "opens a browser download
 *   page" behaviour.
 */
export function AppUpdateGate({ children }: { children: ReactNode }) {
  const { status, info } = useAppUpdate();

  if (status === "update-required" && info) {
    return <UpdateRequiredScreen downloadUrl={info.downloadUrl} />;
  }

  return (
    <>
      <AndroidUpdateDialog />
      {/* The other end of the same flow: says the update went through, and
          what the account signed in can do with it. */}
      <UpdateInstalledDialog />
      {children}
    </>
  );
}
