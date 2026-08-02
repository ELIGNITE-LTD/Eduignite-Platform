// Minimal, safe preload. The web frontend runs unchanged; we only expose a
// tiny marker so app code can detect it is running inside the desktop shell.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('eduigniteDesktop', {
  isDesktop: true,
  platform: process.platform,
});
