"use client";

import { CheckCircle2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { APP_VERSION, compareVersions } from "@/lib/app-version";
import { fetchAppVersionInfo } from "@/lib/update-check";
import { capabilitiesFor, seenVersionKey, type WhatsNew } from "@/lib/whats-new";

/**
 * Tells someone their update went through.
 *
 * Android hands the install to its own package installer and the app restarts
 * on the new version with nothing said, so the person who tapped Install is
 * left to guess whether it worked. This is the other end of that: the first
 * time a version runs for an account, it says plainly that the update was
 * installed, what changed, and what that account can do with it.
 *
 * It only appears after a real upgrade. A fresh install has no earlier version
 * to have come from, so it records the version quietly and says nothing:
 * announcing an update to someone who has just installed the app for the first
 * time would be a lie.
 */
export function UpdateInstalledDialog() {
  const { user } = useAuth();
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // The list is written for whoever is signed in, so it waits for them.
    if (!user) return;

    const key = seenVersionKey(user.id);
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(key);
    } catch {
      return; // no storage, no way to tell an upgrade from a first run
    }

    if (!seen) {
      // First run for this account: record where we are and stay quiet.
      try {
        window.localStorage.setItem(key, APP_VERSION);
      } catch {
        /* ignore */
      }
      return;
    }

    if (compareVersions(seen, APP_VERSION) >= 0) return;

    setPreviousVersion(seen);
    setWhatsNew(capabilitiesFor(user.role));

    // The notes describe what actually changed; the list below them describes
    // what this account can do. If the notes cannot be fetched, the list alone
    // is still true.
    void fetchAppVersionInfo().then((info) => {
      if (info?.releaseNotes && compareVersions(info.latestVersion, APP_VERSION) <= 0) {
        setReleaseNotes(info.releaseNotes);
      }
    });
  }, [user]);

  function dismiss() {
    try {
      window.localStorage.setItem(seenVersionKey(user?.id), APP_VERSION);
    } catch {
      /* ignore */
    }
    setPreviousVersion(null);
  }

  if (!previousVersion || !whatsNew) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-foreground">Update installed</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              EduIgnite updated from version {previousVersion} to {APP_VERSION}.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {releaseNotes && (
          <div className="mt-4 rounded-xl bg-muted/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              What changed
            </p>
            <p className="mt-1.5 whitespace-pre-line text-xs font-medium text-foreground">
              {releaseNotes}
            </p>
          </div>
        )}

        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {whatsNew.title} · {whatsNew.audience}
          </p>
          <ul className="mt-2 space-y-2">
            {whatsNew.canNowDo.map((line) => (
              <li key={line} className="flex gap-2 text-xs font-medium leading-relaxed text-foreground">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={dismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
