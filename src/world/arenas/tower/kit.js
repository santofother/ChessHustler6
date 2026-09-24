// Nocturno Tower helpers: static-geometry batching (one draw call per material), matrix shorthands,
// small canvas textures. Local to the tower arena (worker F).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Matrix from position / euler rotation / scale. */
export function M(x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, s = null, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  if (s != null) _s.set(s, s, s); else _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Shared unit primitives (templates, cloned into batches; disposed by disposeTemplates()). */
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 12),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  lowSphere: new THREE.SphereGeometry(0.5, 8, 6),
  torus: new THREE.TorusGeometry(0.5, 0.06, 6, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};

/**
 * Collects geometry per material and emits one merged mesh per material.
 * add(geo, mat, matrix) — geo is copied, so templates can be reused.
 */
export class Batch {
  constructor(name = 'batch') { this.name = name; this.parts = new Map(); }

  add(geo, mat, matrix = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {};
    g.clearGroups();
    if (matrix) g.applyMatrix4(matrix);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }

  /** Frame helper: returns adder bound to a parent matrix. */
  frame(parent) {
    const self = this;
    return {
      matrix: parent,
      add(geo, mat, local) { self.add(geo, mat, local ? parent.clone().multiply(local) : parent); return this; },
    };
  }

  build(parent, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [mat, list] of this.parts) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = this.name;
      mesh.castShadow = cast && !mat.transparent;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

/** Canvas texture (≤512 px) — owned by whoever uses it (disposed with its material). */
export function canvasTex(w, h, draw, { srgb = true, repeat = null, mips = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Soft round glow (for sprites / points). */
export function glowTex(size = 64, inner = 0.2) {
  return canvasTex(size, size, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(inner, 'rgba(255,255,255,0.7)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

/** Neon text on transparent background (steady glow; no flicker). */
export function neonTextTex(text, color, { w = 512, h = 128, font = 'Anton, Impact, "Arial Black", sans-serif', core = '#fff6dc', blur = 16, line = 7, fill = null } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    let fs = Math.round(h * 0.78);
    const setF = () => { g.font = `bold ${fs}px ${font}`; };
    setF();
    while (g.measureText(text).width > w * 0.94 && fs > 10) { fs -= 2; setF(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (fill) { g.fillStyle = fill; g.fillText(text, w / 2, h / 2 + 2); }
    g.shadowColor = color; g.shadowBlur = blur;
    g.lineWidth = line; g.strokeStyle = color; g.strokeText(text, w / 2, h / 2 + 2);
    g.shadowBlur = blur * 0.5; g.strokeText(text, w / 2, h / 2 + 2);
    g.shadowBlur = 3; g.lineWidth = Math.max(1.5, line * 0.35); g.strokeStyle = core; g.strokeText(text, w / 2, h / 2 + 2);
  }, { mips: true });
}

export const rand = (r, a, b) => a + r() * (b - a);
