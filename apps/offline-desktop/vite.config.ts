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
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: nativeExternals },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
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
