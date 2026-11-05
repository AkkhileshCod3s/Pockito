import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fishGlb from '../../assets/models/fish_swimming.glb?inline';
import { BlueFishFace } from './BlueFishFace.js';

export const BLUEFISH_HEIGHT = 1.25;
export const HOVER = 0.38;
const BODY_HEIGHT = 0.72;

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

export function buildBlueFishRig() {
  const root = pivot('bluefish');
  const hips = pivot('hips', 0, HOVER, 0);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);
  torso.add(head);
  head.position.set(0, 0, 0.45);

  const joints = { hips, torso, head };
  const parts = {
    loaded: false,
    face: null,
    mixer: null,
    action: null,
    bodyPivot: null,
    tailPivot: null,
    tailTipPivot: null,
    pelvicL: null,
    pelvicR: null,
    dorsal: null,
  };

  parts.ready = new GLTFLoader().loadAsync(fishGlb).then((gltf) => {
    // Fish model has length along X (-8 to +5), height along Y (0 to 8), width along Z (-2.6 to 2.6).
    // Rotating around Y by -PI/2 aligns +X with world +Z (facing camera).
    const unit = BODY_HEIGHT / 8.0;

    const model = new THREE.Group();
    model.name = 'model';
    model.rotation.y = -Math.PI / 2;
    model.scale.setScalar(unit);
    // Center model at origin
    model.position.y = -4.0 * unit;
    model.position.z = 1.5 * unit;
    model.add(gltf.scene);
    torso.add(model);

    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = 0.85;
          o.material.metalness = 0.1;
        }
      }
      if (o.name === 'BodyPivot') parts.bodyPivot = o;
      if (o.name === 'TailPivot') parts.tailPivot = o;
      if (o.name === 'TailTipPivot') parts.tailTipPivot = o;
      if (o.name === 'PelvicLPivot') parts.pelvicL = o;
      if (o.name === 'PelvicRPivot') parts.pelvicR = o;
      if (o.name === 'DorsalPivot') parts.dorsal = o;
    });

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(gltf.animations[0]);
      action.play();
      parts.mixer = mixer;
      parts.action = action;
    }

    if (parts.bodyPivot) {
      parts.face = new BlueFishFace(parts.bodyPivot);
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
