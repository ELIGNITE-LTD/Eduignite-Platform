// In-app auto-update, mirroring apps/offline-desktop/electron/autoUpdate.ts
// exactly (same electron-updater usage, same IPC channel names, same
// never-throw/never-crash discipline) -- kept as plain CommonJS here since
// this app's whole electron/ directory is unbuilt, hand-written JS (see
// main.js), unlike offline-desktop's Vite-built TypeScript main process.
//
// electron-updater reads its feed config from the `app-update.yml`
// electron-builder bakes into the packaged app's resources at build time
// (see electron-builder.yml's `publish` block), so no setFeedURL() call is
// needed here.
//
// This is a DIFFERENT mechanism from src/lib/update-check.ts's
// backend-driven `minSupportedVersion`/blocked-status check (rendered via
// AppUpdateGate), which stays exactly as it is -- that's a deliberate,
// human-controlled kill-switch (an admin can force everyone below some
// version to update via Django admin), independent of whatever the actual
// latest release build is. This module is the "here's a real installable
// update, want it now?" flow, and replaces the old UpdateAvailableBanner's
// "opens a browser download page" behaviour for this Electron shell.
const { ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours.

let initialized = false;

function initAutoUpdater(mainWindow) {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false; // Only ever download after the user clicks "Update Now".
  autoUpdater.autoInstallOnAppQuit = false; // We call quitAndInstall() explicitly, from a user-confirmed action.

  const send = (channel, payload) => {
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
  // downloadUpdate() failure. Only the latter should ever interrupt the
  // user: a background check failing (typically just "no internet right
  // now") must stay silent and retry next interval, never pop a dialog.
  let downloadInFlight = false;

  autoUpdater.on('error', (error) => {
    console.warn('[auto-update] check/download failed (will retry later):', (error && error.message) || error);
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
      console.warn('[auto-update] downloadUpdate() rejected:', (error && error.message) || error);
    } finally {
      downloadInFlight = false;
    }
  });

  ipcMain.handle('update:quitAndInstall', () => {
    autoUpdater.quitAndInstall();
  });

  function checkForUpdates() {
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn('[auto-update] checkForUpdates() rejected (will retry later):', (error && error.message) || error);
    });
  }

  // Once shortly after the window is ready, then periodically for the rest
  // of the session.
  setTimeout(checkForUpdates, 10_000);
  setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}

module.exports = { initAutoUpdater };
