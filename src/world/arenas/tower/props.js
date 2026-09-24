// Nocturno Tower: procedural rooftop props (fallbacks for the Blender GLBs) — low-poly, batched by material.
// Static props write into a shared Batch (one draw call per material for the whole roof);
// animated parts (rotors, fans, flames, beacon) are returned as separate objects.
import * as THREE from 'three';
import { Batch, G, M } from './kit.js';

export function makeMaterials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
  return {
    black: std('#0c0d12', { roughness: 0.3, metalness: 0.6 }),
    steel: std('#3a4052', { roughness: 0.45, metalness: 0.7 }),
    darkSteel: std('#1d2130', { roughness: 0.5, metalness: 0.6 }),
    concrete: std('#2a2e3c', { roughness: 0.85 }),
    gold: std('#d9a93a', { roughness: 0.28, metalness: 1.0 }),
    velvet: std('#231a52', { roughness: 0.95 }),
    velvetDark: std('#140f33', { roughness: 0.95 }),
    cushion: std('#ece6da', { roughness: 0.85 }),
    marble: std('#10121a', { roughness: 0.18, metalness: 0.2 }),
    wood: std('#4a2f22', { roughness: 0.7 }),
    leaf: std('#2f6b4a', { roughness: 0.8, side: THREE.DoubleSide }),
    rubber: std('#16171b', { roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: '#0b1830', roughness: 0.06, metalness: 0.85, emissive: '#06222e', emissiveIntensity: 0.6 }),
    ledGold: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc24a').multiplyScalar(2.0) }),
    ledTeal: new THREE.MeshBasicMaterial({ color: new THREE.Color('#3ff0ff').multiplyScalar(1.6) }),
    ledGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8ff3c').multiplyScalar(1.6) }),
    ledWarm: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffdca0').multiplyScalar(2.2) }),
    navRed: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a2a').multiplyScalar(2.2) }),
    navGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color('#2aff6a').multiplyScalar(2.0) }),
  };
}

