// Neon Mile props: festoon string lights, palms, street lamps, speaker stacks, drag "christmas tree", traffic
// lights, cones, food cart, velvet ropes, confetti. Procedural fallbacks for every optional GLB.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET_Y } from '../Arena.js';
import { rng } from '../../util.js';
import { partsFromObject, normalizeParts, InstSet, injectLife, injectSway, glowTex } from './inst.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function compose(x, y, z, yaw = 0, s = 1) {
  _p.set(x, y, z); _q.setFromAxisAngle(UP, yaw); _s.set(s, s, s);
  return _m.compose(_p, _q, _s);
}

// ------------------------------------------------------------------------------------------ festoons
/**
 * spans: [{ a:[x,y,z], b:[x,y,z], sag }]. Bulbs every `spacing` m, warm by default; palette cycles.
 * Returns { group, count }.
 */
export function buildFestoons(arena, spans, { spacing = 0.75, palette = ['#ffc46b'], uni, intensity = 2.4, halo = 0.55 } = {}) {
  const group = new THREE.Group(); group.name = 'festoons';
  const bulbs = []; // [x,y,z, sx, sz, ph, colorIndex]
  const wire = [];
  const wireSway = [];
  spans.forEach((sp, si) => {
    const [ax, ay, az] = sp.a, [bx, by, bz] = sp.b;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / (len || 1), dz = (bz - az) / (len || 1);
    const px = -dz, pz = dx; // sway perpendicular to the span
    const N = Math.max(8, Math.round(len / 1.2));
    const pt = (k) => [ax + (bx - ax) * k, ay + (by - ay) * k - sp.sag * 4 * k * (1 - k), az + (bz - az) * k];
    for (let i = 0; i < N; i++) {
      const k0 = i / N, k1 = (i + 1) / N;
      const p0 = pt(k0), p1 = pt(k1);
      wire.push(...p0, ...p1);
      const w0 = 4 * k0 * (1 - k0), w1 = 4 * k1 * (1 - k1);
      wireSway.push(px * w0, pz * w0, si * 1.7, px * w1, pz * w1, si * 1.7);
    }
    const nb = Math.max(2, Math.floor(len / spacing));
    for (let i = 1; i < nb; i++) {
      const k = i / nb;
      const p = pt(k);
      const w = 4 * k * (1 - k);
      bulbs.push([p[0], p[1] - 0.1, p[2], px * w, pz * w, si * 1.7, (i + si) % palette.length]);
    }
  });
  // wire
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  wg.setAttribute('aSway', new THREE.Float32BufferAttribute(wireSway, 3));
  const wm = injectSway(new THREE.LineBasicMaterial({ color: 0x1a1420 }), uni);
  const lines = new THREE.LineSegments(wg, wm); lines.frustumCulled = false;
  group.add(lines);
  // bulbs (instanced) + halos (points)
  const n = bulbs.length;
  const bg = new THREE.IcosahedronGeometry(0.075, 0);
  const sway = new Float32Array(n * 3);
  bulbs.forEach((b, i) => { sway[i * 3] = b[3]; sway[i * 3 + 1] = b[4]; sway[i * 3 + 2] = b[5]; });
  bg.setAttribute('aSway', new THREE.InstancedBufferAttribute(sway, 3));
  const bm = injectSway(new THREE.MeshBasicMaterial({ color: 0xffffff }), uni);
  const inst = new THREE.InstancedMesh(bg, bm, n);
  const cols = palette.map((c) => new THREE.Color(c).multiplyScalar(intensity));
  bulbs.forEach((b, i) => { inst.setMatrixAt(i, compose(b[0], b[1], b[2])); inst.setColorAt(i, cols[b[6]]); });
  inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere(); inst.frustumCulled = false;
  group.add(inst);
  if (halo > 0) {
    const hp = new Float32Array(n * 3), hc = new Float32Array(n * 3);
    bulbs.forEach((b, i) => {
      hp[i * 3] = b[0]; hp[i * 3 + 1] = b[1]; hp[i * 3 + 2] = b[2];
      const c = cols[b[6]]; hc[i * 3] = c.r / intensity; hc[i * 3 + 1] = c.g / intensity; hc[i * 3 + 2] = c.b / intensity;
    });
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    hg.setAttribute('aSway', new THREE.BufferAttribute(sway.slice(), 3));
    const hm = injectSway(new THREE.PointsMaterial({
      size: 0.75, map: glowTex((t) => arena.track(t)), vertexColors: true, transparent: true, opacity: halo,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }), uni);
    const pts = new THREE.Points(hg, hm); pts.frustumCulled = false; pts.renderOrder = 2;
    group.add(pts);
  }
  arena.group.add(group);
  return { group, count: n, bulbs: inst };
}

