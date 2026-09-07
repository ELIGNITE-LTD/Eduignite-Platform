"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, Sparkles, X } from "lucide-react";
import { checkForUpdate, CURRENT_APP_VERSION } from "@/lib/versioning";
import type { UpdateCheckResult } from "@/lib/versioning";

/**
 * Update-check UI for this app's single home screen (see
 * src/lib/versioning/check-for-update.ts for the fetch + comparison logic).
 *
 * - "blocked" (currentVersion < minSupportedVersion): a full-width banner
 *   that cannot be dismissed — the update-check contract says this must
 *   block usage, not just nag.
 * - "update-available": a dismissible banner linking to the download URL.
 * - "up-to-date" / "unknown": renders nothing.
 */
export function UpdateBanner() {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate(CURRENT_APP_VERSION).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!result || result.status === "up-to-date" || result.status === "unknown") return null;
  if (result.status === "update-available" && dismissed) return null;

  const isBlocked = result.status === "blocked";

  return (
    <div
      className={
        isBlocked
          ? "rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
          : "relative rounded-2xl border border-primary/20 bg-primary/5 p-5"
      }
    >
      {!isBlocked ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      <div className="flex items-start gap-3 pr-6">
        {isBlocked ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        ) : (
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        )}
        <div className="flex-1">
          <p className="font-black text-sm">
            {isBlocked ? "You must update EduIgnite Companion" : `Update available (v${result.latestVersion})`}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {isBlocked
              ? `This version is no longer supported. Please update to at least v${result.minSupportedVersion} to continue.`
              : result.releaseNotes || "A newer version is available."}
          </p>
          {result.downloadUrl ? (
            <a
              href={result.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white shadow-md transition hover:bg-primary-dark"
            >
              <Download className="h-4 w-4" />
              {isBlocked ? "Update now" : "See what's new"}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
