// Crown Hills — procedural set pieces (fallbacks for the Blender GLBs and extra decor). Static things are written
// into a Batch under material keys (see crown.js MATERIAL KEYS); moving things return small Groups.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch } from './batch.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const lathe = (pts, seg = 8) => new THREE.LatheGeometry(pts.map(([x, y]) => V2(x, y)), seg);

// ------------------------------------------------------------------ shared profiles (cached per build)
let _baluster = null;
function balusterGeo() {
  if (_baluster) return _baluster;
  _baluster = lathe([[0, 0], [0.065, 0], [0.04, 0.12], [0.08, 0.3], [0.05, 0.46], [0.035, 0.52], [0.065, 0.58], [0.065, 0.62], [0, 0.62]], 5);
  return _baluster;
}
export function disposeShared() { if (_baluster) { _baluster.dispose(); _baluster = null; } }

/** Marble balustrade from (x0,z0) to (x1,z1) at ground y: pedestals every ~`postEvery` m, turned balusters, rails. */
export function balustrade(B, x0, z0, x1, z1, y, { postEvery = 6, urns = true, key = 'balus', urnKey = 'balus', flowerKey = 'flowerPink', skipPosts = false } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
  const yaw = Math.atan2(dx, dz) - Math.PI / 2; // local X along the run
  const nPosts = Math.max(1, Math.round(len / postEvery));
  const bal = balusterGeo();
  // rails
  const mid = [(x0 + x1) / 2, (z0 + z1) / 2];
  B.put(key, new THREE.BoxGeometry(len, 0.14, 0.34), mid[0], y + 0.07, mid[1], yaw);
  B.put(key, new THREE.BoxGeometry(len, 0.1, 0.36), mid[0], y + 0.9, mid[1], yaw);
  B.put(key, new THREE.BoxGeometry(len, 0.05, 0.3), mid[0], y + 0.97, mid[1], yaw);
  // balusters
  const step = 0.26;
  const n = Math.floor(len / step);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (len / n);
    const px = x0 + dx * t, pz = z0 + dz * t;
    B.add(key, bal, Batch.mat(px, y + 0.14, pz, 0, 0, 0, 1, 1.2, 1));
  }
  if (skipPosts) return;
  for (let i = 0; i <= nPosts; i++) {
    const t = (i / nPosts) * len;
    const px = x0 + dx * t, pz = z0 + dz * t;
    B.put(key, new THREE.BoxGeometry(0.46, 1.08, 0.46), px, y + 0.54, pz, yaw);
    B.put(key, new THREE.BoxGeometry(0.56, 0.08, 0.56), px, y + 1.12, pz, yaw);
    if (urns && i % 2 === 0) urn(B, px, y + 1.16, pz, 0.55, urnKey, flowerKey);
  }
}

/** Marble urn with a ball of flowers. s = scale (1 ≈ 0.9 m tall urn). */
export function urn(B, x, y, z, s = 1, key = 'marble', flowerKey = 'flowerPink') {
  const g = lathe([[0, 0], [0.2, 0], [0.2, 0.06], [0.1, 0.12], [0.08, 0.22], [0.2, 0.34], [0.3, 0.52], [0.31, 0.66],
    [0.26, 0.74], [0.33, 0.78], [0.33, 0.84], [0, 0.84]], 10);
  B.put(key, g, x, y, z, 0, s);
  if (flowerKey) {
    const f = new THREE.IcosahedronGeometry(0.34, 1);
    B.put(flowerKey, f, x, y + 0.92 * s, z, 0, s, s * 0.75, s);
  }
}

/** Clipped hedge block (slightly rounded look via a bevel box of two layers). */
export function hedge(B, x0, z0, x1, z1, h, y, key = 'hedge') {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  B.put(key, new THREE.BoxGeometry(w, h - 0.08, d), cx, y + (h - 0.08) / 2, cz);
  B.put(key, new THREE.BoxGeometry(Math.max(0.05, w - 0.12), 0.08, Math.max(0.05, d - 0.12)), cx, y + h - 0.04, cz);
}

