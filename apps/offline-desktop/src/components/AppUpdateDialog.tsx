import React, { useEffect, useState } from 'react';

// Replaces the old UpdateAvailableBanner (thin dismissible bar + "Download"
// link that opened the system browser to a manual-download page) with a
// real in-app update flow driven by electron-updater (see
// electron/autoUpdate.ts for the main-process half, src/shared/api.ts's
// UpdateApi for the IPC contract).
//
// Deliberately NOT the same thing as src/context/UpdateContext.tsx +
// UpdateRequiredNotice.tsx -- those implement a separate, backend-driven,
// human-controlled hard floor (`minSupportedVersion`) that stays completely
// untouched. This component only ever reflects "electron-updater found a
// real installable update on eduignite.online/downloads/updates/, want it?"
//
// "Remind Me Later" mirrors UpdateContext's own `dismissed` pattern: plain
// in-memory state, not persisted anywhere, so a fresh app launch naturally
// re-shows this dialog if an update is still available and the update
// server is reachable. `dismissedVersion` (rather than a bare boolean) keeps
// that dismissal scoped to the version the user actually saw and declined --
// if a newer version shows up later in the same running session (the main
// process re-checks every few hours), the dialog is allowed to reappear for
// that newer version instead of staying silent all session long.
type DialogState =
  | { status: 'idle' }
  | { status: 'available'; version: string; releaseNotes: string | null }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export default function AppUpdateDialog() {
  const [state, setState] = useState<DialogState>({ status: 'idle' });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    const offAvailable = window.api.update.onAvailable(({ version, releaseNotes }) => {
      setState((prev) => {
        // Already downloading/downloaded this exact version -- a redundant
        // periodic re-check shouldn't rewind the UI back to "available".
        if ((prev.status === 'downloading' || prev.status === 'downloaded') && prev.version === version) {
          return prev;
        }
        return { status: 'available', version, releaseNotes };
      });
    });
    const offProgress = window.api.update.onProgress(({ percent }) => {
      setState((prev) =>
        prev.status === 'downloading' ? { ...prev, percent } : prev.status === 'available' ? { ...prev, status: 'downloading', percent } : prev
      );
    });
    const offDownloaded = window.api.update.onDownloaded(({ version }) => {
      setState({ status: 'downloaded', version });
    });
    const offError = window.api.update.onError(({ message }) => {
      setState({ status: 'error', message });
    });

    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  if (state.status === 'idle') return null;
  if (state.status === 'available' && state.version === dismissedVersion) return null;

  async function handleUpdateNow() {
    if (state.status !== 'available') return;
    // Optimistic transition -- there's a brief gap between the invoke() call
    // resolving and electron-updater's first 'download-progress' event, and
    // the UI should stop offering "Update Now"/"Remind Me Later" immediately
    // on click rather than appear unresponsive for that gap.
    setState({ status: 'downloading', version: state.version, percent: 0 });
    await window.api.update.download();
  }

  function handleRemindLater() {
    if (state.status !== 'available') return;
    setDismissedVersion(state.version);
    setState({ status: 'idle' });
  }

  function handleRestartAndInstall() {
    void window.api.update.quitAndInstall();
  }

  function handleDismissError() {
    setState({ status: 'idle' });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="EduIgnite Offline update"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-6"
    >
      <div className="card w-full max-w-sm bg-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M12 3v10.5m0 0-3.75-3.75M12 13.5l3.75-3.75M4.5 16.5v2.25A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25V16.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div className="font-headline text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              EduIgnite Offline
            </div>
            <h2 className="font-headline text-base font-bold text-foreground">
              {state.status === 'available' && 'Update available'}
              {state.status === 'downloading' && 'Downloading update…'}
              {state.status === 'downloaded' && 'Update ready to install'}
              {state.status === 'error' && "Couldn't check for updates"}
            </h2>
          </div>
        </div>

        {state.status === 'available' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Version {state.version} of EduIgnite Offline is ready to install. Updating brings the latest fixes and
              improvements to your school's records system.
            </p>
            {state.releaseNotes && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">
                {state.releaseNotes}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={handleRemindLater}>
                Remind Me Later
              </button>
              <button type="button" className="btn-primary" onClick={handleUpdateNow}>
                Update Now
              </button>
            </div>
          </div>
        )}

        {state.status === 'downloading' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Downloading version {state.version}. Please keep EduIgnite Offline open until this finishes.
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, state.percent))}%` }}
              />
            </div>
            <div className="text-right text-xs font-medium text-muted-foreground">
              {Math.round(state.percent)}%
            </div>
          </div>
        )}

        {state.status === 'downloaded' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Version {state.version} has been downloaded. EduIgnite Offline needs to restart to finish installing
              it -- this only takes a few seconds, and none of your saved records are affected.
            </p>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={handleRestartAndInstall}>
                Restart &amp; Install Now
              </button>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="space-y-4">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p>
            <p className="text-sm text-muted-foreground">
              You can keep using EduIgnite Offline as normal -- it will check again automatically.
            </p>
            <div className="flex justify-end">
              <button type="button" className="btn-secondary" onClick={handleDismissError}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
