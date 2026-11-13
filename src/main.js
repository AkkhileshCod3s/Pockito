window.addEventListener('error', (e) => console.error('[fatal]', e.error?.stack || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[fatal]', e.reason?.stack || e.reason));

import { Stage } from './core/Stage.js';
import { Loop } from './core/Loop.js';
import { ScreenSpace } from './core/ScreenSpace.js';
import { connectSettings } from './core/Settings.js';
import { MOBS, createMob, disposeMob } from './mobs/index.js';
import { Character } from './character/Character.js';
import { ACTIONS } from './character/states.js';
import { PointerDirector } from './interaction/PointerDirector.js';
import { MobMenu } from './interaction/MobMenu.js';
import { Bubble } from './ai/Bubble.js';
import { ChatPanel } from './ai/ChatPanel.js';

const host = window.mobHost ?? null;
const { settings, save } = await connectSettings();

const stage = new Stage(document.getElementById('app'));
const screen = new ScreenSpace(stage);

let mobName = MOBS[settings.mob] ? settings.mob : 'bluefish';
const character = new Character({ mob: createMob(mobName), scene: stage.scene, settings });
stage.scene.add(character.mob.root);

const bubble = new Bubble({ stage, character });
const chatPanel = new ChatPanel({ stage, character, screen, host, settings });
const menu = new MobMenu({ settings, save, onChat: () => chatPanel.open() });
const director = new PointerDirector({ character, screen, host, canvas: stage.renderer.domElement, menu, chatPanel });

// Greet the user shortly after the pet wakes up, every time the app opens — whichever pet is active.
const GREETINGS = [
  (name) => `Hi! Welcome back👋`,
  (name) => `Hey,! Good to see you again.`,
  (name) => `I missed you! Welcome back 🐾`,
  (name) => `${name} is happy you're here!`,
];
setTimeout(() => {
  const name = settings.petNames?.[mobName] || 'buddy';
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)](name);
  bubble.say(greeting);
}, 1800);

/** Swap the pet's body in place; the character keeps its position, mood and state. */
function applyMob(name) {
  if (!MOBS[name] || name === mobName) return;
  const previous = character.mob;
  const next = createMob(name);
  stage.scene.remove(previous.root);
  disposeMob(previous);
  stage.scene.add(next.root);
  character.setMob(next);
  mobName = name;
  character.trigger('idle', {}, true);
}

function updatePlacement() {
  const scale = screen.scaleForPixels(settings.petSize);
  const [minX, maxX] = screen.movementRange(scale);
  const floorY = screen.floorY(scale);
  const screenH = Math.max(window.screen.availHeight || 0, stage.height);
  const maxLift = Math.max(0, (screenH - 24) / screen.pixelsPerUnit - character.mob.height * scale);
  character.setPlacement({ scale, floorY, minX, maxX, maxLift, halfWidth: screen.halfWidth, halfHeight: screen.halfHeight });
  stage.setFocus(character.loco.x, floorY, scale);
  stage.setShadowStrength(1 - character.lift / (1.2 * scale));
}

const loop = new Loop((dt, t) => {
  if (settings.mob !== mobName) applyMob(settings.mob);
  updatePlacement();
  director.update(dt);
  character.update(dt, t);
  chatPanel.update();
  bubble.update();
  stage.render();
});
loop.start();

character.fsm.listeners.add((name) => host?.reportState(name));

host?.onCommand((cmd) => {
  if (!cmd) return;
  if (cmd.type === 'chat') {
    chatPanel.open(cmd.options || {});
  } else if (cmd.type === 'trigger' && cmd.name === 'wake' && cmd.surprised) {
    character.trigger('surprised', { then: 'wake' }, true);
  } else if (cmd.type === 'trigger' && cmd.name === 'wake') {
    character.trigger('wake', {}, true);
  } else if (cmd.type === 'trigger' && ACTIONS.includes(cmd.name)) {
    character.trigger(cmd.name, { then: 'idle' }, true);
  }
});

host?.onOpenChat((options) => {
  chatPanel.open(options);
});

// Browser fallback (npx vite): number keys trigger moods.
if (!host) {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    if (/^[0-9]$/.test(key) && ACTIONS[Number(key)]) character.trigger(ACTIONS[Number(key)], { then: 'idle' }, true);
  });
}

window.mob = { stage, character, director, menu, settings, screen, loop, bubble, chatPanel, get pet() { return character.mob; } };
