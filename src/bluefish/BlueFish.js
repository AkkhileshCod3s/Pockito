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

    this.height = BLUEFISH_HEIGHT;
    this.halfWidth = 0.85;
    this.emoteLift = 0.85;

    this.stateAliases = { wave: 'happy' };

    this.bobPhase = Math.random() * 10;
    this.flopPhase = Math.random() * 10;
    this.grounded = 0;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    this.grounded = sit;
    this.pose = p;

    const bob = Math.sin(this.bobPhase) * 0.04 * (1 - sit);
    // When sitting on floor, settle low (0.12 units above floor)
    j.hips.position.y = HOVER * (1 - sit) + 0.12 * sit + p.bodyY + bob - p.crouch * 0.4;

    const squash = 1 - p.crouch * 1.2;
    j.torso.scale.set(
      1 / Math.sqrt(squash) + breath * 0.005,
      squash + breath * 0.012,
      1 / Math.sqrt(squash),
    );

    // Torso pitch/yaw/roll + tilt into movement
    j.torso.rotation.set(
      (p.torsoPitch * 0.5 + p.headPitch * 0.4) * (1 - 0.6 * sit) + this.lean - this.climb * 0.18,
      p.torsoYaw + p.headYaw * 0.6,
      p.torsoRoll + p.headRoll * 0.7,
    );

    // Out-of-water flopping when grounded/sitting
    if (sit > 0.05) {
      const flop = Math.sin(this.flopPhase);
      j.torso.rotation.z += flop * 0.35 * sit;
      j.torso.rotation.y += Math.cos(this.flopPhase) * 0.25 * sit;
      j.torso.position.y = Math.abs(flop) * 0.08 * sit;
    } else {
      j.torso.position.y = 0;
    }

    if (!this.parts.loaded) return;

    // Flare pectoral fins from arm channels
    if (this.parts.finL) {
      this.parts.finL.rotation.y = p.armRaiseL * 0.6 + p.armSwingL * 0.5;
      this.parts.finL.rotation.z = p.wristL * 0.4;
    }
    if (this.parts.finR) {
      this.parts.finR.rotation.y = -p.armRaiseR * 0.6 - p.armSwingR * 0.5;
      this.parts.finR.rotation.z = -p.wristR * 0.4;
    }
  }

  animate(dt) {
    this.bobPhase += dt * 3.0;
    this.flopPhase += dt * (3.5 + 7.0 * this.grounded);

    if (this.parts.mixer) {
      // Swish speed: lazy when hovering, fast when swimming or flopping
      const speed = this.grounded > 0.5 ? 1.6 : 0.8 + this.walkAmount * 2.2;
      this.parts.mixer.timeScale = speed;
      this.parts.mixer.update(dt);
    }

    if (this.parts.loaded && this.parts.tail && this.pose) {
      // Procedural tail twitch from legSwing on top of mixer
      this.parts.tail.rotation.y += (this.pose.legSwingL - this.pose.legSwingR) * 0.3;
    }

    this.parts.face?.apply(this.face);
  }
}
