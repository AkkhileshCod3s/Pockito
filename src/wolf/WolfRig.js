import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import wolfGlb from '../../assets/models/minecraft_wolf_baby.glb?inline';

export const WOLF_HEIGHT = 1.05;
export const HOVER = 0;

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

export function buildWolfRig() {
  const root = pivot('wolf');
  const hips = pivot('hips', 0, 0, 0);
  const torso = pivot('torso');
  const head = pivot('head', 0, 0.75 * WOLF_HEIGHT, 0.25 * WOLF_HEIGHT);

  root.add(hips);
  hips.add(torso);
  torso.add(head);

  const joints = { hips, torso, head };
  const parts = {
    loaded: false,
    mixer: null,
    trotAction: null,
    modelWrapper: null,
    eyeMesh: null,
    tail: null,
    ears: [],
  };

  parts.ready = new GLTFLoader().loadAsync(wolfGlb).then((gltf) => {
    // Model dimensions at neutral standing pose (t = 0.25):
    // Height from feet bottom (-2.191) to ears top (0.646) = 2.837 units.
    // Z center is at +0.691 units.
    const unit = WOLF_HEIGHT / 2.837;

    const modelWrapper = new THREE.Group();
    modelWrapper.name = 'modelWrapper';
    modelWrapper.scale.setScalar(unit);
    // Align bottom of feet to y=0 and center Z at 0
    modelWrapper.position.set(0, 2.191 * unit, -0.691 * unit);
    modelWrapper.add(gltf.scene);
    torso.add(modelWrapper);

    parts.modelWrapper = modelWrapper;

    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = 0.95;
          o.material.metalness = 0;
        }
      }
      if (o.name === 'Object_18') parts.eyeMesh = o;
      if (o.name === 'Box006005_4') parts.tail = o;
      if (o.name === 'Box006003_3') parts.ears[0] = o;
      if (o.name === 'Box006002_8') parts.ears[1] = o;
    });

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(gltf.animations[0]);
      action.play();
      // Set to neutral standing pose initially (t = 0.25)
      mixer.setTime(0.25);
      parts.mixer = mixer;
      parts.trotAction = action;
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