// ------------------------------------------------------------------ helicopter (nose +Z, origin on the ground)
export function buildHelicopter(mats) {
  const root = new THREE.Group();
  root.name = 'helicopter';
  const body = new Batch('heli');
  const add = (geo, mat, m) => body.add(geo, mat, m);
  // fuselage + cabin
  add(G.sphere, mats.black, M(0, 1.72, 0.55, { sx: 2.3, sy: 2.1, sz: 5.3 }));
  add(G.sphere, mats.glass, M(0, 1.98, 1.55, { sx: 2.0, sy: 1.5, sz: 3.0 }));
  add(G.sphere, mats.glass, M(0, 1.9, 0.1, { sx: 2.36, sy: 0.8, sz: 2.4 })); // side windows band
  add(G.sphere, mats.gold, M(0, 1.42, 0.5, { sx: 2.36, sy: 0.16, sz: 5.35 })); // gold belt line
  // engine housing
  add(G.sphere, mats.black, M(0, 2.72, -0.6, { sx: 1.5, sy: 0.9, sz: 3.6 }));
  add(G.box, mats.gold, M(0, 2.72, -2.25, { sx: 0.9, sy: 0.35, sz: 0.1 }));
  // tail boom + fins
  add(G.cyl, mats.black, M(0, 2.05, -4.55, { rx: Math.PI / 2, sx: 0.62, sy: 6.2, sz: 0.62 }));
  add(G.cone, mats.black, M(0, 2.05, -4.6, { rx: -Math.PI / 2, sx: 0.95, sy: 6.4, sz: 0.95 }));
  add(G.box, mats.black, M(0, 2.85, -7.35, { rx: -0.45, sx: 0.12, sy: 1.8, sz: 0.85 }));
  add(G.box, mats.black, M(0, 1.55, -7.3, { rx: 0.4, sx: 0.1, sy: 0.8, sz: 0.55 }));
  add(G.box, mats.black, M(0, 2.15, -6.5, { sx: 2.4, sy: 0.08, sz: 0.55 }));
  add(G.box, mats.gold, M(0, 2.85, -7.38, { rx: -0.45, sx: 0.14, sy: 0.25, sz: 0.87 }));
  // skids (chrome/gold)
  for (const sx of [-1, 1]) {
    add(G.cyl, mats.gold, M(sx * 1.05, 0.08, 0.45, { rx: Math.PI / 2, sx: 0.12, sy: 4.4, sz: 0.12 }));
    add(G.sphere, mats.gold, M(sx * 1.05, 0.08, 2.65, { s: 0.12 }));
    for (const z of [1.5, -0.6]) add(G.cyl, mats.steel, M(sx * 0.85, 0.55, z, { rz: sx * 0.45, sx: 0.08, sy: 1.05, sz: 0.08 }));
  }
  // mast
  add(G.cyl, mats.steel, M(0, 3.25, 0.05, { sx: 0.24, sy: 0.55, sz: 0.24 }));
  body.build(root);
  // nav lights (steady — no strobes)
  const nav = new Batch('heli_nav');
  nav.add(G.lowSphere, mats.navRed, M(-1.18, 1.5, 0.9, { s: 0.14 }));
  nav.add(G.lowSphere, mats.navGreen, M(1.18, 1.5, 0.9, { s: 0.14 }));
  nav.add(G.lowSphere, mats.ledWarm, M(0, 3.3, -7.7, { s: 0.14 }));
  nav.add(G.lowSphere, mats.navRed, M(0, 3.05, -1.4, { s: 0.16 }));
  nav.build(root, { cast: false, receive: false });
  // main rotor (node "Rotor", spins Y)
  const rotor = new THREE.Group();
  rotor.name = 'Rotor';
  rotor.position.set(0, 3.55, 0.05);
  const rb = new Batch('rotor');
  rb.add(G.cyl, mats.darkSteel, M(0, 0, 0, { sx: 0.45, sy: 0.22, sz: 0.45 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    rb.add(G.box, mats.black, M(Math.sin(a) * 3.0, -0.03, Math.cos(a) * 3.0, { ry: a, rx: 0.015, sx: 0.32, sy: 0.05, sz: 5.6 }));
    rb.add(G.box, mats.gold, M(Math.sin(a) * 5.65, -0.04, Math.cos(a) * 5.65, { ry: a, sx: 0.33, sy: 0.055, sz: 0.3 }));
  }
  rb.build(rotor, { cast: true, receive: false });
  root.add(rotor);
  // tail rotor (node "TailRotor", spins X)
  const tail = new THREE.Group();
  tail.name = 'TailRotor';
  tail.position.set(0.22, 2.9, -7.5);
  const tb = new Batch('tailrotor');
  tb.add(G.cyl, mats.steel, M(0, 0, 0, { rz: Math.PI / 2, sx: 0.12, sy: 0.12, sz: 0.12 }));
  tb.add(G.box, mats.black, M(0.03, 0, 0, { sx: 0.04, sy: 1.5, sz: 0.14 }));
  tb.add(G.box, mats.black, M(0.03, 0, 0, { sx: 0.04, sy: 0.14, sz: 1.5 }));
  tb.build(tail, { cast: false, receive: false });
  root.add(tail);
  return { root, rotor, tail };
}

// ------------------------------------------------------------------ static props into the roof batch
/** Rooftop AC unit (2 × 1.5 × 1.3); returns the fan group (spins Y). */
export function hvacUnit(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.box, mats.steel, M(0, 0.62, 0, { sx: 2.0, sy: 1.2, sz: 1.5 }));
  f.add(G.box, mats.darkSteel, M(0, 0.04, 0, { sx: 2.1, sy: 0.08, sz: 1.6 }));
  f.add(G.cyl, mats.darkSteel, M(0, 1.26, 0, { sx: 1.25, sy: 0.08, sz: 1.25 }));
  for (let i = -3; i <= 3; i++) f.add(G.box, mats.darkSteel, M(i * 0.13, 1.31, 0, { sx: 0.03, sy: 0.03, sz: 1.2 }));
  for (let i = -3; i <= 3; i++) f.add(G.box, mats.darkSteel, M(1.01, 0.62, i * 0.18, { sx: 0.02, sy: 1.0, sz: 0.05 }));
  const fan = new THREE.Group();
  fan.name = 'Fan';
  const fb = new Batch('fan');
  fb.add(G.cyl, mats.black, M(0, 0, 0, { sx: 0.2, sy: 0.08, sz: 0.2 }));
  for (let i = 0; i < 4; i++) fb.add(G.box, mats.black, M(0, 0, 0, { ry: (i * Math.PI) / 4, rz: 0.25, sx: 1.0, sy: 0.02, sz: 0.14 }));
  fb.build(fan, { cast: false, receive: false });
  fan.position.set(0, 1.22, 0);
  fan.applyMatrix4(m4);
  return fan;
}

/** Tall antenna spire (≈16 m) — returns the local position of the beacon (in world, via m4). */
export function antennaMast(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.box, mats.concrete, M(0, 0.3, 0, { sx: 1.6, sy: 0.6, sz: 1.6 }));
  // three-legged lattice mast (tapering)
  const H = 15;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    f.add(G.cyl6, mats.steel, M(Math.cos(a) * 0.3, 0.6 + H / 2, Math.sin(a) * 0.3, { rz: Math.cos(a) * 0.028, rx: -Math.sin(a) * 0.028, sx: 0.08, sy: H, sz: 0.08 }));
  }
  for (let k = 1; k < 10; k++) {
    const y = 0.6 + k * 1.45;
    const rad = 0.3 - (k * 1.45 / H) * 0.22 + 0.04;
    f.add(G.torus, mats.steel, M(0, y, 0, { rx: Math.PI / 2, s: rad * 2.1 }));
  }
  f.add(G.cyl, mats.steel, M(0, 0.6 + H + 1.4, 0, { sx: 0.07, sy: 2.8, sz: 0.07 }));
  // dishes / panels
  f.add(G.sphere, mats.cushion, M(0.45, 7.5, 0, { rz: Math.PI / 2, sx: 0.2, sy: 1.1, sz: 1.1 }));
  f.add(G.box, mats.cushion, M(-0.35, 10.2, 0.2, { sx: 0.12, sy: 1.4, sz: 0.35 }));
  f.add(G.box, mats.cushion, M(0.2, 10.2, -0.38, { sx: 0.35, sy: 1.4, sz: 0.12 }));
  f.add(G.lowSphere, mats.navRed, M(0, 8.2, 0.3, { s: 0.16 }));
  return new THREE.Vector3(0, 0.6 + H + 2.95, 0).applyMatrix4(m4);
}

