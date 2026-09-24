// Neon Mile helpers: bake any Object3D (procedural or GLB) into per-material merged parts and draw many copies
// as InstancedMeshes (one draw call per material for ALL copies), plus tiny vertex-shader "life" injections
// (bob / sway) driven by a shared time uniform so ambient motion costs no per-frame CPU work.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../../util.js';

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();

function floatAttr(attr, size) {
  const n = attr.count;
  const out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    out[i * size] = attr.getX(i);
    if (size > 1) out[i * size + 1] = attr.getY(i);
    if (size > 2) out[i * size + 2] = attr.getZ(i);
    if (size > 3) out[i * size + 3] = attr.itemSize > 3 ? attr.getW(i) : 1;
  }
  return new THREE.BufferAttribute(out, size);
}

/** Converts a (GLB) material into something owned by the arena; EMISSIVE_* become bright unlit materials. */
function ownMaterial(m, { emissiveBoost = 2.2 } = {}) {
  const name = m.name || '';
  let out;
  if (/^EMISSIVE_|EMISSIVE|LAMP/i.test(name)) {
    const c = (m.emissive && m.emissive.getHex() !== 0 ? m.emissive : m.color || new THREE.Color(1, 1, 1)).clone();
    out = new THREE.MeshBasicMaterial({ color: c.multiplyScalar(emissiveBoost), toneMapped: true });
  } else if (/^GLASS/i.test(name)) {
    out = new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.4 });
  } else {
    out = m.clone();
  }
  out.name = name;
  out.userData = { ...(out.userData || {}), shared: false };
  return out;
}

/**
 * Bakes every mesh under `root` (in root space) and merges them per material name.
 * Returns [{ key, geometry, material }]. Materials are cloned/owned (GLB caches stay untouched).
 */
export function partsFromObject(root, { emissiveBoost = 2.2, keepMaterials = false } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const key = (mat && mat.name) || mat?.uuid || 'default';
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const keep = new THREE.BufferGeometry();
    keep.setAttribute('position', floatAttr(g.attributes.position, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    keep.setAttribute('normal', floatAttr(g.attributes.normal, 3));
    if (g.attributes.uv) keep.setAttribute('uv', floatAttr(g.attributes.uv, 2));
    g.dispose();
    _m.multiplyMatrices(_inv, o.matrixWorld);
    keep.applyMatrix4(_m);
    if (!groups.has(key)) groups.set(key, { key, material: mat, geos: [] });
    groups.get(key).geos.push(keep);
  });
  const parts = [];
  for (const gr of groups.values()) {
    // uv only if every piece has it
    const allUv = gr.geos.every((g) => g.attributes.uv);
    if (!allUv) gr.geos.forEach((g) => g.deleteAttribute('uv'));
    const geometry = gr.geos.length === 1 ? gr.geos[0] : mergeGeometries(gr.geos, false);
    if (gr.geos.length > 1) gr.geos.forEach((g) => g.dispose());
    geometry.computeBoundingSphere();
    parts.push({ key: gr.key, geometry, material: keepMaterials ? gr.material : ownMaterial(gr.material, { emissiveBoost }) });
  }
  return parts;
}

/** Bounding box of the merged parts (template space). */
export function partsBox(parts) {
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  return box;
}

/** Re-centres parts so the base centre sits at the origin and optionally scales to a height. */
export function normalizeParts(parts, { height = null, length = null } = {}) {
  const box = partsBox(parts);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (height && size.y > 1e-4) s = height / size.y;
  if (length && Math.max(size.x, size.z) > 1e-4) s = length / Math.max(size.x, size.z);
  const c = box.getCenter(new THREE.Vector3());
  const m = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  for (const p of parts) { p.geometry.applyMatrix4(m); p.geometry.computeBoundingSphere(); p.geometry.boundingBox = null; }
  return { scale: s, size: size.multiplyScalar(s) };
}

/**
 * Many copies of a set of parts. setMatrix(i, m) / setColor(i, keyPrefix, color).
 * `roles` maps key prefixes → { color: true } for parts that take a per-instance colour.
 */
