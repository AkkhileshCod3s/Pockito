import fs from 'node:fs';
import path from 'node:path';
import { app, Notification, shell } from 'electron';
import electronUpdater from 'electron-updater';

// electron-updater is a CommonJS package, so it is imported as a default export in this ES-module app.
const { autoUpdater } = electronUpdater;

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000; // re-check every 4 hours
const FIRST_CHECK_MS = 10_000; // first check shortly after launch
const IS_MAC = process.platform === 'darwin';

// idle | checking | downloading (Windows) | available (Mac) | ready (Windows)
let state = 'idle';
let version = null;
let manualCheck = false;
let notifiedVersion = null;
let onChange = () => {};

function setState(next, v = version) {
  state = next;
  version = v;
  onChange();
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

// Reads owner/repo from the app-update.yml that electron-builder bakes into the installed app.
function releasesUrl() {
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const owner = /owner:\s*(\S+)/.exec(yml)?.[1];
    const repo = /repo:\s*(\S+)/.exec(yml)?.[1];
    if (owner && repo) return `https://github.com/${owner}/${repo}/releases/latest`;
  } catch {
    /* ignore */
  }
  return null;
}

function openReleases() {
  const url = releasesUrl();
  if (url) shell.openExternal(url);
}

export function initUpdater(changed) {
  onChange = changed;
  if (!app.isPackaged) return; // no updates while running `npm run dev` / `npm start`

  // Windows: download in the background and install when the app quits.
  // Mac: the app is not code-signed, so macOS cannot install updates by itself. We only tell the user
  // a new version exists and send them to the download page.
  autoUpdater.autoDownload = !IS_MAC;
  autoUpdater.autoInstallOnAppQuit = !IS_MAC;

  autoUpdater.on('checking-for-update', () => setState('checking'));

  autoUpdater.on('update-available', (info) => {
    setState(IS_MAC ? 'available' : 'downloading', info.version);
    if (notifiedVersion !== info.version) {
      notifiedVersion = info.version;
      notify(
        'Pockito update available',
        IS_MAC ? `Version ${info.version} is out. Open the tray menu to download it.` : `Downloading version ${info.version}…`,
      );
    }
    manualCheck = false;
  });

  autoUpdater.on('update-not-available', () => {
    setState('idle');
    if (manualCheck) notify('Pockito is up to date', `You have the latest version (${app.getVersion()}).`);
    manualCheck = false;
  });

  autoUpdater.on('update-downloaded', (info) => {
    setState('ready', info.version);
    notify('Pockito update ready', `Version ${info.version} is ready. Choose "Restart to update" in the tray menu.`);
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err?.message ?? err);
    setState('idle');
    if (manualCheck) notify("Couldn't check for updates", 'Check your internet connection and try again.');
    manualCheck = false;
  });

  setTimeout(() => checkForUpdates(false), FIRST_CHECK_MS);
  setInterval(() => checkForUpdates(false), CHECK_EVERY_MS);
}

export function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) notify('Pockito', 'Updates only work in the installed app, not in development.');
    return;
  }
  if (state === 'checking' || state === 'downloading') return;
  if (state === 'ready' || state === 'available') {
    if (manual) notify('Pockito update', `Version ${version} is waiting. Use the tray menu.`);
    return;
  }
  manualCheck = manual;
  autoUpdater.checkForUpdates().catch(() => {}); // failures are reported by the 'error' event
}

/** Tray menu items for the current update state (always ends with a separator). */
export function updateMenuItems() {
  let items;
  switch (state) {
    case 'checking':
      items = [{ label: 'Checking for updates…', enabled: false }];
      break;
    case 'downloading':
      items = [{ label: `Downloading update ${version}…`, enabled: false }];
      break;
    case 'ready':
      // Silent install, then relaunch.
      items = [{ label: `Restart to update to ${version}`, click: () => autoUpdater.quitAndInstall(true, true) }];
      break;
    case 'available':
      items = [{ label: `Download Pockito ${version}`, click: openReleases }];
      break;
    default:
      items = [{ label: 'Check for updates', click: () => checkForUpdates(true) }];
  }
  return [...items, { type: 'separator' }];
}