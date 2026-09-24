// Sunset Strand — procedural props. Static things are baked into Batches (B = flat vertex-colour, E = glowing
// vertex-colour, S = sign atlas with UVs); animated things return their own small meshes.
import * as THREE from 'three';
import { Batch, mtx, unit } from './batch.js';
import { signIndex } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ helpers
/** Adds a group-local transform: returns a function mapping local (x,y,z,ry) placements through a parent frame. */
export function frame(px, py, pz, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    p: (x, y, z) => [px + x * c + z * s, py + y, pz - x * s + z * c],
    yaw,
  };
}
function fbox(B, F, w, h, d, x, y, z, col, ry = 0, rx = 0, rz = 0) {
  const [X, Y, Z] = F.p(x, y, z);
  B.add(unit('box'), mtx(X, Y, Z, rx, F.yaw + ry, rz, [w, h, d]), col);
}
function fcyl(B, F, r, h, x, y, z, col, kind = 'cyl') {
  const [X, Y, Z] = F.p(x, y, z);
  B.add(unit(kind), mtx(X, Y, Z, 0, F.yaw, 0, [r * 2, h, r * 2]), col);
}
function frod(B, F, a, b, r, col) {
  B.rod(V(...F.p(...a)), V(...F.p(...b)), r, col);
}

/** Sign plane (atlas row `key`) facing local +Z, centred at local (x,y,z). */
export function signPlane(S, F, key, w, h, x, y, z, ry = 0) {
  const row = signIndex(key);
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1) / 8 + uv.getY(i) / 8);
  const [X, Y, Z] = F.p(x, y, z);
  S.add(g, mtx(X, Y, Z, 0, F.yaw + ry, 0), '#ffffff');
  g.dispose();
}

// ------------------------------------------------------------------ umbrellas (instanced, striped)
/** Canopy split into two stripe geometries (A/B) + valance; apex at local y = h, rim radius r. */
export function umbrellaCanopyGeos(r = 1.15, h = 2.25, n = 10) {
  const out = [[], []];
  const rimY = h - 0.42;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    const p0 = [Math.cos(a0) * r, rimY, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, rimY, Math.sin(a1) * r];
    const arr = out[i % 2];
    // top triangle (outward facing: apex, p1, p0)
    arr.push(0, h, 0, ...p1, ...p0);
    // underside (so it reads from below)
    arr.push(0, h - 0.02, 0, ...p0, ...p1);
    // valance flap
    const q0 = [p0[0] * 1.01, rimY - 0.16, p0[2] * 1.01], q1 = [p1[0] * 1.01, rimY - 0.16, p1[2] * 1.01];
    arr.push(...p0, ...p1, ...q1, ...p0, ...q1, ...q0);
    arr.push(...p0, ...q1, ...p1, ...p0, ...q0, ...q1);
  }
  return out.map((a) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    return g;
  });
}

// ------------------------------------------------------------------ small beach props (into B)
export function lounger(B, F, cushion, frameCol = '#f7f3ea') {
  // local: length along Z, head (backrest) at +Z... we want backrest at -Z end facing +Z? backrest at +Z end.
  fbox(B, F, 0.66, 0.06, 1.25, 0, 0.3, -0.3, frameCol);
  fbox(B, F, 0.6, 0.07, 1.2, 0, 0.36, -0.3, cushion);
  // backrest, tilted
  const [X, Y, Z] = F.p(0, 0.62, 0.55);
  B.add(unit('box'), mtx(X, Y, Z, 0.95, F.yaw, 0, [0.6, 0.07, 0.75]), cushion);
  const [X2, Y2, Z2] = F.p(0, 0.6, 0.6);
  B.add(unit('box'), mtx(X2, Y2, Z2, 0.95, F.yaw, 0, [0.66, 0.05, 0.8]), frameCol);
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.85, 0.3]) fbox(B, F, 0.05, 0.3, 0.05, sx, 0.15, sz, frameCol);
}

export function towel(B, F, a, b) {
  fbox(B, F, 0.9, 0.02, 1.8, 0, 0.012, 0, a);
  fbox(B, F, 0.91, 0.025, 0.25, 0, 0.014, -0.45, b);
  fbox(B, F, 0.91, 0.025, 0.25, 0, 0.014, 0.45, b);
}

export function cooler(B, F, col) {
  fbox(B, F, 0.6, 0.38, 0.4, 0, 0.19, 0, col);
  fbox(B, F, 0.62, 0.08, 0.42, 0, 0.41, 0, '#f4f4f4');
  fbox(B, F, 0.3, 0.04, 0.05, 0, 0.47, 0, '#dddddd');
}

export function beachBag(B, F, col) {
  fbox(B, F, 0.45, 0.35, 0.18, 0, 0.18, 0, col);
  frod(B, F, [-0.15, 0.35, 0], [0, 0.55, 0], 0.015, col);
  frod(B, F, [0.15, 0.35, 0], [0, 0.55, 0], 0.015, col);
}

export function surfboardInto(B, F, col, stripe, tilt = 0) {
  // upright, stuck in sand; local y up; board face along Z
  const [X, Y, Z] = F.p(0, 0.85, 0);
  B.add(unit('sphere'), mtx(X, Y, Z, 0, F.yaw, tilt, [0.52, 2.1, 0.08]), (x) => (Math.abs(x) < 0.06 ? stripe : col));
}

