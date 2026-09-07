"use client";

import { Download, X } from "lucide-react";

/**
 * Small, dismissible "there's a newer version" strip. Shown when the app's
 * own version is at or above `minSupportedVersion` but below
 * `latestVersion`. Dismissal is per-version (see @/hooks/use-app-update) —
 * once dismissed it stays hidden until a newer `latestVersion` ships.
 *
 * The download link opens through Electron's `setWindowOpenHandler` (see
 * electron/main.js), which routes any window.open/target=_blank navigation
 * to the OS's default browser instead of the app's own BrowserWindow.
 */
export function UpdateAvailableBanner({
  version,
  downloadUrl,
  onDismiss,
}: {
  version: string;
  downloadUrl: string;
  onDismiss: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2 text-xs font-semibold sm:text-sm hover:underline"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span className="truncate">Update available (v{version}) — see what&apos;s new</span>
      </a>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss update notice"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-amber-700 transition-colors hover:bg-amber-100 active:scale-95"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
