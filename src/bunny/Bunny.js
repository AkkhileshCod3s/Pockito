import { BUNNY_HEIGHT, buildBunnyRig } from './BunnyRig.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;

// ---- Tuning knobs -------------------------------------------------------------------------------------
const HOP_HEIGHT = 0.3; // how high a travelling hop goes (world units before scaling)
const CLICK_HOP_HEIGHT = 0.28; // the two happy hops when the bunny is petted
const CLICK_TIME = 0.9; // seconds
// -------------------------------------------------------------------------------------------------------

/** A white voxel bunny. It hops instead of walking: one hop per stride of the locomotion cycle. */
export class Bunny {
  constructor() {
    const { root, joints, parts } = buildBunnyRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.id = 'bunny';
    this.canFly = false;
    this.height = BUNNY_HEIGHT;
    this.halfWidth = 0.6;
    this.emoteLift = 0.85;

    this.time = Math.random() * 10;
    this.petTimer = 0;
    this.isHovered = false;

    this.grounded = 1;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
    this.hop = { f: 0, arc: 0, ext: 0 }; // hop cycle: 0..1, height 0..1, leg extension -1..1
  }

  triggerPetReaction() {
    this.petTimer = CLICK_TIME;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    const crouch = clamp(p.crouch, 0, 1);
    const loaf = Math.max(sit, crouch);
    this.pose = p;

    // Hop cycle follows the distance travelled (walkPhase), so the feet never "slide" on the ground.
    const walk = this.walkAmount;
    const f = (((this.walkPhase / TAU) % 1) + 1) % 1;
    const arc = Math.sin(Math.PI * f); // 0 on the ground, 1 at the top of the hop
    const ext = Math.cos(Math.PI * f); // +1 taking off, -1 landing
    this.hop.f = f;
    this.hop.arc = arc;
    this.hop.ext = ext;

    const hopY = arc * HOP_HEIGHT * walk;

    // Happy double hop when clicked
    let petY = 0;
    if (this.petTimer > 0) {
      const k = 1 - this.petTimer / CLICK_TIME;
      petY = Math.abs(Math.sin(k * Math.PI * 2)) * CLICK_HOP_HEIGHT * (1 - 0.35 * k);
    }

    j.hips.position.y = p.bodyY + hopY + petY - loaf * 0.05;

    // Squash and stretch: crouch before the jump, stretch in the air, squash when landing.
    const ground = (1 - arc) * (1 - arc);
    let sy = 1 - crouch * 0.3 - loaf * 0.06;
    sy += (0.1 * arc - 0.12 * ground) * walk;
    sy += petY > 0 ? 0.12 : 0;
    j.torso.scale.set(
      1 / Math.sqrt(sy) + breath * 0.004,
      sy + breath * 0.008,
      1 / Math.sqrt(sy),
    );

    // Nose up when taking off, nose down when landing (a positive pitch tips the nose down).
    const hopPitch = -0.22 * ext * walk;
    j.torso.rotation.set(
      p.torsoPitch * 0.5 + hopPitch,
      p.torsoYaw + p.headYaw * 0.4,
      p.torsoRoll,
    );
  }

  animate(dt) {
    this.time += dt;
    if (this.petTimer > 0) this.petTimer = Math.max(0, this.petTimer - dt);

    // The model's own Idle clip (head nod, ear wiggle, tail wag, arm sway) keeps playing.
    this.parts.mixer?.update(dt);
    if (!this.parts.loaded) return;

    const walk = this.walkAmount;
    const { arc, ext } = this.hop;
    const loaf = this.pose ? Math.max(clamp(this.pose.sit, 0, 1), clamp(this.pose.crouch, 0, 1)) : 0;
    const base = this.parts.base;

    // Back legs trail behind on take-off and swing forward to land.
    const trail = -0.04 * ext * walk;
    this.parts.feet.forEach((foot) => {
      if (!foot) return;
      const b = base.get(foot);
      foot.position.z = b.z + trail;
      foot.rotation.x = -0.5 * ext * walk;
    });
    this.parts.haunches.forEach((h) => {
      if (!h) return;
      const b = base.get(h);
      h.position.z = b.z + trail * 0.5;
    });

    // These nodes are also moved by the Idle clip, so we add on top of it after the mixer ran.
    const tuck = 0.5 * arc * walk;
    this.parts.arms.forEach((a) => a && (a.rotation.x += tuck)); // arms tuck back in the air
    const [earL, earR] = this.parts.ears;
    const back = -0.35 * arc * walk; // ears stream back in the air
    const perk = this.isHovered ? 0.12 * Math.sin(this.time * 18) : 0; // ears twitch when hovered
    if (earL) {
      earL.rotation.x += back;
      earL.rotation.z += -0.5 * loaf + perk; // ears flop down when sleeping
    }
    if (earR) {
      earR.rotation.x += back;
      earR.rotation.z += 0.5 * loaf - perk;
    }

    this.#updateEyes();
  }

  #updateEyes() {
    const eyes = this.parts.eyeLids;
    if (!eyes.length) return;
    const face = this.face;
    const c = face.current;
    const blink = face.blinkFactor;
    const wide = c.wide > 0.3 || face.expression === 'surprised' || face.expression === 'sparkle';
    const squint = c.happy > 0.4 || c.squeeze > 0.4 ? 0.55 : 0;

    eyes.forEach(({ lid, line }, i) => {
      const open = clamp((c.eyeOpen[i] ?? c.eyeOpen[0]) * blink, 0, 1);
      const closure = wide ? 0 : Math.max(1 - open, squint);
      const show = closure > 0.03;
      lid.visible = show;
      line.visible = show && closure > 0.5;
      if (show) {
        lid.scale.y = closure;
        line.position.y = lid.position.y - 0.0625 * closure; // 0.0625 = eye height
      }
    });
  }
}
