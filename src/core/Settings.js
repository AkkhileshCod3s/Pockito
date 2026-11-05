// Mirrors electron/settings.js; used as a fallback when running in a plain browser (npx vite).
export const DEFAULTS = {
  mob: 'bluefish',
  petSize: 210,
  autoWalk: true,
  walkSpeed: 1,
  idleSleepMin: 5,
  openAtLogin: false,
};

const OLD_STORAGE_KEY = 'minecraft_mob.settings.v1';
const STORAGE_KEY = 'pockito.settings.v1';

/** Settings live in the Electron main process; in a browser they fall back to localStorage. */
export async function connectSettings() {
  const host = window.mobHost;
  const settings = { ...DEFAULTS };
  if (host) {
    Object.assign(settings, await host.getSettings());
    host.onSettings((next) => Object.assign(settings, next));
    return { settings, save: (patch) => host.setSettings(patch) };
  }
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(OLD_STORAGE_KEY);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.mob === 'bee') parsed.mob = 'bluefish';
      else if (parsed.mob === 'axolotl') parsed.mob = 'wolf';
      Object.assign(settings, parsed);
    }
  } catch {}

  if (!['bluefish', 'wolf'].includes(settings.mob)) {
    settings.mob = DEFAULTS.mob;
  }

  return {
    settings,
    save: (patch) => {
      Object.assign(settings, patch);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    },
  };
}
