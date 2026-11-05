import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export const SIZES = { small: 150, medium: 210, large: 290 };
export const MOBS = { bluefish: 'Blue Fish', wolf: 'Wolf' };

export const DEFAULTS = {
  mob: 'bluefish',
  petSize: SIZES.medium,
  autoWalk: true,
  walkSpeed: 1,
  idleSleepMin: 5,
  openAtLogin: false,
};

const file = () => path.join(app.getPath('userData'), 'settings.json');

export function loadSettings() {
  let stored = {};
  const currentPath = file();
  if (fs.existsSync(currentPath)) {
    try {
      stored = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    } catch {
      stored = {};
    }
  } else {
    // Migration: check old app userData folder
    try {
      const oldPath = path.join(app.getPath('appData'), 'minecraft_pet_v2', 'settings.json');
      if (fs.existsSync(oldPath)) {
        stored = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
      }
    } catch {}
  }

  // Migrate legacy mob names
  if (stored.mob === 'bee') stored.mob = 'bluefish';
  else if (stored.mob === 'axolotl') stored.mob = 'wolf';

  const settings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (key in stored) settings[key] = stored[key];
  if (!MOBS[settings.mob]) settings.mob = DEFAULTS.mob;
  return settings;
}

export function saveSettings(settings) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(settings, null, 2));
}
