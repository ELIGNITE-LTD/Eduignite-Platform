import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

// EduIgnite Offline — renderer (React) + Electron main/preload build, all
// driven from a single Vite pipeline. Native modules (better-sqlite3-based)
// are marked external so esbuild doesn't try to bundle their .node binaries.
const nativeExternals = ['better-sqlite3-multiple-ciphers', 'pdfmake'];

export default defineConfig({
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
