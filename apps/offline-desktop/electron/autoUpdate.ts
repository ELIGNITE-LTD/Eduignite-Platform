import { ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

// In-app auto-update (replaces the old "banner links out to a browser
// download page" flow -- see src/components/AppUpdateDialog.tsx for the
// renderer side). electron-updater reads its feed config from the
// `app-update.yml` electron-builder bakes into the packaged app's resources
// at build time (see electron-builder.yml's `publish` block), so no
// setFeedURL() call is needed here.
//
// This is a DIFFERENT mechanism from src/context/UpdateContext.tsx's
// backend-driven `minSupportedVersion`/blocked-status check, which stays
// exactly as it is -- that's a deliberate, human-controlled kill-switch (an
// admin can force everyone below some version to update via Django admin),
// independent of whatever the actual latest release build is. This module
// is the "here's a real installable update, want it now?" flow.
//
// Philosophy carried over from src/update/checkForUpdate.ts: "offline is a
// normal state." Every check/download failure here is caught and reported
// to the renderer as a dismissible error, never thrown, never crashes the
// app, and never blocks startup -- the periodic re-check below is also how
// "remind me later, ask again once back online" works in practice, with no
// dedicated online/offline detection needed.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours -- matches UpdateContext's POLL_INTERVAL_MS.

let initialized = false;

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // registerIpcHandlers() (src/ipc/handlers.ts) is the one place every other
  // IPC channel in this app is registered, but this module owns the
  // auto-updater's entire lifecycle (electron-updater instance + its IPC
  // surface together), so its two renderer-initiated channels
  // (update:download, update:quitAndInstall) are registered here instead --
  // still the same `ipcMain.handle('<namespace>:<action>', ...)` convention
  // used everywhere else.
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false; // Only ever download after the user clicks "Update Now".
  autoUpdater.autoInstallOnAppQuit = false; // We call quitAndInstall() explicitly, from a user-confirmed action.

  const send = (channel: string, payload?: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  autoUpdater.on('update-available', (info) => {
    send('update:available', {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', { percent: progress.percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    send('update:downloaded', { version: info.version });
  });

  // electron-updater emits the same 'error' event for BOTH a routine
  // background checkForUpdates() failure and a user-initiated
  // downloadUpdate() failure -- it doesn't distinguish the source itself.
  // Only the latter should ever interrupt the user: a background check
  // failing (typically just "no internet right now", the normal state for
  // this product's target schools -- see checkForUpdate.ts's own "offline is
  // a normal state" philosophy) must stay completely silent and retry next
  // interval, never pop a full-screen dialog. downloadInFlight scopes the
  // renderer push to only the case the user is actually waiting on.
  let downloadInFlight = false;

  autoUpdater.on('error', (error) => {
    console.warn('[auto-update] check/download failed (will retry later):', error?.message ?? error);
    if (downloadInFlight) {
      send('update:error', {
        message: 'Could not download the update. Please check your internet connection and try again.',
      });
    }
  });

  ipcMain.handle('update:download', async () => {
    downloadInFlight = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      // downloadUpdate() rejecting is redundant with the 'error' event above
      // (electron-updater emits both) -- swallow here so the renderer's
      // await doesn't also see an unhandled/duplicate rejection; the
      // update:error push already informed it.
      console.warn('[auto-update] downloadUpdate() rejected:', (error as Error)?.message ?? error);
    } finally {
      downloadInFlight = false;
    }
  });

  ipcMain.handle('update:quitAndInstall', () => {
    autoUpdater.quitAndInstall();
  });

  function checkForUpdates() {
    autoUpdater.checkForUpdates().catch((error) => {
      // Belt-and-suspenders: checkForUpdates() can reject directly (e.g. a
      // malformed app-update.yml) in addition to/instead of emitting
      // 'error'. Never let this reach an unhandled rejection.
      console.warn('[auto-update] checkForUpdates() rejected (will retry later):', error?.message ?? error);
    });
  }

  // Once shortly after the window is ready, then periodically for the rest
  // of the session. A short initial delay avoids competing with startup
  // (DB open, license gate check, first paint) for network/CPU.
  setTimeout(checkForUpdates, 10_000);
  setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}
