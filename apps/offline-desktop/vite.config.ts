import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import fs from 'node:fs';

// EduIgnite Offline — renderer (React) + Electron main/preload build, all
// driven from a single Vite pipeline. Native modules (better-sqlite3-based)
// are marked external so esbuild doesn't try to bundle their .node binaries.
const nativeExternals = ['better-sqlite3-multiple-ciphers', 'pdfmake'];

// The app's own version, baked into the renderer bundle at build time so
// src/update/checkForUpdate.ts can compare it against the backend's
// latest/min-supported versions without any extra IPC round trip.
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

// src/setup/setupClient.ts and src/sync/syncClient.ts run inside Electron's
// MAIN process (a real Node.js process, not the renderer), and read
// `process.env.VITE_OFFLINE_API_BASE_URL`. Unlike the renderer's
// `import.meta.env.VITE_*`, Vite does NOT automatically replace
// `process.env.*` at build time for the main-process sub-build — it stayed a
// genuine runtime env-var lookup in the packaged app.asar. That's fine for
// `npm run dev` (a real shell env var can be set), but it silently broke
// every packaged, distributed build: CI's build-time environment does not
// carry over into the runtime environment of the .exe on an end user's
// machine, which never has this variable set, so every shipped installer's
// setup wizard/sync client fell back to the `http://localhost:8000` dev
// default and reported "Could not reach the EduIgnite server" even when
// genuinely online (confirmed empirically: built locally with the var set,
// inspected dist-electron/main.js, found the literal `process.env.VITE_...`
// property access still present, unreplaced).
//
// Fix: bake it in as a build-time literal the same way __APP_VERSION__
// already is. `JSON.stringify(process.env.VITE_OFFLINE_API_BASE_URL || '')`
// only replaces the property access itself, so the existing
// `... || 'http://localhost:8000'` fallback in setupClient.ts/syncClient.ts
// still works unchanged for local dev (empty string is falsy) — this only
// fixes what CI's real value actually does once baked in.
const offlineApiBaseUrlDefine = {
  'process.env.VITE_OFFLINE_API_BASE_URL': JSON.stringify(process.env.VITE_OFFLINE_API_BASE_URL || ''),
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          define: offlineApiBaseUrlDefine,
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: nativeExternals },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          define: offlineApiBaseUrlDefine,
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: nativeExternals },
          },
        },
      },
      renderer: {},
    }),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
