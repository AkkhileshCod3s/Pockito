import { BlueFish } from '../bluefish/BlueFish.js';
import { Wolf } from '../wolf/Wolf.js';
import { GuineaPig } from '../guineapig/GuineaPig.js';
import { Bunny } from '../bunny/Bunny.js';
import { Duckling } from '../duckling/Duckling.js';
import { Wraith } from '../wraith/Wraith.js';

/** Every mob exposes the same surface: root, joints, face, height, halfWidth, emoteLift, applyPose(), animate(). */
export const MOBS = {
  bluefish: { label: 'Blue Fish', create: () => new BlueFish() },
  wolf: { label: 'Wolf', create: () => new Wolf() },
  guineapig: { label: 'Guinea Pig', create: () => new GuineaPig() },
  bunny: { label: 'Bunny', create: () => new Bunny() },
  duckling: { label: 'Duckling', create: () => new Duckling() },
  wraith: { label: 'Wraith', create: () => new Wraith() },
};

export const MOB_NAMES = Object.keys(MOBS);
export const DEFAULT_MOB = 'bluefish';

export function createMob(name) {
  return (MOBS[name] ?? MOBS[DEFAULT_MOB]).create();
}

export function nextMob(name) {
  return MOB_NAMES[(MOB_NAMES.indexOf(name) + 1) % MOB_NAMES.length];
}

/** Frees the GPU resources of a mob that has been removed from the scene. */
export function disposeMob(mob) {
  mob.parts?.mixer?.stopAllAction?.();
  mob.root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) {
      m.map?.dispose();
      m.dispose();
    }
  });
  mob.parts?.face?.dispose?.();
}
