// Tiny local semver comparator — no dependency needed for something this
// small. Exists specifically to avoid the classic string-comparison trap:
// "1.0.9" > "1.0.10" is TRUE as strings even though 1.0.10 is the newer
// release, which would make an update-check silently compare versions wrong.
//
// Pre-release/build-metadata suffixes (e.g. "1.2.0-beta.1") are stripped
// before comparing numeric segments. Neither this app's own package.json
// version nor the platform backend's AppVersion rows use pre-release tags
// today, but stripping keeps a stray suffix from breaking `parseInt` instead
// of silently mis-ordering the comparison.
function toParts(version: string): number[] {
  const core = version.trim().split(/[-+]/)[0];
  return core.split('.').map((part) => {
    const n = parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Compares two semver-ish version strings numerically, segment by segment.
 * Returns -1 if `a < b`, 1 if `a > b`, 0 if equal (including when one string
 * has fewer segments than the other — a missing trailing segment is treated
 * as 0, so "1.2" === "1.2.0").
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const partsA = toParts(a);
  const partsB = toParts(b);
  const length = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }

  return 0;
}