export function sandcastle(B, F) {
  const c = '#d9b27a', d = '#c99c62';
  fbox(B, F, 1.3, 0.22, 1.3, 0, 0.11, 0, d);
  fcyl(B, F, 0.3, 0.55, 0, 0.45, 0, c);
  B.add(unit('cone'), mtx(...F.p(0, 0.85, 0), 0, 0, 0, [0.5, 0.3, 0.5]), c);
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    fcyl(B, F, 0.15, 0.4, x, 0.35, z, c);
    B.add(unit('cone'), mtx(...F.p(x, 0.62, z), 0, 0, 0, [0.26, 0.18, 0.26]), c);
  }
  // little flag
  frod(B, F, [0, 1.0, 0], [0, 1.35, 0], 0.01, '#ffffff');
  fbox(B, F, 0.18, 0.1, 0.01, 0.09, 1.3, 0, '#ff5f8f');
  // bucket + spade
  fcyl(B, F, 0.12, 0.2, 0.9, 0.1, 0.3, '#2ec4d6');
  fbox(B, F, 0.08, 0.02, 0.35, 0.95, 0.03, -0.3, '#ffd23f', 0.4);
}

export function bench(B, F, col = '#2ec4d6') {
  // along local X, sitters face +Z
  for (let i = 0; i < 3; i++) fbox(B, F, 1.8, 0.05, 0.12, 0, 0.45, -0.15 + i * 0.14, '#c79a6a');
  for (let i = 0; i < 2; i++) fbox(B, F, 1.8, 0.1, 0.04, 0, 0.62 + i * 0.16, -0.26, '#c79a6a', 0, -0.15);
  for (const sx of [-0.75, 0.75]) {
    fbox(B, F, 0.07, 0.45, 0.45, sx, 0.22, -0.05, col);
    fbox(B, F, 0.07, 0.45, 0.06, sx, 0.68, -0.28, col);
  }
}

export function planter(B, F, pot = '#ff8fab', plant = '#3f9a55') {
  fbox(B, F, 0.9, 0.55, 0.9, 0, 0.275, 0, pot);
  fbox(B, F, 0.8, 0.05, 0.8, 0, 0.56, 0, '#6b4a2e');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const [X, Y, Z] = F.p(Math.cos(a) * 0.18, 0.8, Math.sin(a) * 0.18);
    B.add(unit('sphere'), mtx(X, Y, Z, 0, 0, 0, [0.42, 0.55, 0.42]), i % 2 ? plant : '#57b86a');
  }
}

export function lampPost(B, E, F, globe = '#fff0c8', pole = '#1f6f78') {
  fcyl(B, F, 0.1, 0.3, 0, 0.15, 0, pole, 'cyl6');
  fcyl(B, F, 0.055, 3.9, 0, 2.05, 0, pole, 'cyl6');
  fbox(B, F, 0.9, 0.05, 0.05, 0, 3.9, 0, pole);
  for (const sx of [-0.42, 0.42]) {
    const [X, Y, Z] = F.p(sx, 3.72, 0);
    E.add(unit('sphere'), mtx(X, Y, Z, 0, 0, 0, 0.3), globe);
    fcyl(B, F, 0.06, 0.12, sx, 3.9, 0, pole, 'cyl6');
  }
}

export function duneGrass(B, x, y, z, r) {
  const g = new THREE.BufferGeometry();
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU, h = 0.35 + r() * 0.45, lean = 0.15 + r() * 0.2;
    const bx = Math.cos(a) * 0.12, bz = Math.sin(a) * 0.12;
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    const px = -Math.sin(a) * 0.035, pz = Math.cos(a) * 0.035;
    arr.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    arr.push(bx + px, 0, bz + pz, bx - px, 0, bz - pz, tx, h, tz);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  B.add(g, mtx(x, y, z, 0, r() * TAU, 0, 0.8 + r() * 0.6), (px, py) => (py > 0.2 ? '#b9b86a' : '#7f9a4c'));
  g.dispose();
}

// ------------------------------------------------------------------ boardwalk railing
export function railing(B, E, { z, x0, x1, y, gaps = [], bulbs = null }) {
  const post = '#e9dcc4', rail = '#d8c3a0';
  const inGap = (x) => gaps.some(([a, b]) => x > a && x < b);
  for (let x = x0; x <= x1 + 1e-3; x += 2) {
    if (inGap(x)) continue;
    B.box(0.14, 1.05, 0.14, x, y + 0.52, z, post);
    B.box(0.18, 0.06, 0.18, x, y + 1.07, z, post);
  }
  // rails between gaps
  const segs = [];
  let a = x0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { segs.push([a, g0]); a = g1; }
  segs.push([a, x1]);
  for (const [s0, s1] of segs) {
    const L = s1 - s0; if (L < 0.5) continue;
    const cx = (s0 + s1) / 2;
    B.box(L, 0.08, 0.12, cx, y + 1.0, z, rail);
    B.box(L, 0.05, 0.05, cx, y + 0.55, z, rail);
    if (bulbs) {
      for (let x = s0 + 0.5; x < s1; x += 1.0) bulbs.push([x, y + 1.08 + 0.05, z]);
    }
  }
}

