import { DUCKLING_HEIGHT, buildDucklingRig } from './DucklingRig.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;
const PET_TIME = 0.9; // seconds of happy hop + wing flap when clicked

/** A baby duckling. It uses the model's own Waddle clip, synced to the distance it travels. */
export class Duckling {
  constructor() {
    const { root, joints, parts } = buildDucklingRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.id = 'duckling';
    this.canFly = false;
    this.height = DUCKLING_HEIGHT;
    this.halfWidth = 0.5;
    this.emoteLift = 0.65;

    this.time = Math.random() * 10;
    this.petTimer = 0;
    this.isHovered = false;

    this.grounded = 1;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
  }

  triggerPetReaction() {
    this.petTimer = PET_TIME;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    const crouch = clamp(p.crouch, 0, 1);
    const loaf = Math.max(sit, crouch);
    this.pose = p;

    // Happy hop when clicked
    let petY = 0;
    if (this.petTimer > 0) {
      const k = 1 - this.petTimer / PET_TIME;
      petY = Math.sin(k * Math.PI) * 0.3;
    }

    // Tiny bounce in each step while waddling
    const stepY = Math.abs(Math.sin(this.walkPhase)) * 0.03 * this.walkAmount;
    j.hips.position.y = p.bodyY + stepY + petY - loaf * 0.05;

    // Squash and stretch
    const squash = 1 - crouch * 0.3 - loaf * 0.06 + (petY > 0 ? 0.15 : 0);
    j.torso.scale.set(
      1 / Math.sqrt(squash) + breath * 0.004,
      squash + breath * 0.008,
      1 / Math.sqrt(squash),
    );

    j.torso.rotation.set(
      p.torsoPitch * 0.5,
      p.torsoYaw + p.headYaw * 0.4,
      p.torsoRoll,
    );
  }

  animate(dt) {
    this.time += dt;
    if (this.petTimer > 0) this.petTimer = Math.max(0, this.petTimer - dt);

    const { mixer, waddleAction, duration } = this.parts;
    if (mixer && waddleAction) {
      // Waddle clip is driven by the distance walked (so feet never slide) and fades in while moving.
      const w = clamp(this.walkAmount * 1.4, 0, 1);
      waddleAction.setEffectiveWeight(w);
      waddleAction.time = (((this.walkPhase / TAU) % 1) + 1) % 1 * duration;
      mixer.update(0);
    }
    if (!this.parts.loaded) return;

    // Wings: flap when petted, flutter a little when hovered, otherwise stay folded.
    let flap = 0;
    if (this.petTimer > 0) {
      const k = 1 - this.petTimer / PET_TIME;
      flap = (0.5 + 0.5 * Math.sin(this.time * 34)) * 0.9 * Math.sin(k * Math.PI);
    } else if (this.isHovered) {
      flap = (0.5 + 0.5 * Math.sin(this.time * 22)) * 0.18;
    }
    const [wingL, wingR] = this.parts.wings;
    if (wingL) wingL.rotation.z = flap; // positive swings the left wing outwards
    if (wingR) wingR.rotation.z = -flap;

    this.#updateEyes();
  }

  #updateEyes() {
    const face = this.face;
    const c = face.current;
    const blink = face.blinkFactor;
    const wide = c.wide > 0.3 || face.expression === 'surprised' || face.expression === 'sparkle';
    const squint = c.happy > 0.4 || c.squeeze > 0.4;

    // The eye meshes are small cubes centred on their own node, so scaling closes them in place.
    this.parts.eyes.forEach((eye, i) => {
      if (!eye) return;
      const open = clamp((c.eyeOpen[i] ?? c.eyeOpen[0]) * blink, 0, 1);
      let sy = Math.max(0.1, open);
      if (wide) sy = 1.3;
      else if (squint) sy = Math.min(sy, 0.35);
      eye.scale.y = sy;
    });
  }
}
