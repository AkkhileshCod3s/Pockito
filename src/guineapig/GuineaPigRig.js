import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import guineaPigGlb from '../../assets/models/guinea_pig.glb?inline';
import { GuineaPigFace } from './GuineaPigFace.js';

export const GUINEAPIG_HEIGHT = 0.95;
export const HOVER = 0;
const BODY_HEIGHT = 0.68;

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

export function buildGuineaPigRig() {
  const root = pivot('guineapig');
  const unit = BODY_HEIGHT / 5.85;
  const legLength = 0.5 * unit; // short chubby paws

  const hips = pivot('hips', 0, 0, 0);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);
  torso.add(head);
  head.position.set(0, 0.45, 0.45);

  const joints = { hips, torso, head };
  const parts = {
    loaded: false,
    face: null,
    mixer: null,
    earShakeAction: null,
    guineaPigNode: null,
    feet: [],
    ears: [],
    snout: null,
    unit,
  };

  parts.ready = new GLTFLoader().loadAsync(guineaPigGlb).then((gltf) => {
    const model = new THREE.Group();
    model.name = 'model';
    // Snout points +X, Up +Y -> rotate Y by -PI/2 to align +X with world +Z (facing camera)
    model.rotation.y = -Math.PI / 2;
    model.scale.setScalar(unit);
    // Center along length (X is 2.0 center)
    model.position.z = -2.0 * unit;
    model.add(gltf.scene);
    torso.add(model);

    const faceNodes = {};
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = 0.9;
          o.material.metalness = 0.05;
        }
      }
      if (o.name === 'GuineaPig') {
        parts.guineaPigNode = o;
        faceNodes.guineaPig = o;
      }
      if (o.name === 'Foot0') parts.feet[0] = o;
      if (o.name === 'Foot1') parts.feet[1] = o;
      if (o.name === 'Foot2') parts.feet[2] = o;
      if (o.name === 'Foot3') parts.feet[3] = o;
      if (o.name === 'EarLPivot') parts.ears[0] = o;
      if (o.name === 'EarRPivot') parts.ears[1] = o;
      if (o.name === 'Snout') {
        parts.snout = o;
        faceNodes.snout = o;
      }
      if (o.name === 'EyeL') faceNodes.eyeL = o;
      if (o.name === 'EyeR') faceNodes.eyeR = o;
      if (o.name === 'SparkleL') faceNodes.sparkleL = o;
      if (o.name === 'SparkleR') faceNodes.sparkleR = o;
      if (o.name === 'Sparkle2L') faceNodes.sparkle2L = o;
      if (o.name === 'Sparkle2R') faceNodes.sparkle2R = o;
    });

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const clip = gltf.animations.find((a) => a.name === 'EarShake') || gltf.animations[0];
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = false;
      parts.mixer = mixer;
      parts.earShakeAction = action;
    }

    if (faceNodes.guineaPig) {
      parts.face = new GuineaPigFace(faceNodes);
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
