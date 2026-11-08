import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  clipboard,
  dialog,
  desktopCapturer,
  systemPreferences,
} from 'electron';
import { MOBS, SIZES, MAX_PET_NAME, cleanPetName, loadSettings, saveSettings } from './settings.js';
import { initUpdater, updateMenuItems } from './updater.js';
import {
  hasKey,
  saveKey,
  deleteKey,
  testKey,
  chat,
  MAX_IMAGE_BYTES,
  MAX_TEXT_FILE_BYTES,
  MAX_TEXT_FILE_CHARS,
} from './ai.js';

app.setName('Pockito');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.pockito.app');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (app.dock) {
  app.dock.hide();
  if (!app.isPackaged) {
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon-256.png'));
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }
}

function getAppIconPath() {
  const isWin = process.platform === 'win32';
  const iconFileName = isWin ? 'icon.ico' : 'icon.png';
  const candidates = [
    path.join(process.resourcesPath || '', iconFileName),
    path.join(process.resourcesPath || '', 'build', iconFileName),
    path.join(app.getAppPath(), 'build', iconFileName),
    path.join(__dirname, '..', 'build', iconFileName),
    path.join(__dirname, '..', 'build', 'icon-256.png'),
    path.join(__dirname, 'ui', 'assets', 'logo.png'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, 'ui', 'assets', 'logo.png');
}

function getAppIcon() {
  return nativeImage.createFromPath(getAppIconPath());
}
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const STRIP_HEIGHT_RATIO = 2.6;
const IDLE_POLL_MS = 15_000;
const ASLEEP = new Set(['sleep', 'sleepy']);

const settings = loadSettings();
let win = null;
let tray = null;
let setupWin = null;
let nameWin = null;
let nameMob = null; // which pet the open name window is renaming
let overlayWin = null;
let captureActive = false;
let petState = 'boot';
let idleSleeping = false;
let expanded = false;
let chatOpen = false;
let isSuspended = false;

// Attachments memory store (deleted after sending, on remove, or on chat close)
const attachmentsMap = new Map();
let nextAttachmentId = 1;

if (!app.requestSingleInstanceLock()) {
  console.log('Pockito is already running (check the menu bar). Quitting this copy.');
  app.quit();
  process.exit(0);
}

// A short strip along the bottom normally; expanded when carried, or taller while chat is open.
function stripBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  let baseHeight = Math.round(settings.petSize * STRIP_HEIGHT_RATIO);
  if (chatOpen) {
    baseHeight = Math.max(baseHeight, Math.round(settings.petSize + 380));
  }
  const height = expanded ? workArea.height : Math.min(workArea.height, baseHeight);
  return { x: workArea.x, y: workArea.y + workArea.height - height, width: workArea.width, height };
}

