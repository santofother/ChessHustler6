// Sunset Strand — geometry batching helpers (keep draw calls low).
// Batch: bake many small flat-coloured parts into ONE merged mesh with vertex colours.
// instancify: turn a (GLB) template into InstancedMeshes (one per sub-mesh) with optional per-instance tint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _o = new THREE.Object3D();
const _c = new THREE.Color();

/** Matrix from position / euler rotation / scale (scale may be a number or [x,y,z]). */
export function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  _o.position.set(x, y, z);
  _o.rotation.set(rx, ry, rz, 'YXZ'); // yaw outermost: tilt is local to the yawed prop
  if (Array.isArray(s)) _o.scale.set(s[0], s[1], s[2]); else _o.scale.setScalar(s);
  _o.updateMatrix();
  return _o.matrix.clone();
}

// shared unit primitives (cloned + transformed into batches; never rendered themselves)
const UNIT = {};
export function unit(kind) {
  if (UNIT[kind]) return UNIT[kind];
  let g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); break;
    case 'cyl6': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 10); break;
    case 'cone8': g = new THREE.ConeGeometry(0.5, 1, 8, 1, true); break;
    case 'sphere': g = new THREE.SphereGeometry(0.5, 10, 8); break;
    case 'hemi': g = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); break;
    default: throw new Error('unit ' + kind);
  }
  UNIT[kind] = g;
  return g;
}

export class Batch {
  constructor({ uv = false } = {}) { this.parts = []; this.uv = uv; }

  /** Adds a geometry (cloned) transformed by matrix m, painted with colour (or per-vertex colour fn). */
  add(geo, m, color = '#ffffff') {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && !(this.uv && k === 'uv')) g.deleteAttribute(k);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (this.uv && !g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    if (typeof color === 'function') {
      // colour function receives LOCAL (pre-transform) coordinates
      const p = g.attributes.position;
      for (let i = 0; i < n; i++) { _c.set(color(p.getX(i), p.getY(i), p.getZ(i), i)); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    } else {
      _c.set(color);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (m) g.applyMatrix4(m);
    g.morphAttributes = {};
    this.parts.push(g);
    return this;
  }

  box(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) { return this.add(unit('box'), mtx(x, y, z, rx, ry, rz, [w, h, d]), color); }
  cyl(r, h, x, y, z, color, rx = 0, ry = 0, rz = 0, kind = 'cyl') { return this.add(unit(kind), mtx(x, y, z, rx, ry, rz, [r * 2, h, r * 2]), color); }
  /** Cylinder between two points a,b (THREE.Vector3 or arrays). */
  rod(a, b, r, color, kind = 'cyl6') {
    const A = Array.isArray(a) ? new THREE.Vector3(...a) : a, B = Array.isArray(b) ? new THREE.Vector3(...b) : b;
    const d = new THREE.Vector3().subVectors(B, A);
    const len = d.length();
    _o.position.copy(A).addScaledVector(d, 0.5);
    _o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    _o.scale.set(r * 2, len, r * 2);
    _o.updateMatrix();
    return this.add(unit(kind), _o.matrix.clone(), color);
  }

  get empty() { return this.parts.length === 0; }

  /** Merges everything into one mesh (parts are disposed). */
  build(material, { shadow = true, receive = true, name = 'batch' } = {}) {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    this.parts.forEach((g) => g.dispose());
    this.parts = [];
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadow; mesh.receiveShadow = receive; mesh.name = name;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return mesh;
  }
}

/**
 * Converts a template (a GLB clone or procedural group) into InstancedMeshes — one per sub-mesh — placed at
 * `mats` (array of Matrix4). `colors` (optional): { materialPrefix: [colour per instance] } — those materials are
 * cloned with a white base colour and tinted per instance through instanceColor.
 * Returns { group, meshes } (group holds the InstancedMeshes).
 */
export function instancify(template, mats, { colors = null, shadow = true, receive = true } = {}) {
  const group = new THREE.Group();
  const meshes = [];
  template.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(template.matrixWorld).invert();
  template.traverse((o) => {
    if (!o.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const geo = o.geometry.clone();
    geo.applyMatrix4(local);
    geo.userData = {};
    // materials are cloned (owned by the arena); textures stay shared with the source
    let mat = Array.isArray(o.material) ? o.material[0] : o.material;
    let tintList = null;
    mat = mat.clone(); mat.userData = { ...mat.userData, shared: false };
    for (const k in mat) if (mat[k] && mat[k].isTexture) mat[k].userData.shared = true;
    if (colors && mat.name) {
      const key = Object.keys(colors).find((k) => mat.name.startsWith(k));
      if (key) { mat.color = new THREE.Color(1, 1, 1); tintList = colors[key]; }
    }
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    if (tintList) mats.forEach((_, i) => im.setColorAt(i, _c.set(tintList[i % tintList.length])));
    im.castShadow = shadow; im.receiveShadow = receive;
    im.computeBoundingSphere();
    group.add(im);
    meshes.push(im);
  });
  return { group, meshes };
}
