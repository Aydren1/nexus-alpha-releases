const { app, BrowserWindow, Notification, shell, ipcMain, globalShortcut, desktopCapturer, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('STARLADDER');
app.setAppUserModelId('com.starladder.sccompetitive.desktop');
// Retain the previous product folder only when it already exists so updates keep
// the user's authenticated session and local settings after the STARLADDER rename.
const legacyUserDataPath = path.join(app.getPath('appData'), 'NEXUS');
if (fs.existsSync(legacyUserDataPath)) app.setPath('userData', legacyUserDataPath);

const isDev = !app.isPackaged;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let captureShortcut = '';
let activeMatchId = '';
let captureInFlight = false;

if (!hasSingleInstanceLock) app.quit();

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

function captureRoot() {
  return path.join(app.getPath('pictures'), 'StarLadder', 'Captures');
}

function legacyCaptureRoot() {
  return path.join(app.getPath('pictures'), 'NEXUS', 'Captures');
}

function captureSettingsPath() {
  return path.join(app.getPath('appData'), 'StarLadder', 'capture-settings.json');
}

function readCaptureSettings() {
  const stablePath = captureSettingsPath();
  const legacyPaths = [
    path.join(app.getPath('appData'), 'NEXUS', 'capture-settings.json'),
    path.join(app.getPath('userData'), 'capture-settings.json'),
  ];
  for (const settingsPath of [...new Set([stablePath, ...legacyPaths])]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const accelerator = typeof parsed.accelerator === 'string' ? parsed.accelerator : '';
      if (!accelerator) continue;
      if (settingsPath !== stablePath) {
        fs.mkdirSync(path.dirname(stablePath), { recursive: true });
        fs.writeFileSync(stablePath, JSON.stringify({ accelerator }, null, 2), 'utf8');
      }
      return { accelerator };
    } catch { /* Try the next known settings location. */ }
  }
  return { accelerator: '' };
}

function isSafeAccelerator(accelerator) {
  if (typeof accelerator !== 'string' || accelerator.length > 48) return false;
  const parts = accelerator.split('+');
  const key = parts.at(-1);
  const modifiers = parts.slice(0, -1);
  const allowedModifiers = new Set(['Control', 'Alt', 'Shift', 'Super']);
  const validKey = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|PrintScreen)$/.test(key || '');
  return validKey && modifiers.length > 0 && modifiers.every((part, index) => allowedModifiers.has(part) && modifiers.indexOf(part) === index);
}

function safeMatchId(value) {
  const matchId = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9-]{4,40}$/.test(matchId) ? matchId : '';
}

function recordFromFile(filePath) {
  const stats = fs.statSync(filePath);
  const name = path.basename(filePath);
  const match = name.match(/_((?:SL|NX|AC)-[A-Z0-9-]+)\.png$/i);
  const thumbnail = nativeImage.createFromPath(filePath).resize({ width: 320, quality: 'good' }).toDataURL();
  return {
    id: `${stats.birthtimeMs}-${name}`,
    name,
    path: filePath,
    takenAt: stats.birthtime.toISOString(),
    size: stats.size,
    matchId: match?.[1]?.toUpperCase() || '',
    thumbnail,
  };
}

function sendCaptureEvent(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function showBackgroundChatNotification(win, payload, force = false) {
  if (!win || win.isDestroyed() || !Notification.isSupported()) return { shown: false };
  if (!force && !win.isMinimized()) return { shown: false };
  const author = String(payload?.author || 'STARLADDER pilot').replace(/[\r\n]/g, ' ').slice(0, 48);
  const channel = String(payload?.channel || 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'general';
  const body = String(payload?.body || 'New message received.').replace(/[\r\n]+/g, ' ').slice(0, 180);
  const notification = new Notification({
    title: `${author} · #${channel}`,
    body,
    icon: path.join(__dirname, '..', 'dist', 'starladder.ico'),
    silent: false,
  });
  notification.on('click', () => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('open-chat-channel', channel);
  });
  notification.show();
  return { shown: true };
}

async function takeEvidenceScreenshot(source = 'hotkey') {
  if (captureInFlight) return { ok: false, reason: 'A capture is already in progress.' };
  captureInFlight = true;
  try {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const pixelWidth = Math.max(1, Math.round(display.size.width * display.scaleFactor));
    const pixelHeight = Math.max(1, Math.round(display.size.height * display.scaleFactor));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: pixelWidth, height: pixelHeight },
      fetchWindowIcons: false,
    });
    const selected = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
    if (!selected || selected.thumbnail.isEmpty()) throw new Error('No display image was available.');

    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const matchSuffix = activeMatchId ? `_${activeMatchId}` : '';
    const directory = path.join(captureRoot(), day);
    const filePath = path.join(directory, `STARLADDER_${stamp}${matchSuffix}.png`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, selected.thumbnail.toPNG(), { flag: 'wx' });
    const record = recordFromFile(filePath);
    const result = { ok: true, record, source };
    sendCaptureEvent('capture-complete', result);
    return result;
  } catch (error) {
    const result = { ok: false, reason: error instanceof Error ? error.message : 'Screenshot capture failed.', source };
    sendCaptureEvent('capture-failed', result);
    return result;
  } finally {
    captureInFlight = false;
  }
}

