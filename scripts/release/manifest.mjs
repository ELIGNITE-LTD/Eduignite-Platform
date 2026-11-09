#!/usr/bin/env node
/**
 * Release manifest (one file per app: releases-mobile.json / releases-desktop.json
 * in the VPS downloads directory, served at https://eduignite.online/downloads/).
 *
 * Shape:
 *   { schema: 1, app, updated_at, latest: "1.0.12" | null, releases: [
 *       { version, version_code, platform, file, url, size_bytes, sha256,
 *         built_at, git_sha, min_os, notes: [..], withdrawn?: true } ] }
 * releases are newest first; only the newest KEEP (3) are retained.
 *
 * Subcommands (all file based, no network):
 *   add       --manifest cur.json --app mobile --file <artifact> --version V --version-code C
 *             --sha SHA --built-at ISO --min-os "Android 7.0" --notes-file notes.json
 *             --base-url https://eduignite.online/downloads --out new.json --removed-out removed.txt
 *   withdraw  --manifest cur.json --version V --out new.json
 *   notes     --from-sha SHA --paths "apps/mobile release" [--to HEAD]   (prints JSON array)
 *   last-sha  --manifest cur.json                                           (prints git sha of latest)
 *   latest    --manifest cur.json                                           (prints "<version> <file>")
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compareVersions } from './derive-version.mjs';

export const KEEP = 3;
export const FALLBACK_NOTE = 'Improvements and fixes.';

export function emptyManifest(app) {
  return { schema: 1, app, updated_at: null, latest: null, releases: [] };
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function recomputeLatest(m) {
  const live = m.releases.filter((r) => !r.withdrawn);
  m.latest = live.length ? live[0].version : null;
  return m;
}

/** Adds (or replaces) a release, keeps the newest KEEP, returns { manifest, removed } */
export function addRelease(manifest, entry, now = new Date().toISOString()) {
  const m = structuredClone(manifest && manifest.releases ? manifest : emptyManifest(entry.app));
  m.schema = 1;
  m.app = entry.app || m.app;
  const { app, ...rest } = entry;
  const releases = m.releases.filter((r) => r.version !== rest.version);
  releases.push(rest);
  releases.sort((a, b) => compareVersions(b.version, a.version));
  const removed = releases.slice(KEEP);
  m.releases = releases.slice(0, KEEP);
  m.updated_at = now;
  recomputeLatest(m);
  return { manifest: m, removed };
}

export function withdrawRelease(manifest, version, now = new Date().toISOString()) {
  const m = structuredClone(manifest);
  const r = m.releases.find((x) => x.version === version);
  if (!r) throw new Error(`version ${version} is not in the manifest`);
  r.withdrawn = true;
  m.updated_at = now;
  recomputeLatest(m);
  return m;
}

/**
 * Turns `git log --first-parent --pretty=format:%s%x1f%b%x1e` output into
 * release-note lines (one per merged PR). GitHub merge commits carry the PR
 * title as their body; squash commits carry it as "Title (#123)".
 */
export function parseNotes(log) {
  const notes = [];
  for (const rec of String(log).split('\x1e')) {
    const [subjectRaw = '', bodyRaw = ''] = rec.split('\x1f');
    const subject = subjectRaw.trim();
    if (!subject) continue;
    let title = null;
    if (/^Merge pull request #\d+/.test(subject)) {
      title = bodyRaw.split('\n').map((l) => l.trim()).find(Boolean) || null;
    } else if (/^Merge (branch|remote-tracking|origin)/.test(subject)) {
      title = null;
    } else {
      title = subject.replace(/\s*\(#\d+\)\s*$/, '');
    }
    if (title && !notes.includes(title)) notes.push(title);
  }
  return notes.length ? notes.slice(0, 15) : [FALLBACK_NOTE];
}

export function gitNotes({ fromSha, to = 'HEAD', paths }) {
  const range = fromSha ? `${fromSha}..${to}` : `${to}`;
  const args = ['log', range, '--first-parent', '--pretty=format:%s%x1f%b%x1e', ...(fromSha ? [] : ['-n', '15'])];
  if (paths?.length) args.push('--', ...paths);
  try {
    return parseNotes(execFileSync('git', args, { encoding: 'utf8' }));
  } catch {
    // unknown base sha (force-push, shallow clone): do not fail a release over notes
    return [FALLBACK_NOTE];
  }
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

function loadManifest(file) {
  if (!file || !existsSync(file)) return null;
  try {
    const m = JSON.parse(readFileSync(file, 'utf8'));
    return m && Array.isArray(m.releases) ? m : null;
  } catch {
    return null;
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const a = args(rest);
  if (cmd === 'add') {
    const file = a.file;
    const name = path.basename(file);
    const folder = a.app;
    const entry = {
      app: a.app,
      version: a.version,
      version_code: a['version-code'] ? Number(a['version-code']) : null,
      platform: a.app === 'mobile' ? 'android' : 'windows',
      file: name,
      url: `${a['base-url']}/${folder}/${name}`,
      size_bytes: statSync(file).size,
      sha256: sha256File(file),
      built_at: a['built-at'] || new Date().toISOString(),
      git_sha: a.sha || null,
      min_os: a['min-os'] || null,
      notes: a['notes-file'] && existsSync(a['notes-file']) ? JSON.parse(readFileSync(a['notes-file'], 'utf8')) : [FALLBACK_NOTE],
    };
    const { manifest, removed } = addRelease(loadManifest(a.manifest), entry);
    writeFileSync(a.out, JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(a['removed-out'], removed.map((r) => r.file).join('\n') + (removed.length ? '\n' : ''));
    console.log(`manifest: latest ${manifest.latest}, ${manifest.releases.length} kept, ${removed.length} pruned`);
  } else if (cmd === 'withdraw') {
    const cur = loadManifest(a.manifest);
    if (!cur) throw new Error('no manifest to withdraw from');
    writeFileSync(a.out, JSON.stringify(withdrawRelease(cur, a.version), null, 2) + '\n');
  } else if (cmd === 'notes') {
    console.log(JSON.stringify(gitNotes({ fromSha: a['from-sha'], to: a.to, paths: a.paths ? a.paths.split(/\s+/) : [] })));
  } else if (cmd === 'last-sha') {
    const m = loadManifest(a.manifest);
    const r = m?.releases.find((x) => x.version === m.latest) || m?.releases[0];
    console.log(r?.git_sha || '');
  } else if (cmd === 'latest') {
    const m = loadManifest(a.manifest);
    const r = m?.releases.find((x) => x.version === m.latest);
    console.log(r ? `${r.version} ${r.file}` : '');
  } else {
    throw new Error(`unknown subcommand: ${cmd}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
