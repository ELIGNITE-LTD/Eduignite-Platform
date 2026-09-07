/**
 * The app's own build-time version, and a tiny semver-style comparator used
 * to drive the update-available / update-required UI in
 * `@/lib/update-check.ts`.
 */

// Baked in at build time via next.config.ts's `env` block. CI sets
// NEXT_PUBLIC_APP_VERSION to the version it is about to tag/publish
// (currently `1.0.<run number>` — see .github/workflows/mobile.yml); local
///dev builds fall back to whatever next.config.ts reads from package.json.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";

/**
 * Compares two dotted version strings numerically, segment by segment — not
 * as strings, where `"1.0.9" < "1.0.10"` is false. Missing trailing segments
 * are treated as 0 (`"1.2"` == `"1.2.0"`). Returns -1 / 0 / 1, like a normal
 * comparator.
 */
export function compareVersions(a: string, b: string): number {
  const toParts = (v: string) =>
    String(v || "0")
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((part) => parseInt(part, 10) || 0);

  const partsA = toParts(a);
  const partsB = toParts(b);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const na = partsA[i] ?? 0;
    const nb = partsB[i] ?? 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

export const isVersionBelow = (a: string, b: string): boolean => compareVersions(a, b) < 0;
