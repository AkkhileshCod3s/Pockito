import * as THREE from 'three';
import { WOLF_HEIGHT, buildWolfRig } from './WolfRig.js';
import { FaceDisplay } from '../face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const smooth01 = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const TAU = Math.PI * 2;

// ---- tuning knobs ----
const STRIDE_RATIO = 0.8 / 0.6; // walk-clip cycles per locomotion cycle. Higher = legs step faster for the same ground speed.
const SIT_PITCH = -0.55; // body tips back this much (radians) around the shoulders when sitting
const SIT_REAR_FOLD = -1.0; // back legs fold forward by this much (flip the sign if they fold backwards)
const SHOULDER_Y = 0.45; // shoulder height and position the body tips around (rig units)
const SHOULDER_Z = 0.22;
const HEAD_LEVEL = 0.5; // how much the head tips back down to stay level while the body is tipped (1 = fully level)
const EYE_CLOSED = 0.08;
const BLINK_TIME = 0.22;
const CLOSED_EYE_STATES = new Set(['sleep', 'sleepy']);

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _box = new THREE.Box3();

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
    this.stateName = ''; // set every frame by Character
    this.isHovered = false;
    this.alert = 0;

    this.grounded = 1;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.cycles = 0;
    this.pose = null;
    this.sit = 0;
    this.groundOffset = 0;

    this.hopTimer = 0;
    this.wagTimer = 0;

    this.earTimer = rand(2, 5);
    this.earTwitch = 0;
    this.earSide = 0;

    this.eyeOpen = 1;
    this.nextBlink = rand(1.5, 4);
    this.blinkT = -1;
    this.blinkTwice = false;

    this.glance = { on: false, t: 0, dur: 0, yaw: 0, pitch: 0, roll: 0 };
    this.nextGlance = rand(1.5, 4);
    // Every few seconds it turns to the user and tilts its head, like a dog asking for attention.
    this.affection = { on: false, t: 0, dur: 0, side: 1, env: 0, next: rand(3, 5) };
    this.neckRot = { x: 0, y: 0, z: 0 };
  }

  triggerPetReaction(count = 1) {
    this.hopTimer = 0.6;
    this.wagTimer = 1.0 + Math.min(3, count) * 0.4;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    const e = smooth01(sit);
    this.sit = sit;
    this.pose = p;

    // The walk clip is driven by distance travelled, so the legs never slide and slow down with the body.
    this.cycles = (this.walkPhase / TAU) * STRIDE_RATIO;

    // Small bounce on every footfall (two per stride)
    const walkBob = Math.abs(Math.sin(this.cycles * TAU)) * 0.03 * this.walkAmount * (1 - e);

    // Little hop on click
    let hopY = 0;
    if (this.hopTimer > 0) {
      const k = 1 - this.hopTimer / 0.6;
      hopY = Math.sin(k * Math.PI) * 0.12;
    }

    const breathing = breath * (sit > 0.5 ? 0.012 : 0.008);
    j.hips.position.y = (p.bodyY || 0) - (p.crouch || 0) * 0.15 + walkBob + hopY + breathing + this.groundOffset;

    // Sitting: the whole body tips back around the shoulders, so the front legs stay planted and straight
    // (counter-rotated in animate()) while the hips drop to the floor and the back legs fold forward.
    const rx = SIT_PITCH * e + (p.torsoPitch || 0) * 0.4;
    const c = Math.cos(rx);
    const s = Math.sin(rx);
    j.torso.rotation.set(
      rx,
      0,
      (p.torsoRoll || 0) * 0.6 + Math.sin(this.cycles * TAU) * 0.025 * this.walkAmount,
    );
    j.torso.position.set(0, SHOULDER_Y - (SHOULDER_Y * c - SHOULDER_Z * s), SHOULDER_Z - (SHOULDER_Y * s + SHOULDER_Z * c));
    j.torso.scale.set(1, 1, 1);
  }

  animate(dt) {
    this.time += dt;
    if (this.hopTimer > 0) this.hopTimer = Math.max(0, this.hopTimer - dt);
    if (this.wagTimer > 0) this.wagTimer = Math.max(0, this.wagTimer - dt);
    this.alert = damp(this.alert, this.isHovered ? 1 : 0, 6, dt);

    const closed = CLOSED_EYE_STATES.has(this.stateName);
    this.#updateAffection(dt, closed);
    this.#updateEyes(dt, closed);
    this.#updateHead(dt, closed);
    this.#updateEars(dt);
    this.#updateBody(dt, closed);
    this.#lockToFloor(dt);
  }

  /** Now and then (standing or sitting) the wolf looks at you and tilts its head. `env` is 0..1 while it does. */
  #updateAffection(dt, closed) {
    const a = this.affection;
    a.next -= dt;
    if (!a.on && a.next <= 0 && this.walkAmount < 0.15 && !closed) {
      a.on = true;
      a.t = 0;
      a.dur = rand(2.2, 3.2);
      a.side = Math.random() < 0.5 ? -1 : 1;
    }
    a.env = 0;
    if (a.on) {
      a.t += dt;
      const k = a.t / a.dur;
      if (k >= 1 || closed || this.walkAmount > 0.4) {
        a.on = false;
        a.next = rand(5, 9);
      } else {
        a.env = smooth01(k / 0.2) * (1 - smooth01((k - 0.75) / 0.25));
      }
    }
  }

  /** Gentle blink every few seconds; eyes stay shut only while sleeping. */
  #updateEyes(dt, closed) {
    let target = closed ? EYE_CLOSED : 1 - 0.25 * this.affection.env; // soft, happy eyes while it tilts its head
    if (closed) {
      this.blinkT = -1;
    } else {
      this.nextBlink -= dt;
      if (this.blinkT < 0 && this.nextBlink <= 0) {
        this.blinkT = 0;
        this.blinkTwice = Math.random() < 0.2;
      }
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const k = this.blinkT / BLINK_TIME;
        if (k >= 1) {
          this.blinkT = -1;
          this.nextBlink = this.blinkTwice ? 0.12 : rand(2.2, 5.5);
          this.blinkTwice = false;
        } else {
          target = Math.min(target, 1 - (1 - EYE_CLOSED) * Math.sin(k * Math.PI));
        }
      }
    }
    this.eyeOpen = damp(this.eyeOpen, target, closed ? 8 : 40, dt);

    const eye = this.parts.eyeMesh;
    if (eye) {
      // Squash the eyes around their own centre so they close in place instead of sliding.
      eye.scale.y = this.eyeOpen;
      eye.position.y = (this.parts.eyeCenterY ?? 0) * (1 - this.eyeOpen);
    }
  }

  /** Head follows the cursor, glances around, tilts toward you, and nods slightly while walking. */
  #updateHead(dt, closed) {
    const neck = this.parts.neck;
    const p = this.pose;
    if (!neck || !p) return;
    const e = smooth01(this.sit);
    const walk = this.walkAmount;
    const g = this.glance;
    const aff = this.affection;

    this.nextGlance -= dt;
    if (!g.on && this.nextGlance <= 0 && !closed && !this.isHovered && !aff.on && walk < 0.2) {
      g.on = true;
      g.t = 0;
      g.dur = rand(1.6, 3.0);
      g.yaw = rand(0.25, 0.55) * (Math.random() < 0.5 ? -1 : 1);
      g.pitch = rand(-0.15, 0.1);
      g.roll = rand(-0.12, 0.12);
    }
    let gy = 0;
    let gp = 0;
    let gr = 0;
    if (g.on) {
      g.t += dt;
      const k = g.t / g.dur;
      if (k >= 1 || aff.on) {
        g.on = false;
        this.nextGlance = rand(2.5, 6);
      } else {
        const env = smooth01(k / 0.25) * (1 - smooth01((k - 0.7) / 0.3));
        gy = g.yaw * env;
        gp = g.pitch * env;
        gr = g.roll * env;
      }
    }

    const calm = closed ? 0.2 : 1;
    const cyc = this.cycles * TAU;
    const yaw = p.headYaw * 0.9 + gy + Math.sin(this.time * 0.45) * 0.04 * calm + Math.sin(cyc) * 0.04 * walk;
    let pitch = p.headPitch * 0.9 + gp + Math.sin(this.time * 0.6 + 1) * 0.03 * calm + Math.sin(cyc * 2 + 0.8) * 0.035 * walk;
    let roll = p.headRoll * 0.9 + gr + this.alert * 0.08 * Math.sin(this.time * 1.7);
    // Affection: look up at you and tilt the head to one side
    pitch -= 0.12 * aff.env;
    roll += aff.side * 0.34 * aff.env;
    pitch += -SIT_PITCH * HEAD_LEVEL * e; // keep the head up when the body tips back
    if (closed) pitch += 0.18; // head dips while dozing

    const r = this.neckRot;
    r.x = damp(r.x, clamp(pitch, -0.45, 0.5), 9, dt);
    r.y = damp(r.y, clamp(yaw, -0.7, 0.7), 9, dt);
    r.z = damp(r.z, clamp(roll, -0.4, 0.4), 9, dt);
    neck.rotation.set(r.x, r.y, r.z);
  }

  #updateEars(dt) {
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earSide = Math.random() < 0.5 ? 0 : 1;
      this.earTwitch = 0.35;
      this.earTimer = rand(2.5, 6);
    }
    this.earTwitch *= Math.exp(-9 * dt);
    const perk = this.alert * 0.1 + this.affection.env * 0.12;
    const [earL, earR] = this.parts.ears;
    if (earL && earR) {
      earL.rotation.z = (this.earSide === 0 ? this.earTwitch * 0.5 : 0) + perk;
      earR.rotation.z = -(this.earSide === 1 ? this.earTwitch * 0.5 : 0) - perk;
    }
  }

  /** Samples the GLB's clip by hand: standing frame blended with the walk cycle by speed. */
  #sampleClip() {
    const { tracks, duration } = this.parts;
    if (!tracks.length) return;
    const t = (this.cycles % 1) * duration;
    const w = smooth01(this.walkAmount);
    for (const tr of tracks) {
      const v = tr.interp.evaluate(t);
      if (tr.path === 'quaternion') {
        _qa.fromArray(tr.stand);
        _qb.fromArray(v);
        tr.base.copy(_qa.slerp(_qb, w));
        tr.node.quaternion.copy(tr.base);
      } else {
        const s = tr.stand;
        tr.node.position.set(s[0] + (v[0] - s[0]) * w, s[1] + (v[1] - s[1]) * w, s[2] + (v[2] - s[2]) * w);
      }
    }
  }

  /** node.quaternion = the clip's pose for that node, rotated by an extra amount (never accumulates). */
  #rotate(node, q) {
    const base = this.parts.bases.get(node);
    if (!node || !base) return;
    node.quaternion.copy(base).premultiply(q);
  }

  #updateBody(dt, closed) {
    const { legs, tail } = this.parts;
    this.#sampleClip();

    // Sitting: front legs straight (undo the body tilt), back legs fold forward under the body.
    const e = smooth01(this.sit);
    if (e > 0.001) {
      _q.setFromAxisAngle(AXIS_X, -(SIT_PITCH * e));
      this.#rotate(legs.frontL, _q);
      this.#rotate(legs.frontR, _q);
      _q.setFromAxisAngle(AXIS_X, SIT_REAR_FOLD * e);
      this.#rotate(legs.rearL, _q);
      this.#rotate(legs.rearR, _q);
    }

    if (tail) {
      let wag = Math.sin(this.time * 1.7) * 0.1; // lazy idle sway
      wag += Math.sin(this.cycles * TAU) * 0.18 * this.walkAmount; // swings with each stride
      wag += this.alert * Math.sin(this.time * 9) * 0.25; // excited when hovered
      wag += this.affection.env * Math.sin(this.time * 8) * 0.3; // happy wag while it tilts its head
      if (this.wagTimer > 0) wag += Math.sin(this.time * 22) * 0.5 * Math.min(1, this.wagTimer / 0.5); // click wag
      if (closed) wag *= 0.2;
      // Rotate around the model's vertical axis so the tail wags sideways.
      this.#rotate(tail, _q.setFromAxisAngle(AXIS_Y, wag));
    }
  }

  /** While sitting, keep the lowest part of the body exactly on the floor (no floating, no sinking). */
  #lockToFloor(dt) {
    const wrapper = this.parts.modelWrapper;
    if (!wrapper) return;
    let target = 0;
    if (this.sit > 0.02) {
      this.root.updateMatrixWorld(true);
      _box.setFromObject(wrapper, true);
      const s = this.root.scale.y || 1;
      const minLocal = (_box.min.y - this.root.position.y) / s;
      target = (this.groundOffset - minLocal) * smooth01(this.sit);
    }
    this.groundOffset = damp(this.groundOffset, target, 10, dt);
  }
}