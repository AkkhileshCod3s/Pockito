import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import ducklingGlb from '../../assets/models/baby_duckling.glb?inline';

export const DUCKLING_HEIGHT = 0.7;
export const HOVER = 0;

// The model is about 0.33 units tall and faces +Z, which is already "toward the camera".
const MODEL_HEIGHT = 0.33;

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

export function buildDucklingRig() {
  const root = pivot('duckling');
  const unit = DUCKLING_HEIGHT / MODEL_HEIGHT;

  const hips = pivot('hips', 0, 0, 0);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);
  torso.add(head);
  head.position.set(0, 0.27 * unit, 0.1 * unit); // roughly where the head sits, for gaze and emote anchors

  const joints = { hips, torso, head };
  const parts = {
    loaded: false,
    mixer: null,
    waddleAction: null,
    duration: 1.2,
    eyes: [], // Eye_L, Eye_R
    wings: [], // Wing_L, Wing_R
    unit,
  };

  parts.ready = new GLTFLoader().loadAsync(ducklingGlb).then((gltf) => {
    const model = new THREE.Group();
    model.name = 'model';
    model.scale.setScalar(unit);
    model.position.z = -0.017 * unit; // centre the body front to back
    model.add(gltf.scene);
    torso.add(model);

    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = 1;
          o.material.metalness = 0;
        }
      }
      if (o.name === 'Eye_L') parts.eyes[0] = o;
      if (o.name === 'Eye_R') parts.eyes[1] = o;
      if (o.name === 'Wing_L') parts.wings[0] = o;
      if (o.name === 'Wing_R') parts.wings[1] = o;
    });

    const clip = gltf.animations?.find((a) => a.name === 'Waddle') ?? gltf.animations?.[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.setEffectiveWeight(0); // starts at rest; Duckling.js blends the waddle in while it moves
      parts.mixer = mixer;
      parts.waddleAction = action;
      parts.duration = clip.duration || 1.2;
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
