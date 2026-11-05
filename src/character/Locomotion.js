const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const WALK_FACING = 1.0;
const CYCLE_LENGTH = 0.8;

export class Locomotion {
  constructor() {
    this.x = 0;
    this.targetX = 0;
    this.speed = 0;
    this.maxSpeed = 0.9;
    this.phase = 0;
    this.walkAmount = 0;
    this.facing = 0;
    this.idleFacing = 0;
    this.minX = -3;
    this.maxX = 3;
    this.scale = 1;
    this.startDelay = 0;
    this.settleTime = 0;
  }

  setBounds(minX, maxX) {
    this.minX = minX;
    this.maxX = maxX;
    this.targetX = clamp(this.targetX, minX, maxX);
  }

  walkTo(x) {
    const prevTarget = this.targetX;
    this.targetX = clamp(x, this.minX, this.maxX);
    if (Math.abs(this.targetX - prevTarget) > 0.1) {
      this.startDelay = 0.18; // slight pause before accelerating
    }
  }

  stop() {
    this.targetX = this.x;
    this.startDelay = 0;
  }

  get arrived() {
    return (
      Math.abs(this.targetX - this.x) < 0.04 * this.scale &&
      Math.abs(this.speed) < 0.06 * this.scale
    );
  }

  update(dt, scale) {
    this.scale = scale;
    const vmax = this.maxSpeed * scale;
    const dx = this.targetX - this.x;

    if (this.startDelay > 0) {
      this.startDelay = Math.max(0, this.startDelay - dt);
      // Ease speed down while waiting
      this.speed *= Math.exp(-8 * dt);
    } else {
      // S-curve smooth acceleration & deceleration
      const dist = Math.abs(dx);
      let targetSpeed = 0;
      if (dist > 0.02 * scale) {
        // Slow down smoothly when within stopping distance (0.8 * scale)
        const decelFactor = Math.min(1, Math.sqrt(dist / (0.8 * scale)));
        targetSpeed = Math.sign(dx) * vmax * decelFactor;
      }
      const accelRate = Math.sign(targetSpeed) === Math.sign(this.speed) && Math.abs(targetSpeed) > Math.abs(this.speed) ? 4.5 : 7.0;
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-accelRate * dt));
    }

    this.x += this.speed * dt;

    // Keep within bounds
    if (this.x < this.minX) {
      this.x = this.minX;
      this.speed = 0;
    } else if (this.x > this.maxX) {
      this.x = this.maxX;
      this.speed = 0;
    }

    this.walkAmount = Math.min(1, Math.abs(this.speed) / (0.32 * vmax));
    this.phase += (Math.abs(this.speed) / (CYCLE_LENGTH * scale)) * Math.PI * 2 * dt;

    // Smooth turning towards direction of travel
    const moving = Math.abs(this.speed) > 0.1 * vmax;
    const facingTarget = moving ? Math.sign(this.speed) * WALK_FACING : this.idleFacing;
    this.facing += (facingTarget - this.facing) * (1 - Math.exp(-6.5 * dt));
  }
}