export class InstSet {
  constructor(parts, count, { castShadow = false, receiveShadow = true, culled = true, name = 'inst' } = {}) {
    this.group = new THREE.Group();
    this.group.name = name;
    this.count = count;
    this.meshes = parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geometry, p.material, count);
      m.name = p.key;
      m.castShadow = castShadow && !p.noShadow && !(p.material.isMeshBasicMaterial);
      m.receiveShadow = receiveShadow && !p.material.isMeshBasicMaterial;
      m.frustumCulled = culled;
      m.renderOrder = p.renderOrder || 0;
      m.userData.key = p.key;
      this.group.add(m);
      return m;
    });
  }

  meshFor(prefix) { return this.meshes.filter((m) => m.userData.key.startsWith(prefix)); }

  setMatrix(i, m4) { for (const m of this.meshes) m.setMatrixAt(i, m4); }

  setColor(i, prefix, color) {
    for (const m of this.meshes) if (m.userData.key.startsWith(prefix)) m.setColorAt(i, color);
  }

  /** Call once after placing everything (flags uploads + fits culling spheres). */
  commit() {
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  dirtyMatrices() { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------------------------- shader "life" injections
/**
 * Adds per-instance idle motion to an (instanced) material: `bob` (people bouncing to the beat, amplitude in m)
 * and `sway` (top bends sideways proportional to (y/height)^2, for palms). Phase comes from the instance position,
 * so every mesh of the same instance moves together. uni = { uTime:{value}, uAmp:{value} } shared.
 */
export function injectLife(mat, uni, { bob = 0, sway = 0, height = 5, speed = 1 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uTime = uni.uTime;
    sh.uniforms.uAmp = uni.uAmp;
    sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float lph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 0.71;
        float lfr = fract(sin(lph * 12.9898) * 43758.5453);
        float lt = uTime * ${speed.toFixed(3)};
        ${bob ? `transformed.y += uAmp * ${bob.toFixed(3)} * (0.4 + 0.6 * lfr) * (0.5 + 0.5 * sin(lt * (3.2 + lfr * 1.6) + lph * 3.0));
        transformed.x += uAmp * 0.05 * sin(lt * (1.2 + lfr) + lph) * clamp(transformed.y - 0.8, 0.0, 1.0);` : ''}
        ${sway ? `float lk = clamp(transformed.y / ${height.toFixed(2)}, 0.0, 1.2); lk *= lk;
        transformed.x += uAmp * ${sway.toFixed(3)} * lk * sin(lt * 0.55 + lph);
        transformed.z += uAmp * ${sway.toFixed(3)} * 0.7 * lk * sin(lt * 0.43 + lph * 1.7);` : ''}
      #endif`);
  };
  mat.customProgramCacheKey = () => `neonlife_${bob}_${sway}_${height}_${speed}`;
  return mat;
}

/** Festoon sway: attribute vec3 aSway = (dirX*weight, dirZ*weight, phase). */
export function injectSway(mat, uni, amp = 0.12) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime;
    sh.uniforms.uAmp = uni.uAmp;
    sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\nattribute vec3 aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float sw = sin(uTime * 0.7 + aSway.z) * 0.7 + sin(uTime * 1.13 + aSway.z * 2.3) * 0.3;
      transformed.x += aSway.x * sw * uAmp * ${amp.toFixed(3)};
      transformed.z += aSway.y * sw * uAmp * ${amp.toFixed(3)};
      transformed.y += abs(aSway.x + aSway.y) * sw * uAmp * ${(amp * 0.25).toFixed(3)};`);
  };
  mat.customProgramCacheKey = () => `neonsway_${amp}`;
  return mat;
}

// ---------------------------------------------------------------------------------- textures (owned per arena)
export function glowTex(track) {
  return track(canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }));
}

/** Soft rounded-rectangle glow (underglow pools on the asphalt). */
export function poolTex(track) {
  return track(canvasTexture(128, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = Math.max(0, Math.abs(x - w / 2 + 0.5) / (w / 2) - 0.35) / 0.65;
      const dy = Math.max(0, Math.abs(y - h / 2 + 0.5) / (h / 2) - 0.55) / 0.45;
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - d, 2.2);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
  }, { anisotropy: 4 }));
}
