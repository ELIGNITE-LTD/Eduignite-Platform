// Ambient type for the tiny surface electron/preload.js bridges into the
// renderer via contextBridge. Only ever defined when this Next.js frontend
// is running inside the Electron shell (see electron/main.js) -- always
// check `window.eduigniteDesktop?.isDesktop` before using it, since the
// same window global is `undefined` under `next dev`/a plain browser tab.
export type Unsubscribe = () => void;

export interface ElectronUpdateAvailablePayload {
  version: string;
  releaseNotes: string | null;
}

export interface ElectronUpdateProgressPayload {
  /** 0-100. */
  percent: number;
}

export interface ElectronUpdateDownloadedPayload {
  version: string;
}

export interface ElectronUpdateErrorPayload {
  /** Already a plain-language, non-technical message -- safe to show as-is. */
  message: string;
}

export interface ElectronUpdateApi {
  download(): Promise<void>;
  quitAndInstall(): Promise<void>;
  onAvailable(callback: (payload: ElectronUpdateAvailablePayload) => void): Unsubscribe;
  onProgress(callback: (payload: ElectronUpdateProgressPayload) => void): Unsubscribe;
  onDownloaded(callback: (payload: ElectronUpdateDownloadedPayload) => void): Unsubscribe;
  onError(callback: (payload: ElectronUpdateErrorPayload) => void): Unsubscribe;
}

export interface EduIgniteDesktopBridge {
  isDesktop: true;
  platform: string;
  update: ElectronUpdateApi;
}

declare global {
  interface Window {
    eduigniteDesktop?: EduIgniteDesktopBridge;
  }
}
