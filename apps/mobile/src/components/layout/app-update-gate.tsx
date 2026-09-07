"use client";

import type { ReactNode } from "react";
import { useAppUpdate } from "@/hooks/use-app-update";
import { UpdateRequiredScreen } from "@/components/layout/update-required-screen";
import { UpdateAvailableBanner } from "@/components/layout/update-available-banner";

/**
 * App-wide update gate, mounted once in the root layout so it applies to
 * every screen (login included), not just the authenticated dashboard.
 *
 * - Below `minSupportedVersion`: replaces the whole app with a blocking,
 *   non-dismissible "must update" screen.
 * - Between `minSupportedVersion` and `latestVersion`: renders the app
 *   normally with a small dismissible banner on top.
 * - Otherwise (or if the version check failed/hasn't resolved yet): renders
 *   the app with no extra UI at all.
 */
export function AppUpdateGate({ children }: { children: ReactNode }) {
  const { status, info, dismiss, bannerDismissed } = useAppUpdate();

  if (status === "update-required" && info) {
    return <UpdateRequiredScreen downloadUrl={info.downloadUrl} />;
  }

  return (
    <>
      {status === "update-available" && info && !bannerDismissed && (
        <UpdateAvailableBanner
          version={info.latestVersion}
          downloadUrl={info.downloadUrl}
          onDismiss={dismiss}
        />
      )}
      {children}
    </>
  );
}
