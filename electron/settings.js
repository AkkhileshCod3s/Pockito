import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export const SIZES = { small: 95, medium: 130, large: 175 };
const OLD_SIZES = { 150: 'small', 210: 'medium', 290: 'large' };
export const MOBS = { bluefish: 'Blue Fish', wolf: 'Wolf', guineapig: 'Guinea Pig', bunny: 'Bunny', duckling: 'Duckling' };

export const MAX_PET_NAME = 16;

/** Keeps letters (any language, including their vowel/combining marks), numbers, spaces, - and '. Used for every pet name. */
export function cleanPetName(raw) {
  if (typeof raw !== 'string') return '';
  const name = raw
    .replace(/[^\p{L}\p{M}\p{N} '\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PET_NAME)
    .trim();
  // A name needs at least one real letter or number (not only marks, dashes or quotes).
  return /[\p{L}\p{N}]/u.test(name) ? name : '';
}

export const DEFAULTS = {
  mob: 'bluefish',
  petSize: SIZES.medium,
  autoWalk: true,
  walkSpeed: 1,
  idleSleepMin: 5,
  openAtLogin: false,
  aiEnabled: false,
  petNames: {}, // one custom name per pet, e.g. { bluefish: 'Bubbles' }
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
  // Pet names: keep only known pets with a valid, cleaned name.
  const names = {};
  if (settings.petNames && typeof settings.petNames === 'object') {
    for (const key of Object.keys(MOBS)) {
      const name = cleanPetName(settings.petNames[key]);
      if (name) names[key] = name;
    }
  }
  settings.petNames = names;
  // Move users who saved an old size preset onto the matching new one.
  if (OLD_SIZES[settings.petSize]) settings.petSize = SIZES[OLD_SIZES[settings.petSize]];
  return settings;
}

export function saveSettings(settings) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(settings, null, 2));
}
