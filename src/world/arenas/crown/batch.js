// Crown Hills — static geometry batcher. Everything that never moves is baked into world space and merged into one
// mesh per material, which keeps the whole estate at a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Normalises a geometry so every batch entry has the same attribute layout (non-indexed position/normal/uv). */
function normalize(geo, keepColor) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) {
    if (k === 'position' || k === 'normal' || k === 'uv' || (keepColor && k === 'color')) continue;
    g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (keepColor && !g.attributes.color) {
    const c = new Float32Array(g.attributes.position.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export class Batch {
  constructor() {
    this.lists = new Map(); // key -> geometries
    this.extraMats = new Map(); // key -> material (for GLB materials without a mapping)
  }

  /** Transform matrix from pos / rot (euler, radians) / scale. */
  static mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(_p, _q, _s);
  }

  /** Adds a geometry (not consumed: it's cloned) under a material key with a world transform. */
  add(key, geo, matrix = null) {
    const g = normalize(geo, false);
    if (matrix) g.applyMatrix4(matrix);
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
    return this;
  }

  /** Convenience: geometry at x,y,z with yaw ry and optional scale. The source geometry is disposed. */
  put(key, geo, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
    this.add(key, geo, Batch.mat(x, y, z, rx, ry, rz, sx, sy, sz));
    geo.dispose();
    return this;
  }

  box(key, w, h, d, x, y, z, ry = 0) {
    return this.put(key, new THREE.BoxGeometry(w, h, d), x, y, z, ry);
  }

  /**
   * Adds every mesh of an Object3D (e.g. a GLB clone). matFor(material) → batch key (string) or null to use a
   * dedicated key for that material. `matrix` places the object in the world.
   */
  addObject(root, matrix, matFor = () => null) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      _m.multiplyMatrices(matrix, o.matrixWorld);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const groups = Array.isArray(o.material) && o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = mats[gr.materialIndex] || mats[0];
        let geo = o.geometry;
        if (groups.length > 1) geo = subGeometry(o.geometry, gr.start, gr.count);
        let key = matFor(mat, o);
        if (!key) {
          key = 'glb:' + mat.uuid;
          this.extraMats.set(key, mat);
        }
        const g = normalize(geo, false);
        g.applyMatrix4(_m);
        if (!this.lists.has(key)) this.lists.set(key, []);
        this.lists.get(key).push(g);
        if (geo !== o.geometry) geo.dispose();
      }
    });
    return this;
  }

  /**
   * Merges everything into meshes under `parent`. mats: key -> material. shadowKeys: Set of keys that cast shadows.
   * Returns { key: mesh }.
   */
  flush(parent, mats, { cast = new Set(), receive = true } = {}) {
    const out = {};
    for (const [key, list] of this.lists) {
      if (!list.length) continue;
      const mat = mats[key] || this.extraMats.get(key);
      if (!mat) { console.warn('[crown] no material for', key); list.forEach((g) => g.dispose()); continue; }
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) list.forEach((g) => g.dispose());
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'crown_' + key;
      mesh.castShadow = cast.has(key);
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out[key] = mesh;
    }
    this.lists.clear();
    return out;
  }
}

function subGeometry(geo, start, count) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const end = Math.min(src.attributes.position.count, start + count);
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) {
    const a = src.attributes[k];
    g.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, end * a.itemSize), a.itemSize));
  }
  if (src !== geo) src.dispose();
  return g;
}

/** Horizontal rectangle (y up) whose UVs follow world x/z divided by `tile` metres (continuous tiling). */
export function floorRect(x0, z0, x1, z1, y, tile = 3) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, -p.getZ(i) / tile);
  return g;
}

/** Vertical wall quad from (x0,z0) to (x1,z1), y0..y1. Its front faces (−dz, dx), e.g. west→east faces +Z. */
export function wallQuad(x0, z0, x1, z1, y0, y1, tile = 3) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / tile, uv.getY(i) * (y1 - y0) / tile);
  g.rotateY(Math.atan2(-(z1 - z0) / len, (x1 - x0) / len));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
