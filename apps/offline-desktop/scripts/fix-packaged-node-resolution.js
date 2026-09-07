#!/usr/bin/env node
// Self-heals CommonJS require() resolution across a packaged (extracted
// app.asar) node_modules tree: for every package, checks that each of its
// declared `dependencies` actually resolves the way Node's real algorithm
// would (own node_modules, then walking up), and if not, finds any working
// copy elsewhere in the tree and vendors it into the requiring package's
// own node_modules.
//
// Why this exists: a real crash on install ("Cannot find module
// 'call-bind-apply-helpers'" from inside dunder-proto/get.js) was root-
// caused to this -- npm's flat hoisting plus electron-builder's own asar
// packing/dedup logic can produce a node_modules layout where e.g.
// `get-intrinsic` requires `call-bind-apply-helpers`, a copy exists
// SOMEWHERE in the tree (nested under a sibling package like `call-bind`),
// but not anywhere on get-intrinsic's actual Node resolution path. This was
// reproduced as genuinely non-deterministic run-to-run (which specific
// packages end up mis-nested varies), which is exactly why this is a
// generic self-healing pass over the whole tree rather than a one-off
// pinned fix for the specific packages seen during investigation.
//
// Used by .github/workflows/offline-desktop.yml between building the
// unpacked app (`electron-builder --win dir`) and building the NSIS
// installer from it (`electron-builder --win nsis --prepackaged ...`) --
// see that workflow for the full extract/heal/repack sequence.
const fs = require('fs');
const path = require('path');

const appRootArg = process.argv[2];
if (!appRootArg) {
  console.error('Usage: node fix-packaged-node-resolution.js <path containing node_modules>');
  process.exit(1);
}
// Absolute + never walk above this directory -- a relative path here would
// let the upward directory walk escape the packaged tree entirely and
// resolve against whatever unrelated node_modules happens to sit above the
// current working directory, silently hiding exactly the bug this script
// exists to catch.
const appRoot = path.resolve(appRootArg);
const nodeModulesRoot = path.join(appRoot, 'node_modules');

function collectPackageDirs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.bin') continue;
    if (entry.name.startsWith('@')) {
      collectPackageDirs(path.join(dir, entry.name), out);
      continue;
    }
    const pkgDir = path.join(dir, entry.name);
    out.push(pkgDir);
    const nested = path.join(pkgDir, 'node_modules');
    if (fs.existsSync(nested)) collectPackageDirs(nested, out);
  }
  return out;
}

function resolvesFrom(startDir, pkgName, boundaryDir) {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...pkgName.split('/'));
    if (fs.existsSync(candidate)) return candidate;
    if (dir === boundaryDir) return null; // never search outside the packaged tree
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const allPkgDirs = collectPackageDirs(nodeModulesRoot);
console.log(`Scanning ${allPkgDirs.length} package directories under ${nodeModulesRoot}`);

// Build a name -> first-found-dir index for fallback lookups.
const byName = new Map();
for (const dir of allPkgDirs) {
  const base = path.basename(dir);
  const parentBase = path.basename(path.dirname(path.dirname(dir)));
  const name = parentBase.startsWith('@') ? `${parentBase}/${base}` : base;
  if (!byName.has(name)) byName.set(name, dir);
}

let fixedCount = 0;
let warnCount = 0;

for (const pkgDir of allPkgDirs) {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) continue;
  let pkgJson;
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    continue;
  }
  const deps = Object.keys(pkgJson.dependencies || {});
  for (const dep of deps) {
    if (resolvesFrom(pkgDir, dep, appRoot)) continue;
    const source = byName.get(dep);
    if (!source) {
      console.warn(`WARNING: ${pkgJson.name || path.basename(pkgDir)} requires "${dep}", no copy found anywhere in the tree`);
      warnCount++;
      continue;
    }
    const dest = path.join(pkgDir, 'node_modules', ...dep.split('/'));
    copyDir(source, dest);
    console.log(`Fixed: ${pkgJson.name || path.basename(pkgDir)} -> ${dep} (vendored from ${path.relative(nodeModulesRoot, source)})`);
    fixedCount++;
  }
}

console.log(`\nDone. ${fixedCount} local resolution(s) fixed, ${warnCount} unresolved warning(s).`);
if (warnCount > 0) process.exitCode = 1;
