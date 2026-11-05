import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import bluefishGlb from '../../assets/models/bluefish.glb?inline';
import { BlueFishFace } from './BlueFishFace.js';

export const BLUEFISH_HEIGHT = 1.15;
export const HOVER = 0.34;
const BODY_HEIGHT = 0.62;

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
  head.position.set(0, 0, 0.4);

  const joints = { hips, torso, head };
  const parts = {
    loaded: false,
    face: null,
    mixer: null,
    action: null,
    finL: null,
    finR: null,
    tail: null,
    headBone: null,
    headMesh: null,
  };

  parts.ready = new GLTFLoader().loadAsync(bluefishGlb).then((gltf) => {
    // Keep glTF node hierarchy intact under a model group
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const unit = BODY_HEIGHT / size.y;

    const model = new THREE.Group();
    model.name = 'model';
    // Bluefish model naturally has head at +z (facing camera)
    model.scale.setScalar(unit);
    // Center fish vertically and longitudinally
    model.position.y = -(box.min.y + box.max.y) * 0.5 * unit;
    model.position.z = -(box.min.z + box.max.z) * 0.5 * unit;
    model.add(gltf.scene);
    torso.add(model);

    let headMat = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = 1;
          o.material.metalness = 0;
          if (!headMat) headMat = o.material;
        }
      }
      if (o.name === 'cube_12') parts.finL = o;
      if (o.name === 'cube_14') parts.finR = o;
      if (o.name === 'bone4_9') parts.tail = o;
      if (o.name === 'bone5_18') parts.headBone = o;
      if (o.name === 'Object_26') {
        parts.headMesh = o;
        if (o.material) headMat = o.material;
      }
    });

    // Built-in animation clip
    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(gltf.animations[0]);
      action.play();
      parts.mixer = mixer;
      parts.action = action;
    }

    if (headMat) {
      parts.face = new BlueFishFace(headMat);
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
