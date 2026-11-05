import * as THREE from 'three';
import { WOLF_HEIGHT, HOVER, buildWolfRig } from './WolfRig.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _yAxis = new THREE.Vector3(0, 1, 0);

export class Wolf {
  constructor() {
    const { root, joints, parts } = buildWolfRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.id = 'wolf';
    this.canFly = false;
    this.height = WOLF_HEIGHT;
    this.halfWidth = 0.85;
    this.emoteLift = 0.35;

    this.time = Math.random() * 10;
    this.clipTime = 0.25; // start at neutral standing frame
    this.earTimer = Math.random() * 3 + 2;
    this.earTwitch = 0;
    this.hopTimer = 0;
    this.wagTimer = 0;
    this.isHovered = false;

    this.grounded = 1;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
    this.sit = 0;
    this.eyeScale = 1.0;
  }

  triggerPetReaction(count = 1) {
    this.hopTimer = 0.6;
    this.wagTimer = 1.0 + Math.min(3, count) * 0.4;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    this.sit = sit;
    this.pose = p;

    // Small vertical body bob when walking
    const walkBob = Math.abs(Math.sin(this.walkPhase * 2)) * 0.025 * this.walkAmount;

    // Little bounce on click
    let hopY = 0;
    if (this.hopTimer > 0) {
      const k = 1 - this.hopTimer / 0.6;
      hopY = Math.sin(k * Math.PI) * 0.12;
    }

    // Gentle breathing motion during rest / idle
    const breathing = breath * (sit > 0.5 ? 0.008 : 0.004);

    // Hips position:
    // When sitting, rear lowers and hips drop slightly so rear touches floor
    const sitDrop = 0.11 * sit;
    j.hips.position.y = (p.bodyY || 0) + walkBob + hopY - sitDrop + breathing;

    // Tilt torso back when sitting (rear down, front legs straight, head level)
    // -22 deg tilt = -0.38 rad
    j.torso.rotation.x = -0.38 * sit;
    j.torso.rotation.y = 0;
    j.torso.rotation.z = 0;
    j.torso.scale.set(1, 1, 1); // Strictly uniform 1
  }

  animate(dt) {
    this.time += dt;

    if (this.hopTimer > 0) {
      this.hopTimer = Math.max(0, this.hopTimer - dt);
    }
    if (this.wagTimer > 0) {
      this.wagTimer = Math.max(0, this.wagTimer - dt);
    }

    // Ear twitch timer (subtle occasional twitch)
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earTwitch = 0.25;
      this.earTimer = Math.random() * 4 + 3;
    }
    this.earTwitch *= Math.exp(-10 * dt);

    // Eye open/close state:
    // When sitting/resting/sleeping (sit > 0.5), eyes close (scale.y -> 0.08)
    // When awake, eyes open (scale.y -> 1.0)
    const targetEyeScale = this.sit > 0.6 ? 0.08 : 1.0;
    this.eyeScale += (targetEyeScale - this.eyeScale) * (1 - Math.exp(-8 * dt));
    if (this.parts.eyeMesh) {
      this.parts.eyeMesh.scale.y = this.eyeScale;
    }

    // Ear twitch rotation (clip only animates position of ears, rotation is safe)
    if (this.parts.ears.length >= 2) {
      const [earL, earR] = this.parts.ears;
      earL.rotation.z = this.earTwitch * 0.25;
      earR.rotation.z = -this.earTwitch * 0.25;
    }

    // Walk cycle animation mixer:
    // Plays the embedded Animation clip at a speed matched to real velocity
    if (this.parts.mixer && this.parts.trotAction) {
      if (this.walkAmount > 0.05) {
        // Active walking: advance mixer time matched to real movement
        const trotSpeed = this.walkAmount * 1.6;
        this.parts.mixer.timeScale = trotSpeed;
        this.parts.mixer.update(dt);
        this.clipTime = (this.clipTime + dt * trotSpeed) % 1.0;
      } else {
        // Pausing / stopped: smoothly ease mixer to the nearest neutral standing frame (0.25 or 0.75)
        const targetNeutral = (this.clipTime < 0.5) ? 0.25 : 0.75;
        const diff = targetNeutral - this.clipTime;
        if (Math.abs(diff) > 0.005) {
          this.clipTime += diff * (1 - Math.exp(-12 * dt));
          this.parts.mixer.setTime(this.clipTime);
        } else {
          this.clipTime = targetNeutral;
          this.parts.mixer.setTime(targetNeutral);
        }
      }
    }

    // Tail wag on click:
    if (this.wagTimer > 0 && this.parts.tail) {
      const wagAngle = Math.sin(this.time * 22) * 0.35 * (this.wagTimer / 1.5);
      const qWag = new THREE.Quaternion().setFromAxisAngle(_yAxis, wagAngle);
      this.parts.tail.quaternion.multiply(qWag);
    }
  }
}
