import * as THREE from 'three';

const SLEEPING = new Set(['sleep', 'sleepy']);
const AIRBORNE = new Set(['carried', 'drop']);
const DRAG_THRESHOLD_PX = 6;
const PET_WINDOW = 3.0;
const DOUBLE_CLICK_MS = 350;
const GAZE_DEPTH = 4;
const VELOCITY_WINDOW_MS = 80;
const MAX_THROW = 14;
/** Release speed (world units/s, scale-relative) below which the pet just stays where you left it. */
const THROW_SPEED = 3.5;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class PointerDirector {
  constructor({ character, screen, host, canvas, menu = null, chatPanel = null }) {
    this.character = character;
    this.screen = screen;
    this.host = host;
    this.menu = menu;
    this.chatPanel = chatPanel;
    this.pointer = null;
    this.over = false;
    this.airborne = false;
    this.press = null;
    this.drag = null;
    this.pets = [];
    this.lastClick = 0;
    this.attention = new THREE.Vector3();

    const target = canvas.ownerDocument;
    target.addEventListener('pointermove', (e) => this.#move(e));
    target.addEventListener('pointerdown', (e) => this.#down(e));
    target.addEventListener('pointerup', (e) => this.#up(e));
    target.addEventListener('pointercancel', (e) => this.#up(e));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('mouseleave', () => (this.pointer = null));
    target.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget && !this.drag) this.pointer = null;
    });
    window.addEventListener('blur', () => this.#up());
  }

  /** Pointer in world x and height above the floor; both stay valid when the window grows upward during a drag. */
  #world(px, py) {
    return { x: this.screen.toWorldX(px), h: this.screen.heightAboveFloor(py, this.character.placement.floorY) };
  }

  #hits(w) {
    const c = this.character;
    const { scale } = c.placement;
    const { halfWidth, height } = c.mob;
    return Math.abs(w.x - c.loco.x) < halfWidth * scale && w.h > c.lift && w.h < c.lift + height * scale;
  }

  #move(e) {
    this.pointer = { x: e.clientX, y: e.clientY, target: e.target, t: performance.now() };
    const w = this.#world(e.clientX, e.clientY);
    if (this.press && !this.drag && Math.hypot(e.clientX - this.press.px, e.clientY - this.press.py) > DRAG_THRESHOLD_PX) this.#startDrag(w);
    if (this.drag) {
      const d = this.drag;
      const now = performance.now();
      d.x = w.x - d.offsetX;
      d.h = w.h - d.offsetH;
      d.t = now;
      d.history.push({ x: d.x, h: d.h, t: now });
      while (d.history.length > 2 && now - d.history[0].t > VELOCITY_WINDOW_MS) d.history.shift();
    }
  }

  /** Release velocity from the recent pointer trail, so a flick throws and a pause drops. */
  #releaseVelocity(d) {
    const now = performance.now();
    const recent = d.history.filter((p) => now - p.t <= VELOCITY_WINDOW_MS);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (!first || !last || last.t - first.t < 16 || now - last.t > 90) return { vx: 0, vy: 0 };
    const dt = (last.t - first.t) / 1000;
    const scale = this.character.placement.scale;
    const cap = MAX_THROW * scale;
    return {
      vx: THREE.MathUtils.clamp((last.x - first.x) / dt, -cap, cap),
      vy: THREE.MathUtils.clamp((last.h - first.h) / dt, -cap, cap),
    };
  }

  #down(e) {
    if (this.chatPanel?.isOpen && (this.chatPanel.contains(e.target) || this.chatPanel.isPointOver?.(e.clientX, e.clientY))) {
      return;
    }
    const menu = this.menu;
    if (menu?.isOpen) {
      if (!menu.contains(e.target)) menu.close();
      return;
    }
    if (e.button === 2) {
      if (this.over && !this.drag) this.menu?.open(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0 || !this.over) return;
    this.press = { px: e.clientX, py: e.clientY };
  }

  #startDrag(w) {
    const c = this.character;
    c.brain?.resetInteraction?.();
    this.chatPanel?.onDragStart?.();
    this.drag = { offsetX: w.x - c.loco.x, offsetH: w.h - c.lift, x: c.loco.x, h: c.lift, t: performance.now(), history: [] };
    c.carry = { vx: 0 };
    c.trigger('carried', {}, true);
  }

  #up() {
    const c = this.character;
    if (this.drag) {
      const { vx, vy } = this.#releaseVelocity(this.drag);
      const speed = Math.hypot(vx, vy) / c.placement.scale;
      if (speed < THROW_SPEED) {
        c.trigger('settle', { then: 'idle' }, true);
      } else {
        c.trigger('drop', { vx, vy, then: 'idle' }, true);
      }
      c.carry = null;
      this.drag = null;
      this.chatPanel?.onDragEnd?.();
    } else if (this.press) {
      const now = performance.now();
      if (c.mob?.id === 'wolf' && now - this.lastClick < DOUBLE_CLICK_MS) {
        this.lastClick = 0;
        this.#toggleSit();
      } else {
        this.lastClick = now;
        this.#pet();
      }
    }
    this.press = null;
  }

  /** True while the wolf is sitting (also during the short heart reaction that keeps it sitting). */
  #isSitting() {
    const c = this.character;
    return c.stateName === 'sit' || (c.stateName === 'pet' && c.fsm.params.then === 'sit');
  }

  /** Double-click: sit down, double-click again: stand back up. */
  #toggleSit() {
    const c = this.character;
    c.brain?.resetInteraction?.();
    if (this.#isSitting() || SLEEPING.has(c.stateName)) c.trigger('wake', { then: 'idle' }, true);
    else c.trigger('sit', {}, true);
  }

  #pet() {
    const c = this.character;
    c.brain?.resetInteraction?.();
    const now = performance.now() / 1000;
    this.pets = this.pets.filter((t) => now - t < PET_WINDOW);
    this.pets.push(now);
    const count = this.pets.length;
    if (SLEEPING.has(c.stateName)) {
      c.trigger(c.mob?.id === 'wolf' ? 'wake' : 'surprised', { then: 'idle' }, true);
    } else {
      c.mob.triggerPetReaction?.(count);
      c.trigger('pet', { count, then: this.#isSitting() ? 'sit' : 'idle' }, true);
    }
  }

  update(dt) {
    const c = this.character;
    const w = this.pointer ? this.#world(this.pointer.x, this.pointer.y) : null;

    const isPanelOver = this.chatPanel?.isOpen && (
      this.chatPanel.isDragging ||
      (this.pointer?.target && this.chatPanel.contains(this.pointer.target)) ||
      (this.pointer && this.chatPanel.isPointOver?.(this.pointer.x, this.pointer.y))
    );

    const over = !!this.drag || !!this.menu?.isOpen || !!isPanelOver || (!!w && this.#hits(w));
    if (over !== this.over) {
      this.over = over;
      this.host?.setPointerOver(over);
      document.body.classList.toggle('grab', over && !isPanelOver);

      if (c.mob) c.mob.isHovered = over;

      if (over && !isPanelOver) {
        c.brain?.resetInteraction?.();
        if (c.mob?.id === 'wolf' && SLEEPING.has(c.stateName)) {
          c.trigger('wake', { then: 'idle' }, true);
        } else if (!SLEEPING.has(c.stateName) && !AIRBORNE.has(c.stateName) && c.stateName !== 'boot' && c.stateName !== 'carried' && c.stateName !== 'drop') {
          c.trigger('hover', {}, false);
        }
      } else if (!over) {
        if (c.stateName === 'hover') {
          c.trigger('idle', {}, true);
        }
      }
    }

    const airborne = !!this.drag || AIRBORNE.has(c.stateName) || c.lift > 0.03 || c.restLift > 0.03;
    if (airborne !== this.airborne) {
      this.airborne = airborne;
      this.host?.setExpanded(airborne);
    }

    if (this.drag) {
      const d = this.drag;
      const { minX, maxX } = c.placement;
      c.loco.x = c.loco.targetX = clamp(d.x, minX, maxX);
      c.loco.speed = 0;
      c.lift = Math.max(0, d.h);
      const trail = d.history;
      const a = trail[0];
      const b = trail[trail.length - 1];
      const vx = a && b && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
      c.carry.vx += (vx - c.carry.vx) * (1 - Math.exp(-8 * dt));
      c.attention = null;
      return;
    }

    if (c.inChat) {
      // While chat is open, face forward toward the user
      this.attention.set(c.loco.x, c.placement.floorY + 1.2 * c.placement.scale, GAZE_DEPTH);
      c.attention = this.attention;
      return;
    }

    if (w && c.stateName !== 'drop') {
      this.attention.set(w.x, c.placement.floorY + w.h, GAZE_DEPTH);
      c.attention = this.attention;
    } else c.attention = null;
  }
}
