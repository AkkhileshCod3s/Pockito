import { WRAITH_HEIGHT, HOVER, buildWraithRig } from './WraithRig.js';
import { WraithFace } from './WraithFace.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const RECOIL_TIME = 0.8; // seconds — the little flinch when clicked
const HOVER_SPEED = 1.4; // Float clip plays faster while hovered, calmer at rest

/** A floating, hooded wraith. No legs, no walk cycle — it drifts and the GLB's own "Float" clip
 *  (bob + cloak/tatter/sleeve sway) does all the visible motion; code only changes its speed. */
export class Wraith {
  constructor() {
    const { root, joints, parts } = buildWraithRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;

    // mob.face MUST be a FaceDisplay — Character.js and states.js call setExpression()/current/
    // blinkFactor on it for every pet. eyeFx is our own helper that reads this.face to drive the
    // two glow meshes; it is not a substitute for FaceDisplay.
    this.face = new FaceDisplay();
    this.eyeFx = new WraithFace(parts);

    this.id = 'wraith';
    this.canFly = true;
    this.height = WRAITH_HEIGHT;
    this.halfWidth = 0.65;
    this.emoteLift = 0.95;

    this.recoilTimer = 0;
    this.isHovered = false;

    this.grounded = 0;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
  }

  triggerPetReaction() {
    this.recoilTimer = RECOIL_TIME;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    this.pose = p;

    const settle = clamp(p.sit, 0, 1) + clamp(p.crouch, 0, 1) * 0.5;
    j.hips.position.y = HOVER + p.bodyY - settle * 0.25;

    let roll = p.torsoRoll + p.headRoll * 0.6;
    let pitch = p.torsoPitch * 0.4 + p.headPitch * 0.35;
    let yaw = p.torsoYaw + p.headYaw * 0.6;

    let scale = 1;
    if (this.recoilTimer > 0) {
      const k = 1 - this.recoilTimer / RECOIL_TIME;
      const env = Math.sin(k * Math.PI);
      pitch -= 0.25 * env;
      scale = 1 - 0.08 * env;
    }

    j.torso.rotation.set(pitch, yaw, roll);
    j.torso.scale.setScalar(scale + breath * 0.006);
  }

  animate(dt) {
    if (this.recoilTimer > 0) this.recoilTimer = Math.max(0, this.recoilTimer - dt);

    if (this.parts.mixer) {
      let speed = 0.85;
      if (this.isHovered) speed = HOVER_SPEED;
      if (this.recoilTimer > 0) speed = 2.2;
      this.parts.mixer.timeScale = speed;
      this.parts.mixer.update(dt);
    }

    this.eyeFx.apply(this.face);
  }
}