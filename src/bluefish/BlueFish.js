import { BLUEFISH_HEIGHT, HOVER, buildBlueFishRig } from './BlueFishRig.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class BlueFish {
  constructor() {
    const { root, joints, parts } = buildBlueFishRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.id = 'bluefish';
    this.canFly = true;
    this.height = BLUEFISH_HEIGHT;
    this.halfWidth = 0.8;
    this.emoteLift = 0.8;

    this.stateAliases = { wave: 'happy' };

    this.bobPhase = Math.random() * 10;
    this.swimPhase = Math.random() * 10;
    this.flopPhase = Math.random() * 10;
    this.flipTimer = 0;
    this.isHovered = false;

    this.grounded = 0;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
  }

  triggerPetReaction(count = 1) {
    this.flipTimer = 1.0;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    this.grounded = sit;
    this.pose = p;

    // Hover bob: slow gentle up-and-down wave
    const bob = Math.sin(this.bobPhase) * 0.045 * (1 - sit);
    j.hips.position.y = HOVER * (1 - sit) + 0.12 * sit + p.bodyY + bob - p.crouch * 0.4;

    const squash = 1 - p.crouch * 1.2;
    j.torso.scale.set(
      1 / Math.sqrt(squash) + breath * 0.005,
      squash + breath * 0.012,
      1 / Math.sqrt(squash),
    );

    // Torso pitch/yaw/roll + tilt into movement and banking into turns
    let roll = p.torsoRoll + p.headRoll * 0.7;
    // No constant forward lean (that was tipping the nose down whenever it swam). Stay level while swimming
    // straight, nose up while rising, nose down while sinking.
    const climbPitch = clamp(this.climb * 0.3, -0.5, 0.5);
    let pitch = (p.torsoPitch * 0.5 + p.headPitch * 0.4) * (1 - 0.6 * sit) - climbPitch;
    let yaw = p.torsoYaw + p.headYaw * 0.6;

    // Click reaction
    let puff = 1;
    if (this.flipTimer > 0) {
      // Puff-up bounce: the fish inflates like a happy pufferfish, then pops back with a little jiggle.
      const k = 1 - this.flipTimer; // 0 to 1
      const env = Math.sin(k * Math.PI); // fades in and out
      puff = 1 + 0.3 * env + 0.07 * Math.sin(k * Math.PI * 6) * (1 - k);
      j.torso.position.y = env * 0.1;
    } else if (sit > 0.05) {
      // Out of water flop when sitting
      const flop = Math.sin(this.flopPhase);
      roll += flop * 0.35 * sit;
      yaw += Math.cos(this.flopPhase) * 0.25 * sit;
      j.torso.position.y = Math.abs(flop) * 0.08 * sit;
    } else {
      j.torso.position.y = 0;
    }

    j.torso.rotation.set(pitch, yaw, roll);
    j.torso.scale.multiplyScalar(puff);

    if (!this.parts.loaded) return;

    // Pelvic fin reaction from arm channels
    if (this.parts.pelvicL) {
      this.parts.pelvicL.rotation.y = p.armRaiseL * 0.5 + p.armSwingL * 0.4;
    }
    if (this.parts.pelvicR) {
      this.parts.pelvicR.rotation.y = -p.armRaiseR * 0.5 - p.armSwingR * 0.4;
    }
  }

  animate(dt) {
    this.bobPhase += dt * (this.isHovered ? 1.8 : 2.6);
    this.swimPhase += dt * (2.0 + 4.0 * this.walkAmount);
    this.flopPhase += dt * (3.5 + 7.0 * this.grounded);

    if (this.flipTimer > 0) {
      this.flipTimer = Math.max(0, this.flipTimer - dt * 1.3);
    }

    if (this.parts.mixer) {
      // Time scale tied to speed: lazy hover (0.6x), active swim (up to 2.5x), fast flick on click
      let speed = 0.65 + this.walkAmount * 2.0;
      if (this.isHovered) speed = 0.5;
      if (this.flipTimer > 0) speed = 3.2;
      if (this.grounded > 0.5) speed = 1.4;
      this.parts.mixer.timeScale = speed;
      this.parts.mixer.update(dt);
    }

    // Procedural fin flutter when hovering or swimming
    if (this.parts.loaded) {
      if ((this.isHovered || this.flipTimer > 0) && this.parts.pelvicL && this.parts.pelvicR) {
        const flutter = Math.sin(this.swimPhase * 3) * 0.25;
        this.parts.pelvicL.rotation.z = flutter;
        this.parts.pelvicR.rotation.z = -flutter;
      }
      if (this.parts.tailPivot && this.pose) {
        // Additional tail flick from leg swing
        this.parts.tailPivot.rotation.y += (this.pose.legSwingL - this.pose.legSwingR) * 0.25;
      }
    }

    this.parts.face?.apply(this.face);
  }
}