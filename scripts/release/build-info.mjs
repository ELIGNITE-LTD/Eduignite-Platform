#!/usr/bin/env node
/**
 * Writes public/build-info.json into an app so the build can show
 * "version, commit, build date" in its About/Settings screen.
 *
 *   node scripts/release/build-info.mjs --app mobile --out apps/mobile/public/build-info.json
 * Reads APP_VERSION, APP_VERSION_CODE, GITHUB_SHA from the environment.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function buildInfo({ app, version, versionCode, sha, builtAt }) {
  return {
    app,
    version,
    versionCode: versionCode ? Number(versionCode) : null,
    gitSha: sha ? String(sha).slice(0, 12) : null,
    builtAt: builtAt || new Date().toISOString(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const out = get('--out');
  if (!out || !get('--app')) throw new Error('usage: --app <name> --out <file>');
  const info = buildInfo({
    app: get('--app'),
    version: process.env.APP_VERSION,
    versionCode: process.env.APP_VERSION_CODE,
    sha: process.env.GITHUB_SHA,
  });
  if (!info.version) throw new Error('APP_VERSION is not set');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(info, null, 2) + '\n');
  console.log(`wrote ${out}: ${info.version} (${info.gitSha})`);
}
