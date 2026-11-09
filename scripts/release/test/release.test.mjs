import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveVersion, compareVersions } from '../derive-version.mjs';
import { buildInfo } from '../build-info.mjs';
import { patchGradle } from '../patch-android-version.mjs';
import { addRelease, withdrawRelease, parseNotes, emptyManifest, FALLBACK_NOTE } from '../manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('deriveVersion builds monotonic version and versionCode', () => {
  const a = deriveVersion({ major: 1, minor: 0, run: 9 });
  const b = deriveVersion({ major: 1, minor: 0, run: 10 });
  assert.equal(a.version, '1.0.9');
  assert.equal(a.versionCode, 10000009);
  assert.ok(b.versionCode > a.versionCode);
  assert.ok(deriveVersion({ major: 1, minor: 1, run: 1 }).versionCode > deriveVersion({ major: 1, minor: 0, run: 99999 }).versionCode);
  assert.ok(deriveVersion({ major: 2, minor: 0, run: 1 }).versionCode < 2_100_000_000);
});

test('deriveVersion rejects bad input', () => {
  assert.throws(() => deriveVersion({ major: 1, minor: 0, run: NaN }));
  assert.throws(() => deriveVersion({ major: 1, minor: 0, run: 100000 }));
  assert.throws(() => deriveVersion({ major: 100, minor: 0, run: 1 }));
});

test('compareVersions is numeric, not lexical', () => {
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('v1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1.0.2', '1.1.0'), -1);
});

test('derive-version CLI prints env lines', () => {
  const out = execFileSync('node', [path.join(here, '..', 'derive-version.mjs'), '--run', '42'], { encoding: 'utf8' });
  assert.match(out, /^APP_VERSION=1\.0\.42$/m);
  assert.match(out, /^APP_VERSION_CODE=10000042$/m);
});

test('buildInfo shortens the sha', () => {
  const i = buildInfo({ app: 'mobile', version: '1.0.3', versionCode: '10000003', sha: 'a'.repeat(40) });
  assert.equal(i.gitSha.length, 12);
  assert.equal(i.versionCode, 10000003);
  assert.ok(!Number.isNaN(Date.parse(i.builtAt)));
});

test('patchGradle replaces versionCode and versionName', () => {
  const src = 'defaultConfig {\n    versionCode 1\n    versionName "1.0"\n}';
  const out = patchGradle(src, '1.0.7', 10000007);
  assert.match(out, /versionCode 10000007/);
  assert.match(out, /versionName "1\.0\.7"/);
  assert.throws(() => patchGradle('nothing here', '1', 1));
});

const entry = (v, extra = {}) => ({ app: 'mobile', version: v, file: `app-${v}.apk`, sha256: 'x', notes: ['n'], ...extra });

test('addRelease keeps newest 3, reports pruned files, sets latest', () => {
  let m = emptyManifest('mobile');
  const removedAll = [];
  for (const v of ['1.0.1', '1.0.2', '1.0.10', '1.0.11']) {
    const r = addRelease(m, entry(v));
    m = r.manifest;
    removedAll.push(...r.removed.map((x) => x.file));
  }
  assert.deepEqual(m.releases.map((r) => r.version), ['1.0.11', '1.0.10', '1.0.2']);
  assert.equal(m.latest, '1.0.11');
  assert.deepEqual(removedAll, ['app-1.0.1.apk']);
});

test('addRelease is idempotent for the same version', () => {
  const a = addRelease(null, entry('1.0.5')).manifest;
  const b = addRelease(a, entry('1.0.5', { sha256: 'y' })).manifest;
  assert.equal(b.releases.length, 1);
  assert.equal(b.releases[0].sha256, 'y');
});

test('withdrawRelease moves latest to the previous good build', () => {
  let m = addRelease(null, entry('1.0.1')).manifest;
  m = addRelease(m, entry('1.0.2')).manifest;
  m = withdrawRelease(m, '1.0.2');
  assert.equal(m.latest, '1.0.1');
  assert.equal(m.releases[0].withdrawn, true);
  assert.throws(() => withdrawRelease(m, '9.9.9'));
  m = withdrawRelease(m, '1.0.1');
  assert.equal(m.latest, null);
});

test('parseNotes reads GitHub merge and squash commits', () => {
  const log = [
    'Merge pull request #176 from ELIGNITE-LTD/feat/x\x1fAdd oversight reasons\n\x1e',
    'Merge origin/main into feat/x\x1f\x1e',
    'Fix the report card (#180)\x1f\x1e',
    'Merge pull request #177 from a/b\x1fAdd oversight reasons\x1e',
  ].join('');
  assert.deepEqual(parseNotes(log), ['Add oversight reasons', 'Fix the report card']);
  assert.deepEqual(parseNotes(''), [FALLBACK_NOTE]);
});

test('manifest CLI add writes manifest with sha256 and size', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rel-'));
  const file = path.join(dir, 'eduignite-mobile-1.0.3.apk');
  writeFileSync(file, 'hello');
  const out = path.join(dir, 'new.json');
  execFileSync('node', [
    path.join(here, '..', 'manifest.mjs'), 'add', '--manifest', path.join(dir, 'missing.json'), '--app', 'mobile',
    '--file', file, '--version', '1.0.3', '--version-code', '10000003', '--sha', 'abc', '--min-os', 'Android 7.0',
    '--base-url', 'https://eduignite.online/downloads', '--out', out, '--removed-out', path.join(dir, 'removed.txt'),
  ]);
  const m = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(m.latest, '1.0.3');
  const r = m.releases[0];
  assert.equal(r.size_bytes, 5);
  assert.equal(r.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  assert.equal(r.url, 'https://eduignite.online/downloads/mobile/eduignite-mobile-1.0.3.apk');
  assert.equal(r.platform, 'android');
  assert.equal(r.min_os, 'Android 7.0');
});