function createWindow() {
  win = new BrowserWindow({
    ...stripBounds(),
    title: 'Pockito',
    icon: getAppIcon(),
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

function openSetupWindow(reason = null) {
  if (setupWin) {
    if (reason) {
      setupWin.loadFile(path.join(__dirname, 'ui', 'setup.html'), { query: { reason } });
    }
    setupWin.show();
    setupWin.focus();
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = 440;
  const height = 480;
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);
  const iconPath = path.join(__dirname, 'ui', 'assets', 'logo.png');

  setupWin = new BrowserWindow({
    width,
    height,
    x,
    y,
    useContentSize: true,
    title: 'Pockito AI',
    icon: getAppIcon(),
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'setupPreload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Remove menu bar on Windows/Linux
  setupWin.removeMenu();
  setupWin.setMenuBarVisibility(false);

  // Security: prevent navigation and external window spawning
  setupWin.webContents.on('will-navigate', (e) => e.preventDefault());
  setupWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  setupWin.once('ready-to-show', () => setupWin.show());
  setupWin.on('closed', () => (setupWin = null));

  setupWin.loadFile(path.join(__dirname, 'ui', 'setup.html'), reason ? { query: { reason } } : {});
}

const petName = () => settings.petNames?.[settings.mob] || '';

function openNameWindow() {
  nameMob = settings.mob;
  if (nameWin) {
    nameWin.loadFile(path.join(__dirname, 'ui', 'name.html'));
    nameWin.show();
    nameWin.focus();
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = 360;
  const height = 250;
  nameWin = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    useContentSize: true,
    title: 'Name your pet',
    icon: getAppIcon(),
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'namePreload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  nameWin.removeMenu();
  nameWin.setMenuBarVisibility(false);
  nameWin.webContents.on('will-navigate', (e) => e.preventDefault());
  nameWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  nameWin.once('ready-to-show', () => nameWin.show());
  nameWin.on('closed', () => (nameWin = null));
  nameWin.loadFile(path.join(__dirname, 'ui', 'name.html'));
}

function openChatPanel(options = {}) {
  if (!settings.aiEnabled || !hasKey()) {
    openSetupWindow('Please configure your Groq API key first to use AI features.');
    return;
  }
  win?.webContents.send('chat:open', options);
}

function buildTray() {
  if (!tray) {
    tray = new Tray(getTrayIcon());
    tray.setToolTip('Pockito');
    if (process.platform === 'win32') {
      tray.on('click', () => toggleVisibility());
    }
  }
  tray.setToolTip(petName() ? `Pockito: ${petName()}` : 'Pockito');
  const isVisible = win ? win.isVisible() : true;
  const asleep = ASLEEP.has(petState);
  const radio = (label, key, value) => ({ label, type: 'radio', checked: settings[key] === value, click: () => applySettings({ [key]: value }) });

  const aiMenuItems = [
    {
      label: 'Use AI features',
      type: 'checkbox',
      checked: !!settings.aiEnabled,
      click: (i) => {
        if (i.checked) {
          if (hasKey()) {
            applySettings({ aiEnabled: true });
          } else {
            openSetupWindow();
          }
        } else {
          applySettings({ aiEnabled: false });
        }
      },
    },
    {
      label: 'Change API key…',
      click: () => openSetupWindow(),
    },
    {
      label: 'Remove API key…',
      click: () => {
        deleteKey();
        applySettings({ aiEnabled: false });
      },
    },
    ...(settings.aiEnabled ? [
      { type: 'separator' },
      { label: 'Chat', click: () => openChatPanel() },
    ] : []),
  ];

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
      submenu: Object.entries(MOBS).map(([key, label]) => radio(settings.petNames?.[key] ? `${settings.petNames[key]} (${label})` : label, 'mob', key)),
    },
    { label: petName() ? `Rename ${petName()}…` : 'Name your pet…', click: () => openNameWindow() },
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
    {
      label: 'AI features',
      submenu: aiMenuItems,
    },
    { type: 'separator' },
    ...updateMenuItems(),
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

// IPC Handlers: Settings & Pet Window
ipcMain.handle('settings:get', () => settings);
ipcMain.on('settings:set', (_e, patch) => {
  const sanitized = { ...patch };
  delete sanitized.aiEnabled;
  delete sanitized.petNames; // names are only changed through the name window
  applySettings(sanitized);
});
ipcMain.on('pointer:over', (_e, over) => {
  if (captureActive) return;
  win?.setIgnoreMouseEvents(!over, { forward: true });
});
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

// IPC Handlers: Chat Mode Focus & Bounds
ipcMain.on('chat:mode', (event, on) => {
  if (!win || event.sender.id !== win.webContents.id) return;
  if (captureActive) return;
  chatOpen = !!on;
  if (chatOpen) {
    win.setFocusable(true);
    win.focus();
  } else {
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
    // Clean up all pending attachments when chat closes
    attachmentsMap.clear();
  }
  win.setBounds(stripBounds());
});

// IPC Handlers: Setup Window Resize to Fit Content
ipcMain.on('setup:size', (event, { width, height }) => {
  if (!setupWin || event.sender.id !== setupWin.webContents.id) return;
  const currentDisplay = screen.getDisplayMatching(setupWin.getBounds());
  const maxH = Math.round(currentDisplay.workArea.height * 0.92);
  const targetH = Math.max(380, Math.min(maxH, height));
  setupWin.setContentSize(440, targetH);
});

// IPC Handlers: AI Status & Keys
ipcMain.handle('ai:status', () => ({
  hasKey: hasKey(),
  enabled: !!settings.aiEnabled,
}));

ipcMain.handle('ai:test-and-save', async (e, key) => {
  if (setupWin && e.sender.id !== setupWin.webContents.id) {
    return { success: false, error: 'Unauthorized sender' };
  }
  const result = await testKey(key);
  if (result.success) {
    saveKey(key);
    applySettings({ aiEnabled: true });
    // Open in-pet chat with greeting
    win?.webContents.send('chat:open', { greeting: "Hi! I'm ready to chat!" });
    return { success: true };
  }
  return result;
});

ipcMain.handle('ai:delete-key', async () => {
  deleteKey();
  applySettings({ aiEnabled: false });
  return { success: true };
});

ipcMain.on('ai:open-keys-page', (e) => {
  if (setupWin && e.sender.id !== setupWin.webContents.id) return;
  shell.openExternal('https://console.groq.com/keys');
});

ipcMain.handle('ai:copy-link', (e) => {
  if (setupWin && e.sender.id !== setupWin.webContents.id) return false;
  clipboard.writeText('https://console.groq.com/keys');
  return true;
});

ipcMain.on('ai:open-setup', (_e, reason) => {
  openSetupWindow(reason);
});

// IPC Handlers: Pet name window
ipcMain.handle('pet-name:get', (event) => {
  if (!nameWin || event.sender.id !== nameWin.webContents.id) throw new Error('Unauthorized');
  return {
    label: MOBS[nameMob] || 'Pet',
    name: settings.petNames?.[nameMob] || '',
    max: MAX_PET_NAME,
  };
});

ipcMain.handle('pet-name:save', (event, raw) => {
  if (!nameWin || event.sender.id !== nameWin.webContents.id) throw new Error('Unauthorized');
  if (!MOBS[nameMob]) return { name: '' };
  const name = cleanPetName(raw);
  const petNames = { ...settings.petNames };
  if (name) petNames[nameMob] = name;
  else delete petNames[nameMob]; // empty name goes back to the default
  applySettings({ petNames });
  return { name };
});

ipcMain.on('pet-name:close', (event) => {
  if (!nameWin || event.sender.id !== nameWin.webContents.id) return;
  nameWin.close();
});

ipcMain.on('ai:close-setup', () => {
  setupWin?.close();
});

ipcMain.on('chat:open-request', (_e, options) => {
  openChatPanel(options);
});

// IPC Handlers: Chat Message
ipcMain.handle('chat:send', async (event, { text, attachmentId }) => {
  if (!win || event.sender.id !== win.webContents.id) throw new Error('Unauthorized');
  if (!settings.aiEnabled || !hasKey()) {
    openSetupWindow('Please configure your Groq API key first.');
    return { error: 'No Groq API key configured.', status: 401 };
  }

  const attachment = attachmentId ? attachmentsMap.get(attachmentId) : null;
  if (attachmentId) {
    attachmentsMap.delete(attachmentId); // Cleaned up immediately after sending
  }

  try {
    const reply = await chat({
      userText: text || '',
      attachment,
      mobName: settings.mob,
      petName: petName(),
    });
    return reply;
  } catch (err) {
    if (err.status === 401) {
      openSetupWindow('Your Groq API key was rejected (401). Please update your key.');
    } else if (err.status === 429) {
      openSetupWindow('Groq rate limit reached (429). Limits apply across your entire account.');
    }

    let friendlyError = 'Something went wrong. Please try again.';
    if (err.status === 429) {
      friendlyError = 'I need a little rest (rate limited).';
    } else if (err.status === 401) {
      friendlyError = 'Your Groq API key was rejected. Please check your key in settings.';
    } else if (err.status === 404 || /model/i.test(err.message || '')) {
      friendlyError = "I couldn't find an available AI model for your key right now.";
    } else if (err.status === 0 || err.name === 'AbortError') {
      friendlyError = "Couldn't reach Groq. Please check your internet connection.";
    } else if (err.message && !err.message.includes('HTTP') && !err.message.includes('llama') && !err.message.includes('gpt-oss') && !err.message.includes('json')) {
      friendlyError = err.message;
    }

    return {
      error: friendlyError,
      status: err.status || 0,
    };
  }
});

ipcMain.on('chat:delete-attachment', (_event, id) => {
  attachmentsMap.delete(id);
});

// IPC Handlers: Screen Capture
let currentCropDisplay = null;
let currentFrozenImage = null;
let currentFrozenDataUrl = null;
let overlayPromiseResolve = null;
let guardTimeoutTimer = null;

function isAllBlackImage(nativeImg) {
  try {
    const bitmap = nativeImg.toBitmap();
    if (!bitmap || bitmap.length === 0) return true;
    const step = Math.max(4, Math.floor(bitmap.length / 500));
    for (let i = 0; i < bitmap.length; i += step) {
      if (bitmap[i] > 5) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function processAndStoreCroppedImage(nativeImg, rect, display) {
  const capSize = nativeImg.getSize();
  const sx = capSize.width / display.bounds.width;
  const sy = capSize.height / display.bounds.height;

  const cropX = Math.max(0, Math.round(rect.x * sx));
  const cropY = Math.max(0, Math.round(rect.y * sy));
  const cropW = Math.min(capSize.width - cropX, Math.max(1, Math.round(rect.width * sx)));
  const cropH = Math.min(capSize.height - cropY, Math.max(1, Math.round(rect.height * sy)));

  const cropped = nativeImg.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
  const cropSize = cropped.getSize();

  // Downscale to a maximum long edge of 1024 px
  const maxEdge = 1024;
  let outW = cropSize.width;
  let outH = cropSize.height;
  if (outW > maxEdge || outH > maxEdge) {
    if (outW >= outH) {
      outH = Math.round((outH * maxEdge) / outW);
      outW = maxEdge;
    } else {
      outW = Math.round((outW * maxEdge) / outH);
      outH = maxEdge;
    }
  }

  const finalImage = (outW !== cropSize.width || outH !== cropSize.height)
    ? cropped.resize({ width: outW, height: outH, quality: 'good' })
    : cropped;

  const jpegBuffer = finalImage.toJPEG(85);
  const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

  const attachmentId = `att_${nextAttachmentId++}`;
  attachmentsMap.set(attachmentId, {
    id: attachmentId,
    name: 'Screenshot.jpg',
    kind: 'image',
    dataUrl,
  });

  return {
    id: attachmentId,
    name: 'Screenshot.jpg',
    kind: 'image',
    dataUrl,
    width: outW,
    height: outH,
  };
}

async function runCaptureFlow(opts = {}) {
  captureActive = true;
  isSuspended = true;

  const sendResult = (result) => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      console.log(`[Capture] 7. Result sent (ok=${!!result.ok}, reason=${result.reason || 'none'})`);
      win.webContents.send('capture:result', result);
    }
  };

  try {
    // 1. macOS permission check
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus) {
      const status = systemPreferences.getMediaAccessStatus('screen');
      if (status !== 'granted') {
        console.warn('[Capture] macOS screen recording permission status:', status);
        sendResult({
          ok: false,
          reason: 'permission',
          message: 'Screen Recording permission is required. During development (npm run dev), permission must be granted to the launching terminal or editor.',
        });
        return;
      }
    }

    // 2. Hide windows and wait ~200ms
    win?.hide();
    console.log('[Capture] 2. Windows hidden');
    await new Promise((r) => setTimeout(r, 200));

    // 3. Find display under cursor
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    currentCropDisplay = display;

    // 4. Capture screen with desktopCapturer
    const scaleFactor = display.scaleFactor || 1;
    const nativeW = Math.round(display.size.width * scaleFactor);
    const nativeH = Math.round(display.size.height * scaleFactor);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: nativeW, height: nativeH },
    });

    if (!sources || sources.length === 0) {
      sendResult({
        ok: false,
        reason: 'no_source',
        message: 'No screen display available to capture.',
      });
      return;
    }

    const targetSource = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    currentFrozenImage = targetSource.thumbnail;
    console.log(`[Capture] 3. Screen capture taken (${nativeW}x${nativeH})`);

    // Detect all-black image on macOS as permission failure
    if (process.platform === 'darwin' && isAllBlackImage(currentFrozenImage)) {
      console.warn('[Capture] All-black capture detected on macOS - treating as permission failure');
      sendResult({
        ok: false,
        reason: 'permission',
        message: 'Screen capture returned an empty black image. Please check Screen Recording permissions in System Settings.',
      });
      return;
    }

    // 5. Full-screen option (Shift-click)
    if (opts.fullScreen) {
      console.log('[Capture] Full-screen capture requested (Shift-click), skipping overlay');
      const cropped = processAndStoreCroppedImage(currentFrozenImage, {
        x: 0,
        y: 0,
        width: display.bounds.width,
        height: display.bounds.height,
      }, display);
      sendResult({
        ok: true,
        ...cropped,
      });
      return;
    }

    // 6. Open Overlay Window
    currentFrozenDataUrl = currentFrozenImage.toDataURL();

    const overlayResult = await new Promise((resolve) => {
      overlayPromiseResolve = resolve;

      // 120s guard timeout
      guardTimeoutTimer = setTimeout(() => {
        console.warn('[Capture] 120s guard timeout reached');
        if (overlayPromiseResolve) {
          overlayPromiseResolve({ confirmed: false, reason: 'timeout' });
          overlayPromiseResolve = null;
        }
      }, 120_000);

      overlayWin = new BrowserWindow({
        title: 'Pockito Screen Capture',
        icon: getAppIcon(),
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: true,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'ui', 'captureOverlayPreload.cjs'),
          contextIsolation: true,
          sandbox: true,
        },
      });

      overlayWin.setAlwaysOnTop(true, 'screen-saver');
      overlayWin.webContents.on('will-navigate', (e) => e.preventDefault());
      overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      overlayWin.once('ready-to-show', () => {
        overlayWin.show();
        overlayWin.focus();
        console.log('[Capture] 4. Overlay opened');
      });

      overlayWin.on('closed', () => {
        overlayWin = null;
        if (overlayPromiseResolve) {
          overlayPromiseResolve({ confirmed: false, reason: 'cancelled' });
          overlayPromiseResolve = null;
        }
      });

      overlayWin.loadFile(path.join(__dirname, 'ui', 'capture-overlay.html'));
    });

    console.log('[Capture] 5. Confirmed or cancelled:', overlayResult?.confirmed ? 'confirmed' : overlayResult?.reason || 'cancelled');

    if (overlayResult?.confirmed && overlayResult?.rect) {
      const cropped = processAndStoreCroppedImage(currentFrozenImage, overlayResult.rect, display);
      sendResult({
        ok: true,
        ...cropped,
      });
    } else {
      sendResult({
        ok: false,
        reason: overlayResult?.reason || 'cancelled',
        message: overlayResult?.reason === 'timeout' ? 'Screen capture timed out (120s).' : 'Screen capture cancelled.',
      });
    }
  } catch (err) {
    console.error('[Capture] Error during capture:', err);
    sendResult({
      ok: false,
      reason: 'error',
      message: err.message || 'Screen capture failed.',
    });
  } finally {
    if (guardTimeoutTimer) {
      clearTimeout(guardTimeoutTimer);
      guardTimeoutTimer = null;
    }
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.close();
      overlayWin = null;
    }
    currentFrozenImage = null;
    currentFrozenDataUrl = null;
    currentCropDisplay = null;
    overlayPromiseResolve = null;
    captureActive = false;
    isSuspended = false;

    if (win && !win.isDestroyed()) {
      win.show();
      if (chatOpen) {
        win.focus();
      }
    }
    console.log('[Capture] 6. Windows restored, captureActive=false');
  }
}

