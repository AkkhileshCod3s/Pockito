import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const GLOW_BASE = new THREE.Color(0x82eaff);
const GLOW_HEART = new THREE.Color(0xff5577);
const GLOW_SURPRISED = new THREE.Color(0xffffff);

/** Drives the two glowing eyes from the shared FaceDisplay state. There's no face mesh to repaint here —
 *  "expression" means how open the eyes are, what colour they glow, and a slow idle flicker. */
export class WraithFace {
  constructor(parts) {
    this.parts = parts;
    this.flicker = Math.random() * 10;
    this.color = GLOW_BASE.clone();
  }

  apply(face) {
    const eyes = this.parts.eyes;
    if (!eyes.length) return;
    const c = face.current;
    const blink = face.blinkFactor;
    this.flicker += 0.016;

    const heart = c.heart > 0.4;
    const surprised = c.wide > 0.3 || face.expression === 'surprised';
    const target = heart ? GLOW_HEART : surprised ? GLOW_SURPRISED : GLOW_BASE;
    this.color.lerp(target, 0.08);

    const flicker = 1 + 0.06 * Math.sin(this.flicker * 2.3) + 0.03 * Math.sin(this.flicker * 5.1 + 1);

    eyes.forEach(({ core, glow }, i) => {
      const open = clamp((c.eyeOpen[i] ?? c.eyeOpen[0]) * blink, 0, 1);
      const openScale = Math.max(0.04, open); // never fully flat, so the glow still shows through closed eyes
      if (core) {
        const b = this.parts.base.get(core);
        core.scale.set(b.x, b.y * openScale, b.z);
      }
      if (glow) {
        const b = this.parts.base.get(glow);
        glow.scale.set(b.scale.x, b.scale.y * openScale, b.scale.z);
        glow.material.opacity = b.opacity * (0.5 + 0.5 * open) * flicker;
        glow.material.color.copy(this.color);
      }
    });
  }
}