// EduIgnite Desktop — Electron shell.
//
// The desktop app is the exact web frontend (Next.js) running inside a native
// window. In production we launch the Next standalone server as a child
// process (using Electron's bundled Node via ELECTRON_RUN_AS_NODE) and load it
// in a BrowserWindow, so the UI, styling and behaviour are byte-identical to
// the web application. It talks to the same api.eduignite.online backend.

const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// The renderer is served from http://127.0.0.1 but the API lives on
// api.eduignite.online, which only allow-lists the web domain. A browser would
// block those cross-origin responses (CORS), so we inject permissive CORS
// headers on responses from our own backend — the standard way a trusted
// desktop app talks to a CORS-protected API it owns. Auth uses Bearer tokens
// (no cookies), so a wildcard origin is safe here.
const API_HOSTS = [
  'https://api.eduignite.online/*',
  'http://api.eduignite.online/*',
];

function installCorsBypass() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: API_HOSTS },
    (details, callback) => {
      const responseHeaders = details.responseHeaders || {};
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase().startsWith('access-control-')) {
          delete responseHeaders[key];
        }
      }
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = [
        'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      ];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      callback({ responseHeaders });
    }
  );
}

const PORT = 34613;
const HOST = '127.0.0.1';
const APP_URL = `http://${HOST}:${PORT}`;

let serverProcess = null;
let mainWindow = null;

function serverEntry() {
  // Packaged: copied to resources/next-server via electron-builder extraResources.
  // Dev/unpackaged: the .next/standalone build output in the project.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'next-server', 'server.js')
    : path.join(__dirname, '..', '.next', 'standalone', 'server.js');
}

function startServer() {
  serverProcess = spawn(process.execPath, [serverEntry()], {
    cwd: path.dirname(serverEntry()),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: HOST,
    },
    stdio: 'inherit',
  });
  serverProcess.on('error', (err) => console.error('[next-server] failed to start:', err));
  serverProcess.on('exit', (code) => console.log('[next-server] exited with', code));
}

function waitForServer(done, attempt = 0) {
  const req = http.get(APP_URL, () => done());
  req.on('error', () => {
    if (attempt > 150) return done(new Error('Next server did not start in time'));
    setTimeout(() => waitForServer(done, attempt + 1), 200);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#ffffff',
    title: 'EduIgnite',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  const splash = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    backgroundColor: '#4B2FD1',
    center: true,
    show: true,
  });
  splash.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#4B2FD1;color:#fff;font-family:Segoe UI,Arial,sans-serif">
           <div style="font-size:30px;font-weight:800;letter-spacing:.5px">EduIgnite</div>
           <div style="margin-top:10px;font-size:13px;opacity:.85">Starting your workspace…</div>
         </body>`
      )
  );

  waitForServer((err) => {
    if (err) {
      mainWindow.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            `<body style="font-family:Segoe UI,Arial,sans-serif;padding:40px;color:#1d1b33">
               <h2>EduIgnite could not start</h2>
               <p>The application server failed to launch. Please reopen the app.</p>
             </body>`
          )
      );
    } else {
      mainWindow.loadURL(APP_URL);
    }
    mainWindow.once('ready-to-show', () => {
      if (!splash.isDestroyed()) splash.destroy();
      mainWindow.show();
    });
  });

  // External links (http/https not on our host) open in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// Windows toast notifications show the app name/icon only with an AppUserModelID.
app.setAppUserModelId('online.eduignite.desktop');

app.whenReady().then(() => {
  installCorsBypass();
  startServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function shutdown() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.on('window-all-closed', () => {
  shutdown();
  if (process.platform !== 'darwin') app.quit();
});
app.on('quit', shutdown);
app.on('before-quit', shutdown);