ipcMain.handle('chat:start-crop', async (event, opts = {}) => {
  if (!win || event.sender.id !== win.webContents.id) throw new Error('Unauthorized');

  console.log('[Capture] 1. Start requested (fullScreen=' + !!opts?.fullScreen + ')');

  if (captureActive) {
    console.log('[Capture] Start rejected: capture already in progress');
    return { ok: false, reason: 'already_running', message: 'A screen capture is already active.' };
  }

  // Return immediately so the IPC invoke is never left unanswered!
  runCaptureFlow(opts).catch((err) => {
    console.error('[Capture] Fatal error in runCaptureFlow:', err);
  });

  return { started: true };
});

ipcMain.handle('capture:get-image', (event) => {
  if (!overlayWin || event.sender.id !== overlayWin.webContents.id) throw new Error('Unauthorized');
  return currentFrozenDataUrl;
});

ipcMain.on('capture:confirm', (event, rect) => {
  if (!overlayWin || event.sender.id !== overlayWin.webContents.id) return;
  if (!rect || typeof rect.width !== 'number' || typeof rect.height !== 'number') return;
  if (rect.width < 10 || rect.height < 10) return;
  if (rect.x < 0 || rect.y < 0) return;
  if (currentCropDisplay) {
    if (rect.x + rect.width > currentCropDisplay.bounds.width + 10) return;
    if (rect.y + rect.height > currentCropDisplay.bounds.height + 10) return;
  }

  if (overlayPromiseResolve) {
    overlayPromiseResolve({ confirmed: true, rect });
    overlayPromiseResolve = null;
  }
});

