"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApkInstaller, downloadApkToCache } from "@/lib/apk-installer";

// Real in-app update flow for this sideloaded Android APK (no Play Store,
// so there is no automatic background update -- this is the closest
// equivalent Android allows). Mirrors apps/mobile's identical
// android-update-dialog.tsx exactly (same shared
// packages/capacitor-apk-installer plugin, same state machine); kept as a
// separate copy rather than a shared component because the two apps use
// different UI primitives (this app's own src/components/ui/button.tsx,
// not shadcn) and different layouts (rendered inline inside
// UpdateBanner's "update-available" branch here, rather than as a
// fixed-position sheet).
//
// Android itself never lets a non-system app silently replace itself --
// the OS's own package-installer screen is always the final step, no
// matter what. ApkInstaller.install() is what gets the user there in one
// tap instead of hunting through a Downloads folder.
type FlowState =
  | { status: "prompt" }
  | { status: "downloading"; percent: number; indeterminate: boolean }
  | { status: "needs-permission"; path: string }
  | { status: "ready"; path: string }
  | { status: "error"; message: string };

const FILE_NAME = "eduignite-companion-update.apk";

export function AndroidUpdateDialog({
  version,
  downloadUrl,
  releaseNotes,
  onDismiss,
}: {
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
  onDismiss: () => void;
}) {
  const [state, setState] = useState<FlowState>({ status: "prompt" });

  // This whole flow is Android-only -- ApkInstaller has no web/iOS
  // implementation (see packages/capacitor-apk-installer), and this app
  // only ever ships as a packaged Android build. Falls back to the plain
  // "open in browser" link for any other platform so the update is still
  // reachable somehow.
  if (Capacitor.getPlatform() !== "android") {
    return (
      <a
        href={downloadUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white shadow-md transition hover:bg-primary-dark"
      >
        <Download className="h-4 w-4" />
        See what&apos;s new
      </a>
    );
  }

  async function handleUpdateNow() {
    setState({ status: "downloading", percent: 0, indeterminate: false });
    try {
      const path = await downloadApkToCache(downloadUrl, FILE_NAME, (percent) => {
        setState((prev) =>
          prev.status === "downloading" ? { ...prev, percent, indeterminate: percent === 0 } : prev
        );
      });
      const { value: canInstall } = await ApkInstaller.canInstall();
      setState(canInstall ? { status: "ready", path } : { status: "needs-permission", path });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not download the update. Please check your connection and try again.",
      });
    }
  }

  async function handleOpenSettings() {
    await ApkInstaller.openInstallPermissionSettings();
  }

  async function handleTryInstall() {
    if (state.status !== "needs-permission" && state.status !== "ready") return;
    try {
      await ApkInstaller.install({ path: state.path });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not open the installer. Please try again.",
      });
    }
  }

  if (state.status === "prompt") {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">{releaseNotes || "A newer version is available."}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={onDismiss}>
            Later
          </Button>
          <Button size="md" onClick={handleUpdateNow}>
            <Download className="h-4 w-4" />
            Update to v{version}
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "downloading") {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm text-gray-600">Downloading version {version}…</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: state.indeterminate ? "100%" : `${Math.max(0, Math.min(100, state.percent))}%` }}
          />
        </div>
      </div>
    );
  }

  if (state.status === "needs-permission") {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">
          Version {version} is downloaded. Android needs your permission to install apps from EduIgnite Companion --
          tap below to allow it, then come back and tap Install.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={handleOpenSettings}>
            Open Settings
          </Button>
          <Button size="md" onClick={handleTryInstall}>
            Install
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">
          Version {version} is downloaded and ready. Tap Install to finish -- Android will show its own install
          confirmation screen.
        </p>
        <Button size="md" onClick={handleTryInstall}>
          Install Now
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-start justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
        <p className="text-sm text-destructive">{state.message}</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
