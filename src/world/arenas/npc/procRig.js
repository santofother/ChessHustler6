// Procedural fallback people for NpcCrowd: a low-poly human (head, hair, torso, arms with elbows, legs, shoes)
// built as ONE skinned mesh per body type on a 17-bone skeleton that uses the same bone names as the Blender NPC
// rig (hips/spine/chest/neck/head, upperarm_L/lowerarm_L/hand_L, upperleg_L/lowerleg_L/foot_L, …_R), plus
// generated looping AnimationClips for every spec animation. Character faces −Z, right hand = +X (like the GLBs).
// Everything here is built once per session and flagged userData.shared (NpcCrowd never disposes it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ colour roles (per-vertex, resolved per NPC)
export const ROLE = { TOP: 0, BOTTOM: 1, SKIN: 2, HAIR: 3, SHOES: 4, ACCENT: 5, FOREARM: 6, SHIN: 7, EYES: 8 };
export const ROLE_COUNT = 9;

const BONE_ORDER = ['hips', 'spine', 'chest', 'neck', 'head',
  'upperarm_L', 'lowerarm_L', 'hand_L', 'upperarm_R', 'lowerarm_R', 'hand_R',
  'upperleg_L', 'lowerleg_L', 'foot_L', 'upperleg_R', 'lowerleg_R', 'foot_R'];
const BI = Object.fromEntries(BONE_ORDER.map((n, i) => [n, i]));

const HIPS_Y = 0.93;

function boneDefs(sh) {
  return [
    ['hips', null, [0, HIPS_Y, 0]], ['spine', 'hips', [0, 0.1, 0]], ['chest', 'spine', [0, 0.2, 0]],
    ['neck', 'chest', [0, 0.2, 0]], ['head', 'neck', [0, 0.08, 0]],
    ['upperarm_L', 'chest', [-sh, 0.16, 0]], ['lowerarm_L', 'upperarm_L', [0, -0.28, 0]], ['hand_L', 'lowerarm_L', [0, -0.25, 0]],
    ['upperarm_R', 'chest', [sh, 0.16, 0]], ['lowerarm_R', 'upperarm_R', [0, -0.28, 0]], ['hand_R', 'lowerarm_R', [0, -0.25, 0]],
    ['upperleg_L', 'hips', [-0.1, -0.02, 0]], ['lowerleg_L', 'upperleg_L', [0, -0.42, 0]], ['foot_L', 'lowerleg_L', [0, -0.42, 0]],
    ['upperleg_R', 'hips', [0.1, -0.02, 0]], ['lowerleg_R', 'upperleg_R', [0, -0.42, 0]], ['foot_R', 'lowerleg_R', [0, -0.42, 0]],
  ];
}

// ------------------------------------------------------------------ geometry parts
class PartList {
  constructor() { this.geos = []; this.roles = []; }
  add(geo, bone, role, { pos = [0, 0, 0], rot = null, scale = null } = {}) {
    const g = geo.index ? geo : geo;
    if (scale) g.scale(...scale);
    if (rot) { g.rotateX(rot[0] || 0); g.rotateY(rot[1] || 0); g.rotateZ(rot[2] || 0); }
    g.translate(...pos);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = BI[bone]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (!g.index) g.setIndex([...Array(n).keys()]);
    this.geos.push(g);
    this.roles.push(new Uint8Array(n).fill(role));
  }
  build() {
    const geo = mergeGeometries(this.geos, false);
    this.geos.forEach((g) => g.dispose());
    const roles = new Uint8Array(geo.attributes.position.count);
    let o = 0;
    for (const r of this.roles) { roles.set(r, o); o += r.length; }
    geo.computeBoundingSphere();
    return { geometry: geo, roles };
  }
}

const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ball = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const cap = (r) => new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.52);