ipcMain.on('capture:cancel', (event) => {
  if (!overlayWin || event.sender.id !== overlayWin.webContents.id) return;
  if (overlayPromiseResolve) {
    overlayPromiseResolve({ confirmed: false, reason: 'cancelled' });
    overlayPromiseResolve = null;
  }
});

ipcMain.handle('system:open-permission-settings', () => {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
});

ipcMain.handle('system:open-external', (_e, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    return shell.openExternal(url);
  }
  return false;
});

// IPC Handlers: File Attachments
ipcMain.handle('chat:pick-file', async (event) => {
  if (!win || event.sender.id !== win.webContents.id) throw new Error('Unauthorized');
  isSuspended = true;

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Attach file',
      properties: ['openFile'],
      filters: [
        {
          name: 'Supported Files',
          extensions: [
            'png', 'jpg', 'jpeg', 'webp', 'gif',
            'txt', 'md', 'json', 'csv', 'log', 'js', 'ts', 'jsx', 'tsx',
            'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php',
            'html', 'css', 'xml', 'yaml', 'yml', 'sql', 'sh',
          ],
        },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        {
          name: 'Text & Code',
          extensions: [
            'txt', 'md', 'json', 'csv', 'log', 'js', 'ts', 'jsx', 'tsx',
            'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php',
            'html', 'css', 'xml', 'yaml', 'yml', 'sql', 'sh',
          ],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePaths || filePaths.length === 0) return null;
    const filePath = filePaths[0];

    const stats = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const fileName = path.basename(filePath);

    const imageExts = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
    const textExts = new Set([
      'txt', 'md', 'json', 'csv', 'log', 'js', 'ts', 'jsx', 'tsx',
      'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php',
      'html', 'css', 'xml', 'yaml', 'yml', 'sql', 'sh',
    ]);

    if (imageExts.has(ext)) {
      if (stats.size > MAX_IMAGE_BYTES) {
        return { error: 'Images must be under 20MB.' };
      }

      const buffer = await fs.promises.readFile(filePath);
      const img = nativeImage.createFromBuffer(buffer);
      if (img.isEmpty()) {
        return { error: 'Could not decode image file.' };
      }

      const imgSize = img.getSize();
      const maxDim = 1600;
      let outW = imgSize.width;
      let outH = imgSize.height;
      if (outW > maxDim || outH > maxDim) {
        if (outW > outH) {
          outH = Math.round((outH * maxDim) / outW);
          outW = maxDim;
        } else {
          outW = Math.round((outW * maxDim) / outH);
          outH = maxDim;
        }
      }

      const resized = (outW !== imgSize.width || outH !== imgSize.height)
        ? img.resize({ width: outW, height: outH, quality: 'better' })
        : img;

      const jpegBuffer = resized.toJPEG(82);
      const thumbnail = resized.resize({ width: Math.min(200, outW), quality: 'good' }).toDataURL();

      const attachmentId = `att_${nextAttachmentId++}`;
      attachmentsMap.set(attachmentId, {
        id: attachmentId,
        name: fileName,
        kind: 'image',
        dataUrl: `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`,
      });

      return {
        id: attachmentId,
        name: fileName,
        kind: 'image',
        thumbnail,
      };
    }

    if (textExts.has(ext)) {
      if (stats.size > MAX_TEXT_FILE_BYTES) {
        return { error: 'Text/code files must be under 1MB.' };
      }

      // Check first 8KB for binary NUL bytes
      const fd = await fs.promises.open(filePath, 'r');
      const headBuf = Buffer.alloc(Math.min(8192, stats.size));
      await fd.read(headBuf, 0, headBuf.length, 0);
      await fd.close();

      for (let i = 0; i < headBuf.length; i++) {
        if (headBuf[i] === 0) {
          return { error: 'I can read images and text/code files for now.' };
        }
      }

      let content = await fs.promises.readFile(filePath, 'utf8');
      if (content.length > MAX_TEXT_FILE_CHARS) {
        content = content.slice(0, MAX_TEXT_FILE_CHARS) + '\n... [Content truncated to 24,000 characters]';
      }

      const attachmentId = `att_${nextAttachmentId++}`;
      attachmentsMap.set(attachmentId, {
        id: attachmentId,
        name: fileName,
        kind: 'text',
        content,
      });

      return {
        id: attachmentId,
        name: fileName,
        kind: 'text',
      };
    }

    return { error: 'I can read images and text/code files for now.' };
  } finally {
    isSuspended = false;
  }
});

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  createWindow();
  buildTray();
  initUpdater(buildTray);
  setInterval(pollIdle, IDLE_POLL_MS);
  screen.on('display-metrics-changed', () => {
    win?.setBounds(stripBounds());
    if (setupWin) {
      const currentDisplay = screen.getDisplayMatching(setupWin.getBounds());
      const maxH = Math.round(currentDisplay.workArea.height * 0.92);
      const b = setupWin.getContentBounds();
      setupWin.setContentSize(440, Math.min(maxH, b.height));
    }
  });
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
