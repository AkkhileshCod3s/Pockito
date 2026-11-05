import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import wolfGlb from '../../assets/models/wolf.glb?inline';
import { WolfFace } from './WolfFace.js';

export const WOLF_HEIGHT = 1.15;
export const HOVER = 0;
const BODY_HEIGHT = 1.05;

const _zero = new THREE.Vector3();

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

function hinge(parent, name, mesh, point, origin = _zero) {
  const p = pivot(name, point.x - origin.x, point.y - origin.y, point.z - origin.z);
  parent.add(p);
  p.add(mesh);
  mesh.position.set(-point.x, -point.y, -point.z);
  return p;
}

/**
 * Splits the single merged wolf mesh into 11 separate BufferGeometries.
 */
function splitWolfGeometry(geom) {
  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  const uv = geom.attributes.uv;
  const index = geom.index;
  const numTris = index.count / 3;

  function vKey(i) {
    const x = Math.round(pos.getX(i) * 100) / 100;
    const y = Math.round(pos.getY(i) * 100) / 100;
    const z = Math.round(pos.getZ(i) * 100) / 100;
    return `${x},${y},${z}`;
  }

  const parent = Array.from({ length: numTris }, (_, i) => i);
  function find(i) {
    if (parent[i] === i) return i;
    return (parent[i] = find(parent[i]));
  }
  function union(i, j) {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  const vertToTris = new Map();
  for (let t = 0; t < numTris; t++) {
    for (let c = 0; c < 3; c++) {
      const vi = index.getX(t * 3 + c);
      const k = vKey(vi);
      if (!vertToTris.has(k)) vertToTris.set(k, []);
      vertToTris.get(k).push(t);
    }
  }
  for (const tris of vertToTris.values()) {
    for (let i = 1; i < tris.length; i++) union(tris[0], tris[i]);
  }

  const compGroups = new Map();
  for (let t = 0; t < numTris; t++) {
    const r = find(t);
    if (!compGroups.has(r)) compGroups.set(r, []);
    compGroups.get(r).push(t);
  }

  const pieces = {};
  for (const tris of compGroups.values()) {
    const box = new THREE.Box3();
    for (const t of tris) {
      for (let c = 0; c < 3; c++) {
        const vi = index.getX(t * 3 + c);
        box.expandByPoint(new THREE.Vector3(pos.getX(vi), pos.getY(vi), pos.getZ(vi)));
      }
    }

    if (tris.length === 34) {
      // Body + rear legs fused
      const bodyTris = [];
      const rearLTris = [];
      const rearRTris = [];
      for (const t of tris) {
        let hasNegZ = false, avgX = 0;
        for (let c = 0; c < 3; c++) {
          const vi = index.getX(t * 3 + c);
          if (pos.getZ(vi) < -0.01) hasNegZ = true;
          avgX += pos.getX(vi);
        }
        avgX /= 3;
        if (!hasNegZ) bodyTris.push(t);
        else if (avgX < 0) rearLTris.push(t);
        else rearRTris.push(t);
      }
      pieces.body = bodyTris;
      pieces.legRearLeft = rearLTris;
      pieces.legRearRight = rearRTris;
    } else if (box.min.y < -13.6) {
      pieces.snout = tris;
    } else if (box.min.z > 5.5) {
      if (box.min.x < 0) pieces.earLeft = tris;
      else pieces.earRight = tris;
    } else if (box.min.y < -11.0) {
      pieces.head = tris;
    } else if (box.min.y < -5.0 && box.min.z < -2.0) {
      if (box.min.x < 0) pieces.legFrontLeft = tris;
      else pieces.legFrontRight = tris;
    } else if (box.min.y < -4.6) {
      pieces.mane = tris;
    } else if (box.min.y > 2.0) {
      pieces.tail = tris;
    }
  }

  const geometries = {};
  for (const [name, tris] of Object.entries(pieces)) {
    const newPos = [];
    const newNorm = [];
    const newUv = [];
    const newIdx = [];
    const vmap = new Map();

    for (const t of tris) {
      for (let c = 0; c < 3; c++) {
        const vi = index.getX(t * 3 + c);
        if (!vmap.has(vi)) {
          vmap.set(vi, newPos.length / 3);
          newPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
          if (normal) newNorm.push(normal.getX(vi), normal.getY(vi), normal.getZ(vi));
          if (uv) newUv.push(uv.getX(vi), uv.getY(vi));
        }
        newIdx.push(vmap.get(vi));
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
    if (newNorm.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
    if (newUv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
    g.setIndex(newIdx);
    g.computeBoundingBox();
    geometries[name] = g;
  }

  return geometries;
}

export function buildWolfRig() {
  const root = pivot('wolf');
  const unit = BODY_HEIGHT / 16.0;
  const legLength = 8.0 * unit;

  const hips = pivot('hips', 0, legLength, 0);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);

  const joints = { hips, torso, head };
  const parts = {
    legs: [],
    ears: [],
    tail: null,
    legLength,
    loaded: false,
    face: null,
  };

  parts.ready = new GLTFLoader().loadAsync(wolfGlb).then((gltf) => {
    let origMesh = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !origMesh) origMesh = o;
    });

    const material = origMesh.material;
    material.roughness = 1;
    material.metalness = 0;

    const geoms = splitWolfGeometry(origMesh.geometry);
    const meshes = {};
    for (const [name, g] of Object.entries(geoms)) {
      const m = new THREE.Mesh(g, material);
      m.name = name;
      m.castShadow = true;
      m.receiveShadow = true;
      meshes[name] = m;
    }

    // Model group: Z-up, -Y forward -> rotate X by -PI/2 to make +Y up and +Z forward (facing camera)
    const model = new THREE.Group();
    model.name = 'model';
    model.rotation.x = -Math.PI / 2;
    model.scale.setScalar(unit);
    torso.add(model);

    // Body and mane stay attached to model
    model.add(meshes.body, meshes.mane);

    // Head group: neck pivot at (0, -9.5, 3.0)
    const neck = new THREE.Vector3(0, -9.5, 3.0);
    const headPivot = hinge(model, 'head', meshes.head, neck);
    joints.head = headPivot;

    // Snout inside head pivot
    meshes.snout.position.set(-neck.x, -neck.y, -neck.z);
    headPivot.add(meshes.snout);

    // Ears inside head pivot
    const earL = hinge(headPivot, 'ear_left', meshes.earLeft, new THREE.Vector3(-2, -11.0, 6.0), neck);
    const earR = hinge(headPivot, 'ear_right', meshes.earRight, new THREE.Vector3(2, -11.0, 6.0), neck);
    parts.ears = [earL, earR];

    // Tail pivot at base of tail (0, 3.0, 3.0)
    parts.tail = hinge(model, 'tail', meshes.tail, new THREE.Vector3(0, 3.0, 3.0));

    // 4 Legs: [frontLeft, frontRight, rearLeft, rearRight]
    // All swing from hip plane z = 0
    const legFL = hinge(model, 'leg_fl', meshes.legFrontLeft, new THREE.Vector3(-2, -9.5, 0));
    const legFR = hinge(model, 'leg_fr', meshes.legFrontRight, new THREE.Vector3(2, -9.5, 0));
    const legRL = hinge(model, 'leg_rl', meshes.legRearLeft, new THREE.Vector3(-2, 3.5, 0));
    const legRR = hinge(model, 'leg_rr', meshes.legRearRight, new THREE.Vector3(2, 3.5, 0));
    parts.legs = [legFL, legFR, legRL, legRR];

    parts.face = new WolfFace(material);
    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
