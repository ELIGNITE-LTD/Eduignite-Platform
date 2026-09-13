export interface CanInstallResult {
  /** Whether this app currently has the OS's "install unknown apps" permission. Always `true` on iOS/web (never used there). */
  value: boolean;
}

export interface ApkInstallerPlugin {
  /** Checks PackageManager.canRequestPackageInstalls() (Android 8+). Web/iOS stub: always resolves `{ value: false }` -- this plugin is Android-only. */
  canInstall(): Promise<CanInstallResult>;
  /** Opens the OS settings screen where the user grants this app permission to install unknown apps. Resolves once the screen is launched, not once the user finishes -- call canInstall() again after the app resumes. */
  openInstallPermissionSettings(): Promise<void>;
  /** Hands `path` (a native filesystem path or file:// URI, e.g. from @capacitor/filesystem's getUri()) to the system package installer via a FileProvider content:// URI + ACTION_VIEW intent. Rejects if the permission from canInstall() has not been granted. */
  install(options: { path: string }): Promise<void>;
}

export declare const ApkInstaller: ApkInstallerPlugin;

/**
 * Downloads `url` into this app's cache directory (as `fileName`) and
 * resolves to a URI usable with `ApkInstaller.install()`. `onProgress`
 * receives 0-100; see index.js for why it may only ever report 0 then 100
 * (CapacitorHttp's fetch shim doesn't support streamed reads).
 */
export declare function downloadApkToCache(
  url: string,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string>;
