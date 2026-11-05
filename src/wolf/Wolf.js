import { WOLF_HEIGHT, HOVER, buildWolfRig } from './WolfRig.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class Wolf {
  constructor() {
    const { root, joints, parts } = buildWolfRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.height = WOLF_HEIGHT;
    this.halfWidth = 0.95;
    this.emoteLift = 0.75;

    this.time = Math.random() * 10;
    this.bobPhase = Math.random() * 10;
    this.tailPhase = Math.random() * 10;
    this.earTimer = Math.random() * 3 + 2;
    this.earTwitch = 0;

    this.grounded = 1;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    const crouch = clamp(p.crouch, 0, 1);
    this.pose = p;

    const legLength = this.parts.legLength;
    const bob = Math.sin(this.bobPhase) * 0.02 * this.walkAmount;

    // Ground animal: hips position when standing vs sitting vs crouching
    j.hips.position.y =
      legLength * (1 - 0.42 * sit) + p.bodyY + bob - crouch * 0.4 * legLength;

    const squash = 1 - crouch * 0.4;
    j.torso.scale.set(
      1 / Math.sqrt(squash) + breath * 0.003,
      squash + breath * 0.008,
      1 / Math.sqrt(squash),
    );

    // Body pitch: when sitting, torso tilts back/up ~26° (0.45 rad) like a sitting dog
    j.torso.rotation.set(
      p.torsoPitch * (1 - 0.5 * sit) - 0.45 * sit + this.lean * 0.4 - this.climb * 0.15,
      p.torsoYaw,
      p.torsoRoll,
    );
  }

  animate(dt) {
    this.time += dt;
    this.bobPhase += dt * 3.0;

    if (!this.pose) return;
    const p = this.pose;
    const move = this.walkAmount;
    const sit = clamp(p.sit, 0, 1);

    // Head orientation (model space: X = pitch, Z = yaw, Y = roll)
    const k = 1 - Math.exp(-9 * dt);
    const h = this.joints.head.rotation;
    // When sitting, compensate head pitch so wolf still looks ahead
    const sitHeadPitch = 0.45 * sit;
    h.x += (-p.headPitch * 0.7 + sitHeadPitch - h.x) * k;
    h.z += (p.headYaw * 0.7 - h.z) * k;
    h.y += (-p.headRoll * 0.7 - h.y) * k;

    if (!this.parts.loaded) return;

    // Tail wagging and pose
    const isExcited = p.happy > 0.4 || p.dance > 0.4 || p.excited > 0.4;
    const tailSpeed = isExcited ? 14.0 : 2.2 + 5.0 * move;
    this.tailPhase += dt * tailSpeed;

    const wagAmp = isExcited ? 0.45 : 0.12 + 0.25 * move;
    this.parts.tail.rotation.z = Math.sin(this.tailPhase) * wagAmp;

    // Tail pitch: sad = down, excited = up, sitting = tilted down
    if (p.sad > 0.4) {
      this.parts.tail.rotation.x = -0.4;
    } else if (isExcited) {
      this.parts.tail.rotation.x = 0.35;
    } else if (sit > 0.1) {
      this.parts.tail.rotation.x = -0.25 * sit;
    } else {
      this.parts.tail.rotation.x = 0;
    }

    // Ears twitch and sad flattening
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earTwitch = 0.35;
      this.earTimer = Math.random() * 4 + 2.5;
    }
    this.earTwitch *= Math.exp(-12 * dt);

    const [earL, earR] = this.parts.ears;
    if (p.sad > 0.4) {
      earL.rotation.y = -0.35;
      earR.rotation.y = 0.35;
    } else {
      earL.rotation.y = this.earTwitch * 0.3;
      earR.rotation.y = -this.earTwitch * 0.2;
    }

    // Legs: [FL, FR, RL, RR]
    // Diagonal pairs walk: (FL & RR) vs (FR & RL)
    this.parts.legs.forEach((leg, i) => {
      const isLeft = i === 0 || i === 2;
      const isFront = i === 0 || i === 1;
      const diag = (i === 0 || i === 3) ? 0 : Math.PI;

      const swing = isLeft ? p.legSwingL : p.legSwingR;
      const step = -Math.sin(this.walkPhase + diag) * 0.65 * move;

      let rotX = step * (1 - sit) - swing * 0.8;

      if (sit > 0.05) {
        if (!isFront) {
          // Rear legs fold forward under body
          rotX += -1.25 * sit;
        } else {
          // Front legs stay straight down / slight forward tilt to meet floor
          rotX += 0.25 * sit;
        }
      }

      // Waving with front-left paw
      if (i === 0 && (p.armRaiseL > 0.1 || p.wristL > 0.1)) {
        rotX = -0.75 * p.armRaiseL - 0.35 * Math.sin(this.time * 8.0) * p.armRaiseL;
      }

      leg.rotation.x = rotX;
    });

    this.parts.face?.apply(this.face);
  }
}