// ------------------------------------------------------------------ lifeguard tower (procedural)
export function lifeguardTower(B, F, { hut = '#ff8fb1', trim = '#2ec4d6', accent = '#ffd23f' } = {}) {
  const wood = '#efe3cf';
  const P = 1.9; // platform height
  for (const sx of [-1.1, 1.1]) for (const sz of [-1.1, 1.1]) frod(B, F, [sx * 1.08, 0, sz * 1.08], [sx, P, sz], 0.09, wood);
  frod(B, F, [-1.1, 0.4, 1.1], [1.1, 1.5, 1.1], 0.05, wood);
  frod(B, F, [1.1, 0.4, 1.1], [-1.1, 1.5, 1.1], 0.05, wood);
  fbox(B, F, 3.0, 0.14, 3.0, 0, P, 0, wood);
  // hut with pastel stripes
  const hw = 2.1, hd = 1.8, hh = 1.7, hy = P + 0.07 + hh / 2;
  fbox(B, F, hw, hh, hd, 0, hy, -0.35, hut);
  for (let i = 0; i < 3; i++) fbox(B, F, hw + 0.02, 0.12, hd + 0.02, 0, P + 0.35 + i * 0.5, -0.35, i === 1 ? accent : trim);
  // window (front = +Z)
  fbox(B, F, 1.4, 0.6, 0.04, 0, hy + 0.25, -0.35 + hd / 2 + 0.01, '#23394a');
  fbox(B, F, 1.5, 0.08, 0.06, 0, hy - 0.08, -0.35 + hd / 2 + 0.02, trim);
  // roof (overhanging, slanted)
  fbox(B, F, hw + 0.7, 0.12, hd + 1.1, 0, P + hh + 0.22, -0.2, trim, 0, -0.12);
  fbox(B, F, hw + 0.72, 0.05, hd + 1.12, 0, P + hh + 0.3, -0.2, accent, 0, -0.12);
  // front railing
  for (const sx of [-1.4, -0.47, 0.47, 1.4]) fbox(B, F, 0.07, 0.8, 0.07, sx, P + 0.47, 1.42, wood);
  fbox(B, F, 2.9, 0.07, 0.08, 0, P + 0.86, 1.42, trim);
  // ramp to the back
  const [ax, ay, az] = F.p(0, P / 2, -3.1);
  B.add(unit('box'), mtx(ax, ay, az, -Math.atan2(P, 3.0), F.yaw, 0, [1.0, 0.1, Math.hypot(P, 3.0) + 0.2]), wood);
  // rescue buoy + flag pole
  fcyl(B, F, 0.13, 0.75, 1.25, P + 0.5, 1.45, '#ff3b30');
  frod(B, F, [-1.4, P, 1.4], [-1.4, P + 3.2, 1.4], 0.035, '#ffffff');
  return { flagAt: F.p(-1.4, P + 3.0, 1.4), standAt: F.p(0.3, P + 0.07, 0.9) };
}

// ------------------------------------------------------------------ volleyball net
export function volleyballNet(B, F) {
  const pole = '#e8e8e8';
  for (const sx of [-4.3, 4.3]) fcyl(B, F, 0.06, 2.5, sx, 1.25, 0, pole, 'cyl6');
  fbox(B, F, 8.6, 0.07, 0.03, 0, 2.38, 0, '#ffffff');
  fbox(B, F, 8.6, 0.04, 0.02, 0, 1.52, 0, '#ffffff');
  for (let x = -4.2; x <= 4.21; x += 0.3) fbox(B, F, 0.015, 0.86, 0.015, x, 1.95, 0, '#20262e');
  for (let y = 1.6; y < 2.35; y += 0.25) fbox(B, F, 8.5, 0.015, 0.015, 0, y, 0, '#20262e');
  // court lines
  for (const sz of [-4.2, 4.2]) fbox(B, F, 8.6, 0.02, 0.07, 0, 0.012, sz, '#2ec4d6');
  for (const sx of [-4.3, 4.3]) fbox(B, F, 0.07, 0.02, 8.4, sx, 0.012, 0, '#2ec4d6');
}

