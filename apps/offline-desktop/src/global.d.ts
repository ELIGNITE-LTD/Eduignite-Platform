/// <reference types="vite/client" />

import type { EduIgniteApi } from './shared/api';

// Declares the `window.api` surface bridged in by electron/preload.ts so
// renderer code (pages, components) gets full IPC type-checking/autocomplete.
declare global {
  interface Window {
    api: EduIgniteApi;
  }

  // Baked into the renderer bundle at build time from package.json's
  // "version" field — see vite.config.ts's `define`. Read by
  // src/update/checkForUpdate.ts (via src/context/UpdateContext.tsx) to
  // compare this build against the backend's latest/min-supported versions.
  const __APP_VERSION__: string;
}

export {};