// ------------------------------------------------------------------------------------------ palms
function proceduralPalm() {
  const root = new THREE.Group();
  const trunkM = Object.assign(new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 }), { name: 'BARK' });
  const frondM = Object.assign(new THREE.MeshStandardMaterial({ color: 0x2f6a2a, roughness: 0.8, side: THREE.DoubleSide }), { name: 'FROND' });
  const H = 5.6;
  const pts = []; for (let i = 0; i <= 5; i++) { const k = i / 5; pts.push(new THREE.Vector3(0.7 * k * k, k * H, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tg = new THREE.TubeGeometry(curve, 10, 0.17, 7, false);
  root.add(new THREE.Mesh(tg, trunkM));
  const top = curve.getPointAt(1);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.PlaneGeometry(0.8, 2.6, 1, 5);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const k = (pos.getY(v) + 1.3) / 2.6;
      pos.setXYZ(v, pos.getX(v) * (1 - 0.6 * k), -k * k * 1.3 + k * 0.4, -k * 2.6);
    }
    g.computeVertexNormals();
    g.rotateY((i / 9) * Math.PI * 2);
    g.translate(top.x, top.y, top.z);
    root.add(new THREE.Mesh(g, frondM));
  }
  return root;
}

/** Instanced palms with gentle wind sway (shader). spots: [[x,z,scale,yaw]] */
export function buildPalms(arena, spots, uni, glb) {
  const src = glb ? glb.clone(true) : proceduralPalm();
  const parts = partsFromObject(src, { keepMaterials: !glb });
  normalizeParts(parts, { height: 6.2 });
  for (const p of parts) {
    if (p.material.color && /FROND/i.test(p.key)) p.material.color.multiplyScalar(1.15);
    injectLife(p.material, uni, { sway: 0.22, height: 6.2, speed: 1 });
  }
  const set = new InstSet(parts, spots.length, { castShadow: false, name: 'palms' });
  spots.forEach(([x, z, s = 1, yaw = 0], i) => set.setMatrix(i, compose(x, STREET_Y + 0.16, z, yaw, s)));
  set.commit();
  arena.group.add(set.group);
  return set;
}