/** Topiary in a square planter: kind 0 = cone, 1 = stacked balls, 2 = single ball. */
export function topiary(B, x, z, y, kind = 0, s = 1, potKey = 'marble', leafKey = 'hedge') {
  B.put(potKey, new THREE.BoxGeometry(0.62, 0.5, 0.62), x, y + 0.25 * s, z, 0, s);
  B.put(potKey, new THREE.BoxGeometry(0.72, 0.07, 0.72), x, y + 0.52 * s, z, 0, s);
  B.put('soil', new THREE.CylinderGeometry(0.04, 0.05, 0.3, 5), x, y + 0.7 * s, z, 0, s);
  if (kind === 0) {
    B.put(leafKey, new THREE.ConeGeometry(0.42, 1.3, 10), x, y + 1.25 * s, z, 0, s);
  } else if (kind === 1) {
    B.put(leafKey, new THREE.IcosahedronGeometry(0.34, 1), x, y + 0.95 * s, z, 0, s);
    B.put(leafKey, new THREE.IcosahedronGeometry(0.25, 1), x, y + 1.45 * s, z, 0, s);
    B.put(leafKey, new THREE.IcosahedronGeometry(0.15, 1), x, y + 1.8 * s, z, 0, s);
  } else {
    B.put(leafKey, new THREE.IcosahedronGeometry(0.42, 1), x, y + 1.05 * s, z, 0, s);
  }
}

/** Low boxwood ball on the ground. */
export function boxBall(B, x, z, y, r = 0.4, key = 'hedge') {
  B.put(key, new THREE.IcosahedronGeometry(r, 1), x, y + r * 0.85, z, 0, 1, 0.9, 1);
}

/** Black iron lamp post with gold rings and a warm glass globe (≈3.3 m). Returns the globe top position. */
export function lampPost(B, x, z, y, { h = 3.1, twin = false } = {}) {
  B.put('iron', new THREE.CylinderGeometry(0.22, 0.28, 0.35, 8), x, y + 0.175, z);
  B.put('iron', new THREE.CylinderGeometry(0.055, 0.08, h, 8), x, y + h / 2, z);
  B.put('gold', new THREE.TorusGeometry(0.075, 0.025, 6, 12), x, y + 0.9, z, 0, 1, 1, 1, Math.PI / 2);
  B.put('gold', new THREE.TorusGeometry(0.06, 0.02, 6, 12), x, y + h - 0.1, z, 0, 1, 1, 1, Math.PI / 2);
  const tops = [];
  if (twin) {
    for (const s of [-1, 1]) {
      B.put('iron', new THREE.BoxGeometry(0.9, 0.05, 0.05), x, y + h - 0.25, z);
      B.put('globe', new THREE.SphereGeometry(0.2, 12, 8), x + s * 0.45, y + h - 0.02, z);
      tops.push([x + s * 0.45, y + h - 0.02, z]);
    }
  }
  B.put('globe', new THREE.SphereGeometry(0.24, 12, 8), x, y + h + 0.18, z);
  B.put('gold', new THREE.ConeGeometry(0.1, 0.16, 8), x, y + h + 0.47, z);
  tops.push([x, y + h + 0.18, z]);
  return tops;
}

/** Sun lounger (frame + cushion + raised back). yaw: direction the feet point to. */
export function lounger(B, x, z, y, yaw, cushionKey = 'cushion') {
  const m = Batch.mat(x, y, z, 0, yaw);
  const add = (key, geo, lx, ly, lz, rx = 0) => {
    geo.rotateX(rx); geo.translate(lx, ly, lz);
    B.add(key, geo, m); geo.dispose();
  };
  add('teak', new THREE.BoxGeometry(0.7, 0.08, 1.9), 0, 0.3, 0.1);
  for (const sx of [-0.3, 0.3]) for (const sz of [-0.75, 0.9]) add('teak', new THREE.BoxGeometry(0.06, 0.3, 0.06), sx, 0.15, sz);
  add(cushionKey, new THREE.BoxGeometry(0.66, 0.1, 1.25), 0, 0.39, 0.4);
  add(cushionKey, new THREE.BoxGeometry(0.66, 0.1, 0.75), 0, 0.62, -0.62, -0.75);
  add('teak', new THREE.BoxGeometry(0.7, 0.05, 0.78), 0, 0.55, -0.68, -0.75);
}

/** Market umbrella. */
export function umbrella(B, x, z, y, canopyKey = 'canvas', h = 2.5) {
  B.put('teak', new THREE.CylinderGeometry(0.035, 0.035, h, 6), x, y + h / 2, z);
  B.put('marble', new THREE.CylinderGeometry(0.28, 0.32, 0.12, 10), x, y + 0.06, z);
  B.put(canopyKey, new THREE.ConeGeometry(1.35, 0.55, 8, 1, true), x, y + h - 0.12, z);
  B.put('gold', new THREE.SphereGeometry(0.06, 6, 4), x, y + h + 0.18, z);
}

