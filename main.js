const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const { exec } = require('child_process');
const { randomUUID } = require('crypto');

const DATA_FILE     = path.join(app.getPath('userData'), 'state.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

let mainWindow;
let httpServer   = null;
let serverStatus = { running: false, port: null, error: null };
let settings     = { port: 27182 };

// ── Settings ───────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE))
      settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch (e) { /* use defaults */ }
}

function saveSettingsToDisk() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (e) {}
}

// ── HTTP server ────────────────────────────────────────────────────────────

function startHttpServer(port) {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  const srv = http.createServer(handleHttpRequest);

  srv.on('error', (e) => {
    httpServer = null;
    serverStatus = {
      running: false,
      port:    null,
      error:   e.code === 'EADDRINUSE'
        ? `Port ${port} is already in use by another application.`
        : e.message,
    };
    notifyServerStatus();
  });

  srv.listen(port, '127.0.0.1', () => {
    httpServer   = srv;
    serverStatus = { running: true, port, error: null };
    notifyServerStatus();
  });
}

function notifyServerStatus() {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('server-status', serverStatus);
}

function corsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome 104+ Private Network Access: reflect the request header so Chrome
  // allows extension fetches to localhost without blocking the preflight.
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}

function handleHttpRequest(req, res) {
  corsHeaders(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/destinations') {
    handleGetDestinations(res);
  } else if (req.method === 'POST' && req.url === '/add') {
    handlePostAdd(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// ── State helpers (reads/writes the JSON file directly from main process) ──

function readState() {
  try {
    if (fs.existsSync(DATA_FILE))
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {}
  return null;
}

function writeState(state) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); } catch (e) {}
}

function findContextInState(state, id) {
  function search(ctx) {
    if (ctx.id === id) return ctx;
    for (const obj of ctx.canvas.objects) {
      if (obj.type === 'subcontext') {
        const found = search(obj.context);
        if (found) return found;
      }
    }
    return null;
  }
  for (const ctx of (state.contexts || [])) {
    const found = search(ctx);
    if (found) return found;
  }
  return null;
}

function buildDestinations(state) {
  const destinations = [];
  function traverse(ctx, parts) {
    if (ctx.archived) return;
    destinations.push({ id: ctx.id, displayPath: parts.join(' › ') });
    for (const obj of ctx.canvas.objects) {
      if (obj.type === 'subcontext' && !obj.archived)
        traverse(obj.context, [...parts, obj.context.name]);
    }
  }
  for (const ctx of (state.contexts || [])) traverse(ctx, [ctx.name]);
  return destinations;
}

// ── GET /destinations ──────────────────────────────────────────────────────

function handleGetDestinations(res) {
  const state = readState();
  if (!state) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'State not available' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(buildDestinations(state)));
}

// ── POST /add ──────────────────────────────────────────────────────────────

function handlePostAdd(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { url, label, destinationId, screenshot } = JSON.parse(body);
      if (!url || !destinationId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url and destinationId are required' }));
        return;
      }

      const state = readState();
      if (!state) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'State not available' }));
        return;
      }

      const ctx = findContextInState(state, destinationId);
      if (!ctx) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Destination context not found' }));
        return;
      }

      // Place object at the centre of the stored viewport
      const vp  = ctx.canvas.viewport;
      const vpW = 1000, vpH = 640; // reasonable estimate of canvas area
      const cx  = (vpW / 2 - vp.offsetX) / vp.scale;
      const cy  = (vpH / 2 - vp.offsetY) / vp.scale;

      const obj = {
        id:              randomUUID(),
        type:            'website',
        label:           label || url,
        url,
        image:           screenshot || null,
        x:               Math.round(cx - 100),
        y:               Math.round(cy - 65),
        width:           200,
        height:          130,
        archived:        false,
        attachedNoteIds: [],
      };

      ctx.canvas.objects.push(obj);
      writeState(state);

      // Tell the renderer to reload from disk
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('state-updated-externally');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id: obj.id }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    }
  });
}

// ── IPC: settings ──────────────────────────────────────────────────────────

ipcMain.handle('settings:load', () => ({ ...settings, serverStatus }));

ipcMain.handle('settings:save', (_e, updates) => {
  const portChanged = updates.port !== undefined && updates.port !== settings.port;
  settings = { ...settings, ...updates };
  saveSettingsToDisk();
  if (portChanged) startHttpServer(settings.port);
  return { ...settings, serverStatus };
});

ipcMain.handle('settings:status', () => serverStatus);

// ── IPC: state persistence ─────────────────────────────────────────────────

ipcMain.handle('state:load', () => {
  try {
    if (fs.existsSync(DATA_FILE))
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {}
  return null;
});

ipcMain.handle('state:save', (_e, state) => {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); return true; }
  catch (e) { return false; }
});

// ── IPC: system ────────────────────────────────────────────────────────────

ipcMain.handle('apps:list', () => new Promise(resolve => {
  exec("mdfind \"kMDItemKind == 'Application'\" 2>/dev/null | head -500",
    { maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const apps = stdout.trim().split('\n')
        .filter(p => p.endsWith('.app'))
        .map(p => ({ bundlePath: p, appName: path.basename(p, '.app') }))
        .sort((a, b) => a.appName.localeCompare(b.appName));
      resolve(apps);
    });
}));

ipcMain.handle('file:icon', async (_e, filePath) => {
  try { return (await app.getFileIcon(filePath, { size: 'large' })).toDataURL(); }
  catch (e) { return null; }
});

ipcMain.handle('file:open',  (_e, filePath) => shell.openPath(filePath));
ipcMain.handle('app:launch', (_e, bundlePath) => shell.openPath(bundlePath));
ipcMain.handle('url:open',   (_e, url) => shell.openExternal(url));

ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('web:screenshot', async (_e, url) => new Promise(resolve => {
  let win;
  const timeout = setTimeout(() => { if (win && !win.isDestroyed()) win.destroy(); resolve(null); }, 15000);
  try {
    win = new BrowserWindow({ width: 1280, height: 800, show: false,
      webPreferences: { contextIsolation: true } });
    win.webContents.on('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const img = await win.webContents.capturePage();
        clearTimeout(timeout); win.destroy(); resolve(img.toDataURL());
      } catch { clearTimeout(timeout); if (!win.isDestroyed()) win.destroy(); resolve(null); }
    });
    win.webContents.on('did-fail-load', () => { clearTimeout(timeout); if (!win.isDestroyed()) win.destroy(); resolve(null); });
    win.loadURL(url);
  } catch { clearTimeout(timeout); resolve(null); }
}));

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 800, minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  mainWindow.loadFile('renderer/index.html');
  if (process.env.DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  startHttpServer(settings.port);
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
