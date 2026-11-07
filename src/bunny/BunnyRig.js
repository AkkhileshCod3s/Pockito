import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import bunnyGlb from '../../assets/models/white_bunny.glb?inline';

export const BUNNY_HEIGHT = 0.95;
export const HOVER = 0;

// The model is about 0.62 units tall (feet to ear tips) and faces +Z, which is already "toward the camera".
const MODEL_HEIGHT = 0.62;
const FUR = 0xf6f3f0; // fur colour around the painted eyes (sampled from the texture)

// The eyes are painted on the head texture, so there is no eye mesh to squash. Instead, two fur-coloured
// "eyelids" sit on top of the painted eyes and slide down to close them. Measured from the 64x64 atlas:
// each eye is 3 texels wide and 4 tall; one texel on the head's front face = 0.015625 model units.
const TEXEL = 0.015625;
const FACE_Z = 0.09375 + 0.0008; // just in front of the head's front face
const EYE_TOP_Y = 0.09375;
const EYE_W = 3 * TEXEL;
const EYE_H = 4 * TEXEL;
const EYE_LEFT_X = -0.078125; // left edge of the eye on the -X side
const EYE_RIGHT_X = 0.078125 - EYE_W; // left edge of the eye on the +X side

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

function makeLid(x) {
  const geom = new THREE.PlaneGeometry(EYE_W, EYE_H);
  geom.translate(EYE_W / 2, -EYE_H / 2, 0); // origin at the top-left corner, so scale.y closes it downwards
  const mat = new THREE.MeshStandardMaterial({
    color: FUR,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const lid = new THREE.Mesh(geom, mat);
  lid.position.set(x, EYE_TOP_Y, FACE_Z);
  lid.visible = false;

  // A thin darker line along the lid's lower edge so a closed eye reads as a closed eye.
  const lineGeom = new THREE.PlaneGeometry(EYE_W, TEXEL * 0.35);
  lineGeom.translate(EYE_W / 2, 0, 0);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x8f7f7c,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const line = new THREE.Mesh(lineGeom, lineMat);
  line.position.set(x, EYE_TOP_Y, FACE_Z + 0.0004);
  line.visible = false;
  return { lid, line };
}

export function buildBunnyRig() {
  const root = pivot('bunny');
  const unit = BUNNY_HEIGHT / MODEL_HEIGHT;

  const hips = pivot('hips', 0, 0, 0);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);
  torso.add(head);
  head.position.set(0, 0.38 * unit, 0.06 * unit); // roughly where the head sits, for gaze and emote anchors

  const joints = { hips, torso, head };
  const parts = {
    loaded: false,
    mixer: null,
    idleAction: null,
    eyeLids: [], // [{ lid, line }, { lid, line }]
    ears: [],
    arms: [],
    haunches: [],
    feet: [],
    base: new Map(), // node -> resting position, so procedural offsets never accumulate
    unit,
  };

  parts.ready = new GLTFLoader().loadAsync(bunnyGlb).then((gltf) => {
    const model = new THREE.Group();
    model.name = 'model';
    model.scale.setScalar(unit);
    model.position.z = 0.01 * unit; // centre the body front to back
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
      if (o.name === 'Ear_L') parts.ears[0] = o;
      if (o.name === 'Ear_R') parts.ears[1] = o;
      if (o.name === 'Arm_L') parts.arms[0] = o;
      if (o.name === 'Arm_R') parts.arms[1] = o;
      if (o.name === 'Haunch_L') parts.haunches[0] = o;
      if (o.name === 'Haunch_R') parts.haunches[1] = o;
      if (o.name === 'Foot_L') parts.feet[0] = o;
      if (o.name === 'Foot_R') parts.feet[1] = o;
    });
    for (const n of [...parts.haunches, ...parts.feet]) if (n) parts.base.set(n, n.position.clone());

    // Eyelids over the painted eyes (children of the Head node, so they move with the head).
    const headNode = gltf.scene.getObjectByName('Head');
    if (headNode) {
      for (const x of [EYE_LEFT_X, EYE_RIGHT_X]) {
        const eye = makeLid(x);
        headNode.add(eye.lid, eye.line);
        parts.eyeLids.push(eye);
      }
    }

    const clip = gltf.animations?.find((a) => a.name === 'Idle') ?? gltf.animations?.[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      parts.mixer = mixer;
      parts.idleAction = action;
    }

    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