/** Cocktail table (high, white cloth). */
export function cocktailTable(B, x, z, y) {
  B.put('iron', new THREE.CylinderGeometry(0.28, 0.3, 0.04, 12), x, y + 0.02, z);
  B.put('iron', new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), x, y + 0.52, z);
  B.put('cloth', new THREE.CylinderGeometry(0.4, 0.44, 0.3, 14), x, y + 0.92, z);
  B.put('cloth', new THREE.CylinderGeometry(0.4, 0.4, 0.03, 14), x, y + 1.08, z);
  B.put('gold', new THREE.CylinderGeometry(0.06, 0.045, 0.1, 8), x - 0.12, y + 1.14, z + 0.08);
  B.put('flowerPink', new THREE.IcosahedronGeometry(0.1, 0), x - 0.12, y + 1.22, z + 0.08);
  B.put('glassware', new THREE.CylinderGeometry(0.035, 0.02, 0.14, 6), x + 0.15, y + 1.16, z - 0.1);
}

/** Tiered marble fountain at (x,z). Water surfaces → 'fwater', falling sheets → 'fall'. r ≈ basin radius. */
export function fountain(B, x, z, y, r = 2.6) {
  // basin
  const seg = 24;
  B.put('marble', lathe([[r + 0.14, 0], [r + 0.04, 0.5], [r + 0.04, 0.56], [r - 0.3, 0.56], [r - 0.3, 0.02]], seg), x, y, z);
  B.put('marbleDark', new THREE.CircleGeometry(r - 0.28, seg).rotateX(-Math.PI / 2), x, y + 0.02, z);
  B.put('fwater', new THREE.CircleGeometry(r - 0.28, seg).rotateX(-Math.PI / 2), x, y + 0.42, z);
  // pedestal + tiers
  B.put('marble', lathe([[0, 0], [0.45, 0], [0.45, 0.1], [0.28, 0.2], [0.22, 0.6], [0.3, 0.9], [0.18, 1.1], [0.16, 1.25], [0, 1.25]], 12), x, y + 0.4, z);
  const tier = (ty, tr, depth) => {
    B.put('marble', lathe([[0, 0], [0.18, 0], [tr * 0.55, depth * 0.5], [tr, depth], [tr + 0.06, depth + 0.02], [tr + 0.06, depth + 0.1], [tr - 0.05, depth + 0.1], [0, depth * 0.55]], 18), x, ty, z);
    B.put('fwater', new THREE.CircleGeometry(tr - 0.04, 18).rotateX(-Math.PI / 2), x, ty + depth + 0.06, z);
    // falling sheet from the rim to the level below (open cylinder, uv.y 0 bottom → 1 top)
    return [tr + 0.07, ty + depth + 0.08];
  };
  const t1 = tier(y + 1.6, 1.25, 0.32);
  B.put('marble', lathe([[0, 0], [0.16, 0], [0.12, 0.3], [0.16, 0.5], [0.1, 0.62], [0, 0.62]], 10), x, y + 2.0, z);
  const t2 = tier(y + 2.55, 0.62, 0.22);
  B.put('gold', lathe([[0, 0], [0.1, 0], [0.06, 0.12], [0.12, 0.24], [0.05, 0.36], [0.03, 0.5], [0, 0.55]], 10), x, y + 2.85, z);
  // sheets
  const sheet = (radius, top, bottom) => {
    const g = new THREE.CylinderGeometry(radius, radius + 0.12, top - bottom, 24, 1, true);
    B.put('fall', g, x, (top + bottom) / 2, z);
  };
  sheet(t1[0], t1[1], y + 0.45);
  sheet(t2[0], t2[1], y + 1.6 + 0.4);
  // top jet
  B.put('fall', new THREE.CylinderGeometry(0.02, 0.07, 0.6, 8, 1, true), x, y + 3.6, z);
}