// ------------------------------------------------------------------------------------------ lamps
/** Instanced street lamps; arm points toward the street centre. spots: [[x,z]] */
export function buildLamps(arena, spots, glb) {
  let parts;
  let armDir = new THREE.Vector3(0, 0, -1), armLen = 1.2, headY = 4.3;
  if (glb) {
    parts = partsFromObject(glb.clone(true), { emissiveBoost: 3 });
    normalizeParts(parts, { height: 4.6 });
    const lamp = parts.find((p) => /LAMP|EMISSIVE|BULB|LIGHT/i.test(p.key));
    if (lamp) {
      lamp.geometry.computeBoundingBox();
      const c = lamp.geometry.boundingBox.getCenter(new THREE.Vector3());
      headY = c.y; armLen = Math.hypot(c.x, c.z);
      if (armLen > 0.1) armDir.set(c.x, 0, c.z).normalize();
    }
  } else {
    const root = new THREE.Group();
    const pm = Object.assign(new THREE.MeshStandardMaterial({ color: 0x2b2a33, metalness: 0.7, roughness: 0.4 }), { name: 'POLE' });
    const lm = Object.assign(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb866).multiplyScalar(3) }), { name: 'LAMP' });
    const pole = new THREE.CylinderGeometry(0.06, 0.1, 4.6, 8); pole.translate(0, 2.3, 0);
    const arm = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6); arm.rotateX(Math.PI / 2); arm.translate(0, 4.55, -0.62);
    const head = new THREE.BoxGeometry(0.24, 0.1, 0.55); head.translate(0, 4.5, -1.2);
    const bulb = new THREE.BoxGeometry(0.17, 0.03, 0.44); bulb.translate(0, 4.44, -1.2);
    [pole, arm, head].forEach((g) => root.add(new THREE.Mesh(g, pm)));
    root.add(new THREE.Mesh(bulb, lm));
    parts = partsFromObject(root, { keepMaterials: true });
    headY = 4.44; armLen = 1.2;
  }
  const set = new InstSet(parts, spots.length, { castShadow: false, name: 'lamps' });
  const armYaw = Math.atan2(armDir.x, armDir.z);
  const heads = [];
  spots.forEach(([x, z], i) => {
    const inward = x < 0 ? 1 : -1;
    const want = Math.atan2(inward, 0);
    set.setMatrix(i, compose(x, STREET_Y + 0.16, z, want - armYaw));
    heads.push([x + inward * armLen, STREET_Y + 0.16 + headY - 0.1, z]);
  });
  set.commit();
  arena.group.add(set.group);
  // soft glow sprites under the heads (one Points draw)
  const hp = new Float32Array(heads.flat());
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const pm = new THREE.PointsMaterial({
    size: 2.2, map: glowTex((t) => arena.track(t)), color: new THREE.Color(0xffa04a), transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, pm); pts.frustumCulled = false;
  arena.group.add(pts);
  return { set, heads };
}

// ------------------------------------------------------------------------------------------ speaker stack
export function speakerObject() {
  const root = new THREE.Group();
  const cab = Object.assign(new THREE.MeshStandardMaterial({ color: 0x17141c, roughness: 0.7 }), { name: 'TINT_Cabinet' });
  const cone = Object.assign(new THREE.MeshStandardMaterial({ color: 0x2c2833, roughness: 0.5, metalness: 0.3 }), { name: 'CONE' });
  const ring = Object.assign(new THREE.MeshBasicMaterial({ color: 0xffffff }), { name: 'EMISSIVE_Ring' });
  const add = (g, m) => root.add(new THREE.Mesh(g, m));
  const b = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  add(b(0.1, 0.3, 0.1, -0.3, 0.15, 0), cab); add(b(0.1, 0.3, 0.1, 0.3, 0.15, 0), cab);
  add(b(0.85, 0.72, 0.62, 0, 0.66, 0), cab);
  add(b(0.8, 0.62, 0.58, 0, 1.33, 0), cab);
  add(b(0.6, 0.3, 0.5, 0, 1.8, 0), cab);
  const disc = (r, x, y) => {
    const g = new THREE.CylinderGeometry(r, r * 0.8, 0.04, 16); g.rotateX(Math.PI / 2); g.translate(x, y, 0.32); add(g, cone);
    const t = new THREE.TorusGeometry(r + 0.01, 0.012, 4, 20); t.translate(x, y, 0.33); add(t, ring);
  };
  disc(0.27, 0, 0.66); disc(0.13, -0.19, 1.33); disc(0.13, 0.19, 1.33); disc(0.08, 0, 1.8);
  return root;
}

