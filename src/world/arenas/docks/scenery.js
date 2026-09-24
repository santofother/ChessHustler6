// Rustwater Docks: shared scenery helpers (textures, skyline, water, GLB-or-fallback loading, baking).
import * as THREE from 'three';
import { canvasTexture, rng } from '../../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

/** Bakes every mesh of obj (with its current local hierarchy) into the batcher at pos/yaw/scale. */
export function bake(batcher, obj, pos = [0, 0, 0], yaw = 0, scale = 1) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  _q.setFromAxisAngle(_y, yaw);
  _p.set(pos[0], pos[1], pos[2]);
  _s.setScalar(scale);
  const place = new THREE.Matrix4().compose(_p, _q, _s);
  obj.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    _m.multiplyMatrices(inv, o.matrixWorld).premultiply(place);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.length > 1 && o.geometry.groups.length) {
      for (const gr of o.geometry.groups) {
        const sub = o.geometry.clone();
        sub.setDrawRange(0, Infinity);
        const idx = sub.index;
        if (idx) sub.setIndex(Array.from(idx.array.slice(gr.start, gr.start + gr.count)));
        else sub.setIndex(Array.from({ length: gr.count }, (_, k) => gr.start + k));
        sub.clearGroups();
        batcher.addMatrix(mats[gr.materialIndex], sub, _m);
        sub.dispose();
      }
    } else batcher.addMatrix(mats[0], o.geometry, _m);
  });
}

/** Normalises a loaded GLB into a holder (feet on y=0, centred), optional height. */
export function normalise(root, { height = null, length = null } = {}) {
  const holder = new THREE.Group();
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (height && size.y > 1e-4) root.scale.multiplyScalar(height / size.y);
  else if (length) { const l = Math.max(size.x, size.z); if (l > 1e-4) root.scale.multiplyScalar(length / l); }
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
  holder.add(root);
  holder.userData.size = box.getSize(new THREE.Vector3());
  return holder;
}

/** Merged geometry groups of a GLB by material (for instancing). Long axis → X. Returns [{geometry, material}]. */
export function glbParts(root, { length = null } = {}) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const rot = size.z > size.x ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : new THREE.Matrix4();
  const sc = length ? length / Math.max(size.x, size.z) : 1;
  const pre = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
  const fin = new THREE.Matrix4().makeScale(sc, sc, sc).multiply(rot).multiply(pre);
  const by = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(fin, o.matrixWorld));
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!by.has(m)) by.set(m, []);
    by.get(m).push(g);
  });
  const out = [];
  for (const [material, list] of by) {
    const geometry = list.length > 1 ? mergeGeometries(list) : list[0];
    if (geometry) out.push({ geometry, material });
  }
  return out;
}

// ------------------------------------------------------------------ textures
export function concreteTexture(seed = 9) {
  const r = rng(seed);
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#5b5e62'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      const x = r() * w, y = r() * h, rad = 8 + r() * 50;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const v = r() < 0.55 ? '10,10,12' : '200,200,205';
      grd.addColorStop(0, `rgba(${v},${0.04 + r() * 0.07})`); grd.addColorStop(1, `rgba(${v},0)`);
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // slab joints every 4 m (tile = 8 m)
    g.fillStyle = 'rgba(15,15,18,0.65)';
    for (const p of [0, 256]) { g.fillRect(p, 0, 3, h); g.fillRect(0, p, w, 3); }
    // oil stains
    for (let i = 0; i < 7; i++) {
      const x = r() * w, y = r() * h, rad = 12 + r() * 36;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(8,8,10,0.55)'); grd.addColorStop(0.7, 'rgba(8,8,10,0.25)'); grd.addColorStop(1, 'rgba(8,8,10,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
    }
    // cracks
    g.strokeStyle = 'rgba(10,10,12,0.5)'; g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 6000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.08)'; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  }, { repeat: [1, 1] });
}