/** Gold rearing horse on a marble plinth (fallback for horse_statue.glb). Faces +Z at yaw 0. */
export function horseStatue(B, x, z, y, yaw = 0, s = 1, key = 'gold') {
  const m = Batch.mat(x, y, z, 0, yaw, 0, s);
  const add = (k, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
    geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(lx, ly, lz);
    B.add(k, geo, m); geo.dispose();
  };
  // plinth
  add('marble', new THREE.BoxGeometry(1.6, 0.25, 2.6), 0, 0.125, 0);
  add('marble', new THREE.BoxGeometry(1.3, 1.1, 2.3), 0, 0.8, 0);
  add('marble', new THREE.BoxGeometry(1.55, 0.18, 2.55), 0, 1.44, 0);
  add('marbleDark', new THREE.BoxGeometry(1.32, 0.5, 2.32), 0, 0.85, 0);
  const Y = 1.53;
  // body tilted up (rearing): torso capsule along Z rotated by -0.75 rad around X
  const tilt = -0.7;
  const body = new THREE.CapsuleGeometry(0.34, 1.0, 4, 10);
  body.rotateX(Math.PI / 2); body.rotateX(tilt);
  body.translate(0, Y + 1.25, 0.1);
  B.add(key, body, m); body.dispose();
  // hind legs (standing)
  for (const sx of [-0.17, 0.17]) {
    add(key, new THREE.CylinderGeometry(0.09, 0.12, 0.75, 6), sx, Y + 0.72, -0.45, 0.25);
    add(key, new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), sx, Y + 0.3, -0.5, -0.1);
    add(key, new THREE.CylinderGeometry(0.08, 0.09, 0.08, 6), sx, Y + 0.04, -0.52);
  }
  // front legs raised & bent
  for (const [sx, k] of [[-0.17, 0], [0.17, 0.35]]) {
    add(key, new THREE.CylinderGeometry(0.08, 0.1, 0.55, 6), sx, Y + 1.75 + k * 0.1, 0.75, -1.2 + k * 0.4);
    add(key, new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6), sx, Y + 1.62 + k * 0.1, 1.08, 0.5 + k * 0.3);
  }
  // neck + head
  add(key, new THREE.CylinderGeometry(0.17, 0.26, 0.9, 8), 0, Y + 2.2, 0.72, 0.35);
  add(key, new THREE.CapsuleGeometry(0.13, 0.42, 3, 8), 0, Y + 2.62, 1.0, 1.1);
  add(key, new THREE.ConeGeometry(0.05, 0.16, 4), -0.08, Y + 2.85, 0.83, -0.3);
  add(key, new THREE.ConeGeometry(0.05, 0.16, 4), 0.08, Y + 2.85, 0.83, -0.3);
  // mane + tail
  add(key, new THREE.BoxGeometry(0.06, 0.2, 0.8), 0, Y + 2.35, 0.58, 0.45);
  const tail = new THREE.ConeGeometry(0.12, 0.9, 6);
  tail.rotateX(Math.PI * 0.85); tail.translate(0, Y + 0.7, -0.75);
  B.add(key, tail, m); tail.dispose();
}