// ------------------------------------------------------------------ food cart / speaker / cabana
export function foodCart(B, E, S, F, canopyA = '#ff5f8f', canopyB = '#fff4e0') {
  const body = '#fff4e0';
  fbox(B, F, 1.9, 0.9, 1.0, 0, 0.75, 0, body);
  fbox(B, F, 1.92, 0.18, 1.02, 0, 0.36, 0, '#2ec4d6');
  fbox(B, F, 2.0, 0.06, 1.1, 0, 1.22, 0, '#b88a5a');
  for (const sx of [-0.7, 0.7]) {
    const [X, Y, Z] = F.p(sx, 0.3, 0.52);
    B.add(unit('cyl'), mtx(X, Y, Z, Math.PI / 2, F.yaw, 0, [0.52, 0.08, 0.52]), '#2b2d42');
  }
  for (const sx of [-0.9, 0.9]) frod(B, F, [sx, 1.2, -0.4], [sx, 2.25, -0.4], 0.03, '#dddddd');
  // striped canopy
  for (let i = 0; i < 8; i++) {
    const x = -1.05 + i * 0.3 + 0.15;
    fbox(B, F, 0.3, 0.05, 1.5, x, 2.3, -0.1, i % 2 ? canopyA : canopyB, 0, 0.12);
  }
  // goodies on the counter
  for (let i = 0; i < 4; i++) fcyl(B, F, 0.07, 0.18, -0.6 + i * 0.4, 1.34, 0.25, ['#ffd23f', '#ff9f1c', '#7bdff2', '#ff6f91'][i]);
  signPlane(S, F, 'tacos', 1.7, 0.24, 0, 0.9, 0.52);
  // warm counter light strip
  const [X, Y, Z] = F.p(0, 2.2, 0.3);
  E.add(unit('box'), mtx(X, Y, Z, 0, F.yaw, 0, [1.8, 0.04, 0.04]), '#ffe2a8');
}

/** Speaker stack; returns the glowing ring mesh (own material, soft pulse). */
export function speakerStack(B, F, ringColor = '#29e3d6') {
  const cab = '#1c1a24';
  fbox(B, F, 0.8, 0.9, 0.6, 0, 0.45, 0, cab);
  fbox(B, F, 0.7, 0.7, 0.55, 0, 1.25, 0, cab);
  for (const [y, r] of [[0.45, 0.3], [1.25, 0.22], [1.52, 0.08]]) {
    const [X, Y, Z] = F.p(0, y, 0.31);
    B.add(unit('cyl'), mtx(X, Y, Z, Math.PI / 2, F.yaw, 0, [r * 2, 0.04, r * 2]), '#3a3a48');
  }
  const ringGeo = new THREE.TorusGeometry(0.31, 0.025, 6, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: ringColor });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  const [X, Y, Z] = F.p(0, 0.45, 0.33);
  ring.position.set(X, Y, Z); ring.rotation.y = F.yaw;
  return ring;
}

export function vipCabana(B, E, F, { gold = '#ffcf5a', orange = '#ff9f1c', cream = '#ffe29a' } = {}) {
  const w = 4.2, d = 3.2, h = 2.7;
  // raised platform + red carpet
  fbox(B, F, w + 0.4, 0.14, d + 0.4, 0, 0.07, 0, '#f4ecdf');
  fbox(B, F, 1.2, 0.02, 2.4, 0, 0.01, d / 2 + 1.3, '#c8102e');
  for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) fcyl(B, F, 0.07, h, sx, h / 2 + 0.14, sz, gold, 'cyl6');
  // striped roof (pyramid-ish: flat top + stripes)
  for (let i = 0; i < 9; i++) fbox(B, F, (w + 0.3) / 9, 0.12, d + 0.3, -w / 2 - 0.15 + (i + 0.5) * ((w + 0.3) / 9), h + 0.2, 0, i % 2 ? orange : cream);
  fbox(B, F, w + 0.34, 0.3, 0.05, 0, h + 0.05, d / 2 + 0.16, orange);
  // curtains tied at posts
  for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) fbox(B, F, 0.5, h - 0.2, 0.06, sx, h / 2 + 0.1, d / 2, '#fffaf0');
  fbox(B, F, w, h - 0.2, 0.05, 0, h / 2 + 0.1, -d / 2, '#fffaf0');
  // gold sofa facing +Z
  fbox(B, F, 2.4, 0.42, 0.9, 0, 0.35, -0.8, orange);
  fbox(B, F, 2.4, 0.7, 0.22, 0, 0.75, -1.2, orange);
  for (const sx of [-1.25, 1.25]) fbox(B, F, 0.18, 0.62, 0.9, sx, 0.45, -0.8, gold);
  fbox(B, F, 2.6, 0.08, 0.26, 0, 1.12, -1.2, gold);
  // champagne table + bucket
  fcyl(B, F, 0.35, 0.05, 0, 0.55, 0.35, gold);
  fcyl(B, F, 0.05, 0.4, 0, 0.33, 0.35, gold, 'cyl6');
  fcyl(B, F, 0.12, 0.2, 0, 0.68, 0.35, '#e0e0e0');
  frod(B, F, [0.03, 0.7, 0.35], [0.1, 0.95, 0.4], 0.025, '#1f5a2c');
  // warm glow strip along the roof edge
  const [X, Y, Z] = F.p(0, h - 0.02, d / 2 + 0.18);
  E.add(unit('box'), mtx(X, Y, Z, 0, F.yaw, 0, [w, 0.04, 0.04]), cream);
  return { sofa: F.p(0, 0, -0.55), guards: [F.p(-w / 2 - 0.6, 0, d / 2 + 0.3), F.p(w / 2 + 0.6, 0, d / 2 + 0.3)] };
}

// ------------------------------------------------------------------ storefront row (strip mall)
const FACADES = ['#ffb3c7', '#9ee6d0', '#c9b6ff', '#ffd6a5', '#8fdcf0', '#fff0a8', '#ffc4a8', '#b8f0b0'];
const AWNINGS = [['#ff5f8f', '#fff4e0'], ['#2ec4d6', '#ffffff'], ['#7a5cff', '#fff4e0'], ['#ff9f1c', '#fff4e0'], ['#1f6f78', '#e9fbff'], ['#ff6f61', '#fff4e0']];
const SHOP_SIGNS = ['surf', 'ice', 'pawn', 'tattoo', 'arcade', 'tacos'];

