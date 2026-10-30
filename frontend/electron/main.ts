import { app, BrowserWindow, shell, Menu, dialog, utilityProcess, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Directory layout ────────────────────────────────────────────────
//
// Development (vite dev server running):
//   frontend/
//   ├─ electron/main.ts          ← we are here (transpiled to dist-electron/)
//   └─ ...
//   backend/
//   └─ dist/index.js             ← compiled backend
//
// Production (packaged by electron-builder):
//   resources/
//   ├─ app.asar                  ← renderer + dist-electron
//   └─ backend/                  ← extraResources (real filesystem)
//       ├─ dist/index.js
//       ├─ node_modules/
//       └─ package.json
// ─────────────────────────────────────────────────────────────────────

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

const BACKEND_PORT = 5000;
let backendChild: Electron.UtilityProcess | null = null;
let mainWindow: BrowserWindow | null = null;

// ── Resolve backend entry path ──────────────────────────────────────
function getBackendEntry(): string {
  if (app.isPackaged) {
    // extraResources places the backend directly in resources/backend/
    return path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
  }
  // In dev: the repo root is one level above frontend/
  return path.join(process.env.APP_ROOT!, '..', 'backend', 'dist', 'index.js');
}

// ── Resolve backend working directory ───────────────────────────────
function getBackendCwd(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend');
  }
  return path.join(process.env.APP_ROOT!, '..', 'backend');
}

// ── Start the Express backend using Electron's utilityProcess ───────
async function startBackend(): Promise<void> {
  // Check if backend is already running (e.g. via 'npm run dev:backend')
  const alreadyRunning = await new Promise<boolean>((resolve) => {
    const req = http.get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });

  if (alreadyRunning) {
    console.log(`[electron] Backend is already running on port ${BACKEND_PORT}`);
    return;
  }

  return new Promise((resolve, reject) => {
    const entry = getBackendEntry();
    const cwd = getBackendCwd();

    console.log(`[electron] Starting backend: ${entry}`);
    console.log(`[electron] Backend cwd: ${cwd}`);

    // Verify the backend entry file exists before attempting to start
    if (!fs.existsSync(entry)) {
      reject(new Error(`Backend entry not found: ${entry}`));
      return;
    }

    // Use Electron's utilityProcess.fork() — it's designed for spawning
    // Node.js child processes inside packaged Electron apps and avoids
    // the process.execPath quoting issues that child_process.fork() has
    // on Windows when the exe path contains special characters.
    // Use a writable location for uploads and data.
    // C:\Program Files\ is read-only, so redirect to the user's app data dir.
    const userDataDir = app.getPath('userData');
    const uploadsDir = path.join(userDataDir, 'data');

    backendChild = utilityProcess.fork(entry, [], {
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(BACKEND_PORT),
        // Pass cwd as an env var since utilityProcess doesn't support cwd option.
        BACKEND_CWD: cwd,
        // Writable directory for uploads and any data the backend writes
        UPLOAD_DIR: uploadsDir,
      },
    });

    backendChild.stdout?.on('data', (data: Buffer) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });

    backendChild.stderr?.on('data', (data: Buffer) => {
      console.error(`[backend:err] ${data.toString().trim()}`);
    });

    backendChild.on('exit', (code) => {
      console.log(`[electron] Backend process exited with code ${code}`);
      backendChild = null;
    });

    // Poll until the backend is accepting connections
    waitForServer(`http://localhost:${BACKEND_PORT}/api/health`, 30_000)
      .then(() => {
        console.log('[electron] Backend is ready');
        resolve();
      })
      .catch((err) => {
        console.error('[electron] Backend did not become ready in time');
        reject(err);
      });
  });
}

// ── Wait for the server to respond ──────────────────────────────────
function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Server at ${url} not ready after ${timeoutMs}ms`));
          } else {
            setTimeout(check, 500);
          }
        });
    };
    check();
  });
}

// ── Stop the backend process ────────────────────────────────────────
function stopBackend(): void {
  if (backendChild) {
    console.log('[electron] Stopping backend process…');
    backendChild.kill();
    backendChild = null;
  }
}

// ── Create the main window ──────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(process.env.APP_ROOT!, 'public', 'vite.svg'),
    title: 'Supermarket Inventory & Accounting',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    autoHideMenuBar: true,
    fullscreen: true,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Hide the application menu
  Menu.setApplicationMenu(null);

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// ── IPC handlers for window controls ─────────────────────────────────
ipcMain.on('minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.on('close-window', () => {
  mainWindow?.close();
});

ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err) {
    console.error('[electron] Failed to get printers', err);
    return [];
  }
});

// ── App lifecycle ───────────────────────────────────────────────────
app.on('window-all-closed', () => {
  mainWindow = null;
  stopBackend();
  app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (err) {
    console.error('[electron] Fatal: could not start backend', err);
    dialog.showErrorBox(
      'Startup Error',
      `Could not start the backend server.\n\n${String(err)}\n\nMake sure MongoDB is running and try again.`
    );
    app.quit();
  }
});
// Reload trigger for backend build