/** Stylised luxury car (fallback for car_luxury.glb). Faces +Z at yaw 0. bodyKey = batch key for the paint. */
export function luxuryCar(B, x, z, y, yaw, bodyKey, { long = 5.0, convertible = false } = {}) {
  const m = Batch.mat(x, y, z, 0, yaw);
  const add = (k, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
    geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(lx, ly, lz);
    B.add(k, geo, m); geo.dispose();
  };
  const L = long, W = 1.95;
  // lower body (extruded side profile for a long sleek shape)
  const sh = new THREE.Shape();
  sh.moveTo(-L / 2, 0.28); sh.lineTo(-L / 2, 0.72); sh.quadraticCurveTo(-L / 2 + 0.1, 0.86, -L / 2 + 0.6, 0.88);
  sh.lineTo(L / 2 - 0.9, 0.9); sh.quadraticCurveTo(L / 2 - 0.05, 0.86, L / 2, 0.66); sh.lineTo(L / 2, 0.3);
  sh.lineTo(-L / 2, 0.28);
  const body = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 6 });
  body.translate(0, 0, -W / 2);
  body.rotateY(-Math.PI / 2); // profile x → world z (front at +Z)
  B.add(bodyKey, body, m); body.dispose();
  if (!convertible) {
    // cabin
    const c = new THREE.Shape();
    c.moveTo(-1.35, 0.9); c.lineTo(-1.05, 1.36); c.lineTo(0.45, 1.36); c.lineTo(1.1, 0.9); c.lineTo(-1.35, 0.9);
    const cab = new THREE.ExtrudeGeometry(c, { depth: W - 0.3, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
    cab.translate(0, 0, -(W - 0.3) / 2); cab.rotateY(-Math.PI / 2); cab.translate(0, 0, -0.25);
    B.add('carGlass', cab, m); cab.dispose();
    add(bodyKey, new THREE.BoxGeometry(W - 0.34, 0.05, 1.3), 0, 1.4, -0.3);
  } else {
    add('carGlass', new THREE.BoxGeometry(W - 0.2, 0.32, 0.05), 0, 1.06, 0.55, -0.4);
    add('leather', new THREE.BoxGeometry(W - 0.4, 0.5, 1.4), 0, 0.85, -0.45);
  }
  // grille + lights
  add('chrome', new THREE.BoxGeometry(0.9, 0.3, 0.06), 0, 0.62, L / 2 + 0.07);
  add('headlight', new THREE.BoxGeometry(0.34, 0.1, 0.05), -0.66, 0.72, L / 2 + 0.05);
  add('headlight', new THREE.BoxGeometry(0.34, 0.1, 0.05), 0.66, 0.72, L / 2 + 0.05);
  add('taillight', new THREE.BoxGeometry(0.4, 0.08, 0.05), -0.65, 0.76, -L / 2 - 0.07);
  add('taillight', new THREE.BoxGeometry(0.4, 0.08, 0.05), 0.65, 0.76, -L / 2 - 0.07);
  add('chrome', new THREE.BoxGeometry(W + 0.05, 0.06, 0.1), 0, 0.34, L / 2 + 0.06);
  add('chrome', new THREE.BoxGeometry(W + 0.05, 0.06, 0.1), 0, 0.34, -L / 2 - 0.06);
  add('gold', new THREE.CylinderGeometry(0.05, 0.05, 0.14, 6), 0, 0.96, L / 2 - 0.25);
  // wheels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wx = sx * (W / 2 - 0.02), wz = sz * (L / 2 - 0.85);
    add('tire', new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), wx, 0.36, wz, 0, 0, Math.PI / 2);
    add('chrome', new THREE.CylinderGeometry(0.24, 0.24, 0.28, 10), wx, 0.36, wz, 0, 0, Math.PI / 2);
  }
}

/** Golf cart (fallback for golf_cart.glb). */
export function golfCart(B, x, z, y, yaw, bodyKey = 'cartWhite') {
  const m = Batch.mat(x, y, z, 0, yaw);
  const add = (k, geo, lx, ly, lz, rx = 0, rz = 0) => { geo.rotateX(rx); geo.rotateZ(rz); geo.translate(lx, ly, lz); B.add(k, geo, m); geo.dispose(); };
  add(bodyKey, new THREE.BoxGeometry(1.2, 0.4, 2.3), 0, 0.45, 0);
  add(bodyKey, new THREE.BoxGeometry(1.1, 0.45, 0.4), 0, 0.85, 0.85);
  add('leather', new THREE.BoxGeometry(1.05, 0.15, 0.6), 0, 0.72, -0.1);
  add('leather', new THREE.BoxGeometry(1.05, 0.5, 0.12), 0, 0.98, -0.42);
  for (const sx of [-0.52, 0.52]) for (const sz of [-0.9, 0.95]) add('iron', new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), sx, 1.3, sz * 0.62);
  add(bodyKey, new THREE.BoxGeometry(1.3, 0.06, 1.7), 0, 1.95, 0.1);
  add('carGlass', new THREE.BoxGeometry(1.0, 0.6, 0.03), 0, 1.5, 0.62, -0.2);
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.75, 0.75]) add('tire', new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10), sx, 0.22, sz, 0, Math.PI / 2);
  // golf bag
  add('crimsonDark', new THREE.CylinderGeometry(0.14, 0.14, 0.8, 8), 0.3, 1.0, -0.9, -0.25);
}

/** Speaker stack (fallback for speaker_stack.glb). Faces +Z. */
export function speakerStack(B, x, z, y, yaw) {
  const m = Batch.mat(x, y, z, 0, yaw);
  const add = (k, geo, lx, ly, lz, rx = 0) => { geo.rotateX(rx); geo.translate(lx, ly, lz); B.add(k, geo, m); geo.dispose(); };
  add('iron', new THREE.BoxGeometry(0.7, 0.2, 0.55), 0, 0.1, 0);
  add('speaker', new THREE.BoxGeometry(0.75, 0.8, 0.6), 0, 0.6, 0);
  add('speaker', new THREE.BoxGeometry(0.65, 0.6, 0.55), 0, 1.3, 0);
  add('chrome', new THREE.CylinderGeometry(0.26, 0.26, 0.03, 16), 0, 0.6, 0.3, Math.PI / 2);
  add('chrome', new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12), 0, 1.35, 0.28, Math.PI / 2);
  add('ringGlow', new THREE.TorusGeometry(0.27, 0.018, 6, 20), 0, 0.6, 0.315);
}

