"use client";

import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";

/**
 * "EduIgnite 1.0.57 (a1b2c3d4e5f6) built 9 Nov 2026" -- the build stamp CI writes to
 * /build-info.json (scripts/release/build-info.mjs). Falls back to the baked-in
 * version when the file is absent (local dev) so it never renders blank or throws.
 */
type BuildInfo = { version: string; gitSha?: string | null; builtAt?: string | null };

export function BuildInfoLine({ className }: { className?: string }) {
  const [info, setInfo] = useState<BuildInfo>({ version: APP_VERSION });

  useEffect(() => {
    let cancelled = false;
    fetch("/build-info.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.version) setInfo(data as BuildInfo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const built = info.builtAt ? new Date(info.builtAt) : null;
  const builtLabel = built && !Number.isNaN(built.getTime()) ? built.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

  return (
    <p className={className ?? "text-center text-[11px] text-muted-foreground"}>
      EduIgnite {info.version}
      {info.gitSha ? ` (${info.gitSha})` : ""}
      {builtLabel ? ` · built ${builtLabel}` : ""}
    </p>
  );
}
