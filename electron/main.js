import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, powerMonitor, screen } from 'electron';
import { MOBS, SIZES, loadSettings, saveSettings } from './settings.js';

app.setName('Pockito');
if (app.dock) app.dock.hide();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const STRIP_HEIGHT_RATIO = 2.6;
const IDLE_POLL_MS = 15_000;
const ASLEEP = new Set(['sleep', 'sleepy']);

const settings = loadSettings();
let win = null;
let tray = null;
let petState = 'boot';
let idleSleeping = false;
let expanded = false;

if (!app.requestSingleInstanceLock()) {
  console.log('Pockito is already running (check the menu bar). Quitting this copy.');
  app.quit();
  process.exit(0);
}

// A short strip along the bottom normally; the full work area while the pet is being carried or falling.
function stripBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const height = expanded ? workArea.height : Math.min(workArea.height, Math.round(settings.petSize * STRIP_HEIGHT_RATIO));
  return { x: workArea.x, y: workArea.y + workArea.height - height, width: workArea.width, height };
}

function createWindow() {
  win = new BrowserWindow({
    ...stripBounds(),
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    hiddenInMissionControl: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => {
    win.showInactive();
    buildTray();
  });
  win.on('show', () => buildTray());
  win.on('hide', () => buildTray());
  win.on('closed', () => (win = null));

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

const send = (channel, payload) => win?.webContents.send(channel, payload);
const command = (type, extra = {}) => send('command', { type, ...extra });

function applySettings(patch) {
  const prevSize = settings.petSize;
  Object.assign(settings, patch);
  saveSettings(settings);
  if (settings.petSize !== prevSize) win?.setBounds(stripBounds());
  if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
  send('settings', settings);
  buildTray();
}

function toggleVisibility() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.showInactive();
  }
  buildTray();
}

function getTrayIcon() {
  const isMac = process.platform === 'darwin';
  const iconName = isMac ? 'trayTemplate.png' : 'trayWin.png';
  const iconPath = path.join(__dirname, '..', 'assets', iconName);
  const icon = nativeImage.createFromPath(iconPath);
  if (isMac) {
    icon.setTemplateImage(true);
  }
  return icon;
}

function buildTray() {
  if (!tray) {
    tray = new Tray(getTrayIcon());
    tray.setToolTip('Pockito');
    if (process.platform === 'win32') {
      tray.on('click', () => toggleVisibility());
    }
  }
  const isVisible = win ? win.isVisible() : true;
  const asleep = ASLEEP.has(petState);
  const radio = (label, key, value) => ({ label, type: 'radio', checked: settings[key] === value, click: () => applySettings({ [key]: value }) });

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isVisible ? 'Hide Pockito' : 'Show Pockito', click: () => toggleVisibility() },
    { type: 'separator' },
    { label: asleep ? 'Wake up' : 'Go to sleep', click: () => command('trigger', { name: asleep ? 'wake' : 'sleepy' }) },
    { label: 'Dance', click: () => command('trigger', { name: 'dance' }), enabled: !asleep },
    { label: 'Wave', click: () => command('trigger', { name: 'wave' }), enabled: !asleep },
    { type: 'separator' },
    { label: 'Wanders around', type: 'checkbox', checked: settings.autoWalk, click: (i) => applySettings({ autoWalk: i.checked }) },
    {
      label: 'Pet',
      submenu: Object.entries(MOBS).map(([key, label]) => radio(label, 'mob', key)),
    },
    {
      label: 'Size',
      submenu: Object.entries(SIZES).map(([name, px]) => radio(name[0].toUpperCase() + name.slice(1), 'petSize', px)),
    },
    {
      label: 'Sleep when idle',
      submenu: [radio('Never', 'idleSleepMin', 0), radio('After 2 min', 'idleSleepMin', 2), radio('After 5 min', 'idleSleepMin', 5), radio('After 15 min', 'idleSleepMin', 15)],
    },
    { label: 'Open at login', type: 'checkbox', checked: settings.openAtLogin, click: (i) => applySettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Quit Pockito', click: () => app.quit() },
  ]));
}

function pollIdle() {
  const idle = powerMonitor.getSystemIdleTime();
  const limit = settings.idleSleepMin * 60;
  if (limit > 0 && !idleSleeping && idle >= limit) {
    idleSleeping = true;
    if (!ASLEEP.has(petState)) command('trigger', { name: 'sleepy' });
  } else if (idleSleeping && idle < IDLE_POLL_MS / 1000) {
    idleSleeping = false;
    if (ASLEEP.has(petState)) command('trigger', { name: 'wake', surprised: true });
  }
}

ipcMain.handle('settings:get', () => settings);
ipcMain.on('settings:set', (_e, patch) => applySettings(patch));
ipcMain.on('pointer:over', (_e, over) => win?.setIgnoreMouseEvents(!over, { forward: true }));
ipcMain.on('window:expand', (_e, on) => {
  if (on === expanded) return;
  expanded = on;
  win?.setBounds(stripBounds());
});
ipcMain.on('state', (_e, name) => {
  if (ASLEEP.has(name) !== ASLEEP.has(petState)) {
    petState = name;
    buildTray();
  } else petState = name;
});

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  createWindow();
  buildTray();
  setInterval(pollIdle, IDLE_POLL_MS);
  screen.on('display-metrics-changed', () => win?.setBounds(stripBounds()));
  screen.on('display-added', () => win?.setBounds(stripBounds()));
  screen.on('display-removed', () => win?.setBounds(stripBounds()));
});

app.on('window-all-closed', () => app.quit());
app.on('second-instance', () => {
  if (win) {
    if (!win.isVisible()) {
      win.showInactive();
    }
    buildTray();
  }
});
