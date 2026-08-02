// After `next build` (output: 'standalone'), Next emits a self-contained
// server at .next/standalone/server.js but does NOT copy the static assets
// or the public/ folder next to it. This script copies them so the server
// can serve /_next/static and public files when launched by Electron.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(standalone)) {
  console.error('[prepare-standalone] .next/standalone not found. Run `next build` first.');
  process.exit(1);
}

copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(standalone, 'public'));

console.log('[prepare-standalone] Copied .next/static and public into the standalone server.');