// ------------------------------------------------------------------------------------------ drag start tree
/** Procedural "christmas tree" start light. Returns { root, lamps: { stage, amber:[3], green, red } } */
export function startTreeObject() {
  const root = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1a22, metalness: 0.6, roughness: 0.4 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf9d71c, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.8, 8), yellow); pole.position.y = 0.9;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), dark); base.position.y = 0.06;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.25, 0.2), dark); housing.position.y = 2.35;
  root.add(pole, base, housing);
  const mk = (hex) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.12) });
  const lamps = { stage: mk('#ffffff'), amber: [mk('#ffa21a'), mk('#ffa21a'), mk('#ffa21a')], green: mk('#3dff6a'), red: mk('#ff2a2a') };
  const g = new THREE.CircleGeometry(0.075, 14);
  const rows = [[lamps.stage, 2.86], [lamps.amber[0], 2.66], [lamps.amber[1], 2.46], [lamps.amber[2], 2.26], [lamps.green, 2.02], [lamps.red, 1.82]];
  for (const [m, y] of rows) for (const x of [-0.16, 0.16]) {
    const d = new THREE.Mesh(g, m); d.position.set(x, y, 0.105); root.add(d);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12, 1, true, 0, Math.PI), dark);
    hood.rotation.x = Math.PI / 2; hood.rotation.y = 0; hood.position.set(x, y + 0.02, 0.13); root.add(hood);
  }
  return { root, lamps };
}

// ------------------------------------------------------------------------------------------ traffic light
export function trafficLightObject() {
  const root = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x24222b, metalness: 0.6, roughness: 0.45 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 6.2, 8), dark); pole.position.y = 3.1;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), dark); arm.rotation.z = Math.PI / 2; arm.position.set(2.5, 5.9, 0);
  root.add(pole, arm);
  const lights = { red: null, amber: null, green: null };
  const mk = (hex) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex) });
  lights.red = mk('#ff2a2a'); lights.amber = mk('#ffae1a'); lights.green = mk('#3dff9a');
  for (const hx of [2.2, 4.4]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.05, 0.3), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 }));
    box.position.set(hx, 5.3, 0); root.add(box);
    [['red', 5.62], ['amber', 5.3], ['green', 4.98]].forEach(([k, y]) => {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), lights[k]); d.position.set(hx, y, 0.155); root.add(d);
    });
  }
  return { root, lights };
}

// ------------------------------------------------------------------------------------------ food cart
export function foodCartObject() {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xe8e2ea, metalness: 0.4, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1720, roughness: 0.8 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.95, 1.05), body); b.position.y = 0.72;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 1.15), dark); counter.position.y = 1.22;
  root.add(b, counter);
  for (const x of [-0.65, 0.65]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.22, 0.55); root.add(w);
  }
  for (const x of [-0.9, 0.9]) for (const z of [-0.45, 0.45]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), body); p.position.set(x, 1.72, z); root.add(p);
  }
  // striped canopy
  const stripes = 8;
  const sm = [new THREE.MeshStandardMaterial({ color: 0xff3ea5, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })];
  for (let i = 0; i < stripes; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.3 / stripes, 0.05, 1.5), sm[i % 2]);
    s.position.set(-1.15 + (i + 0.5) * (2.3 / stripes), 2.25, 0); s.rotation.x = 0.12; root.add(s);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc46b).multiplyScalar(1.8) }));
  sign.position.set(0, 2.45, 0.72); root.add(sign);
  return root;
}

// ------------------------------------------------------------------------------------------ cones + ropes
export function buildCones(arena, spots) {
  const root = new THREE.Group();
  const orange = Object.assign(new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }), { name: 'CONE' });
  const white = Object.assign(new THREE.MeshStandardMaterial({ color: 0xf2eef4, roughness: 0.5, emissive: 0x333333 }), { name: 'BAND' });
  const c = new THREE.ConeGeometry(0.17, 0.5, 10); c.translate(0, 0.29, 0);
  const b = new THREE.BoxGeometry(0.44, 0.04, 0.44); b.translate(0, 0.02, 0);
  const band = new THREE.CylinderGeometry(0.1, 0.125, 0.08, 10, 1, true); band.translate(0, 0.33, 0);
  root.add(new THREE.Mesh(c, orange), new THREE.Mesh(b, orange), new THREE.Mesh(band, white));
  const parts = partsFromObject(root, { keepMaterials: true });
  const set = new InstSet(parts, spots.length, { castShadow: true, name: 'cones' });
  spots.forEach(([x, z], i) => set.setMatrix(i, compose(x, STREET_Y, z, i)));
  set.commit();
  arena.group.add(set.group);
  return set;
}

