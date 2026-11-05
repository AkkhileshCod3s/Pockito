const BASE = {
  eyeOpen: [1, 1], eyeScale: [1, 1], happy: 0, squeeze: 0, heart: 0, brow: 0,
  mouthCurve: 0.45, mouthOpen: 0, mouthWidth: 0.08, mouthTilt: 0, mouthAlpha: 1, cat: 0,
  blush: 0, tears: 0, sweat: 0, tongue: 0, wide: 0, dizzy: 0,
};

const PRESETS = {
  neutral: {},
  happy: { eyeScale: [1.05, 1.05], happy: 1, mouthCurve: 1, mouthOpen: 0.45, mouthWidth: 0.12, blush: 0.8 },
  sad: { eyeOpen: [0.8, 0.8], eyeScale: [0.95, 0.95], brow: -0.85, mouthCurve: -0.9 },
  sleepy: { eyeOpen: [0.28, 0.28], brow: -0.15, mouthCurve: 0.1, mouthWidth: 0.05 },
  asleep: { eyeOpen: [0, 0], mouthCurve: 0.2, mouthOpen: 0.12, mouthWidth: 0.04 },
  curious: { eyeOpen: [1, 0.72], eyeScale: [1.15, 0.92], brow: 0.15, mouthCurve: 0, mouthOpen: 0.18, mouthWidth: 0.045 },
  surprised: { eyeScale: [1.32, 1.32], mouthCurve: 0, mouthOpen: 1, mouthWidth: 0.07, wide: 1 },
  excited: { eyeScale: [1.2, 1.2], brow: -0.1, mouthCurve: 1, mouthOpen: 0.85, mouthWidth: 0.13, blush: 0.7, tongue: 0.8 },
  angry: { eyeOpen: [0.85, 0.85], brow: 0.9, mouthCurve: -0.45, mouthWidth: 0.09 },

  joy: { squeeze: 1, mouthCurve: 1, mouthOpen: 0.7, mouthWidth: 0.12, blush: 0.9, tongue: 0.9 },
  love: { heart: 1, eyeScale: [1.15, 1.15], mouthCurve: 1, mouthOpen: 0.35, mouthWidth: 0.1, blush: 1 },
  uwu: { happy: 1, cat: 1, blush: 0.95, mouthCurve: 1, tongue: 0.7 },
  crying: { eyeOpen: [0.14, 0.14], brow: -0.8, mouthCurve: -0.8, mouthOpen: 0.25, mouthWidth: 0.07, tears: 1 },
  smug: { eyeOpen: [0.42, 0.42], brow: 0.2, mouthCurve: 0.7, mouthWidth: 0.07, mouthTilt: 0.8, blush: 0.25 },
  deadpan: { eyeOpen: [0.1, 0.1], mouthCurve: 0, mouthWidth: 0.07 },
  annoyed: { eyeOpen: [0.45, 0.45], brow: 0.45, mouthCurve: -0.25, mouthWidth: 0.06, sweat: 1 },
  nervous: { happy: 1, mouthCurve: 0.25, mouthWidth: 0.09, mouthTilt: -0.4, sweat: 1 },
  pouty: { eyeOpen: [0.85, 0.85], brow: 0.65, mouthCurve: -0.35, mouthWidth: 0.04, blush: 0.8 },
  dizzy: { eyeOpen: [0.65, 0.65], eyeScale: [0.95, 0.95], brow: -0.2, mouthCurve: -0.2, mouthOpen: 0.4, sweat: 1, dizzy: 1 },
  sparkle: { eyeScale: [1.3, 1.3], heart: 1, happy: 1, mouthOpen: 0.6, mouthCurve: 1, blush: 1, wide: 1 },
};

export const EXPRESSIONS = Object.fromEntries(Object.entries(PRESETS).map(([name, p]) => [name, { ...BASE, ...p }]));

export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS);

export const FACE_KEYS = Object.keys(BASE).filter((k) => !Array.isArray(BASE[k]));

export function cloneExpression(name) {
  const e = EXPRESSIONS[name] ?? EXPRESSIONS.neutral;
  return { ...e, eyeOpen: [...e.eyeOpen], eyeScale: [...e.eyeScale] };
}