/** body: 'm'|'f'; style: hair/outfit variant index. */
function buildBody(body, style) {
  const f = body === 'f';
  const sh = f ? 0.17 : 0.2;
  const P = new PartList();
  const { TOP, BOTTOM, SKIN, HAIR, SHOES, ACCENT, FOREARM, SHIN, EYES } = ROLE;
  const skirt = f && style === 1;
  for (const [s, sx] of [['L', -1], ['R', 1]]) {
    const lx = sx * (f ? 0.095 : 0.1);
    // legs + shoes
    P.add(box(f ? 0.09 : 0.105, 0.075, f ? 0.21 : 0.24), 'foot_' + s, SHOES, { pos: [lx, 0.0375, -0.04] });
    P.add(box(f ? 0.085 : 0.1, 0.03, f ? 0.2 : 0.23), 'foot_' + s, ACCENT, { pos: [lx, 0.012, -0.04] }); // sole
    P.add(cyl(f ? 0.05 : 0.058, f ? 0.04 : 0.048, 0.44, 7), 'lowerleg_' + s, skirt ? SKIN : SHIN, { pos: [lx, 0.29, 0] });
    P.add(cyl(f ? 0.078 : 0.086, f ? 0.056 : 0.064, 0.44, 7), 'upperleg_' + s, skirt ? SKIN : BOTTOM, { pos: [lx, 0.7, 0] });
    // arms
    const ax = sx * sh;
    P.add(ball(f ? 0.062 : 0.074, 8, 6), 'upperarm_' + s, TOP, { pos: [ax * 0.96, 1.405, 0], scale: [1, 0.9, 1] });
    P.add(cyl(f ? 0.047 : 0.056, f ? 0.04 : 0.048, 0.28, 7), 'upperarm_' + s, TOP, { pos: [ax, 1.25, 0] });
    P.add(cyl(f ? 0.039 : 0.046, f ? 0.033 : 0.038, 0.25, 7), 'lowerarm_' + s, FOREARM, { pos: [ax, 0.985, 0] });
    P.add(box(f ? 0.045 : 0.052, f ? 0.09 : 0.1, 0.034), 'hand_' + s, SKIN, { pos: [ax, 0.81, -0.004] });
    // ears
    P.add(box(0.022, 0.045, 0.035), 'head', SKIN, { pos: [sx * (f ? 0.1 : 0.106), 1.615, 0.005] });
    // eyes
    P.add(box(0.026, 0.02, 0.012), 'head', EYES, { pos: [sx * 0.04, 1.643, f ? -0.097 : -0.102] });
  }
  // pelvis / belt / torso
  P.add(cyl(f ? 0.162 : 0.162, f ? 0.182 : 0.17, 0.18, 9), 'hips', BOTTOM, { pos: [0, 0.93, 0], scale: [1, 1, 0.68] });
  P.add(cyl(f ? 0.152 : 0.167, f ? 0.164 : 0.167, 0.035, 9), 'hips', ACCENT, { pos: [0, 1.02, 0], scale: [1, 1, 0.7] });
  if (skirt) P.add(cyl(0.17, 0.27, 0.34, 10), 'hips', BOTTOM, { pos: [0, 0.8, 0], scale: [1, 1, 0.78] });
  P.add(cyl(f ? 0.135 : 0.162, f ? 0.152 : 0.158, 0.2, 9), 'spine', TOP, { pos: [0, 1.12, 0], scale: [1, 1, 0.66] });
  P.add(cyl(f ? 0.165 : 0.205, f ? 0.138 : 0.166, 0.26, 9), 'chest', TOP, { pos: [0, 1.34, 0], scale: [1, 1, 0.62] });
  if (f) for (const sx of [-1, 1]) P.add(ball(0.056, 8, 6), 'chest', TOP, { pos: [sx * 0.056, 1.3, -0.07], scale: [1, 0.9, 0.8] });
  // neck + head
  P.add(cyl(f ? 0.045 : 0.052, f ? 0.05 : 0.06, 0.13, 7), 'neck', SKIN, { pos: [0, 1.47, 0] });
  const hr = f ? 0.106 : 0.112;
  P.add(new THREE.IcosahedronGeometry(hr, 1), 'head', SKIN, { pos: [0, 1.62, 0], scale: [0.92, 1.08, 1.0] });
  P.add(box(0.03, 0.045, 0.035), 'head', SKIN, { pos: [0, 1.603, -hr - 0.002] });
  // hair styles
  if (!f && style === 0) { // short crop
    P.add(cap(hr + 0.01), 'head', HAIR, { pos: [0, 1.638, 0.008], scale: [0.95, 0.85, 1.04] });
    P.add(box(0.19, 0.12, 0.07), 'head', HAIR, { pos: [0, 1.6, 0.07] });
  } else if (!f && style === 1) { // backwards-free cap with brim
    P.add(cap(hr + 0.018), 'head', ACCENT, { pos: [0, 1.648, 0.004], scale: [0.95, 0.8, 1.04] });
    P.add(box(0.17, 0.016, 0.11), 'head', ACCENT, { pos: [0, 1.672, -0.14], rot: [0.12, 0, 0] });
    P.add(box(0.18, 0.08, 0.07), 'head', HAIR, { pos: [0, 1.585, 0.07] });
  } else if (f && style === 0) { // long hair
    P.add(cap(hr + 0.014), 'head', HAIR, { pos: [0, 1.64, 0.01], scale: [0.98, 0.9, 1.06] });
    P.add(box(0.21, 0.3, 0.07), 'head', HAIR, { pos: [0, 1.49, 0.07], rot: [-0.08, 0, 0] });
    for (const sx of [-1, 1]) P.add(box(0.045, 0.2, 0.08), 'head', HAIR, { pos: [sx * 0.098, 1.555, 0.02] });
  } else { // ponytail
    P.add(cap(hr + 0.012), 'head', HAIR, { pos: [0, 1.64, 0.008], scale: [0.97, 0.88, 1.05] });
    P.add(ball(0.05, 7, 5), 'head', HAIR, { pos: [0, 1.66, 0.12] });
    P.add(cyl(0.036, 0.018, 0.24, 6), 'head', HAIR, { pos: [0, 1.52, 0.14], rot: [0.25, 0, 0] });
  }
  return { ...P.build(), sh };
}

