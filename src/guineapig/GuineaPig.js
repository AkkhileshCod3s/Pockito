import { GUINEAPIG_HEIGHT, HOVER, buildGuineaPigRig } from './GuineaPigRig.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class GuineaPig {
  constructor() {
    const { root, joints, parts } = buildGuineaPigRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.id = 'guineapig';
    this.canFly = false;
    this.height = GUINEAPIG_HEIGHT;
    this.halfWidth = 0.75;
    this.emoteLift = 0.75;

    this.time = Math.random() * 10;
    this.bobPhase = Math.random() * 10;
    this.scurryPhase = Math.random() * 10;
    this.nosePhase = Math.random() * 10;
    this.popcornTimer = 0;
    this.isHovered = false;

    this.grounded = 1;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
  }

  playEarShake() {
    if (this.parts.earShakeAction) {
      this.parts.earShakeAction.reset().play();
    }
  }

  triggerPetReaction(count = 1) {
    this.popcornTimer = 0.8;
    this.playEarShake();
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    const crouch = clamp(p.crouch, 0, 1);
    this.pose = p;

    // Popcorn jump calculation
    let popcornY = 0;
    let popcornRoll = 0;
    if (this.popcornTimer > 0) {
      const k = 1 - this.popcornTimer / 0.8; // 0 to 1
      popcornY = Math.sin(k * Math.PI) * 0.35;
      popcornRoll = Math.sin(k * Math.PI * 2) * 0.35;
    }

    // Chubby wobbly body: slight bounce and roll when scurrying
    const move = this.walkAmount;
    const waddleY = Math.abs(Math.sin(this.scurryPhase)) * 0.025 * move;
    const waddleRoll = Math.sin(this.scurryPhase) * 0.08 * move;

    // Ground animal resting at floor: loaf when sitting or sleeping
    const loaf = Math.max(sit, p.crouch);
    j.hips.position.y = p.bodyY + popcornY + waddleY - loaf * 0.06;

    // Squash & stretch (anticipation & landing squash)
    const squash = 1 - crouch * 0.3 + (popcornY > 0 ? 0.2 : 0);
    j.torso.scale.set(
      1 / Math.sqrt(squash) + breath * 0.004,
      squash + breath * 0.008,
      1 / Math.sqrt(squash),
    );

    j.torso.rotation.set(
      p.torsoPitch * 0.5 + this.lean * 0.3 - this.climb * 0.12,
      p.torsoYaw + p.headYaw * 0.4,
      p.torsoRoll + waddleRoll + popcornRoll,
    );
  }

  animate(dt) {
    this.time += dt;
    this.bobPhase += dt * 3.0;
    this.scurryPhase += dt * (12.0 * this.walkAmount + 2.0);
    this.nosePhase += dt * (this.isHovered ? 16.0 : 8.0);

    if (this.popcornTimer > 0) {
      this.popcornTimer = Math.max(0, this.popcornTimer - dt);
    }

    if (this.parts.mixer) {
      this.parts.mixer.update(dt);
    }

    if (!this.parts.loaded) return;

    // Feet scurry: Foot0 (RL), Foot1 (RR), Foot2 (FL), Foot3 (FR)
    // Diagonal pairs scurry forward and back quickly
    const move = this.walkAmount;
    const loaf = this.pose ? Math.max(clamp(this.pose.sit, 0, 1), clamp(this.pose.crouch, 0, 1)) : 0;
    this.parts.feet.forEach((foot, i) => {
      if (!foot) return;
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const step = Math.sin(this.scurryPhase + diag) * 0.5 * move;
      // In model space (+X is forward): translate along X
      foot.position.x = step;
      // Loaf: tuck feet up inside body
      foot.position.y = loaf > 0.1 ? loaf * 0.6 : 0;
    });

    // Ear wiggle when hovering
    if (this.isHovered && Math.sin(this.time * 6) > 0.8) {
      if (this.parts.ears[0]) this.parts.ears[0].rotation.z = Math.sin(this.time * 25) * 0.2;
      if (this.parts.ears[1]) this.parts.ears[1].rotation.z = -Math.sin(this.time * 25) * 0.2;
    }

    // Nose twitch
    const twitch = Math.sin(this.nosePhase) * (this.isHovered ? 1.0 : 0.6);
    this.parts.face?.apply(this.face, twitch);
  }
}
