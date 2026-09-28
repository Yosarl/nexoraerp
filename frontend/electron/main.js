var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { app, BrowserWindow, shell, Menu, dialog, utilityProcess, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
var __dirname = path.dirname(fileURLToPath(import.meta.url));
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
export var VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export var RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
var BACKEND_PORT = 5000;
var backendChild = null;
var mainWindow = null;
// ── Resolve backend entry path ──────────────────────────────────────
function getBackendEntry() {
    if (app.isPackaged) {
        // extraResources places the backend directly in resources/backend/
        return path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
    }
    // In dev: the repo root is one level above frontend/
    return path.join(process.env.APP_ROOT, '..', 'backend', 'dist', 'index.js');
}
// ── Resolve backend working directory ───────────────────────────────
function getBackendCwd() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'backend');
    }
    return path.join(process.env.APP_ROOT, '..', 'backend');
}
// ── Start the Express backend using Electron's utilityProcess ───────
function startBackend() {
    return new Promise(function (resolve, reject) {
        var _a, _b;
        var entry = getBackendEntry();
        var cwd = getBackendCwd();
        console.log("[electron] Starting backend: ".concat(entry));
        console.log("[electron] Backend cwd: ".concat(cwd));
        // Verify the backend entry file exists before attempting to start
        if (!fs.existsSync(entry)) {
            reject(new Error("Backend entry not found: ".concat(entry)));
            return;
        }
        // Use Electron's utilityProcess.fork() — it's designed for spawning
        // Node.js child processes inside packaged Electron apps and avoids
        // the process.execPath quoting issues that child_process.fork() has
        // on Windows when the exe path contains special characters.
        // Use a writable location for uploads and data.
        // C:\Program Files\ is read-only, so redirect to the user's app data dir.
        var userDataDir = app.getPath('userData');
        var uploadsDir = path.join(userDataDir, 'data');
        backendChild = utilityProcess.fork(entry, [], {
            stdio: 'pipe',
            env: __assign(__assign({}, process.env), { NODE_ENV: 'production', PORT: String(BACKEND_PORT), 
                // Pass cwd as an env var since utilityProcess doesn't support cwd option.
                BACKEND_CWD: cwd, 
                // Writable directory for uploads and any data the backend writes
                UPLOAD_DIR: uploadsDir }),
        });
        (_a = backendChild.stdout) === null || _a === void 0 ? void 0 : _a.on('data', function (data) {
            console.log("[backend] ".concat(data.toString().trim()));
        });
        (_b = backendChild.stderr) === null || _b === void 0 ? void 0 : _b.on('data', function (data) {
            console.error("[backend:err] ".concat(data.toString().trim()));
        });
        backendChild.on('exit', function (code) {
            console.log("[electron] Backend process exited with code ".concat(code));
            backendChild = null;
        });
        // Poll until the backend is accepting connections
        waitForServer("http://localhost:".concat(BACKEND_PORT, "/api/health"), 30000)
            .then(function () {
            console.log('[electron] Backend is ready');
            resolve();
        })
            .catch(function (err) {
            console.error('[electron] Backend did not become ready in time');
            reject(err);
        });
    });
}
// ── Wait for the server to respond ──────────────────────────────────
function waitForServer(url, timeoutMs) {
    var start = Date.now();
    return new Promise(function (resolve, reject) {
        var check = function () {
            http
                .get(url, function (res) {
                res.resume();
                resolve();
            })
                .on('error', function () {
                if (Date.now() - start > timeoutMs) {
                    reject(new Error("Server at ".concat(url, " not ready after ").concat(timeoutMs, "ms")));
                }
                else {
                    setTimeout(check, 500);
                }
            });
        };
        check();
    });
}
// ── Stop the backend process ────────────────────────────────────────
function stopBackend() {
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
        icon: path.join(process.env.APP_ROOT, 'public', 'vite.svg'),
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
    mainWindow.once('ready-to-show', function () {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.show();
    });
    mainWindow.webContents.setWindowOpenHandler(function (_a) {
        var url = _a.url;
        if (url.startsWith('https:') || url.startsWith('http:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    // Hide the application menu
    Menu.setApplicationMenu(null);
    if (VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
    }
    else {
        mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }
}
// ── IPC handlers for window controls ─────────────────────────────────
ipcMain.on('minimize-window', function () {
    mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.minimize();
});
ipcMain.on('close-window', function () {
    mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.close();
});
// ── App lifecycle ───────────────────────────────────────────────────
app.on('window-all-closed', function () {
    mainWindow = null;
    stopBackend();
    app.quit();
});
app.on('before-quit', function () {
    stopBackend();
});
app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
app.whenReady().then(function () { return __awaiter(void 0, void 0, void 0, function () {
    var err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, startBackend()];
            case 1:
                _a.sent();
                createWindow();
                return [3 /*break*/, 3];
            case 2:
                err_1 = _a.sent();
                console.error('[electron] Fatal: could not start backend', err_1);
                dialog.showErrorBox('Startup Error', "Could not start the backend server.\n\n".concat(String(err_1), "\n\nMake sure MongoDB is running and try again."));
                app.quit();
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Reload trigger for backend build
