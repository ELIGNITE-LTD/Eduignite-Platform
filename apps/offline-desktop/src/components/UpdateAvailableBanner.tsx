import React from 'react';
import { useUpdateCheck } from '../context/UpdateContext';

// Contract: between minSupportedVersion and latestVersion is a dismissible
// nudge, not a blocker. Sibling of LicenseStatusBanner in Layout.tsx — same
// visual pattern/placement (a thin bar above the page content), but this one
// can be closed for the rest of the session, unlike UpdateRequiredNotice.
export default function UpdateAvailableBanner() {
  const { result, dismissed, dismiss } = useUpdateCheck();

  if (!result || result.status !== 'available' || !result.info || dismissed) return null;

  const { info } = result;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
      <span>Update available (v{info.latestVersion}) — see what&apos;s new.</span>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => window.api.shell.openExternal(info.downloadUrl)}
          className="whitespace-nowrap font-medium underline hover:no-underline"
        >
          Download
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss update notice"
          className="opacity-60 hover:opacity-100"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
