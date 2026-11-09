#!/usr/bin/env node
/**
 * Sets versionCode / versionName in the Capacitor-generated android/app/build.gradle
 * (scaffolded fresh in CI, so it cannot be committed).
 *   node patch-android-version.mjs android/app/build.gradle   (needs APP_VERSION, APP_VERSION_CODE)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function patchGradle(src, version, versionCode) {
  let n = 0;
  let out = src.replace(/versionCode\s+\d+/, () => (n++, `versionCode ${versionCode}`));
  out = out.replace(/versionName\s+"[^"]*"/, () => (n++, `versionName "${version}"`));
  if (n !== 2) throw new Error('could not find versionCode and versionName in build.gradle');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const { APP_VERSION, APP_VERSION_CODE } = process.env;
  if (!file || !APP_VERSION || !APP_VERSION_CODE) throw new Error('usage: <build.gradle> with APP_VERSION and APP_VERSION_CODE set');
  writeFileSync(file, patchGradle(readFileSync(file, 'utf8'), APP_VERSION, APP_VERSION_CODE));
  console.log(`build.gradle: versionName ${APP_VERSION}, versionCode ${APP_VERSION_CODE}`);
}