export function storefronts(B, E, S, { z0, x0, x1, y, time, r, winLit }) {
  const neonMap = { surf: '#2ee6d6', ice: '#ff7ab8', pawn: '#ffd23f', tattoo: '#b06cff', arcade: '#44f0ff', tacos: '#ff9f1c' };
  const winDay = '#9fd6e4', winLitCol = '#ffd9a0';
  let x = x0, i = 0;
  const signsOut = [];
  while (x < x1 - 3) {
    const w = 8.5 + r() * 3;
    const cx = x + w / 2;
    const F = frame(cx, y, z0, Math.PI); // local +Z faces the board (-Z world)
    const col = FACADES[i % FACADES.length];
    const floors = 2 + (i % 3 === 1 ? 1 : 0);
    const H = floors * 3.3 + 0.5;
    const d = 7;
    // body (local: front face at z=0, building extends to -d)
    fbox(B, F, w - 0.15, H, d, 0, H / 2, -d / 2, col);
    // cornice + base band
    fbox(B, F, w + 0.05, 0.35, 0.3, 0, H - 0.1, 0.1, '#fff8ee');
    fbox(B, F, w - 0.1, 0.5, 0.12, 0, 0.25, 0.05, '#f4ecdf');
    // art-deco fins / eyebrows
    if (i % 2 === 0) {
      for (const sx of [-w / 2 + 0.6, w / 2 - 0.6]) fbox(B, F, 0.3, H + 0.8, 0.35, sx, (H + 0.8) / 2, 0.15, '#fff8ee');
    } else {
      fbox(B, F, 1.4, 1.2, 0.3, 0, H + 0.5, 0.1, col);
      fbox(B, F, 1.5, 0.15, 0.35, 0, H + 1.1, 0.1, '#fff8ee');
    }
    // ground floor: shop window + door
    const lit = winLit;
    E.add(unit('box'), mtx(...F.p(-0.9, 1.55, 0.03), 0, F.yaw, 0, [w - 3.2, 2.0, 0.05]), lit ? winLitCol : winDay);
    fbox(B, F, w - 3.0, 0.1, 0.1, -0.9, 0.52, 0.08, '#fff8ee');
    fbox(B, F, w - 3.0, 0.1, 0.1, -0.9, 2.58, 0.08, '#fff8ee');
    for (let k = 0; k < 3; k++) fbox(B, F, 0.06, 2.0, 0.08, -0.9 - (w - 3.2) / 2 + ((w - 3.2) / 2) * k, 1.55, 0.08, '#fff8ee');
    // door
    const dx = w / 2 - 1.1;
    fbox(B, F, 1.1, 2.3, 0.06, dx, 1.15, 0.03, '#2b3440');
    E.add(unit('box'), mtx(...F.p(dx, 1.35, 0.07), 0, F.yaw, 0, [0.8, 1.5, 0.02]), lit ? '#ffcf8a' : '#7fb8c8');
    // small neon "OPEN"-ish bar in window
    const nk = SHOP_SIGNS[i % SHOP_SIGNS.length];
    E.add(unit('box'), mtx(...F.p(-0.9 + (r() - 0.5) * 2, 2.25, 0.08), 0, F.yaw, 0, [1.2, 0.08, 0.04]), neonMap[nk]);
    // striped awning, sloping down toward the viewer
    const aw = AWNINGS[i % AWNINGS.length];
    const n = Math.round(w / 0.5);
    for (let k = 0; k < n; k++) {
      const sx = -w / 2 + 0.2 + (k + 0.5) * ((w - 0.4) / n);
      fbox(B, F, (w - 0.4) / n + 0.01, 0.05, 1.6, sx, 2.95, 0.75, k % 2 ? aw[0] : aw[1], 0, 0.38);
    }
    fbox(B, F, w - 0.4, 0.28, 0.04, 0, 2.58, 1.5, aw[0]);
    // upper floor windows
    for (let f = 1; f < floors; f++) {
      const wy = 3.3 * f + 1.6;
      const nw = Math.max(2, Math.floor(w / 2.6));
      for (let k = 0; k < nw; k++) {
        const wx = -w / 2 + (k + 0.5) * (w / nw);
        const on = lit ? r() < 0.55 : false;
        E.add(unit('box'), mtx(...F.p(wx, wy, 0.03), 0, F.yaw, 0, [1.2, 1.4, 0.04]), on ? '#ffc98a' : (lit ? '#2b3558' : '#87c6d8'));
        fbox(B, F, 1.4, 0.12, 0.2, wx, wy - 0.76, 0.1, '#fff8ee');
        if (f === 1 && k % 2 === 0) { // little balcony
          fbox(B, F, 1.6, 0.08, 0.6, wx, wy - 0.8, 0.35, '#fff8ee');
          fbox(B, F, 1.6, 0.5, 0.04, wx, wy - 0.52, 0.64, aw[0]);
        }
      }
    }
    // shop sign above awning
    signPlane(S, F, nk, Math.min(w - 1.5, 5.2), 0.66, 0, 3.55, 0.12);
    signsOut.push({ x: cx, key: nk });
    // rooftop details: AC box, antenna
    fbox(B, F, 1.2, 0.7, 1.0, (r() - 0.5) * (w - 3), H + 0.35, -3, '#d8d8d8');
    x += w;
    i++;
  }
  return signsOut;
}

