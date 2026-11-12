import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import wraithGlb from '../../assets/models/wraith_glowing_eyes.glb?inline';

export const WRAITH_HEIGHT = 1.3;
export const HOVER = 0.5;

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

export function buildWraithRig() {
  const root = pivot('wraith');
  const hips = pivot('hips', 0, HOVER, 0);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);
  torso.add(head);
  head.position.set(0, 0.55, 0.05); // roughly where the glowing eyes sit, for gaze/emote anchors

  const joints = { hips, torso, head };
  const parts = {
    loaded: false,
    mixer: null,
    floatAction: null,
    eyes: [], // [{ core, glow }]
    base: new Map(), // mesh -> resting scale/opacity, so eye closing never accumulates
  };

  parts.ready = new GLTFLoader().loadAsync(wraithGlb).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    // Fit by whichever of height/width is tighter, so the cloak never overflows sideways.
    const unit = Math.min(WRAITH_HEIGHT / size.y, (WRAITH_HEIGHT * 0.8) / Math.max(size.x, size.z));

    const model = new THREE.Group();
    model.name = 'model';
    model.scale.setScalar(unit);
    model.position.y = -box.min.y * unit; // cloak hem rests on the floor plane
    model.add(gltf.scene);
    torso.add(model);

    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false; // keeps the dark cloak from catching its own shadow and going muddy
      }
    });

    // Eyes: 'EyeL'/'EyeR' nodes ARE the white core mesh, each with a child 'EyeLGlow'/'EyeRGlow' mesh.
    // Neither is touched by the baked clip, so code can drive their scale/opacity directly, every frame.
    for (const side of ['L', 'R']) {
      const core = gltf.scene.getObjectByName('Eye' + side);
      const glow = gltf.scene.getObjectByName('Eye' + side + 'Glow');
      if (core) parts.base.set(core, core.scale.clone());
      if (glow) parts.base.set(glow, { scale: glow.scale.clone(), opacity: glow.material.opacity });
      if (core || glow) parts.eyes.push({ core, glow });
    }

    // The GLB's own "Float" clip owns the bob plus all the tatter/sleeve/finger sway. Code only ever
    // changes its playback speed (see Wraith.js) — never adds extra rotations on the nodes it drives.
    const clip = gltf.animations?.find((a) => a.name === 'Float') ?? gltf.animations?.[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      parts.mixer = mixer;
      parts.floatAction = action;
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}