// ------------------------------------------------------------------ skeleton template
function buildTemplate(body, style, material) {
  const { geometry, roles, sh } = buildBody(body, style);
  const root = new THREE.Group();
  root.name = 'npc_model';
  const bones = {};
  for (const [name, parent, pos] of boneDefs(sh)) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    (parent ? bones[parent] : root).add(b);
    bones[name] = b;
  }
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'npc_body';
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BONE_ORDER.map((n) => bones[n])));
  geometry.userData.shared = true;
  return { root, mesh, geometry, roles, body, style };
}

// ------------------------------------------------------------------ animation clips
const TAU = Math.PI * 2;
const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// Each clip: dur (s) and f(p, R, H) — p in [0,1); R(bone, x, y, z) sets a local Euler (rest = identity);
// H(x, y, z) offsets the hips from rest. All functions are periodic in p so the loops are seamless.
const CLIPS = {
  idle: { dur: 4, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p);
    H(0.012 * s1, 0.004 * s2, 0);
    R('hips', 0, 0, 0.022 * s1); R('spine', 0.012 * s2, 0, 0); R('chest', -0.012 * s2, 0.03 * s1, -0.018 * s1);
    R('head', 0.03 * s2, 0.22 * Math.sin(TAU * p + 0.6), 0.02 * s1);
    R('upperarm_L', 0.04, 0, -0.08 - 0.012 * s2); R('upperarm_R', 0.04, 0, 0.08 + 0.012 * s2);
    R('lowerarm_L', 0.16, 0, 0); R('lowerarm_R', 0.16, 0, 0);
    R('upperleg_L', 0, 0, -0.03 - 0.022 * s1); R('upperleg_R', 0, 0, 0.03 - 0.022 * s1);
  } },
  talk: { dur: 3, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p), s3 = Math.sin(TAU * 3 * p);
    H(0.008 * s1, 0.003 * s2, 0);
    R('hips', 0, 0, 0.015 * s1); R('chest', 0.03 * s3, 0.1 * s1, 0); R('head', 0.06 * s3, -0.14 * s1, 0.04 * s2);
    R('upperarm_R', 0.4 + 0.18 * s2, 0, 0.22 + 0.08 * s3); R('lowerarm_R', 1.15 + 0.35 * Math.sin(TAU * 2 * p + 0.7), 0, 0);
    R('hand_R', 0.25, 0, 0);
    R('upperarm_L', 0.25 + 0.16 * Math.sin(TAU * 2 * p + 2.1), 0, -0.2); R('lowerarm_L', 0.85 + 0.25 * Math.sin(TAU * 2 * p + 2.8), 0, 0);
    R('upperleg_L', 0, 0, -0.03); R('upperleg_R', 0, 0, 0.03);
  } },
  phone: { dur: 4, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p);
    H(0.012 * s1, 0.003 * s2, 0);
    R('hips', 0, 0, 0.02 * s1); R('chest', 0, 0.06 * s1, -0.02); R('head', 0.04 * s2, 0.12 * s1, 0.14);
    R('upperarm_R', 0.28, -0.3, 0.42); R('lowerarm_R', 2.45, 0, 0); R('hand_R', 0.1, 0, -0.2);
    R('upperarm_L', 0.05, 0, -0.42); R('lowerarm_L', 1.35, 0, 0.5);
    R('upperleg_L', 0, 0, -0.03 - 0.02 * s1); R('upperleg_R', 0, 0, 0.03 - 0.02 * s1);
  } },
  cheer: { dur: 1.2, f(p, R, H) {
    const s2 = Math.sin(TAU * 2 * p), b = (1 - Math.cos(TAU * 2 * p)) / 2;
    H(0, 0.045 * b, 0);
    R('chest', 0.06, 0, 0); R('head', 0.16 + 0.05 * s2, 0, 0);
    R('upperarm_L', 0.2, 0, -2.55 - 0.15 * s2); R('upperarm_R', 0.2, 0, 2.55 + 0.15 * s2);
    R('lowerarm_L', 0.3 + 0.3 * b, 0, 0); R('lowerarm_R', 0.3 + 0.3 * b, 0, 0);
    R('upperleg_L', 0.08 * (1 - b), 0, -0.04); R('upperleg_R', 0.08 * (1 - b), 0, 0.04);
    R('lowerleg_L', -0.16 * (1 - b), 0, 0); R('lowerleg_R', -0.16 * (1 - b), 0, 0);
  } },
  clap: { dur: 0.8, f(p, R, H) {
    const c = 0.5 + 0.5 * Math.cos(TAU * 2 * p); // 1 apart, 0 together
    H(0, 0.006 * c, 0);
    R('chest', -0.04, 0, 0); R('head', 0.04 * c, 0, 0);
    R('upperarm_L', 0.75, 0, 0.22 - 0.36 * c); R('upperarm_R', 0.75, 0, -0.22 + 0.36 * c);
    R('lowerarm_L', 1.05, 0, 0.35); R('lowerarm_R', 1.05, 0, -0.35);
    R('upperleg_L', 0, 0, -0.03); R('upperleg_R', 0, 0, 0.03);
  } },
  dance: { dur: 1.0, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p), b = (1 - Math.cos(TAU * 2 * p)) / 2;
    H(0.04 * s1, -0.045 * b, 0);
    R('hips', 0, 0.15 * s1, 0.08 * s1); R('chest', 0, -0.22 * s1, -0.1 * s1); R('head', 0.08 * s2, 0.1 * s1, 0.1 * s1);
    R('upperarm_L', 0.6 + 0.4 * s1, 0, -0.5); R('lowerarm_L', 1.4 + 0.3 * s2, 0, 0);
    R('upperarm_R', 0.6 - 0.4 * s1, 0, 0.5); R('lowerarm_R', 1.4 - 0.3 * s2, 0, 0);
    R('upperleg_L', 0.14 * b, 0, -0.06); R('upperleg_R', 0.14 * b, 0, 0.06);
    R('lowerleg_L', -0.28 * b, 0, 0); R('lowerleg_R', -0.28 * b, 0, 0);
    R('foot_L', 0.14 * b, 0, 0); R('foot_R', 0.14 * b, 0, 0);
  } },
  dance2: { dur: 0.9, f(p, R, H) {
    const s1 = Math.sin(TAU * p), b = (1 - Math.cos(TAU * 2 * p)) / 2;
    H(0.03 * s1, -0.04 * b, 0);
    R('hips', 0, 0.1 * s1, 0.06 * s1); R('chest', 0.04, -0.12 * s1, -0.08 * s1); R('head', 0.12 * b, 0, 0.08 * s1);
    R('upperarm_L', 0.3, 0, -2.2 - 0.35 * s1); R('upperarm_R', 0.3, 0, 2.2 - 0.35 * s1);
    R('lowerarm_L', 0.5 + 0.3 * b, 0, 0); R('lowerarm_R', 0.5 + 0.3 * b, 0, 0);
    R('upperleg_L', 0.12 * b, 0, -0.06); R('upperleg_R', 0.12 * b, 0, 0.06);
    R('lowerleg_L', -0.24 * b, 0, 0); R('lowerleg_R', -0.24 * b, 0, 0);
    R('foot_L', 0.12 * b, 0, 0); R('foot_R', 0.12 * b, 0, 0);
  } },
  lean: { dur: 5, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p);
    H(0, -0.03, 0.11);
    R('hips', 0.13, 0, 0); R('spine', -0.04 + 0.01 * s2, 0, 0); R('chest', -0.06, 0.04 * s1, 0);
    R('head', -0.08 + 0.03 * s2, 0.2 * Math.sin(TAU * p + 1.3), 0);
    R('upperarm_L', 0.35, 0, 0.1); R('lowerarm_L', 0.35, 0, 1.45);
    R('upperarm_R', 0.4, 0, -0.1); R('lowerarm_R', 0.3, 0, -1.4);
    R('upperleg_L', 0.05, 0, -0.04); R('upperleg_R', 0.12, 0, 0.02); R('lowerleg_R', -0.1, 0, 0);
    R('foot_L', -0.13, 0, 0); R('foot_R', -0.1, 0, 0);
  } },
  crossed: { dur: 5, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p);
    H(0.006 * s1, 0.003 * s2, 0);
    R('chest', 0.03 + 0.012 * s2, 0, 0); R('head', 0.02, 0.3 * Math.sin(TAU * p + 0.4), 0);
    R('upperarm_L', 0.35, 0, 0.1); R('lowerarm_L', 0.35, 0, 1.45);
    R('upperarm_R', 0.4, 0, -0.1); R('lowerarm_R', 0.3, 0, -1.4);
    R('upperleg_L', 0, 0, -0.07); R('upperleg_R', 0, 0, 0.07);
    R('foot_L', 0, 0, 0.07); R('foot_R', 0, 0, -0.07);
  } },
  sit: { dur: 4, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p);
    H(0, -0.4, 0.02);
    R('spine', -0.04 + 0.01 * s2, 0, 0); R('chest', -0.02, 0.05 * s1, 0); R('head', 0.02 * s2, 0.2 * Math.sin(TAU * p + 0.8), 0);
    R('upperleg_L', 1.52, 0, -0.06); R('upperleg_R', 1.52, 0, 0.06);
    R('lowerleg_L', -1.5, 0, 0); R('lowerleg_R', -1.5, 0, 0);
    R('upperarm_L', 0.42, 0, -0.1); R('upperarm_R', 0.42, 0, 0.1);
    R('lowerarm_L', 0.85, 0, 0); R('lowerarm_R', 0.85, 0, 0);
  } },
  sit_ground: { dur: 4, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p);
    H(0, -0.8, 0.06);
    R('spine', 0.1 + 0.01 * s2, 0, 0); R('chest', -0.12, 0, 0); R('head', -0.1, 0.22 * Math.sin(TAU * p + 0.8), 0.02 * s1);
    R('upperleg_L', 2.2, 0, -0.14); R('upperleg_R', 2.2, 0, 0.14);
    R('lowerleg_L', -2.3, 0, 0); R('lowerleg_R', -2.3, 0, 0);
    R('upperarm_L', 1.0, 0, -0.08); R('upperarm_R', 1.0, 0, 0.08);
    R('lowerarm_L', 0.45, 0, 0); R('lowerarm_R', 0.45, 0, 0);
  } },
  walk: { dur: 1.1, speed: 1.2, f(p, R, H) {
    const s = Math.sin(TAU * p), c = Math.cos(TAU * p);
    H(0, 0.022 * Math.cos(TAU * 2 * p) - 0.012, 0);
    R('hips', 0, 0.09 * s, 0); R('chest', 0.03, -0.13 * s, 0); R('head', -0.02, 0.05 * s, 0);
    R('upperleg_L', 0.45 * s, 0, 0); R('upperleg_R', -0.45 * s, 0, 0);
    R('lowerleg_L', -0.08 - 0.62 * Math.max(0, c), 0, 0); R('lowerleg_R', -0.08 - 0.62 * Math.max(0, -c), 0, 0);
    R('foot_L', 0.2 * Math.max(0, -s), 0, 0); R('foot_R', 0.2 * Math.max(0, s), 0, 0);
    R('upperarm_L', -0.36 * s, 0, -0.07); R('upperarm_R', 0.36 * s, 0, 0.07);
    R('lowerarm_L', 0.3 + 0.15 * Math.max(0, -s), 0, 0); R('lowerarm_R', 0.3 + 0.15 * Math.max(0, s), 0, 0);
  } },
  wave_flag: { dur: 1.6, f(p, R, H) {
    const s1 = Math.sin(TAU * p), b = (1 - Math.cos(TAU * 2 * p)) / 2;
    H(0, 0.012 * b, 0);
    R('chest', 0.03, 0.06 * s1, -0.06 * s1); R('head', 0.12, 0.1 * s1, 0);
    R('upperarm_R', 0.12, 0, 2.62 + 0.32 * s1); R('lowerarm_R', 0.2 + 0.18 * Math.sin(TAU * p + 0.8), 0, 0);
    R('upperarm_L', 0.05, 0, -0.42); R('lowerarm_L', 1.35, 0, 0.5);
    R('upperleg_L', 0, 0, -0.06); R('upperleg_R', 0, 0, 0.06);
  } },
  drink: { dur: 5, f(p, R, H) {
    const s1 = Math.sin(TAU * p), s2 = Math.sin(TAU * 2 * p);
    const e = sstep(0.34, 0.46, p) * (1 - sstep(0.6, 0.72, p));
    H(0.01 * s1, 0.003 * s2, 0);
    R('hips', 0, 0, 0.02 * s1); R('chest', 0, 0.04 * s1, 0); R('head', 0.22 * e + 0.02 * s2, 0.15 * s1 * (1 - e), 0);
    R('upperarm_R', 0.3 + 0.3 * e, 0, 0.14 + 0.06 * e); R('lowerarm_R', 1.45 + 0.8 * e, 0, 0); R('hand_R', -0.1, 0, 0);
    R('upperarm_L', 0.04, 0, -0.08); R('lowerarm_L', 0.18, 0, 0);
    R('upperleg_L', 0, 0, -0.03 - 0.02 * s1); R('upperleg_R', 0, 0, 0.03 - 0.02 * s1);
  } },
  point: { dur: 2, f(p, R, H) {
    const s2 = Math.sin(TAU * 2 * p);
    H(0, 0, 0);
    R('chest', -0.05, 0.12, 0); R('head', -0.05, 0.06, 0);
    R('upperarm_R', 1.38 + 0.07 * s2, 0.1, -0.1); R('lowerarm_R', 0.1 + 0.06 * s2, 0, 0);
    R('upperarm_L', 0.05, 0, -0.1); R('lowerarm_L', 0.3, 0, 0);
    R('upperleg_L', 0.05, 0, -0.04); R('upperleg_R', -0.03, 0, 0.04);
  } },
};