/** Tropical potted plant (fallback for plant_pot.glb). */
export function pottedPalm(B, x, z, y, s = 1) {
  B.put('marble', lathe([[0, 0], [0.26, 0], [0.34, 0.5], [0.36, 0.56], [0, 0.56]], 10), x, y, z, 0, s);
  const r = Math.abs(Math.sin(x * 12.9 + z * 78.2));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r;
    const leaf = new THREE.ConeGeometry(0.11, 1.0, 4);
    leaf.scale(1, 1, 0.25);
    leaf.translate(0, 0.5, 0);
    leaf.rotateX(0.55 + (i % 2) * 0.3);
    leaf.rotateY(a);
    B.put('leaf', leaf, x, y + 0.5 * s, z, 0, s);
  }
}

/** DJ booth with gold facade & turntables. Faces +Z at yaw 0 (the crowd side). */
export function djBooth(B, x, z, y, yaw) {
  const m = Batch.mat(x, y, z, 0, yaw);
  const add = (k, geo, lx, ly, lz, rx = 0) => { geo.rotateX(rx); geo.translate(lx, ly, lz); B.add(k, geo, m); geo.dispose(); };
  add('cloth', new THREE.BoxGeometry(2.2, 1.0, 0.8), 0, 0.5, 0);
  add('gold', new THREE.BoxGeometry(2.24, 0.1, 0.84), 0, 1.05, 0);
  add('gold', new THREE.BoxGeometry(2.0, 0.06, 0.02), 0, 0.75, 0.41);
  add('gold', new THREE.BoxGeometry(2.0, 0.06, 0.02), 0, 0.3, 0.41);
  add('ringGlow', new THREE.BoxGeometry(0.4, 0.4, 0.02), 0, 0.52, 0.415);
  add('speaker', new THREE.BoxGeometry(1.4, 0.08, 0.5), 0, 1.14, -0.05);
  add('chrome', new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14), -0.45, 1.19, -0.05);
  add('chrome', new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14), 0.45, 1.19, -0.05);
  add('crimsonDark', new THREE.CylinderGeometry(0.05, 0.05, 0.021, 10), -0.45, 1.2, -0.05);
  add('crimsonDark', new THREE.CylinderGeometry(0.05, 0.05, 0.021, 10), 0.45, 1.2, -0.05);
}

/** Bar counter with gold trim, back shelf with bottles and a champagne coupe tower at the +X end. Faces +Z. */
export function bar(B, x, z, y, yaw, len = 5) {
  const m = Batch.mat(x, y, z, 0, yaw);
  const add = (k, geo, lx, ly, lz) => { geo.translate(lx, ly, lz); B.add(k, geo, m); geo.dispose(); };
  add('marble', new THREE.BoxGeometry(len, 1.05, 0.7), 0, 0.525, 0);
  add('marbleDark', new THREE.BoxGeometry(len + 0.1, 0.06, 0.82), 0, 1.08, 0.02);
  add('gold', new THREE.BoxGeometry(len, 0.05, 0.02), 0, 0.95, 0.36);
  add('gold', new THREE.BoxGeometry(len, 0.05, 0.02), 0, 0.12, 0.36);
  // back shelf
  add('teak', new THREE.BoxGeometry(len * 0.8, 1.9, 0.35), 0, 0.95, -1.35);
  const colors = ['bottleGreen', 'bottleAmber', 'glassware'];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 10; i++) {
    const g = new THREE.CylinderGeometry(0.035, 0.04, 0.26, 6);
    add(colors[(i + row) % 3], g, -len * 0.36 + i * (len * 0.72 / 9), 1.05 + row * 0.6, -1.15);
  }
  // champagne tower (4 tiers of coupes)
  const tx = len / 2 - 0.55, tz = 0.05;
  let level = 0;
  for (let n = 4; n >= 1; n--, level++) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const g = new THREE.CylinderGeometry(0.075, 0.03, 0.07, 7);
      add('champagne', g, tx + (i - (n - 1) / 2) * 0.15, 1.16 + level * 0.12, tz + (j - (n - 1) / 2) * 0.15);
    }
  }
  // ice bucket
  add('chrome', new THREE.CylinderGeometry(0.12, 0.1, 0.22, 10), -len / 2 + 0.5, 1.22, 0.05);
  add('bottleGreen', new THREE.CylinderGeometry(0.035, 0.04, 0.34, 6), -len / 2 + 0.5, 1.36, 0.05);
}

