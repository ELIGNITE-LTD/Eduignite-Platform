// Minimal, safe preload. The web frontend runs unchanged; we only expose a
// tiny marker so app code can detect it is running inside the desktop shell,
// plus the electron-updater IPC surface (see electron/autoUpdate.js and
// src/components/layout/electron-update-dialog.tsx).
const { contextBridge, ipcRenderer } = require('electron');

// Wraps ipcRenderer.on() as an addListener-returns-unsubscribe helper, the
// same shape apps/offline-desktop's preload exposes for its own update.on*
// methods -- keeps the renderer-side dialog component identical between
// the two apps.
function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('eduigniteDesktop', {
  isDesktop: true,
  platform: process.platform,
  update: {
    download: () => ipcRenderer.invoke('update:download'),
    quitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
    onAvailable: (callback) => on('update:available', callback),
    onProgress: (callback) => on('update:progress', callback),
    onDownloaded: (callback) => on('update:downloaded', callback),
    onError: (callback) => on('update:error', callback),
  },
});