function makeClip(name, def) {
  const fps = 15;
  const n = Math.max(2, Math.round(def.dur * fps));
  const times = new Float32Array(n + 1);
  const rot = new Map(); // bone -> Float32Array quats
  const hips = new Float32Array((n + 1) * 3);
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  const used = new Set();
  // discover the bones this clip touches
  def.f(0.123, (b) => used.add(b), () => {});
  for (const b of used) rot.set(b, new Float32Array((n + 1) * 4));
  for (let i = 0; i <= n; i++) {
    const p = (i / n) % 1;
    times[i] = (i / n) * def.dur;
    let hx = 0, hy = 0, hz = 0;
    def.f(p, (b, x, y, z) => {
      const arr = rot.get(b);
      if (!arr) return;
      q.setFromEuler(e.set(x, y, z, 'XYZ'));
      q.toArray(arr, i * 4);
    }, (x, y, z) => { hx = x; hy = y; hz = z; });
    hips[i * 3] = hx; hips[i * 3 + 1] = HIPS_Y + hy; hips[i * 3 + 2] = hz;
  }
  const tracks = [new THREE.VectorKeyframeTrack('hips.position', times, hips)];
  for (const [b, arr] of rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, arr));
  // bones that are animated by other clips but not by this one go back to rest
  for (const b of BONE_ORDER) {
    if (rot.has(b)) continue;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, [0, def.dur], [0, 0, 0, 1, 0, 0, 0, 1]));
  }
  const clip = new THREE.AnimationClip(name, def.dur, tracks);
  clip.userData = { speed: def.speed || 0 };
  return clip;
}