/** Gaudy gold-and-velvet throne sofa for the City Boss (2.4 × 1 × 1.2), front +Z. */
export function throneSofa(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.box, mats.gold, M(0, 0.22, 0, { sx: 2.4, sy: 0.3, sz: 1.0 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.add(G.sphere, mats.gold, M(sx * 1.08, 0.07, sz * 0.4, { s: 0.16 }));
  f.add(G.box, mats.velvet, M(0, 0.45, 0.06, { sx: 2.1, sy: 0.2, sz: 0.86 }));
  f.add(G.box, mats.velvet, M(0, 0.95, -0.36, { rx: -0.12, sx: 2.1, sy: 1.0, sz: 0.24 }));
  // tufting buttons
  for (let i = -3; i <= 3; i++) for (const y of [0.78, 1.12]) f.add(G.lowSphere, mats.gold, M(i * 0.27, y, -0.21 - (y - 0.95) * 0.12, { s: 0.05 }));
  // gold back frame with a crown crest
  f.add(G.box, mats.gold, M(0, 1.48, -0.44, { sx: 2.3, sy: 0.12, sz: 0.2 }));
  f.add(G.cyl, mats.gold, M(0, 1.46, -0.46, { rx: Math.PI / 2, sx: 1.1, sy: 0.14, sz: 0.62 }));
  for (const [x, y] of [[-0.42, 1.95], [0, 2.08], [0.42, 1.95]]) {
    f.add(G.cone, mats.gold, M(x, y - 0.12, -0.46, { sx: 0.16, sy: 0.4, sz: 0.16 }));
    f.add(G.sphere, mats.gold, M(x, y + 0.1, -0.46, { s: 0.14 }));
  }
  // armrests (velvet rolls with gold caps)
  for (const sx of [-1, 1]) {
    f.add(G.cyl, mats.velvet, M(sx * 1.1, 0.72, 0.02, { rx: Math.PI / 2, sx: 0.34, sy: 0.9, sz: 0.34 }));
    f.add(G.cyl, mats.gold, M(sx * 1.1, 0.72, 0.48, { rx: Math.PI / 2, sx: 0.38, sy: 0.05, sz: 0.38 }));
    f.add(G.box, mats.gold, M(sx * 1.1, 0.46, 0.02, { sx: 0.3, sy: 0.3, sz: 0.9 }));
  }
}

/** Sun lounger (0.75 × 2 × 0.8), head at -Z. */
export function lounger(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.box, mats.gold, M(0, 0.2, 0.15, { sx: 0.7, sy: 0.06, sz: 1.5 }));
  for (const sx of [-1, 1]) for (const z of [-0.5, 0.8]) f.add(G.box, mats.gold, M(sx * 0.3, 0.1, z, { sx: 0.05, sy: 0.2, sz: 0.05 }));
  f.add(G.box, mats.cushion, M(0, 0.28, 0.2, { sx: 0.66, sy: 0.1, sz: 1.35 }));
  f.add(G.box, mats.cushion, M(0, 0.55, -0.72, { rx: -0.85, sx: 0.66, sy: 0.1, sz: 0.75 }));
  f.add(G.box, mats.gold, M(0, 0.5, -0.8, { rx: -0.85, sx: 0.7, sy: 0.06, sz: 0.75 }));
  f.add(G.box, mats.velvetDark, M(0, 0.36, 0.55, { sx: 0.5, sy: 0.02, sz: 0.4 })); // towel
}

/** Low side table with a drink. */
export function sideTable(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.cyl, mats.gold, M(0, 0.22, 0, { sx: 0.1, sy: 0.44, sz: 0.1 }));
  f.add(G.cyl, mats.marble, M(0, 0.46, 0, { sx: 0.6, sy: 0.04, sz: 0.6 }));
  f.add(G.cyl, mats.gold, M(0, 0.02, 0, { sx: 0.4, sy: 0.04, sz: 0.4 }));
  f.add(G.cyl, mats.glass, M(0.1, 0.54, 0.05, { sx: 0.07, sy: 0.12, sz: 0.07 }));
  f.add(G.cone, mats.glass, M(-0.12, 0.56, -0.05, { rx: Math.PI, sx: 0.12, sy: 0.12, sz: 0.12 }));
}

