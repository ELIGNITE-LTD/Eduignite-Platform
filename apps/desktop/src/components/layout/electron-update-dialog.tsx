"use client";

import { useEffect, useState } from "react";
import { DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Real in-app auto-update for the Electron shell, backed by electron-updater
// (see electron/autoUpdate.js for the main-process half, electron/preload.js
// for the IPC bridge). Only ever active when running inside Electron --
// `window.eduigniteDesktop` is undefined under `next dev`/a plain browser
// tab, so this renders nothing there.
//
// Deliberately separate from AppUpdateGate's UpdateAvailableBanner/
// UpdateRequiredScreen (src/lib/update-check.ts's backend-driven,
// human-controlled `minSupportedVersion` floor) -- that mechanism stays
// exactly as it is. This component only ever reflects "electron-updater
// found a real installable update on eduignite.online/downloads/updates/,
// want it?" Mirrors apps/offline-desktop/src/components/AppUpdateDialog.tsx
// state machine and copy, restyled with this app's own shadcn primitives.
type DialogState =
  | { status: "idle" }
  | { status: "available"; version: string; releaseNotes: string | null }
  | { status: "downloading"; version: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

export function ElectronUpdateDialog() {
  const [state, setState] = useState<DialogState>({ status: "idle" });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    const update = window.eduigniteDesktop?.update;
    if (!update) return; // Not running inside Electron -- nothing to wire up.

    const offAvailable = update.onAvailable(({ version, releaseNotes }) => {
      setState((prev) => {
        if ((prev.status === "downloading" || prev.status === "downloaded") && prev.version === version) {
          return prev;
        }
        return { status: "available", version, releaseNotes };
      });
    });
    const offProgress = update.onProgress(({ percent }) => {
      setState((prev) =>
        prev.status === "downloading"
          ? { ...prev, percent }
          : prev.status === "available"
            ? { ...prev, status: "downloading", percent }
            : prev
      );
    });
    const offDownloaded = update.onDownloaded(({ version }) => {
      setState({ status: "downloaded", version });
    });
    const offError = update.onError(({ message }) => {
      setState({ status: "error", message });
    });

    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  if (state.status === "idle") return null;
  if (state.status === "available" && state.version === dismissedVersion) return null;

  const update = window.eduigniteDesktop?.update;
  if (!update) return null;

  async function handleUpdateNow() {
    if (state.status !== "available") return;
    setState({ status: "downloading", version: state.version, percent: 0 });
    await update!.download();
  }

  function handleRemindLater() {
    if (state.status !== "available") return;
    setDismissedVersion(state.version);
    setState({ status: "idle" });
  }

  function handleRestartAndInstall() {
    void update!.quitAndInstall();
  }

  function handleDismissError() {
    setState({ status: "idle" });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="EduIgnite update"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
    >
      <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <DownloadCloud className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">EduIgnite</div>
            <h2 className="text-base font-bold text-foreground">
              {state.status === "available" && "Update available"}
              {state.status === "downloading" && "Downloading update…"}
              {state.status === "downloaded" && "Update ready to install"}
              {state.status === "error" && "Couldn't check for updates"}
            </h2>
          </div>
        </div>

        {state.status === "available" && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Version {state.version} of EduIgnite is ready to install. Updating brings the latest fixes and
              improvements to your school's system.
            </p>
            {state.releaseNotes && (
              <p className="whitespace-pre-line rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {state.releaseNotes}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleRemindLater}>
                Remind Me Later
              </Button>
              <Button onClick={handleUpdateNow}>Update Now</Button>
            </div>
          </div>
        )}

        {state.status === "downloading" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Downloading version {state.version}. Please keep EduIgnite open until this finishes.
            </p>
            <Progress value={Math.max(0, Math.min(100, state.percent))} />
            <div className="text-right text-xs font-medium text-muted-foreground">{Math.round(state.percent)}%</div>
          </div>
        )}

        {state.status === "downloaded" && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Version {state.version} has been downloaded. EduIgnite needs to restart to finish installing it --
              this only takes a few seconds.
            </p>
            <div className="flex justify-end">
              <Button onClick={handleRestartAndInstall}>Restart &amp; Install Now</Button>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-4">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p>
            <p className="text-sm text-muted-foreground">
              You can keep using EduIgnite as normal -- it will check again automatically.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={handleDismissError}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