// ------------------------------------------------------------------ held props (procedural)
function buildProps() {
  const mat = (c, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...extra }); m.userData.shared = true; return m; };
  const shared = (g) => { g.userData.shared = true; return g; };
  const props = {};
  // Phone: held along the hand, screen facing the palm/ear.
  const phone = new THREE.Group();
  phone.add(new THREE.Mesh(shared(new THREE.BoxGeometry(0.075, 0.15, 0.014)), mat('#111116', { roughness: 0.3 })));
  const scr = new THREE.Mesh(shared(new THREE.PlaneGeometry(0.062, 0.128)), mat('#3a6cff', { emissive: '#1d3a8a', emissiveIntensity: 0.6 }));
  scr.position.z = -0.008; scr.rotation.y = Math.PI;
  phone.add(scr);
  phone.position.set(-0.03, -0.07, 0); // in the grip
  props.phone = phone;
  // Cup (party cup) — axis along the hand's -Z so it stands upright when the forearm is raised
  const cup = new THREE.Group();
  const cupM = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.04, 0.03, 0.12, 8)), mat('#d62839'));
  cupM.rotation.x = -Math.PI / 2;
  cup.add(cupM);
  cup.position.set(0, -0.07, -0.02);
  props.drink = cup;
  // Bottle
  const bottle = new THREE.Group();
  const bb = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.03, 0.033, 0.16, 8)), mat('#2f7a3a', { roughness: 0.2 }));
  const bn = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.012, 0.022, 0.08, 6)), mat('#2f7a3a', { roughness: 0.2 }));
  bb.rotation.x = bn.rotation.x = -Math.PI / 2;
  bn.position.z = -0.11;
  bottle.add(bb, bn);
  bottle.position.set(0, -0.07, 0);
  props.bottle = bottle;
  // Checkered flag on a ~1 m pole (pole along the hand's -Y; overhead when the arm is raised)
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6)), mat('#d8d8de', { metalness: 0.6, roughness: 0.35 }));
  pole.position.y = -0.4;
  const tex = checkerTexture();
  const cloth = new THREE.Mesh(shared(clothGeometry()), mat('#ffffff', { map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.position.set(0, -0.62, 0);
  flag.add(pole, cloth);
  flag.position.set(0, -0.06, 0);
  props.flag = flag;
  return props;
}

function clothGeometry() {
  const g = new THREE.PlaneGeometry(0.62, 0.42, 6, 3);
  g.rotateY(Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i); // 0.31 .. -0.31 along the cloth
    const k = (0.31 - z) / 0.62;
    pos.setX(i, Math.sin(k * 5) * 0.05 * k);
    pos.setZ(i, z - 0.31); // hang from the pole
  }
  g.computeVertexNormals();
  return g;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
    g.fillRect(x * (64 / 6), y * 16, 64 / 6 + 1, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.userData.shared = true;
  return t;
}

// ------------------------------------------------------------------ public
let cached = null;
/** Session-wide procedural assets: { kind:'procedural', bases:[…], clips:Map, props, material } */
export function proceduralAssets() {
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, flatShading: true });
  material.userData.shared = true;
  const bases = [];
  for (const body of ['m', 'f']) for (const style of [0, 1]) {
    const t = buildTemplate(body, style, material);
    bases.push({ name: `proc_${body}${style}`, body, template: t.root, geometry: t.geometry, roles: t.roles, roleMode: true, looks: null });
  }
  const clips = new Map();
  for (const [name, def] of Object.entries(CLIPS)) clips.set(name, makeClip(name, def));
  cached = { kind: 'procedural', bases, clips, props: buildProps(), material, facing: -1 };
  return cached;
}

export const PROC_CLIP_NAMES = Object.keys(CLIPS);