/** Black planter with gold rim (palm added separately). */
export function planter(batch, mats, m4, { r = 0.45, h = 0.7 } = {}) {
  const f = batch.frame(m4);
  f.add(G.cyl, mats.black, M(0, h / 2, 0, { sx: r * 2, sy: h, sz: r * 2 }));
  f.add(G.torus, mats.gold, M(0, h, 0, { rx: Math.PI / 2, s: r * 2 }));
  f.add(G.cyl, mats.rubber, M(0, h - 0.04, 0, { sx: r * 1.85, sy: 0.04, sz: r * 1.85 }));
}

/** Procedural potted palm fronds (fallback when palm.glb is missing). */
export function palmFronds(batch, mats, m4, rnd) {
  const f = batch.frame(m4);
  const trunkH = 1.6 + rnd() * 0.6;
  f.add(G.cyl6, mats.wood, M(0, 0.6 + trunkH / 2, 0, { sx: 0.16, sy: trunkH, sz: 0.2 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd() * 0.3;
    f.add(G.box, mats.leaf, M(Math.sin(a) * 0.55, 0.55 + trunkH - 0.05, Math.cos(a) * 0.55, { ry: a, rx: 0.55, sx: 0.36, sy: 0.02, sz: 1.3 }));
  }
}

/** Bar counter (length L along X, front +Z) with back shelf and bottles. */
export function barCounter(batch, mats, m4, rnd, L = 5) {
  const f = batch.frame(m4);
  f.add(G.box, mats.black, M(0, 0.53, 0, { sx: L, sy: 1.06, sz: 0.7 }));
  f.add(G.box, mats.marble, M(0, 1.1, 0.03, { sx: L + 0.2, sy: 0.08, sz: 0.85 }));
  f.add(G.box, mats.gold, M(0, 1.05, 0.46, { sx: L + 0.2, sy: 0.05, sz: 0.02 }));
  for (let i = 0; i <= 5; i++) f.add(G.box, mats.gold, M(-L / 2 + (i / 5) * L, 0.55, 0.36, { sx: 0.05, sy: 0.9, sz: 0.02 }));
  f.add(G.box, mats.ledGold, M(0, 0.08, 0.38, { sx: L - 0.2, sy: 0.04, sz: 0.02 }));
  // back shelf (behind the bartender)
  f.add(G.box, mats.black, M(0, 1.0, -1.45, { sx: L, sy: 2.0, sz: 0.4 }));
  for (const y of [1.05, 1.55]) f.add(G.box, mats.ledWarm, M(0, y - 0.03, -1.25, { sx: L - 0.3, sy: 0.02, sz: 0.04 }));
  const bottleMats = [mats.glass, mats.gold, mats.ledGreen, mats.glass, mats.cushion];
  for (const y of [1.05, 1.55]) {
    for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.2 + rnd() * 0.12) {
      const hgt = 0.22 + rnd() * 0.16;
      const bm = bottleMats[Math.floor(rnd() * bottleMats.length)];
      f.add(G.cyl6, bm === mats.ledGreen ? mats.glass : bm, M(x, y + hgt / 2, -1.36, { sx: 0.08, sy: hgt, sz: 0.08 }));
      f.add(G.cyl6, mats.black, M(x, y + hgt + 0.05, -1.36, { sx: 0.03, sy: 0.1, sz: 0.03 }));
    }
  }
  // glasses + a champagne bucket on the counter
  for (let i = 0; i < 5; i++) f.add(G.cone, mats.glass, M(-L / 2 + 0.6 + i * 0.4, 1.22, 0.15, { rx: Math.PI, sx: 0.1, sy: 0.14, sz: 0.1 }));
  f.add(G.cyl, mats.gold, M(L / 2 - 0.7, 1.28, 0.05, { sx: 0.3, sy: 0.3, sz: 0.3 }));
  f.add(G.cyl6, mats.black, M(L / 2 - 0.7, 1.45, 0.05, { rz: 0.3, sx: 0.08, sy: 0.4, sz: 0.08 }));
  // stools
  for (let i = 0; i < 4; i++) {
    const x = -L / 2 + 0.8 + i * ((L - 1.6) / 3);
    f.add(G.cyl, mats.gold, M(x, 0.4, 0.95, { sx: 0.06, sy: 0.8, sz: 0.06 }));
    f.add(G.cyl, mats.velvet, M(x, 0.82, 0.95, { sx: 0.42, sy: 0.08, sz: 0.42 }));
    f.add(G.torus, mats.gold, M(x, 0.3, 0.95, { rx: Math.PI / 2, s: 0.34 }));
  }
}

/** DJ booth (front +Z) — returns the two platters (spin Y slowly). */
export function djBooth(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.box, mats.black, M(0, 0.5, 0, { sx: 2.4, sy: 1.0, sz: 0.9 }));
  f.add(G.box, mats.gold, M(0, 1.02, 0, { sx: 2.5, sy: 0.05, sz: 1.0 }));
  f.add(G.box, mats.ledTeal, M(0, 0.5, 0.46, { sx: 2.2, sy: 0.05, sz: 0.02 }));
  f.add(G.box, mats.ledGold, M(0, 0.2, 0.46, { sx: 2.2, sy: 0.05, sz: 0.02 }));
  f.add(G.box, mats.darkSteel, M(0, 1.08, -0.05, { sx: 0.6, sy: 0.07, sz: 0.45 }));
  f.add(G.box, mats.glass, M(0.9, 1.25, -0.28, { rx: -0.3, sx: 0.4, sy: 0.3, sz: 0.02 }));
  const platters = [];
  for (const x of [-0.72, 0.72]) {
    f.add(G.box, mats.darkSteel, M(x, 1.08, 0, { sx: 0.62, sy: 0.07, sz: 0.5 }));
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 16), mats.black);
    p.position.set(x, 1.13, 0);
    p.applyMatrix4(m4);
    platters.push(p);
  }
  return platters;
}