/** Roughness map (G channel): wet patches smooth, dry concrete rough. */
export function wetRoughTexture(seed = 13) {
  const r = rng(seed);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(40,40,40,0.9)'); grd.addColorStop(0.6, 'rgba(70,70,70,0.6)'); grd.addColorStop(1, 'rgba(150,150,150,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rad, rad * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '200,200,200' : '60,60,60'},0.15)`; g.fillRect(r() * w, r() * h, 1, 1); }
  }, { srgb: false, repeat: [1, 1] });
}

/** Puddle alpha texture (several soft-edged blobs). */
export function puddleTexture(seed = 21) {
  const r = rng(seed);
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.5, y = h / 2 + (r() - 0.5) * h * 0.4, rx = w * (0.1 + r() * 0.18), ry = rx * (0.5 + r() * 0.4);
      const grd = g.createRadialGradient(x, y, 0, x, y, rx);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { srgb: false });
}

/** Yellow/black hazard stripes (repeat along U). */
export function hazardTexture() {
  return canvasTexture(128, 32, (g, w, h) => {
    g.fillStyle = '#16161a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2b90f';
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
  }, { repeat: [1, 1] });
}

/** Tileable glowing ripple / caustic pattern for the canal (white on black, used as emissiveMap). */
export function causticTexture(seed = 5, { lines = 70, width = 2.2 } = {}) {
  const r = rng(seed);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let i = 0; i < lines; i++) {
      const x0 = r() * w, y0 = r() * h, len = 20 + r() * 60, a = r() * Math.PI * 2, bend = (r() - 0.5) * 50;
      const alpha = 0.25 + r() * 0.6;
      g.strokeStyle = `rgba(255,255,255,${alpha})`; g.lineWidth = width * (0.5 + r());
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        g.beginPath(); g.moveTo(x0 + ox, y0 + oy);
        g.quadraticCurveTo(x0 + ox + Math.cos(a) * len / 2 - Math.sin(a) * bend, y0 + oy + Math.sin(a) * len / 2 + Math.cos(a) * bend,
          x0 + ox + Math.cos(a) * len, y0 + oy + Math.sin(a) * len);
        g.stroke();
      }
    }
    // soft blobs
    for (let i = 0; i < 20; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 30;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  }, { srgb: false, repeat: [1, 1] });
}

/** Window texture pair for skyline facades. */
export function windowTextures(r, colors, litRatio) {
  const W = 128, H = 128, cols = 4, rows = 4;
  const lit = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) lit.push(r() < litRatio ? colors[Math.floor(r() * colors.length)] : null);
  const draw = (emissive) => (g) => {
    g.fillStyle = emissive ? '#000' : '#ffffff'; g.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = lit[y * cols + x];
      if (emissive) { if (!c) continue; g.fillStyle = c; g.globalAlpha = 0.55 + r() * 0.45; g.fillRect(x * cw + 6, y * ch + 8, cw - 12, ch - 16); g.globalAlpha = 1; }
      else { g.fillStyle = c ? '#ddd' : '#555'; g.fillRect(x * cw + 6, y * ch + 8, cw - 12, ch - 16); }
    }
  };
  const map = canvasTexture(W, H, draw(false), { repeat: [1, 1] });
  const emissive = canvasTexture(W, H, draw(true), { repeat: [1, 1] });
  map.magFilter = emissive.magFilter = THREE.NearestFilter;
  return { map, emissive };
}

/**
 * Distant skyline as a few merged meshes. place(x,z,w,d,h) boxes; returns meshes. y0 = ground height.
 * windowsLit: 0..1 multiplier for emissive windows.
 */
export function buildSkyline(parent, { seed = 64, y0 = 0, lit = 1, areas = [], track = (x) => x } = {}) {
  const r = rng(seed);
  const tex = [
    windowTextures(r, ['#ffcf7a', '#ffe2a8', '#ffb35c'], 0.4),
    windowTextures(r, ['#7ff5ff', '#29e3d6', '#c9ffff'], 0.3),
    windowTextures(r, ['#ff8ac0', '#ffd0e6', '#ffe9c7'], 0.3),
  ];
  const facades = ['#1d2230', '#232838', '#1a1e2b'];
  const mats = tex.map((t, i) => {
    track(t.map); track(t.emissive);
    return new THREE.MeshStandardMaterial({
      color: facades[i], map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.5 * lit,
      roughness: 0.6, metalness: 0.3,
    });
  });
  const geos = mats.map(() => []);
  const tops = [];
  for (const a of areas) {
    for (let i = 0; i < a.count; i++) {
      const x = a.x[0] + r() * (a.x[1] - a.x[0]);
      const z = a.z[0] + r() * (a.z[1] - a.z[0]);
      const w = 5 + r() * 9, d = 5 + r() * 9;
      const h = a.h[0] + Math.pow(r(), 1.7) * (a.h[1] - a.h[0]);
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv, nrm = g.attributes.normal;
      for (let k = 0; k < uv.count; k++) {
        const nx = Math.abs(nrm.getX(k)), ny = Math.abs(nrm.getY(k));
        if (ny > 0.5) { uv.setXY(k, 0, 0); continue; }
        uv.setXY(k, uv.getX(k) * (nx > 0.5 ? d : w) / 3, uv.getY(k) * h / 3);
      }
      g.translate(x, y0 + h / 2, z);
      geos[Math.floor(r() * mats.length)].push(g);
      if (h > 30 && r() < 0.5) tops.push([x, y0 + h, z]);
    }
  }
  const out = [];
  mats.forEach((m, i) => {
    if (!geos[i].length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos[i]), m);
    geos[i].forEach((g) => g.dispose());
    mesh.name = 'skyline';
    parent.add(mesh); out.push(mesh);
  });
  return { meshes: out, tops, mats };
}