// ------------------------------------------------------------------ pier
/** Pier along -Z starting at the boardwalk edge. Returns lamp / bulb positions and the deck height at the far end. */
export function pier(B, E, S, { x, zStart, zEnd, deckY, topY, rampTo, waterY, width = 7, lamps = [] }) {
  const wood = '#b98e62', wood2 = '#a57a52', rail = '#f2eadb';
  const hw = width / 2;
  const yAt = (z) => (z > rampTo ? deckY + (topY - deckY) * ((zStart - z) / (zStart - rampTo)) : topY);
  // deck in 2 m segments (ramp + flat)
  for (let z = zStart; z > zEnd; z -= 2) {
    const zc = z - 1;
    const y0 = yAt(z), y1 = yAt(z - 2);
    const slope = Math.atan2(y0 - y1, 2);
    B.add(unit('box'), mtx(x, (y0 + y1) / 2 - 0.1, zc, -slope, 0, 0, [width, 0.2, 2.05]), (Math.round(z / 2) % 2) ? wood : wood2);
  }
  // piles every 4 m
  for (let z = zStart - 1.5; z > zEnd; z -= 4) {
    const top = yAt(z) - 0.2;
    for (const sx of [-hw + 0.3, 0, hw - 0.3]) B.cyl(0.17, top - (waterY - 3), x + sx, (top + waterY - 3) / 2, z, '#6e5238', 0, 0, 0, 'cyl6');
    B.box(width, 0.2, 0.2, x, top - 0.5, z, '#6e5238');
  }
  // railings + lamp posts
  for (const sx of [-hw + 0.1, hw - 0.1]) {
    for (let z = zStart - 0.5; z > zEnd; z -= 2) B.box(0.1, 1.0, 0.1, x + sx, yAt(z) + 0.5, z, rail);
    for (let z = zStart; z > zEnd; z -= 2) {
      const y0 = yAt(z), y1 = yAt(z - 2);
      B.add(unit('box'), mtx(x + sx, (y0 + y1) / 2 + 1.0, z - 1, -Math.atan2(y0 - y1, 2), 0, 0, [0.1, 0.08, 2.02]), rail);
    }
    for (let z = zStart - 6; z > zEnd; z -= 10) {
      const F = frame(x + sx, yAt(z), z, 0);
      fcyl(B, F, 0.06, 3.4, 0, 1.7, 0, '#1f6f78', 'cyl6');
      E.add(unit('sphere'), mtx(x + sx, yAt(z) + 3.5, z, 0, 0, 0, 0.36), '#fff0c8');
      lamps.push([x + sx, yAt(z) + 3.5, z]);
    }
  }
  // entrance arch with sign
  const F = frame(x, deckY, zStart - 0.4, 0);
  for (const sx of [-hw - 0.2, hw + 0.2]) {
    fbox(B, F, 0.6, 5.2, 0.6, sx, 2.6, 0, '#fff4e0');
    fbox(B, F, 0.75, 0.3, 0.75, sx, 5.3, 0, '#ff6f91');
    B.add(unit('sphere'), mtx(...F.p(sx, 5.7, 0), 0, 0, 0, 0.5), '#2ec4d6');
  }
  fbox(B, F, width + 1.2, 1.3, 0.35, 0, 4.4, 0, '#e8546a');
  signPlane(S, F, 'pier', width + 0.6, 1.0, 0, 4.4, 0.19);
  signPlane(S, F, 'pier', width + 0.6, 1.0, 0, 4.4, -0.19, Math.PI);
  // booths near the far end
  const booths = [];
  for (let k = 0; k < 4; k++) {
    const z = rampTo - 8 - k * 7;
    const side = k % 2 ? 1 : -1;
    const Fb = frame(x + side * (hw - 1.1), topY, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    fbox(B, Fb, 2.0, 2.2, 1.6, 0, 1.1, 0, FACADES[(k * 3) % FACADES.length]);
    for (let s = 0; s < 5; s++) fbox(B, Fb, 0.44, 0.06, 2.0, -0.88 + s * 0.44, 2.4, 0.2, s % 2 ? '#ff5f8f' : '#fff4e0', 0, 0.2);
    E.add(unit('box'), mtx(...Fb.p(0, 1.3, 0.81), 0, Fb.yaw, 0, [1.4, 0.7, 0.03]), '#ffe0a8');
    booths.push([x + side * (hw - 1.1), z]);
  }
  return { yAt, booths };
}

// ------------------------------------------------------------------ ferris wheel (procedural fallback)
/**
 * Holder (local origin on the deck, disc in the local YZ plane, spinning around local X). Returns
 * { root, wheel, gondolas: InstancedMesh, hubY, radius, n, bulbs: Points }.
 */
export function ferrisWheel({ gondolaColors, bulbTex, time, mat }) {
  const root = new THREE.Group(); root.name = 'ferris';
  const R = 10.5, H = 13.2, N = 12;
  // static frame
  const S = new Batch();
  const F = frame(0, 0, 0, 0);
  const white = '#f5f1ea', teal = '#1f9aa8';
  for (const sx of [-1, 1]) {
    frod(S, F, [sx * 2.2, 0, -5.2], [sx * 0.75, H, 0], 0.22, white);
    frod(S, F, [sx * 2.2, 0, 5.2], [sx * 0.75, H, 0], 0.22, white);
    frod(S, F, [sx * 2.0, 3.5, -3.9], [sx * 2.0, 3.5, 3.9], 0.1, white);
  }
  S.add(unit('cyl'), mtx(0, H, 0, 0, 0, Math.PI / 2, [0.6, 2.2, 0.6]), '#e8546a');
  fbox(S, F, 5.5, 0.6, 11.5, 0, 0.3, 0, '#e9dcc4');
  fbox(S, F, 1.6, 2.2, 1.6, 0, 1.4, 6.6, '#ff8fb1'); // ticket booth
  fbox(S, F, 2.0, 0.15, 2.0, 0, 2.55, 6.6, teal);
  const frameMesh = S.build(mat, { name: 'ferris_frame' });
  root.add(frameMesh);

  // spinning wheel
  const wheel = new THREE.Group(); wheel.position.y = H; wheel.name = 'Wheel';
  const W = new Batch();
  const ringGeo = new THREE.TorusGeometry(R, 0.14, 5, 64); ringGeo.rotateY(Math.PI / 2);
  const ring2 = new THREE.TorusGeometry(R * 0.62, 0.08, 4, 48); ring2.rotateY(Math.PI / 2);
  for (const sx of [-0.65, 0.65]) {
    W.add(ringGeo, mtx(sx, 0, 0), white);
    W.add(ring2, mtx(sx, 0, 0), '#ff8fb1');
  }
  ringGeo.dispose(); ring2.dispose();
  const spokes = 24;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    const c = Math.cos(a) * R, s = Math.sin(a) * R;
    for (const sx of [-0.65, 0.65]) W.rod([sx * 0.3, 0, 0], [sx, s, c], 0.045, i % 2 ? white : teal);
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    W.rod([-0.7, Math.sin(a) * R, Math.cos(a) * R], [0.7, Math.sin(a) * R, Math.cos(a) * R], 0.06, white);
  }
  W.add(unit('cyl'), mtx(0, 0, 0, 0, 0, Math.PI / 2, [1.4, 1.6, 1.4]), '#ffd23f');
  const wheelMesh = W.build(mat, { name: 'ferris_wheel' });
  wheelMesh.matrixAutoUpdate = true;
  wheel.add(wheelMesh);
  root.add(wheel);

  // bulbs along both rims + spokes (rotate with the wheel)
  const pos = [], col = [];
  const palette = [new THREE.Color('#fff1c4'), new THREE.Color('#ff7ab8'), new THREE.Color('#5ff0ff')];
  const nb = 72;
  for (const sx of [-0.66, 0.66]) {
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU;
      pos.push(sx, Math.sin(a) * (R + 0.05), Math.cos(a) * (R + 0.05));
      const c = palette[Math.floor(i / 3) % 3]; col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    for (let k = 1; k <= 4; k++) {
      const rr = (k / 5) * R;
      pos.push(0.66, Math.sin(a) * rr, Math.cos(a) * rr);
      const c = palette[0]; col.push(c.r, c.g, c.b);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const night = time === 'night';
  const bm = new THREE.PointsMaterial({
    size: night ? 0.9 : 0.55, map: bulbTex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: night ? 1 : time === 'day' ? 0.35 : 0.75, sizeAttenuation: true,
  });
  const bulbs = new THREE.Points(bg, bm);
  bulbs.frustumCulled = false;
  wheel.add(bulbs);

  // gondolas (instanced, kept upright, hang below the rim point)
  const G = new Batch();
  const gF = frame(0, 0, 0, 0);
  frod(G, gF, [0, 0, 0], [0, -0.7, 0], 0.04, '#dddddd');
  G.add(unit('cyl'), mtx(0, -1.45, 0, 0, 0, 0, [1.5, 1.2, 1.5]), '#ffffff');
  G.add(unit('cone'), mtx(0, -0.62, 0, 0, 0, 0, [1.8, 0.45, 1.8]), '#ffffff');
  G.add(unit('cyl'), mtx(0, -1.2, 0, 0, 0, 0, [1.53, 0.35, 1.53]), '#3a3a48'); // window band
  const gGeo = (() => { const m = G.build(mat); const g = m.geometry; return g; })();
  const gMat = mat.clone();
  const gondolas = new THREE.InstancedMesh(gGeo, gMat, N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) gondolas.setColorAt(i, c.set(gondolaColors[i % gondolaColors.length]));
  gondolas.castShadow = true;
  gondolas.frustumCulled = false;
  root.add(gondolas);
  return { root, wheel, gondolas, hubY: H, radius: R, n: N, bulbs };
}

// ------------------------------------------------------------------ small animated things
export function gullGeometry() {
  const B = new Batch();
  const g = new THREE.BufferGeometry();
  // body along +Z (forward), wings spread along X with a gentle M shape
  const w = [
    0, 0, 0.1, -0.35, 0.08, 0.0, 0, 0, -0.15,
    0, 0, 0.1, 0, 0, -0.15, 0.35, 0.08, 0.0,
    -0.35, 0.08, 0.0, -0.7, -0.02, -0.12, -0.3, 0.06, -0.14,
    0.35, 0.08, 0.0, 0.3, 0.06, -0.14, 0.7, -0.02, -0.12,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
  g.computeVertexNormals();
  B.add(g, null, (x) => (Math.abs(x) > 0.55 ? '#5b5f66' : '#f7f7f2'));
  B.add(unit('sphere'), mtx(0, 0, 0, 0, 0, 0, [0.12, 0.1, 0.4]), '#f7f7f2');
  B.add(unit('cone'), mtx(0, 0, 0.24, Math.PI / 2, 0, 0, [0.04, 0.1, 0.04]), '#ffb03a');
  g.dispose();
  const mesh = B.build(new THREE.MeshBasicMaterial());
  const geo = mesh.geometry; mesh.material.dispose();
  // double-sided look without DoubleSide: duplicate reversed triangles
  return geo;
}

export function sailboat(mat) {
  const B = new Batch();
  B.add(unit('sphere'), mtx(0, 0.2, 0, 0, 0, 0, [1.6, 0.8, 5.2]), '#ffffff');
  B.box(1.4, 0.2, 3.6, 0, 0.55, 0, '#1f6f78');
  B.rod([0, 0.5, 0.4], [0, 7.5, 0.4], 0.07, '#dddddd');
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, 0.5, 0, 7.3, 0.5, 0, 1.2, -2.2, 0, 1.2, 0.5, 0, 1.2, -2.2, 0, 7.3, 0.5], 3));
  sail.computeVertexNormals();
  B.add(sail, null, (x, y) => (y > 5 ? '#ff6f91' : y > 3.2 ? '#ffd23f' : '#fff8ee'));
  const sail2 = new THREE.BufferGeometry();
  sail2.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, 0.8, 0, 6.8, 0.6, 0, 1.2, 2.4, 0, 1.2, 0.8, 0, 1.2, 2.4, 0, 6.8, 0.6], 3));
  sail2.computeVertexNormals();
  B.add(sail2, null, '#fff8ee');
  sail.dispose(); sail2.dispose();
  return B.build(mat, { name: 'sailboat', shadow: false });
}