/** Velvet rope line: gold stanchions + sagging rope, from a list of post positions. */
export function buildRopes(arena, posts, { rope = '#a259ff', post = '#f9d25a' } = {}) {
  const pg = [], rg = [];
  posts.forEach(([x, z], i) => {
    const p = new THREE.CylinderGeometry(0.035, 0.05, 0.95, 8); p.translate(x, STREET_Y + 0.16 + 0.475, z); pg.push(p);
    const base = new THREE.CylinderGeometry(0.16, 0.18, 0.05, 12); base.translate(x, STREET_Y + 0.185, z); pg.push(base);
    const top = new THREE.SphereGeometry(0.07, 8, 6); top.translate(x, STREET_Y + 1.13, z); pg.push(top);
    if (i < posts.length - 1) {
      const [x2, z2] = posts[i + 1];
      const pts = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(x + (x2 - x) * t, STREET_Y + 1.02 - 0.28 * 4 * t * (1 - t), z + (z2 - z) * t)); }
      rg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 5, false));
    }
  });
  const pm = new THREE.MeshStandardMaterial({ color: post, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.3 });
  const rm = new THREE.MeshStandardMaterial({ color: rope, roughness: 0.55, emissive: new THREE.Color(rope).multiplyScalar(0.25) });
  const a = new THREE.Mesh(mergeGeometries(pg), pm), b = new THREE.Mesh(mergeGeometries(rg.map((g) => g.index ? g.toNonIndexed() : g)), rm);
  pg.forEach((g) => g.dispose()); rg.forEach((g) => g.dispose());
  a.castShadow = true;
  arena.group.add(a, b);
}

// ------------------------------------------------------------------------------------------ confetti
export class Confetti {
  constructor(arena, count = 180) {
    const g = new THREE.PlaneGeometry(0.09, 0.14);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.5, emissive: 0x222222 });
    this.mesh = new THREE.InstancedMesh(g, m, count);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.n = count;
    this.r = rng(1234);
    this.p = new Float32Array(count * 7); // x y z vy spin phase drift
    const pal = ['#ff3ea5', '#a259ff', '#f9f871', '#2de2e6', '#ffffff', '#ff7a1a'];
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, _c.set(pal[i % pal.length]));
    this.t = 0; this.active = false;
    arena.group.add(this.mesh);
  }

  fire() {
    const r = this.r;
    for (let i = 0; i < this.n; i++) {
      const a = r() * Math.PI * 2, d = 5.8 + r() * 6;
      const o = i * 7;
      this.p[o] = Math.cos(a) * d; this.p[o + 1] = 5 + r() * 5; this.p[o + 2] = Math.sin(a) * d;
      this.p[o + 3] = 0.6 + r() * 0.8; this.p[o + 4] = 1 + r() * 3; this.p[o + 5] = r() * 6; this.p[o + 6] = (r() - 0.5) * 0.6;
    }
    this.t = 0; this.active = true; this.mesh.visible = true;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const p = this.p;
    for (let i = 0; i < this.n; i++) {
      const o = i * 7;
      p[o + 1] -= p[o + 3] * dt;
      p[o] += Math.sin(this.t * 1.3 + p[o + 5]) * 0.4 * dt + p[o + 6] * dt;
      if (p[o + 1] < STREET_Y + 0.02) p[o + 1] = STREET_Y + 0.02;
      _e.set(this.t * p[o + 4] + p[o + 5], this.t * p[o + 4] * 0.7, p[o + 5]);
      _q.setFromEuler(_e);
      _p.set(p[o], p[o + 1], p[o + 2]); _s.set(1, 1, 1);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.t > 12) { this.active = false; this.mesh.visible = false; }
  }
}
