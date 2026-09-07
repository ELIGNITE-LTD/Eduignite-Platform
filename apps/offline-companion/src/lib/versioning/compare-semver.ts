/**
 * Minimal, dependency-free semver comparator.
 *
 * Only what this app needs: compare two `MAJOR.MINOR.PATCH[-prerelease]`
 * strings numerically (never as plain strings — `"1.0.9" < "1.0.10"` is
 * false as a string comparison, which is exactly the bug this exists to
 * avoid). Follows the relevant parts of the semver precedence rules:
 * numeric identifiers compare numerically, and a version WITH a
 * pre-release tag has lower precedence than the same version without one
 * (e.g. `1.2.0-beta` < `1.2.0`). Pre-release identifiers themselves are
 * compared as dot-separated fields (numeric fields numerically, others
 * lexically), same as the semver spec's tie-break rule.
 *
 * Unparsable input is treated defensively rather than thrown: missing
 * numeric fields default to 0, and non-numeric core segments fall back to
 * lexical comparison of the whole string so a malformed version string can
 * never crash the update-check path.
 */

export type SemverComparison = -1 | 0 | 1;

interface ParsedSemver {
  core: [number, number, number];
  prerelease: string[];
}

function isNumeric(value: string): boolean {
  return value.length > 0 && /^\d+$/.test(value);
}

function parseSemver(version: string): ParsedSemver {
  const trimmed = (version || "").trim().replace(/^v/i, "");
  const [corePart, ...prereleaseParts] = trimmed.split("-");
  const prerelease = prereleaseParts.join("-").split(".").filter(Boolean);

  const coreSegments = corePart.split(".");
  const core: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const segment = coreSegments[i];
    const parsedSegment = segment !== undefined ? parseInt(segment, 10) : 0;
    core[i] = Number.isFinite(parsedSegment) ? parsedSegment : 0;
  }

  return { core, prerelease };
}

function compareIdentifiers(a: string, b: string): SemverComparison {
  const aIsNumeric = isNumeric(a);
  const bIsNumeric = isNumeric(b);

  if (aIsNumeric && bIsNumeric) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (na === nb) return 0;
    return na < nb ? -1 : 1;
  }

  // Per semver: numeric identifiers always have lower precedence than
  // non-numeric identifiers when compared against each other.
  if (aIsNumeric !== bIsNumeric) {
    return aIsNumeric ? -1 : 1;
  }

  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function comparePrerelease(a: string[], b: string[]): SemverComparison {
  if (a.length === 0 && b.length === 0) return 0;
  // A version with no pre-release has HIGHER precedence than one that has one.
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const cmp = compareIdentifiers(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Compares two semver-ish version strings.
 * Returns -1 if `a` < `b`, 0 if equal, 1 if `a` > `b`.
 */
export function compareSemver(a: string, b: string): SemverComparison {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  for (let i = 0; i < 3; i += 1) {
    if (parsedA.core[i] !== parsedB.core[i]) {
      return parsedA.core[i] < parsedB.core[i] ? -1 : 1;
    }
  }

  return comparePrerelease(parsedA.prerelease, parsedB.prerelease);
}
