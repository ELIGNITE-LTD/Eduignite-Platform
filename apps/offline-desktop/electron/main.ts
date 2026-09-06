import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { openDatabase } from '../src/db/connection';
import { registerIpcHandlers } from '../src/ipc/handlers';
import { setPublicKeyPemPath } from '../src/licensing/crypto';
import { checkLicenseGate } from '../src/licensing/gate';

// EduIgnite Offline — Electron shell.
//
// Unlike apps/desktop (a thin wrapper around a remote Next.js server), this
// app is fully local: there is no server process to spawn or wait on. On
// `app.whenReady()` we open the encrypted SQLite database (creating +
// migrating it on first run), wire every IPC handler the renderer needs, and
// show a window loading either the Vite dev server (dev) or the built
// renderer bundle (prod). contextIsolation stays on and nodeIntegration off,
// matching the company convention in apps/desktop/electron/main.js — the
// renderer never touches Node/Electron APIs directly, only via preload's
// `window.api` bridge.

const isDev = !!process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function userDataPaths() {
  const base = app.getPath('userData');
  return {
    dbPath: path.join(base, 'data', 'eduignite-offline.sqlite'),
    keyFilePath: path.join(base, 'data', 'eduignite-offline.key'),
    migrationsDir: isDev
      ? path.join(__dirname, '..', 'src', 'db', 'migrations')
      : path.join(process.resourcesPath, 'migrations'),
    // See src/licensing/crypto.ts (setPublicKeyPemPath) for why this can't
    // just be a __dirname-relative path inside the bundled main process.
    publicKeyPemPath: isDev
      ? path.join(__dirname, '..', 'src', 'licensing', 'public-key.pem')
      : path.join(process.resourcesPath, 'public-key.pem'),
    reportsDir: path.join(base, 'report-cards'),
    receiptsDir: path.join(base, 'receipts'),
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#F0F2F5',
    title: 'EduIgnite Offline',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

app.whenReady().then(() => {
  const paths = userDataPaths();
  setPublicKeyPemPath(paths.publicKeyPemPath);

  const db = openDatabase({
    dbPath: paths.dbPath,
    keyFilePath: paths.keyFilePath,
    migrationsDir: paths.migrationsDir,
  });

  // Evaluate the licensing gate once at startup (spec section 5) — this also
  // stamps the first-year-free entitlement on a genuine first run and
  // advances the clock-tamper watermark. Every write-path IPC handler
  // re-checks the gate itself (src/ipc/handlers.ts), so nothing here needs
  // to be cached or block window creation; this call is just so a startup
  // read-only/expired state is visible in logs immediately.
  const startupGate = checkLicenseGate(db);
  if (startupGate.readOnly) {
    console.warn(`[licensing] Starting in read-only mode: ${startupGate.message}`);
  }

  registerIpcHandlers(db, { reportsDir: paths.reportsDir, receiptsDir: paths.receiptsDir });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
