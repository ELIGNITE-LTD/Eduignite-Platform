#!/usr/bin/env node
/**
 * Single source of truth for app versions.
 *
 *   major.minor  -> release/version.json (bump by hand for a feature release)
 *   patch        -> the CI run number of the build workflow (always grows)
 *
 * The Android versionCode is derived from the same three numbers so it also
 * only ever grows:  major * 10_000_000 + minor * 100_000 + run.
 * (Capacitor's generated project ships versionCode 1 forever, which Android
 * treats as "not newer" - see patch-android-version.mjs.)
 *
 * Usage (CI):  node scripts/release/derive-version.mjs --run 123 >> "$GITHUB_ENV"
 * prints APP_VERSION=1.0.123 and APP_VERSION_CODE=10000123.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MAX_RUN = 99_999;

export function deriveVersion({ major, minor, run }) {
  for (const [k, v] of Object.entries({ major, minor, run })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${k} must be a non-negative integer, got ${v}`);
  }
  if (major > 99 || minor > 99) throw new Error('major and minor must be <= 99');
  if (run > MAX_RUN) throw new Error(`run number ${run} exceeds ${MAX_RUN}; bump release/version.json`);
  return {
    version: `${major}.${minor}.${run}`,
    versionCode: major * 10_000_000 + minor * 100_000 + run,
  };
}

export function readBase(file) {
  const base = JSON.parse(readFileSync(file, 'utf8'));
  return { major: base.major, minor: base.minor };
}

export function compareVersions(a, b) {
  const p = (v) => String(v || '0').replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pa = p(a);
  const pb = p(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run');
  const run = Number(runIdx >= 0 ? args[runIdx + 1] : NaN);
  const baseFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'release', 'version.json');
  const { version, versionCode } = deriveVersion({ ...readBase(baseFile), run });
  console.log(`APP_VERSION=${version}`);
  console.log(`APP_VERSION_CODE=${versionCode}`);
}