function registerCaptureShortcut(accelerator, persist = false) {
  if (!isSafeAccelerator(accelerator)) return { ok: false, reason: 'Use a modifier plus A-Z, 0-9, F1-F12, or Print Screen.' };
  const previous = captureShortcut;
  if (previous) globalShortcut.unregister(previous);
  const registered = globalShortcut.register(accelerator, () => { void takeEvidenceScreenshot('hotkey'); });
  if (!registered) {
    if (previous) globalShortcut.register(previous, () => { void takeEvidenceScreenshot('hotkey'); });
    return { ok: false, reason: 'That shortcut is already used by Windows or another application.' };
  }
  captureShortcut = accelerator;
  if (persist) {
    fs.mkdirSync(path.dirname(captureSettingsPath()), { recursive: true });
    fs.writeFileSync(captureSettingsPath(), JSON.stringify({ accelerator }, null, 2), 'utf8');
  }
  return { ok: true, accelerator, folder: captureRoot() };
}

function isCapturePath(filePath) {
  if (typeof filePath !== 'string') return false;
  const resolved = path.resolve(filePath);
  return [captureRoot(), legacyCaptureRoot()].some((root) => resolved.startsWith(path.resolve(root) + path.sep));
}

function findCaptureFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findCaptureFiles(entryPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.png') ? [entryPath] : [];
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#070a0d',
    title: 'STARLADDER',
    icon: path.join(__dirname, '..', 'dist', 'starladder.ico'),
    autoHideMenuBar: true,
    frame: false,
    thickFrame: true,
    movable: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
    },
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const publishWindowState = () => {
    if (!win.isDestroyed()) win.webContents.send('window-maximized-changed', win.isMaximized());
  };
  win.on('maximize', publishWindowState);
  win.on('unmaximize', publishWindowState);
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  const savedCaptureSettings = readCaptureSettings();
  if (savedCaptureSettings.accelerator) registerCaptureShortcut(savedCaptureSettings.accelerator);

  ipcMain.handle('get-capture-settings', () => ({
    ...(() => {
      const saved = readCaptureSettings();
      return {
        accelerator: saved.accelerator || captureShortcut,
        folder: captureRoot(),
        configured: Boolean(saved.accelerator),
        registered: Boolean(captureShortcut),
      };
    })(),
  }));
  ipcMain.handle('configure-capture-shortcut', (_event, accelerator) => registerCaptureShortcut(String(accelerator || ''), true));
  ipcMain.handle('capture-evidence-now', () => takeEvidenceScreenshot('button'));
  ipcMain.handle('set-active-match-context', (_event, matchId) => {
    activeMatchId = safeMatchId(matchId);
    return { ok: true, matchId: activeMatchId };
  });
  ipcMain.handle('list-local-captures', (_event, requestedMatchId) => {
    const roots = [captureRoot(), legacyCaptureRoot()].filter((root) => fs.existsSync(root));
    if (!roots.length) return [];
    const matchId = safeMatchId(requestedMatchId);
    const files = roots.flatMap((root) => findCaptureFiles(root))
      .filter((filePath) => isCapturePath(filePath))
      .map(recordFromFile)
      .filter((record) => !matchId || record.matchId === matchId)
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    return files.slice(0, 40);
  });
  ipcMain.handle('open-captures-folder', async () => {
    fs.mkdirSync(captureRoot(), { recursive: true });
    const error = await shell.openPath(captureRoot());
    return { ok: !error, reason: error || undefined };
  });
  ipcMain.handle('reveal-local-capture', (_event, filePath) => {
    if (!isCapturePath(filePath) || !fs.existsSync(filePath)) return { ok: false, reason: 'Capture not found.' };
    shell.showItemInFolder(filePath);
    return { ok: true };
  });
  ipcMain.handle('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
    return true;
  });
  ipcMain.handle('window-toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('window-is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() || false);
  ipcMain.handle('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
  ipcMain.handle('show-background-chat-notification', (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return showBackgroundChatNotification(win, payload);
  });
  ipcMain.handle('test-background-chat-notification', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { shown: false };
    win.minimize();
    setTimeout(() => showBackgroundChatNotification(win, {
      author: 'STARLADDER Test',
      channel: 'general',
      body: 'Background chat notifications are working.',
    }, true), 900);
    return { scheduled: true };
  });

  ipcMain.handle('verify-rsi-profile', async (_event, handle, code) => {
    const cleanHandle = String(handle || '').trim();
    const cleanCode = String(code || '').trim();
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(cleanHandle)) {
      return { ok: false, reason: 'Enter a valid RSI handle.' };
    }
    if (!/^(?:SL|NEXUS)-[A-Z0-9-]{8,24}$/.test(cleanCode)) {
      return { ok: false, reason: 'The verification code is invalid.' };
    }

    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://robertsspaceindustries.com/citizens/${encodeURIComponent(cleanHandle)}`, {
        headers: { 'User-Agent': 'STARLADDER-Desktop/0.5-alpha profile-verification' },
        signal: controller.signal,
      });
      if (response.status === 404) return { ok: false, reason: 'That RSI handle does not have a public Citizen Dossier.' };
      if (response.status === 403 || response.status === 429) {
        return { ok: false, reason: 'RSI temporarily blocked the dossier check. Wait a minute, then retry.' };
      }
      if (!response.ok) return { ok: false, reason: `RSI returned an error (${response.status}). Try again shortly.` };
      const profile = await response.text();
      if (/just a moment|challenge-platform|cf-chl-/i.test(profile)) {
        return { ok: false, reason: 'RSI requested a browser security check. Wait a minute, then retry.' };
      }
      if (!profile.toUpperCase().includes(cleanCode.toUpperCase())) {
        return { ok: false, reason: 'Code not found in the public RSI profile bio yet.' };
      }
      return { ok: true, profileUrl: `https://robertsspaceindustries.com/citizens/${cleanHandle}` };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return { ok: false, reason: 'RSI did not respond within 12 seconds. Please retry.' };
      }
      return { ok: false, reason: 'Could not reach RSI. Check your connection and try again.' };
    } finally {
      clearTimeout(requestTimeout);
    }
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
