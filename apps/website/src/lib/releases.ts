/**
 * Release manifests published by CI next to the installers
 * (scripts/release/publish.sh -> https://eduignite.online/downloads/releases-<app>.json).
 * This is the primary source for the download pages; everything here degrades
 * to `null` / empty so a missing or malformed file can never break a page.
 */

export type AppRelease = {
  version: string;
  file: string;
  url: string;
  sizeBytes: number | null;
  sha256: string | null;
  builtAt: string | null;
  gitSha: string | null;
  minOs: string | null;
  notes: string[];
  withdrawn: boolean;
};

export type AppReleases = {
  latest: AppRelease | null;
  /** Older, still-hosted, non-withdrawn builds (newest first), excluding `latest`. */
  older: AppRelease[];
};

const DOWNLOADS_BASE = (process.env.NEXT_PUBLIC_DOWNLOADS_URL || "https://eduignite.online/downloads").replace(/\/$/, "");

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseRelease(raw: any): AppRelease | null {
  const version = str(raw?.version);
  const file = str(raw?.file);
  const url = str(raw?.url);
  if (!version || !file || !url) return null;
  let host: URL;
  try {
    host = new URL(url);
  } catch {
    return null;
  }
  // only ever link to our own download host
  if (host.protocol !== "https:" || !["eduignite.online", "www.eduignite.online"].includes(host.hostname)) return null;
  const sha = str(raw?.sha256);
  return {
    version,
    file,
    url,
    sizeBytes: typeof raw?.size_bytes === "number" && raw.size_bytes > 0 ? raw.size_bytes : null,
    sha256: sha && /^[0-9a-f]{64}$/i.test(sha) ? sha.toLowerCase() : null,
    builtAt: str(raw?.built_at),
    gitSha: str(raw?.git_sha),
    minOs: str(raw?.min_os),
    notes: Array.isArray(raw?.notes) ? raw.notes.filter((n: unknown) => typeof n === "string" && n.trim()).slice(0, 15) : [],
    withdrawn: raw?.withdrawn === true,
  };
}

/** Pure parser (exported for tests). Never throws. */
export function parseManifest(data: unknown): AppReleases | null {
  const list = (data as any)?.releases;
  if (!Array.isArray(list)) return null;
  const releases = list.map(parseRelease).filter((r): r is AppRelease => r !== null && !r.withdrawn);
  if (!releases.length) return null;
  const latestVersion = str((data as any)?.latest);
  const latest = releases.find((r) => r.version === latestVersion) || releases[0];
  return { latest, older: releases.filter((r) => r !== latest) };
}

export function formatBytes(bytes: number | null): string | null {
  if (!bytes) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function fetchAppReleases(app: "mobile" | "desktop"): Promise<AppReleases | null> {
  try {
    const res = await fetch(`${DOWNLOADS_BASE}/releases-${app}.json`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return parseManifest(await res.json());
  } catch {
    return null;
  }
}
