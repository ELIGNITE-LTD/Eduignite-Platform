"use client";

/**
 * The maintenance notice for the PUBLIC marketing site (visitors are not signed
 * in, so this does not use the auth context). It reads the public platform
 * settings and shows the banner at the head of the page when the founders have
 * turned maintenance on for the "public" or "both" audience.
 */

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";

export function PublicMaintenanceBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    const base = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${base}/platform/settings/`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const on = Boolean(d.maintenance_mode);
        const scope = (d.maintenance_scope as string) || "both";
        setShow(on && scope !== "accounts");
      })
      .catch(() => {
        /* never block the public site on this */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950"
    >
      <Wrench className="h-4 w-4 shrink-0" aria-hidden />
      <span>The system is under maintenance. We&rsquo;re working to improve your experience.</span>
    </div>
  );
}