export function floatToys(mat) {
  const B = new Batch();
  // flamingo ring
  const tor = new THREE.TorusGeometry(0.55, 0.22, 8, 18); tor.rotateX(Math.PI / 2);
  B.add(tor, mtx(0, 0, 0), '#ff7ab8');
  B.rod([0, 0.1, 0.55], [0, 0.95, 0.75], 0.08, '#ff7ab8', 'cyl');
  B.add(unit('sphere'), mtx(0, 1.0, 0.82, 0, 0, 0, [0.26, 0.24, 0.34]), '#ff7ab8');
  B.add(unit('cone'), mtx(0, 0.95, 1.02, Math.PI / 2, 0, 0, [0.08, 0.2, 0.08]), '#2b2d42');
  // donut ring nearby
  const tor2 = new THREE.TorusGeometry(0.45, 0.18, 8, 16); tor2.rotateX(Math.PI / 2);
  B.add(tor2, mtx(2.4, 0, -1.2), (x, y) => (y > 0.08 ? '#ff9ec7' : '#f6d6a8'));
  tor.dispose(); tor2.dispose();
  return B.build(mat, { name: 'floats', shadow: false });
}

export function swimmerGeometry(mat) {
  const B = new Batch();
  B.add(unit('sphere'), mtx(0, 0.14, 0, 0, 0, 0, [0.26, 0.28, 0.26]), '#e0ac69');
  B.add(unit('hemi'), mtx(0, 0.17, -0.01, 0, 0, 0, [0.28, 0.22, 0.28]), '#2b1d14');
  B.add(unit('sphere'), mtx(0, -0.05, 0, 0, 0, 0, [0.62, 0.22, 0.34]), '#e0ac69');
  const m = B.build(mat);
  return m.geometry;
}

export function beachBall(r = 0.18) {
  const g = new THREE.SphereGeometry(r, 12, 8);
  const B = new Batch();
  B.add(g, null, (x, y, z) => {
    if (Math.abs(y) > r * 0.85) return '#ffffff';
    const a = Math.atan2(z, x);
    return ['#ff5f8f', '#ffd23f', '#2ec4d6', '#ffffff', '#ff9f1c', '#5b8cff'][Math.floor(((a + Math.PI) / TAU) * 6) % 6];
  });
  g.dispose();
  return B;
}

export function bonfire(B) {
  // logs + stones ring (static); flames added separately
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    B.add(unit('sphere'), mtx(Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.75, 0, a, 0, [0.28, 0.2, 0.24]), '#8b8378');
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    B.rod([Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [-Math.cos(a) * 0.5, 0.18, -Math.sin(a) * 0.5], 0.07, '#5a3a22');
  }
}
