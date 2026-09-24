// Tiny static-geometry batcher: collect transformed primitives per material, merge into one mesh each.
// Keeps procedural set dressing to a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function clean(g) {
  let out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  if (!out.attributes.uv) {
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  out.morphAttributes = {};
  return out;
}

export class Batcher {
  constructor() { this.buckets = new Map(); }

  /** Add geometry with transform. pos [x,y,z], rot [x,y,z] euler or number (yaw), scale number|[x,y,z]. */
  add(material, geometry, pos = [0, 0, 0], rot = 0, scale = 1) {
    if (typeof rot === 'number') _e.set(0, rot, 0); else _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _p.set(pos[0], pos[1], pos[2]);
    if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
    _m.compose(_p, _q, _s);
    return this.addMatrix(material, geometry, _m);
  }

  addMatrix(material, geometry, matrix) {
    const g = clean(geometry);
    g.applyMatrix4(matrix);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
    return this;
  }

  /** Axis-aligned-ish box helper: size [w,h,d], position of its BOTTOM centre. */
  box(material, size, pos, rot = 0) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.translate(0, size[1] / 2, 0);
    this.add(material, g, pos, rot);
    g.dispose();
    return this;
  }

  cyl(material, rTop, rBot, h, pos, rot = 0, seg = 10) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    this.add(material, g, pos, rot);
    g.dispose();
    return this;
  }

  /** Box beam from point a to point b (thickness w × h). */
  beam(material, a, b, w = 0.3, h = w) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.BoxGeometry(w, h, len);
    const m = new THREE.Matrix4().lookAt(A, B, Math.abs(B.x - A.x) + Math.abs(B.z - A.z) < 1e-4 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    m.setPosition(A.clone().add(B).multiplyScalar(0.5));
    this.addMatrix(material, g, m);
    g.dispose();
    return this;
  }

  /** Merge everything into meshes under parent. Returns list of meshes. */
  flush(parent, { castShadow = true, receiveShadow = true, name = 'batch' } = {}) {
    const out = [];
    for (const [mat, list] of this.buckets) {
      if (!list.length) continue;
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = name;
      mesh.castShadow = castShadow && !mat.transparent && !mat.userData.noShadow;
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

/** Material cache keyed by a string so a whole arena shares a few materials. */
export class Mats {
  constructor() { this.map = new Map(); }
  std(key, opts) {
    if (!this.map.has(key)) this.map.set(key, new THREE.MeshStandardMaterial(opts));
    return this.map.get(key);
  }
  basic(key, opts) {
    if (!this.map.has(key)) this.map.set(key, new THREE.MeshBasicMaterial(opts));
    return this.map.get(key);
  }
  /** Glowing unlit colour (HDR multiplier for bloom). */
  glow(key, color, mult = 3, extra = {}) {
    if (!this.map.has(key)) {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(mult), ...extra });
      m.userData.noShadow = true;
      this.map.set(key, m);
    }
    return this.map.get(key);
  }
}
