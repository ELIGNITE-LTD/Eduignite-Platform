"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ApkInstaller, downloadApkToCache } from "@eduignite/capacitor-apk-installer";
import { useAppUpdate } from "@/hooks/use-app-update";

// Real in-app update flow for the sideloaded Android APK (no Play Store,
// so there is no automatic background update -- this is the closest
// equivalent Android allows): background version check already runs via
// useAppUpdate/src/lib/update-check.ts; this component adds an actual
// in-app download + one-tap install on top of it, replacing the old
// UpdateAvailableBanner's "opens a browser download page" behaviour.
//
// Android itself never lets a non-system app silently replace itself --
// the OS's own package-installer screen is always the final step, no
// matter what. ApkInstaller.install() (packages/capacitor-apk-installer)
// is what gets the user there in one tap instead of hunting through a
// Downloads folder. Rendered as a bottom sheet rather than a full-screen
// overlay so it doesn't block the app just for the "available" state --
// same footprint as the banner it replaces, but able to grow into a real
// progress/ready-to-install flow.
type SheetState =
  | { status: "idle" }
  | { status: "available"; version: string; downloadUrl: string; releaseNotes?: string }
  | { status: "downloading"; version: string; percent: number; indeterminate: boolean }
  | { status: "needs-permission"; version: string; path: string }
  | { status: "ready"; version: string; path: string }
  | { status: "error"; message: string };

const FILE_NAME = "eduignite-mobile-update.apk";

export function AndroidUpdateDialog() {
  const { status, info } = useAppUpdate();
  const [sheet, setSheet] = useState<SheetState>({ status: "idle" });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (status === "update-available" && info) {
      setSheet((prev) => (prev.status === "idle" ? { status: "available", version: info.latestVersion, downloadUrl: info.downloadUrl, releaseNotes: info.releaseNotes } : prev));
    }
  }, [status, info]);

  // This whole flow is Android-only -- ApkInstaller has no web/iOS
  // implementation (see packages/capacitor-apk-installer), and this app
  // only ever ships as a packaged Android build (no hosted web deployment
  // exists for it), but the guard is cheap and keeps `next dev` safe too.
  if (Capacitor.getPlatform() !== "android") return null;
  if (sheet.status === "idle") return null;
  if (sheet.status === "available" && sheet.version === dismissedVersion) return null;

  async function handleUpdateNow() {
    if (sheet.status !== "available") return;
    const { version, downloadUrl } = sheet;
    setSheet({ status: "downloading", version, percent: 0, indeterminate: false });
    try {
      const path = await downloadApkToCache(downloadUrl, FILE_NAME, (percent) => {
        setSheet((prev) =>
          prev.status === "downloading" ? { ...prev, percent, indeterminate: percent === 0 } : prev
        );
      });
      const { value: canInstall } = await ApkInstaller.canInstall();
      setSheet(canInstall ? { status: "ready", version, path } : { status: "needs-permission", version, path });
    } catch (error) {
      setSheet({
        status: "error",
        message: error instanceof Error ? error.message : "Could not download the update. Please check your connection and try again.",
      });
    }
  }

  function handleRemindLater() {
    if (sheet.status !== "available") return;
    setDismissedVersion(sheet.version);
    setSheet({ status: "idle" });
  }

  async function handleOpenSettings() {
    await ApkInstaller.openInstallPermissionSettings();
  }

  async function handleTryInstall() {
    if (sheet.status !== "needs-permission" && sheet.status !== "ready") return;
    try {
      await ApkInstaller.install({ path: sheet.path });
    } catch (error) {
      setSheet({
        status: "error",
        message: error instanceof Error ? error.message : "Could not open the installer. Please try again.",
      });
    }
  }

  function handleDismissError() {
    setSheet({ status: "idle" });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl">
        {sheet.status === "available" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Download className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Update available
                </div>
                <p className="text-sm text-foreground">Version {sheet.version} is ready to download.</p>
              </div>
              <button
                type="button"
                onClick={handleRemindLater}
                aria-label="Dismiss update notice"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleRemindLater}>
                Later
              </Button>
              <Button size="sm" onClick={handleUpdateNow}>
                Update Now
              </Button>
            </div>
          </div>
        )}

        {sheet.status === "downloading" && (
          <div className="space-y-2">
            <p className="text-sm text-foreground">Downloading version {sheet.version}…</p>
            <Progress value={sheet.indeterminate ? undefined : Math.max(0, Math.min(100, sheet.percent))} />
            {!sheet.indeterminate && (
              <div className="text-right text-xs font-medium text-muted-foreground">{Math.round(sheet.percent)}%</div>
            )}
          </div>
        )}

        {sheet.status === "needs-permission" && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Version {sheet.version} is downloaded. Android needs your permission to install apps from EduIgnite --
              tap below to allow it, then come back and tap Install.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleOpenSettings}>
                Open Settings
              </Button>
              <Button size="sm" onClick={handleTryInstall}>
                Install
              </Button>
            </div>
          </div>
        )}

        {sheet.status === "ready" && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Version {sheet.version} is downloaded and ready. Tap Install to finish -- Android will show its own
              install confirmation screen.
            </p>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleTryInstall}>
                Install Now
              </Button>
            </div>
          </div>
        )}

        {sheet.status === "error" && (
          <div className="space-y-3">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sheet.message}</p>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={handleDismissError}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