/** Speaker stack (≈1 × 0.8 × 2.2), front +Z. */
export function speakerStack(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.box, mats.black, M(0, 0.55, 0, { sx: 1.0, sy: 1.1, sz: 0.8 }));
  f.add(G.box, mats.black, M(0, 1.6, 0, { sx: 0.9, sy: 1.0, sz: 0.75 }));
  f.add(G.cyl, mats.darkSteel, M(0, 0.55, 0.41, { rx: Math.PI / 2, sx: 0.8, sy: 0.04, sz: 0.8 }));
  f.add(G.cyl, mats.gold, M(0, 0.55, 0.43, { rx: Math.PI / 2, sx: 0.2, sy: 0.03, sz: 0.2 }));
  for (const y of [1.35, 1.85]) {
    f.add(G.cyl, mats.darkSteel, M(0, y, 0.385, { rx: Math.PI / 2, sx: 0.42, sy: 0.04, sz: 0.42 }));
    f.add(G.cyl, mats.gold, M(0, y, 0.4, { rx: Math.PI / 2, sx: 0.12, sy: 0.03, sz: 0.12 }));
  }
  f.add(G.box, mats.gold, M(0, 2.11, 0, { sx: 0.92, sy: 0.02, sz: 0.77 }));
}

/** Fire bowl on a pedestal; returns the local flame anchor in world coords. */
export function fireBowl(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.cyl, mats.black, M(0, 0.3, 0, { sx: 0.25, sy: 0.6, sz: 0.25 }));
  f.add(G.cyl, mats.black, M(0, 0.02, 0, { sx: 0.6, sy: 0.04, sz: 0.6 }));
  f.add(G.sphere, mats.black, M(0, 0.72, 0, { sx: 1.1, sy: 0.45, sz: 1.1 }));
  f.add(G.torus, mats.gold, M(0, 0.8, 0, { rx: Math.PI / 2, s: 1.02 }));
  f.add(G.cyl, mats.rubber, M(0, 0.82, 0, { sx: 0.95, sy: 0.04, sz: 0.95 }));
  return new THREE.Vector3(0, 0.84, 0).applyMatrix4(m4);
}