/** Gold-and-crimson throne on a dais (boss variant). Faces +Z. */
export function throne(B, x, z, y, yaw) {
  const m = Batch.mat(x, y, z, 0, yaw);
  const add = (k, geo, lx, ly, lz) => { geo.translate(lx, ly, lz); B.add(k, geo, m); geo.dispose(); };
  add('marble', new THREE.BoxGeometry(3.2, 0.18, 2.6), 0, 0.09, 0);
  add('crimson', new THREE.BoxGeometry(2.6, 0.02, 2.1), 0, 0.19, 0);
  add('gold', new THREE.BoxGeometry(1.3, 0.45, 0.9), 0, 0.42, -0.2);
  add('crimson', new THREE.BoxGeometry(1.1, 0.14, 0.8), 0, 0.71, -0.15);
  add('gold', new THREE.BoxGeometry(1.3, 1.5, 0.16), 0, 1.2, -0.62);
  add('crimson', new THREE.BoxGeometry(1.0, 1.2, 0.05), 0, 1.2, -0.52);
  for (const sx of [-0.62, 0.62]) {
    add('gold', new THREE.BoxGeometry(0.14, 0.35, 0.8), sx, 0.85, -0.2);
    add('gold', new THREE.SphereGeometry(0.1, 8, 6), sx, 1.06, 0.18);
  }
  // crown crest
  for (let i = -2; i <= 2; i++) add('gold', new THREE.ConeGeometry(0.07, 0.3 - Math.abs(i) * 0.05, 5), i * 0.22, 2.08 - Math.abs(i) * 0.03, -0.62);
  add('gold', new THREE.BoxGeometry(1.2, 0.1, 0.18), 0, 1.93, -0.62);
}

/** Paper-lantern garland between two points (sagging), writes bulbs into lantern key; wire into 'iron'. */
export function garland(B, a, b, sag = 0.6, n = 10, key = 'lantern', size = 0.13) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * sag, a[2] + (b[2] - a[2]) * k));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  B.add('iron', new THREE.TubeGeometry(curve, n * 2, 0.012, 3, false));
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n);
    B.put(key, new THREE.SphereGeometry(size, 8, 6), p.x, p.y - size * 1.1, p.z, 0, 1, 1.25, 1);
  }
}

/** Vertical HOA banner on a gold pole: returns a Mesh (animated wave material provided). */
export function bannerMesh(mat, w = 0.9, h = 2.2) {
  const g = new THREE.PlaneGeometry(w, h, 8, 4);
  g.translate(w / 2, 0, 0);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = false;
  return mesh;
}

