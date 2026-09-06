/// <reference types="vite/client" />

import type { EduIgniteApi } from './shared/api';

// Declares the `window.api` surface bridged in by electron/preload.ts so
// renderer code (pages, components) gets full IPC type-checking/autocomplete.
declare global {
  interface Window {
    api: EduIgniteApi;
  }
}

export {};
