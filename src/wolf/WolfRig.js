import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import wolfGlb from '../../assets/models/minecraft_wolf_baby.glb?inline';

export const WOLF_HEIGHT = 1.05;
export const HOVER = 0;
/** Where the head meets the body, in the GLB's GLTF_SceneRootNode space. Nudge these if the head turns around the wrong spot. */
const NECK_POS = [0, 1.0, 2.9];
/** Time in the GLB's clip where all four legs are straight down (the standing frame). */
const STAND_TIME = 0.25;

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
    modelWrapper: null,
    eyeMesh: null,
    eyeCenterY: 0,
    tail: null,
    ears: [],
    legs: {},
    neck: null,
    tracks: [], // clip tracks we sample ourselves (see Wolf.js)
    bases: new Map(), // node -> the quaternion the clip wants this frame (so extra motion never accumulates)
    duration: 1,
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
      if (o.name === 'Object_15') o.visible = false;
      if (o.name === 'Object_18') parts.eyeMesh = o;
      if (o.name === 'Box006005_4') parts.tail = o;
      if (o.name === 'Box006003_3') parts.ears[0] = o;
      if (o.name === 'Box006002_8') parts.ears[1] = o;
      if (o.name === 'Box006006_5') parts.legs.frontR = o;
      if (o.name === 'Box006004_9') parts.legs.frontL = o;
      if (o.name === 'Box006007_10') parts.legs.rearR = o;
      if (o.name === 'Box006008_11') parts.legs.rearL = o;
    });

    // Neck: the GLB's BabyHeadPivot sits at the rump, so rotating it would swing the head around the tail.
    // Wrap it in a pivot placed where the head meets the body (same world position, so nothing moves).
    const headPivot = gltf.scene.getObjectByName('BabyHeadPivot');
    if (headPivot) {
      const neck = new THREE.Group();
      neck.name = 'neckPivot';
      neck.position.set(...NECK_POS);
      headPivot.parent.add(neck);
      neck.add(headPivot);
      headPivot.position.sub(neck.position);
      parts.neck = neck;
    }

    // Eye mesh centre, so blinking squashes the eyes in place.
    if (parts.eyeMesh) {
      parts.eyeMesh.geometry.computeBoundingBox();
      parts.eyeCenterY = parts.eyeMesh.geometry.boundingBox.getCenter(new THREE.Vector3()).y;
    }

    // Rest orientation of every node we add motion on top of.
    for (const node of [parts.tail, ...Object.values(parts.legs)]) {
      if (node) parts.bases.set(node, node.quaternion.clone());
    }

    // The clip is sampled by hand (Wolf.js) instead of through an AnimationMixer, so we can blend it with a
    // standing pose by speed and add our own motion on top without the mixer overwriting or skipping it.
    const clip = gltf.animations?.[0];
    if (clip) {
      parts.duration = clip.duration || 1;
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf('.');
        const path = track.name.slice(dot + 1);
        const node = gltf.scene.getObjectByName(track.name.slice(0, dot));
        if (!node || (path !== 'position' && path !== 'quaternion')) continue;
        const interp = track.createInterpolant();
        const stand = Array.from(interp.evaluate(STAND_TIME));
        const rec = { node, path, interp, stand };
        if (path === 'quaternion') {
          rec.base = new THREE.Quaternion().fromArray(stand);
          parts.bases.set(node, rec.base);
        }
        parts.tracks.push(rec);
      }
      console.info(`[wolf] clip tracks bound: ${parts.tracks.length}/${clip.tracks.length}`);
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}