// ------------------------------------------------------------------ moving pieces
/** Inflatable pool flamingo (single mesh with 2 material groups: pink, beak). */
export function flamingo(pinkMat, beakMat) {
  const parts = [];
  const ring = new THREE.TorusGeometry(0.55, 0.22, 10, 22); ring.rotateX(Math.PI / 2);
  parts.push([ring, 0]);
  const neck = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.1, 0.55), new THREE.Vector3(0, 0.6, 0.72), new THREE.Vector3(0, 1.05, 0.55), new THREE.Vector3(0, 1.2, 0.3),
  ]), 12, 0.09, 8, false);
  parts.push([neck, 0]);
  const head = new THREE.SphereGeometry(0.15, 10, 8); head.translate(0, 1.22, 0.28);
  parts.push([head, 0]);
  const tail = new THREE.ConeGeometry(0.16, 0.35, 8); tail.rotateX(-1.2); tail.translate(0, 0.25, -0.68);
  parts.push([tail, 0]);
  const beak = new THREE.ConeGeometry(0.06, 0.22, 6); beak.rotateX(Math.PI * 0.75); beak.translate(0, 1.14, 0.42);
  parts.push([beak, 1]);
  const geos = parts.map(([g]) => (g.index ? g.toNonIndexed() : g));
  geos.forEach((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
  const merged = mergeGeometries(geos, true);
  // group index: parts in order → reassign material indices
  merged.groups.forEach((gr, i) => { gr.materialIndex = parts[i][1]; });
  parts.forEach(([g]) => g.dispose());
  const mesh = new THREE.Mesh(merged, [pinkMat, beakMat]);
  mesh.castShadow = false;
  return mesh;
}

/** Superyacht (white hull, dark glass decks, warm deck lights). Returns a Group; bow toward +X. */
export function yacht(mats) {
  const B = new Batch();
  const hull = new THREE.Shape();
  hull.moveTo(-14, 0); hull.lineTo(10, 0); hull.quadraticCurveTo(15, 0.6, 17, 3.2); hull.lineTo(-14.5, 3.2); hull.lineTo(-14, 0);
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 7, bevelEnabled: false });
  hg.translate(0, -0.8, -3.5);
  B.add('yHull', hg); hg.dispose();
  B.box('yStripe', 30.5, 0.3, 7.05, 0.5, 1.6, 0);
  const deck = (x0, x1, y0, h, inset) => {
    B.box('yHull', x1 - x0, h * 0.35, 7 - inset * 2, (x0 + x1) / 2, y0 + h * 0.175, 0);
    B.box('yGlass', x1 - x0 - 0.3, h * 0.5, 7 - inset * 2 - 0.1, (x0 + x1) / 2, y0 + h * 0.6, 0);
    B.box('yHull', x1 - x0 + 0.6, 0.18, 7 - inset * 2 + 0.6, (x0 + x1) / 2, y0 + h - 0.09, 0);
    B.box('yLight', x1 - x0 - 0.4, 0.06, 0.06, (x0 + x1) / 2, y0 + h - 0.22, (7 - inset * 2) / 2 + 0.31);
  };
  deck(-11, 8, 2.4, 2.4, 0.4);
  deck(-9, 4.5, 4.8, 2.2, 0.8);
  deck(-6.5, 1.5, 7.0, 2.0, 1.3);
  B.box('yHull', 1.2, 2.2, 1.2, -2.5, 10, 0);
  B.put('yHull', new THREE.CylinderGeometry(0.9, 0.9, 0.35, 12), -2.5, 11.2, 0);
  const g = new THREE.Group();
  B.flush(g, mats, { cast: new Set(), receive: false });
  return g;
}

/** Polo horse + rider (procedural, far away). Faces +Z; returns { group, legs[] } for a simple gallop. */
export function poloRider(mats) {
  const g = new THREE.Group();
  const mk = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); return m; };
  const body = new THREE.CapsuleGeometry(0.36, 1.1, 4, 8); body.rotateX(Math.PI / 2);
  mk(body, mats.horse, 0, 1.35, 0);
  mk(new THREE.CylinderGeometry(0.16, 0.24, 0.8, 7), mats.horse, 0, 1.75, 0.8, 0.7);
  const head = new THREE.CapsuleGeometry(0.13, 0.4, 3, 6); head.rotateX(Math.PI / 2 + 0.6);
  mk(head, mats.horse, 0, 2.05, 1.18);
  const legs = [];
  for (const [sx, sz] of [[-0.2, 0.6], [0.2, 0.6], [-0.2, -0.6], [0.2, -0.6]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx, 1.15, sz); g.add(pivot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 1.1, 5), mats.horse); leg.position.y = -0.55; pivot.add(leg);
    legs.push(pivot);
  }
  mk(new THREE.ConeGeometry(0.1, 0.8, 5), mats.horseDark, 0, 1.3, -0.95, -2.4);
  // rider
  mk(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 7), mats.shirt, 0, 2.1, -0.05);
  mk(new THREE.CylinderGeometry(0.14, 0.12, 0.5, 6), mats.pants, -0.2, 1.72, 0.05, 1.2, 0.3);
  mk(new THREE.CylinderGeometry(0.14, 0.12, 0.5, 6), mats.pants, 0.2, 1.72, 0.05, 1.2, -0.3);
  mk(new THREE.SphereGeometry(0.13, 8, 6), mats.skin, 0, 2.55, -0.02);
  mk(new THREE.SphereGeometry(0.15, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.helmet, 0, 2.58, -0.02);
  const mallet = new THREE.Group(); mallet.position.set(0.25, 2.25, 0); g.add(mallet);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 4), mats.helmet); shaft.position.y = -0.65; mallet.add(shaft);
  const headM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), mats.helmet); headM.position.y = -1.3; headM.rotation.z = Math.PI / 2; mallet.add(headM);
  mallet.rotation.x = 0.4;
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, legs, mallet };
}