/** Low helipad floodlight (≈0.5 m), aimed at the board (+Z front). */
export function padFlood(batch, mats, m4) {
  const f = batch.frame(m4);
  f.add(G.box, mats.darkSteel, M(0, 0.12, 0, { sx: 0.5, sy: 0.24, sz: 0.4 }));
  f.add(G.box, mats.black, M(0, 0.36, 0, { rx: -0.35, sx: 0.46, sy: 0.3, sz: 0.3 }));
  f.add(G.box, mats.ledWarm, M(0, 0.4, 0.15, { rx: -0.35, sx: 0.38, sy: 0.22, sz: 0.02 }));
}

/** Rooftop access penthouse (elevator / stairs) with gold-framed lit doors, front +Z. */
export function penthouse(batch, mats, m4, { w = 7, d = 5, h = 3.4 } = {}) {
  const f = batch.frame(m4);
  f.add(G.box, mats.concrete, M(0, h / 2, 0, { sx: w, sy: h, sz: d }));
  f.add(G.box, mats.black, M(0, h + 0.1, 0, { sx: w + 0.3, sy: 0.2, sz: d + 0.3 }));
  f.add(G.box, mats.ledGold, M(0, h + 0.02, d / 2 + 0.16, { sx: w + 0.3, sy: 0.04, sz: 0.02 }));
  f.add(G.box, mats.gold, M(0, 1.3, d / 2 + 0.02, { sx: 2.3, sy: 2.6, sz: 0.06 }));
  f.add(G.box, mats.ledWarm, M(0, 1.25, d / 2 + 0.06, { sx: 2.0, sy: 2.4, sz: 0.02 }));
  f.add(G.box, mats.gold, M(0, 1.25, d / 2 + 0.08, { sx: 0.04, sy: 2.4, sz: 0.02 }));
}

/** Flag pole + returns cloth mesh (animated by CPU wave, flat-shaded). */
export function flag(batch, mats, m4, tex) {
  const f = batch.frame(m4);
  f.add(G.cyl, mats.steel, M(0, 2.4, 0, { sx: 0.07, sy: 4.8, sz: 0.07 }));
  f.add(G.sphere, mats.gold, M(0, 4.85, 0, { s: 0.14 }));
  const geo = new THREE.PlaneGeometry(1.8, 1.1, 10, 4);
  geo.translate(0.9, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8, flatShading: true }));
  cloth.position.set(0.05, 4.1, 0);
  cloth.applyMatrix4(m4);
  cloth.castShadow = false;
  cloth.userData.base = Float32Array.from(geo.attributes.position.array);
  return cloth;
}
