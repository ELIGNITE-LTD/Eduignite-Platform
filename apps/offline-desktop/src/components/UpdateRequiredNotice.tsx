import React from 'react';
import { useUpdateCheck } from '../context/UpdateContext';

// Contract: below `minSupportedVersion` is a hard floor — a blocking,
// non-dismissible, full-screen notice (no close button, no click-through).
// Rendered once at the App root (see App.tsx), above the Router/Layout, as a
// fixed full-viewport overlay so it truly blocks the whole app rather than
// just one page's content area — unlike LicenseStatusBanner/
// UpdateAvailableBanner, which are dismissible/informational and live inside
// Layout's content column.
export default function UpdateRequiredNotice() {
  const { result } = useUpdateCheck();

  if (!result || result.status !== 'blocked' || !result.info) return null;

  const { info } = result;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Update required"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 px-6 text-white"
    >
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-headline text-xl font-bold">Update required</h1>
        <p>
          An update is required to continue using EduIgnite Offline. You&apos;re running v
          {result.currentVersion}, but v{info.minSupportedVersion} or later is now required to keep using
          this app.
        </p>
        {info.releaseNotes && <p className="text-sm text-white/70">{info.releaseNotes}</p>}
        <button
          type="button"
          onClick={() => window.api.shell.openExternal(info.downloadUrl)}
          className="inline-block rounded-md bg-white px-5 py-2 font-medium text-slate-900 hover:bg-slate-100"
        >
          Download the update
        </button>
      </div>
    </div>
  );
}
