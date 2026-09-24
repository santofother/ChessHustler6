// Pieces: GLB loading with procedural fallbacks, per-team tinting, board sync (diff-based) and
// per-type move animations (thug hop, bike stunt jump, race-car drift, armored truck, heli flight, boss swagger).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  sqToXZ, yawFor, teamYaw, lerpAngle, angleDelta, lerp, Ease, canvasTexture, rng,
} from './util.js';

export const PIECE_TYPES = ['p', 'n', 'b', 'r', 'q', 'k'];
const TYPE_FILE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const TYPE_HEIGHT = { p: 0.7, n: 0.8, b: 0.7, r: 0.85, q: 1.1, k: 1.2 };
export const MOVE_DURATION = { p: 0.6, n: 0.9, b: 0.8, r: 1.0, q: 1.2, k: 0.8 };
const CASH = { p: 1000, n: 3000, b: 3000, r: 5000, q: 9000, k: 0 };

// ======================================================================= model loading
/** Loads GLBs; resolves a map name -> THREE.Object3D | null. Never rejects. */
export async function loadModels(names, onProgress) {
  const loader = new GLTFLoader();
  const out = {};
  let done = 0;
  const total = names.length;
  await Promise.allSettled(names.map(async (name) => {
    try {
      const res = await fetch(`models/${name}.glb`.replace(/^/, baseUrl()), { method: 'GET' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || type.includes('text/html')) throw new Error('missing');
      const buf = await res.arrayBuffer();
      // GLB magic 'glTF'
      if (buf.byteLength < 12 || new Uint32Array(buf, 0, 1)[0] !== 0x46546c67) throw new Error('not a glb');
      const gltf = await loader.parseAsync(buf, baseUrl() + 'models/');
      out[name] = gltf.scene;
    } catch (e) {
      out[name] = null;
    } finally {
      done++;
      try { onProgress && onProgress(done / total); } catch (_) { /* ignore */ }
    }
  }));
  return out;
}
function baseUrl() {
  const b = (import.meta.env && import.meta.env.BASE_URL) || '/';
  return b.endsWith('/') ? b : b + '/';
}

// ======================================================================= materials
const M = {};
function commonMats() {
  if (M.ready) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.skin = std({ color: 0xc98d68, roughness: 0.65 });
  M.hair = std({ color: 0x1c1410, roughness: 0.6 });
  M.jeans = std({ color: 0x2d3b5e, roughness: 0.85 });
  M.tire = std({ color: 0x141418, roughness: 0.92 });
  M.chrome = std({ color: 0xe6e6ee, metalness: 1, roughness: 0.18 });
  M.darkMetal = std({ color: 0x2a2a30, metalness: 0.7, roughness: 0.4 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1422, metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 2 });
  M.shades = std({ color: 0x050507, metalness: 0.6, roughness: 0.08, envMapIntensity: 2.5 });
  M.gold = std({ color: 0xffc34d, metalness: 1, roughness: 0.22, emissive: 0x5a3500, emissiveIntensity: 0.4 });
  M.base = std({ color: 0x17151c, roughness: 0.5, metalness: 0.3 });
  M.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4d8).multiplyScalar(4) });
  M.tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(3.5) });
  M.ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6020).multiplyScalar(5) });
  M.screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ff5ff).multiplyScalar(2.5) });
  M.ready = true;
  for (const k in M) if (M[k] && M[k].isMaterial) M[k].userData.shared = true;
  return M;
}

const TEAM_DEF = {
  w: { primary: 0xf3f1ec, accent: 0x29e3d6, accent2: 0xff5fa2, pants: 0xf0ece4, name: 'Vice Crew' },
  b: { primary: 0x151519, accent: 0xffc34d, accent2: 0x9dff3c, pants: 0x1a1a1f, name: 'Cartel Nocturno' },
};
const TEAM = {};
export function teamMats(color) {
  if (TEAM[color]) return TEAM[color];
  const d = TEAM_DEF[color];
  const white = color === 'w';
  const primary = white
    ? new THREE.MeshPhysicalMaterial({ color: d.primary, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, name: 'TEAM_PRIMARY_w' })
    : new THREE.MeshPhysicalMaterial({ color: d.primary, roughness: 0.78, metalness: 0.25, clearcoat: 0.25, clearcoatRoughness: 0.6, name: 'TEAM_PRIMARY_b' });
  const accent = white
    ? new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.35, metalness: 0.1, emissive: d.accent, emissiveIntensity: 0.55 })
    : new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.28, metalness: 0.85, emissive: d.accent, emissiveIntensity: 0.35 });
  const accent2 = new THREE.MeshStandardMaterial({ color: d.accent2, roughness: 0.35, emissive: d.accent2, emissiveIntensity: 0.7 });
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.accent).multiplyScalar(3) });
  const neon2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.accent2).multiplyScalar(3) });
  const shirt = new THREE.MeshStandardMaterial({ map: floralTexture(color), roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: d.pants, roughness: 0.7 });
  const t = { primary, accent, accent2, neon, neon2, shirt, pants };
  for (const k in t) t[k].userData.shared = true;
  TEAM[color] = t;
  return t;
}

/**
 * Recolor a team's shared materials in place (every piece of that color updates at once).
 * colors = { primary:'#hex', accent:'#hex' } or null to restore the stock look. Black keeps a darkened body so
 * the two sides stay readable on the board.
 */
export function setTeamColors(color, colors) {
  const T = TEAM[color];
  const d = TEAM_DEF[color];
  if (!T || !d) return;
  const parse = (v, fb) => {
    try {
      return v ? new THREE.Color(v) : new THREE.Color(fb);
    } catch (_) {
      return new THREE.Color(fb);
    }
  };
  const base = new THREE.Color(d.primary);
  let primary = base.clone();
  if (colors && colors.primary) {
    primary = parse(colors.primary, d.primary);
    // keep the contrast between the sides: white stays light, black stays dark
    primary.lerp(base, color === 'b' ? 0.55 : 0.45);
  }
  const accent = colors && colors.accent ? parse(colors.accent, d.accent) : new THREE.Color(d.accent);
  T.primary.color.copy(primary);
  T.accent.color.copy(accent);
  T.accent.emissive.copy(accent);
  T.neon.color.copy(accent).multiplyScalar(3);
  if (colors && colors.primary) {
    const p2 = parse(colors.primary, d.accent2);
    T.accent2.color.copy(p2);
    T.accent2.emissive.copy(p2);
    T.neon2.color.copy(p2).multiplyScalar(3);
  } else {
    T.accent2.color.set(d.accent2);
    T.accent2.emissive.set(d.accent2);
    T.neon2.color.set(d.accent2).multiplyScalar(3);
  }
}

function floralTexture(color) {
  const white = color === 'w';
  const base = white ? '#f4f1ea' : '#141418';
  const leafA = white ? '#18b8ad' : '#e0a93a';
  const leafB = white ? '#ff5fa2' : '#86d932';
  const r = rng(white ? 11 : 22);
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 38; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI * 2, s = 10 + r() * 16;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        g.save(); g.translate(x + ox, y + oy); g.rotate(a);
        g.fillStyle = r() < 0.6 ? leafA : leafB;
        if (i % 4 === 0) { // hibiscus
          for (let p = 0; p < 5; p++) { g.rotate((Math.PI * 2) / 5); g.beginPath(); g.ellipse(s * 0.45, 0, s * 0.45, s * 0.28, 0, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = white ? '#ffd36b' : '#ffffff'; g.beginPath(); g.arc(0, 0, s * 0.15, 0, Math.PI * 2); g.fill();
        } else { // palm leaf
          g.beginPath(); g.ellipse(0, 0, s, s * 0.32, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = base; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke();
        }
        g.restore();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  return tex;
}

// ======================================================================= procedural models
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (rt, rb, h, mat, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
const cap = (r, l, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), mat);
const sph = (r, mat, ws = 14, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);

function baseDisc(T) {
  const g = new THREE.Group();
  const d = cyl(0.36, 0.37, 0.035, commonMats().base, 28); d.position.y = 0.0175; d.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.012, 6, 40), T.neon2);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.035;
  g.add(d, ring);
  g.name = 'base';
  return g;
}

function humanoid(T, { scale = 1, boss = false } = {}) {
  const C = commonMats();
  const g = new THREE.Group();
  const s = scale;
  const y0 = 0.035;
  // legs
  for (const sx of [-1, 1]) {
    const leg = cap(0.05 * s, 0.2 * s, boss ? T.pants : C.jeans);
    leg.position.set(sx * 0.06 * s, y0 + 0.16 * s, 0);
    g.add(leg);
    const shoe = box(0.08 * s, 0.05 * s, 0.14 * s, boss ? C.gold : T.accent2, sx * 0.06 * s, y0 + 0.025 * s, -0.02 * s);
    g.add(shoe);
  }
  // torso (floral shirt) + belly for the boss
  const torso = cap(0.11 * s, 0.14 * s, T.shirt);
  torso.scale.set(1, 1, boss ? 0.95 : 0.78);
  torso.position.set(0, y0 + 0.43 * s, 0);
  g.add(torso);
  // collar
  const collar = cyl(0.07 * s, 0.09 * s, 0.03 * s, T.shirt, 10); collar.position.set(0, y0 + 0.57 * s, 0); g.add(collar);
  // arms
  const armL = cap(0.035 * s, 0.17 * s, T.shirt);
  armL.position.set(-0.145 * s, y0 + 0.44 * s, 0); armL.rotation.z = -0.18; g.add(armL);
  const handL = sph(0.034 * s, C.skin, 8, 6); handL.position.set(-0.165 * s, y0 + 0.31 * s, 0); g.add(handL);
  const armR = new THREE.Group(); armR.position.set(0.145 * s, y0 + 0.53 * s, 0); armR.rotation.x = -1.05; armR.rotation.z = 0.25;
  const upR = cap(0.035 * s, 0.17 * s, T.shirt); upR.position.y = -0.1 * s; armR.add(upR);
  const handR = sph(0.034 * s, C.skin, 8, 6); handR.position.y = -0.22 * s; armR.add(handR);
  g.add(armR);
  if (!boss) {
    // phone
    const phone = box(0.05 * s, 0.085 * s, 0.012 * s, C.darkMetal); phone.position.set(0, -0.23 * s, -0.03 * s); phone.rotation.x = 1.0;
    const scr = box(0.042 * s, 0.07 * s, 0.002, C.screen); scr.position.set(0, 0, -0.007 * s); phone.add(scr);
    armR.add(phone);
  } else {
    // cigar with glowing tip
    const cigar = cyl(0.008 * s, 0.008 * s, 0.07 * s, C.darkMetal, 6); cigar.rotation.x = Math.PI / 2;
    cigar.position.set(0.03 * s, y0 + 0.645 * s, -0.1 * s);
    const tip = sph(0.01 * s, C.ember, 6, 4); tip.position.set(0, -0.035 * s, 0); cigar.add(tip);
    g.add(cigar);
  }
  // neck + head
  const neck = cyl(0.035 * s, 0.04 * s, 0.05 * s, C.skin, 8); neck.position.set(0, y0 + 0.6 * s, 0); g.add(neck);
  const head = sph(0.085 * s, C.skin); head.scale.set(1, 1.08, 1); head.position.set(0, y0 + 0.68 * s, 0); g.add(head);
  const nose = box(0.02 * s, 0.03 * s, 0.03 * s, C.skin, 0, y0 + 0.67 * s, -0.085 * s); g.add(nose);
  if (boss) {
    const hair = sph(0.088 * s, C.hair, 12, 8); hair.scale.set(1, 0.6, 1.05); hair.position.set(0, y0 + 0.73 * s, 0.01 * s); g.add(hair);
    const shades = box(0.15 * s, 0.035 * s, 0.02 * s, C.shades, 0, y0 + 0.695 * s, -0.08 * s); g.add(shades);
    // gold chain
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.085 * s, 0.012 * s, 6, 24), C.gold);
    chain.rotation.x = Math.PI / 2 - 0.35; chain.position.set(0, y0 + 0.55 * s, -0.03 * s); g.add(chain);
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.008 * s, 12), C.gold);
    medal.rotation.x = Math.PI / 2; medal.position.set(0, y0 + 0.47 * s, -0.1 * s); g.add(medal);
    // watch
    const watch = cyl(0.04 * s, 0.04 * s, 0.02 * s, C.gold, 10); watch.position.set(-0.165 * s, y0 + 0.345 * s, 0); g.add(watch);
    // floating neon crown hologram (chess-readable king marker)
    const crown = new THREE.Group(); crown.name = 'crown';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07 * s, 0.008 * s, 6, 24), T.neon);
    ring.rotation.x = Math.PI / 2; crown.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.014 * s, 0.05 * s, 4), T.neon);
      spike.position.set(Math.cos(a) * 0.07 * s, 0.025 * s, Math.sin(a) * 0.07 * s);
      crown.add(spike);
    }
    crown.position.set(0, y0 + 0.86 * s, 0);
    g.add(crown);
  } else {
    // backwards snapback cap in team accent
    const capTop = sph(0.09 * s, T.accent, 12, 8, 0); capTop.scale.set(1, 0.62, 1); capTop.position.set(0, y0 + 0.725 * s, 0); g.add(capTop);
    const brim = box(0.1 * s, 0.012 * s, 0.08 * s, T.accent, 0, y0 + 0.72 * s, 0.1 * s); g.add(brim);
    const shades = box(0.13 * s, 0.022 * s, 0.015 * s, C.shades, 0, y0 + 0.695 * s, -0.08 * s); g.add(shades);
  }
  return g;
}

function wheel(r, w, name) {
  const C = commonMats();
  const g = new THREE.Group(); g.name = name;
  const t = cyl(r, r, w, C.tire, 16); t.rotation.z = Math.PI / 2; g.add(t);
  const rim = cyl(r * 0.62, r * 0.62, w + 0.004, C.chrome, 10); rim.rotation.z = Math.PI / 2; g.add(rim);
  return g;
}

function sideProfile(points, width, mat, bevel = 0.01) {
  // points: [[forward, y]...]; forward = -Z
  const s = new THREE.Shape();
  points.forEach(([u, y], i) => (i ? s.lineTo(u, y) : s.moveTo(u, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(Math.PI / 2); // shape x (forward) -> -Z
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function buildPawn(T) { const g = new THREE.Group(); g.add(baseDisc(T), humanoid(T, { scale: 1 })); return g; }
function buildKing(T) { const g = new THREE.Group(); g.add(baseDisc(T)); const h = humanoid(T, { scale: 1.3, boss: true }); g.add(h); return g; }

function buildKnight(T) {
  const C = commonMats();
  const g = new THREE.Group(); g.add(baseDisc(T));
  const bike = new THREE.Group(); bike.position.y = 0.035; g.add(bike);
  const R = 0.12;
  const wf = wheel(R, 0.06, 'wheel_f'); wf.position.set(0, R, -0.27);
  const wr = wheel(R, 0.075, 'wheel_r'); wr.position.set(0, R, 0.25);
  bike.add(wf, wr);
  // fairing / tank / tail (sport-bike silhouette)
  const body = sideProfile([[0.34, 0.2], [0.3, 0.32], [0.16, 0.38], [0.06, 0.36], [-0.08, 0.33], [-0.2, 0.36], [-0.32, 0.4], [-0.3, 0.3], [-0.1, 0.2], [0.1, 0.17]], 0.13, T.primary, 0.015);
  bike.add(body);
  const stripe = sideProfile([[0.32, 0.25], [0.28, 0.3], [-0.26, 0.37], [-0.28, 0.33], [0.1, 0.26]], 0.145, T.accent, 0);
  bike.add(stripe);
  const engine = box(0.1, 0.1, 0.16, C.darkMetal, 0, 0.17, 0.02); bike.add(engine);
  const fork = cyl(0.012, 0.012, 0.28, C.chrome, 6); fork.position.set(0, 0.24, -0.29); fork.rotation.x = -0.35; bike.add(fork);
  const bars = cyl(0.01, 0.01, 0.22, C.darkMetal, 6); bars.rotation.z = Math.PI / 2; bars.position.set(0, 0.39, -0.2); bike.add(bars);
  const exhaust = cyl(0.022, 0.018, 0.2, C.chrome, 8); exhaust.rotation.x = Math.PI / 2 - 0.25; exhaust.position.set(0.06, 0.24, 0.22); bike.add(exhaust);
  const hl = box(0.06, 0.03, 0.01, C.head, 0, 0.27, -0.345); bike.add(hl);
  const tl = box(0.05, 0.02, 0.01, C.tail, 0, 0.37, 0.325); bike.add(tl);
  const glassShield = sideProfile([[0.3, 0.32], [0.22, 0.42], [0.18, 0.4], [0.22, 0.33]], 0.1, C.glass, 0); bike.add(glassShield);
  // rider leaning forward
  const rider = new THREE.Group(); rider.position.set(0, 0.36, 0.02); bike.add(rider);
  const torso = cap(0.075, 0.16, T.primary); torso.rotation.x = -0.95; torso.position.set(0, 0.1, -0.03); rider.add(torso);
  const back = cap(0.05, 0.12, T.accent2); back.rotation.x = -0.95; back.position.set(0, 0.14, 0.0); back.scale.set(0.6, 1, 0.6); rider.add(back);
  const helmet = sph(0.075, T.accent); helmet.position.set(0, 0.25, -0.12); rider.add(helmet);
  const visor = sph(0.066, C.glass); visor.scale.set(1, 0.55, 1); visor.position.set(0, 0.25, -0.145); rider.add(visor);
  for (const sx of [-1, 1]) {
    const arm = cap(0.028, 0.16, T.primary); arm.position.set(sx * 0.08, 0.1, -0.15); arm.rotation.x = -1.1; rider.add(arm);
    const leg = cap(0.035, 0.16, C.jeans); leg.position.set(sx * 0.075, -0.02, 0.06); leg.rotation.x = 0.9; rider.add(leg);
  }
  return g;
}

function buildBishop(T) {
  const C = commonMats();
  const g = new THREE.Group(); g.add(baseDisc(T));
  const car = new THREE.Group(); car.position.y = 0.035; g.add(car);
  const R = 0.08;
  for (const [x, z, n] of [[-0.2, -0.24, 'wheel_fl'], [0.2, -0.24, 'wheel_fr'], [-0.2, 0.25, 'wheel_rl'], [0.2, 0.25, 'wheel_rr']]) {
    const w = wheel(R, 0.07, n); w.position.set(x, R, z); car.add(w);
  }
  // wedge body (touring car)
  const body = sideProfile([[0.39, 0.07], [0.4, 0.13], [0.3, 0.18], [0.12, 0.2], [-0.3, 0.21], [-0.38, 0.2], [-0.39, 0.08], [-0.3, 0.05], [0.3, 0.05]], 0.42, T.primary, 0.02);
  car.add(body);
  const cabin = sideProfile([[0.14, 0.2], [0.02, 0.31], [-0.14, 0.31], [-0.24, 0.21]], 0.34, C.glass, 0.015);
  car.add(cabin);
  const roof = sideProfile([[0.02, 0.305], [-0.14, 0.305], [-0.13, 0.318], [0.0, 0.318]], 0.3, T.primary, 0.005);
  car.add(roof);
  // livery: twin racing stripes + side stripe
  for (const sx of [-0.045, 0.045]) {
    const st = box(0.045, 0.006, 0.8, T.accent, sx, 0.0, 0); st.position.y = 0.214; st.scale.z = 0.98; car.add(st);
  }
  for (const sx of [-1, 1]) {
    const side = box(0.004, 0.035, 0.6, T.accent2, sx * 0.222, 0.13, 0.02); car.add(side);
  }
  const splitter = box(0.44, 0.015, 0.06, C.darkMetal, 0, 0.06, -0.38); car.add(splitter);
  // rear wing
  const wing = box(0.46, 0.014, 0.1, T.accent, 0, 0.42, 0.33); wing.rotation.x = 0.12; car.add(wing);
  for (const sx of [-1, 1]) {
    const strut = box(0.012, 0.2, 0.04, C.darkMetal, sx * 0.12, 0.31, 0.34); car.add(strut);
    const plate = box(0.01, 0.08, 0.12, T.accent2, sx * 0.23, 0.42, 0.33); car.add(plate);
  }
  for (const sx of [-1, 1]) {
    const h = box(0.08, 0.03, 0.01, C.head, sx * 0.14, 0.14, -0.39); h.rotation.x = -0.4; car.add(h);
    const t = box(0.09, 0.025, 0.01, C.tail, sx * 0.14, 0.17, 0.395); car.add(t);
  }
  return g;
}

function buildRook(T) {
  const C = commonMats();
  const g = new THREE.Group(); g.add(baseDisc(T));
  const tr = new THREE.Group(); tr.position.y = 0.035; g.add(tr);
  const R = 0.09;
  for (const [z, n] of [[-0.25, 'f'], [0.13, 'm'], [0.29, 'r']]) for (const sx of [-1, 1]) {
    const w = wheel(R, 0.08, `wheel_${n}${sx > 0 ? 'r' : 'l'}`); w.position.set(sx * 0.21, R, z); tr.add(w);
  }
  const chassis = box(0.44, 0.08, 0.76, C.darkMetal, 0, 0.12, 0); tr.add(chassis);
  // cab
  const cab = sideProfile([[0.38, 0.16], [0.38, 0.36], [0.3, 0.52], [0.12, 0.54], [0.12, 0.16]], 0.46, T.primary, 0.02); tr.add(cab);
  const wind = sideProfile([[0.36, 0.38], [0.3, 0.5], [0.27, 0.5], [0.33, 0.38]], 0.4, C.glass, 0); tr.add(wind);
  // armored cargo box
  const cargo = box(0.48, 0.58, 0.54, T.primary, 0, 0.45, 0.1); tr.add(cargo);
  const band = box(0.49, 0.07, 0.55, T.accent, 0, 0.55, 0.1); tr.add(band);
  const bandLow = box(0.49, 0.03, 0.55, T.accent2, 0, 0.3, 0.1); tr.add(bandLow);
  // rivet plates + vault door
  const door = box(0.34, 0.4, 0.012, C.darkMetal, 0, 0.44, 0.375); tr.add(door);
  const wheelLock = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), T.accent); wheelLock.position.set(0, 0.44, 0.385); tr.add(wheelLock);
  // roof light bar + bull bar
  const bar = box(0.3, 0.035, 0.06, C.darkMetal, 0, 0.56, -0.2); tr.add(bar);
  const b1 = box(0.12, 0.03, 0.05, T.neon, -0.08, 0.585, -0.2); const b2 = box(0.12, 0.03, 0.05, T.neon2, 0.08, 0.585, -0.2); tr.add(b1, b2);
  const bull = box(0.46, 0.08, 0.04, C.chrome, 0, 0.2, -0.4); tr.add(bull);
  for (const sx of [-1, 1]) {
    const h = box(0.07, 0.04, 0.01, C.head, sx * 0.15, 0.28, -0.385); tr.add(h);
    const slit = box(0.004, 0.04, 0.3, C.darkMetal, sx * 0.242, 0.62, 0.1); tr.add(slit);
  }
  // roof hatch / gun-port turret
  const hatch = cyl(0.08, 0.09, 0.05, T.primary, 12); hatch.position.set(0, 0.765, 0.12); tr.add(hatch);
  const ant = cyl(0.004, 0.004, 0.2, C.darkMetal, 4); ant.position.set(0.18, 0.84, 0.3); tr.add(ant);
  return g;
}

function buildQueen(T) {
  const C = commonMats();
  const g = new THREE.Group(); g.add(baseDisc(T));
  // hover-pad beam (fades while flying)
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_DEF[T === TEAM.w ? 'w' : 'b'].accent).multiplyScalar(0.9), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  beamMat.userData.shared = false;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 0.42, 20, 1, true), beamMat);
  beam.position.y = 0.035 + 0.21; beam.name = 'hover_beam';
  g.add(beam);
  const heli = new THREE.Group(); heli.position.y = 0.48; heli.name = 'heli'; g.add(heli);
  const fus = sph(0.17, T.primary, 18, 12); fus.scale.set(1, 0.95, 1.45); heli.add(fus);
  const glass = sph(0.14, C.glass, 16, 10); glass.scale.set(1, 0.9, 1.2); glass.position.set(0, 0.03, -0.1); heli.add(glass);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.018, 6, 28), T.accent); stripe.scale.set(1, 1.45, 1); stripe.rotation.y = Math.PI / 2; stripe.position.y = -0.02; heli.add(stripe);
  // tail boom + fin
  const boom = cyl(0.035, 0.06, 0.42, T.primary, 10); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.04, 0.38); heli.add(boom);
  const fin = sideProfile([[-0.5, 0.02], [-0.6, 0.18], [-0.64, 0.18], [-0.6, 0.02]], 0.02, T.accent, 0); fin.rotation.y = Math.PI; heli.add(fin);
  const hstab = box(0.2, 0.012, 0.05, T.accent2, 0, 0.05, 0.52); heli.add(hstab);
  const tail = new THREE.Group(); tail.name = 'tail_rotor'; tail.position.set(0.035, 0.12, 0.6);
  for (let i = 0; i < 2; i++) { const bl = box(0.006, 0.16, 0.02, C.darkMetal); bl.rotation.x = i * Math.PI / 2; tail.add(bl); }
  heli.add(tail);
  // skids
  for (const sx of [-1, 1]) {
    const skid = cyl(0.012, 0.012, 0.44, C.chrome, 6); skid.rotation.x = Math.PI / 2; skid.position.set(sx * 0.14, -0.2, -0.02); heli.add(skid);
    for (const z of [-0.12, 0.1]) { const st = cyl(0.008, 0.008, 0.12, C.chrome, 4); st.position.set(sx * 0.12, -0.15, z); st.rotation.z = sx * 0.4; heli.add(st); }
  }
  // underglow + searchlight
  const under = box(0.12, 0.01, 0.3, T.neon2, 0, -0.16, 0); heli.add(under);
  const search = sph(0.03, C.head, 8, 6); search.position.set(0, -0.12, -0.22); heli.add(search);
  // mast + main rotor
  const mast = cyl(0.02, 0.02, 0.1, C.darkMetal, 8); mast.position.y = 0.2; heli.add(mast);
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.y = 0.25;
  const hub = cyl(0.035, 0.035, 0.03, C.darkMetal, 10); rotor.add(hub);
  for (let i = 0; i < 4; i++) {
    const bl = box(0.035, 0.008, 0.4, C.darkMetal); bl.position.z = 0.2; const piv = new THREE.Group(); piv.rotation.y = (i * Math.PI) / 2; piv.add(bl);
    const tip = box(0.036, 0.009, 0.04, T.accent2); tip.position.z = 0.38; piv.add(tip);
    rotor.add(piv);
  }
  // motion blur disc (visible when spinning fast)
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x222228, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), blurMat); blur.rotation.x = -Math.PI / 2; blur.name = 'rotor_blur';
  rotor.add(blur);
  heli.add(rotor);
  return g;
}

const BUILDERS = { p: buildPawn, n: buildKnight, b: buildBishop, r: buildRook, q: buildQueen, k: buildKing };

// ======================================================================= templates
function prepGLB(scene, type, color) {
  const T = teamMats(color);
  const root = scene.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const swap = (m) => {
      const n = (m && m.name) || '';
      if (/^TEAM_ACCENT_?2/i.test(n)) return T.accent2;
      if (/^TEAM_PRIMARY/i.test(n)) return T.primary;
      if (/^TEAM_ACCENT/i.test(n)) return T.accent;
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  // normalize: base center at origin, height per contract
  root.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(root);
  const size = box3.getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  if (size.y > 1e-4) {
    const s = TYPE_HEIGHT[type] / size.y;
    // GLBs are authored at real scale (bishop car is intentionally low): only rescale if wildly off
    if (s < 0.5 || s > 2) root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root);
    const c = b2.getCenter(new THREE.Vector3());
    root.position.x -= c.x; root.position.z -= c.z; root.position.y -= b2.min.y;
  }
  holder.add(root);
  holder.userData.glb = true;
  return holder;
}

// ======================================================================= Pieces manager
export class Pieces {
  constructor({ tweener, effects }) {
    this.tweener = tweener;
    this.effects = effects;
    this.group = new THREE.Group();
    this.group.name = 'pieces';
    this.bySquare = new Map();
    this.all = new Set();          // includes dying pieces
    this.templates = {};           // `${type}${color}` -> Object3D
    this.onFx = () => {};
    this._hoverSq = null;
    this._selectedSq = null;
    this._active = null;           // current move context
    this.glbTypes = new Set();
  }

  /** models: map from loadModels. */
  init(models = {}) {
    commonMats();
    for (const c of ['w', 'b']) {
      teamMats(c);
      for (const t of PIECE_TYPES) {
        const glb = models[TYPE_FILE[t]];
        let tmpl = null;
        if (glb) {
          try { tmpl = prepGLB(glb, t, c); this.glbTypes.add(t); } catch (e) { console.warn('[world] bad GLB', t, e); }
        }
        if (!tmpl) tmpl = BUILDERS[t](TEAM[c]);
        tmpl.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.templates[t + c] = tmpl;
      }
    }
  }

  _spawn(type, color, square) {
    const tmpl = this.templates[type + color];
    const model = tmpl.clone(true);
    // per-instance materials that animate (hover beam) must not be shared
    model.traverse((o) => { if (o.name === 'hover_beam') o.material = o.material.clone(); });
    const root = new THREE.Group();
    const body = new THREE.Group();
    const idle = new THREE.Group();
    root.add(body); body.add(idle); idle.add(model);
    const p = {
      type, color, square, root, body, idle, model,
      rotor: null, tailRotor: null, wheels: [], crown: null, beam: null, blur: null,
      phase: Math.random() * Math.PI * 2, lift: 0, rotorSpeed: 1, wheelSpin: 0, flying: 0,
    };
    model.traverse((o) => {
      const n = o.name || '';
      if (/^rotor(?!_blur)/i.test(n) && !p.rotor) p.rotor = o;
      else if (/^tail_rotor/i.test(n) && !p.tailRotor) p.tailRotor = o;
      else if (/^wheel/i.test(n)) p.wheels.push(o);
      else if (n === 'crown') p.crown = o;
      else if (n === 'hover_beam') p.beam = o;
      else if (n === 'rotor_blur') p.blur = o;
    });
    // strip wheels that are children of other wheels (avoid double spin)
    p.wheels = p.wheels.filter((w) => !p.wheels.some((o) => o !== w && isAncestor(o, w)));
    if (p.crown) p.crownY0 = p.crown.position.y;
    root.userData.square = square;
    root.userData.piece = p;
    this._place(p, square);
    this.group.add(root);
    this.all.add(p);
    return p;
  }

  _place(p, square) {
    const { x, z } = sqToXZ(square);
    p.root.position.set(x, 0, z);
    p.root.rotation.set(0, teamYaw(p.color), 0);
    p.body.position.set(0, 0, 0);
    p.body.rotation.set(0, 0, 0);
    p.body.scale.set(1, 1, 1);
    p.square = square;
    p.root.userData.square = square;
    p.flying = 0;
    p.dragging = false;
  }

  _remove(p) {
    this.group.remove(p.root);
    this.all.delete(p);
    p.dead = true;
    // clone()-shared geometry/materials: only per-instance beam material is disposed
    if (p.beam) p.beam.material.dispose();
  }

  // ------------------------------------------------------------- sync
  setPosition(board) {
    if (this._active) this._finishActive();
    const want = new Map();
    for (const row of board || []) for (const cell of row || []) if (cell && cell.square) want.set(cell.square, cell);
    for (const [sq, p] of [...this.bySquare]) {
      const w = want.get(sq);
      if (!w || w.type !== p.type || w.color !== p.color) { this._remove(p); this.bySquare.delete(sq); }
      else {
        // keep, but make sure it's at rest
        if (p.root.position.distanceToSquared(new THREE.Vector3(sqToXZ(sq).x, 0, sqToXZ(sq).z)) > 1e-6) this._place(p, sq);
      }
    }
    for (const [sq, cell] of want) {
      if (!this.bySquare.has(sq)) this.bySquare.set(sq, this._spawn(cell.type, cell.color, sq));
    }
  }

  pieceAt(sq) { return this.bySquare.get(sq) || null; }

  setHover(sq) { this._hoverSq = sq; }
  setSelected(sq) { this._selectedSq = sq; }

  // ------------------------------------------------------------- drag & drop
  /** Hold the piece on `sq` lifted at world x/z (the pointer's spot on the board). */
  dragTo(sq, x, z) {
    const p = this.bySquare.get(sq);
    if (!p || this._active) return false;
    p.dragging = true;
    p.root.position.x = x;
    p.root.position.z = z;
    return true;
  }

  /**
   * Release a dragged piece. With `drop`, the next animateMove from `sq` to `drop` settles the piece from where
   * it was released instead of replaying the whole trip; without it the piece slides back to its square.
   */
  endDrag(sq, { drop = null } = {}) {
    const p = this.bySquare.get(sq);
    if (!p || !p.dragging) return;
    if (drop) {
      this._drop = { from: sq, to: drop };
      return; // stays lifted where it was released until animateMove picks it up
    }
    p.dragging = false;
    const a = sqToXZ(sq);
    const x0 = p.root.position.x, z0 = p.root.position.z;
    this.tweener.tween(0.18, (k) => {
      const e = Ease.outCubic(k);
      p.root.position.x = x0 + (a.x - x0) * e;
      p.root.position.z = z0 + (a.z - z0) * e;
    });
  }

  /** A dropped piece glides the last bit onto its target square and lands. */
  _settlePiece(p, to, token, onImpact) {
    const b = sqToXZ(to);
    const R = p.root;
    const x0 = R.position.x, z0 = R.position.z;
    R.rotation.y = teamYaw(p.color);
    return this.tweener.tween(0.22, (k) => {
      const e = Ease.outCubic(k);
      R.position.x = x0 + (b.x - x0) * e;
      R.position.z = z0 + (b.z - z0) * e;
      if (k >= 1) {
        p.dragging = false;
        if (onImpact) onImpact();
        this.effects.dust(b.x, b.z, 6, 0.5);
        this.onFx('land', { type: p.type });
      }
    }, { token });
  }

  // ------------------------------------------------------------- per frame
  update(dt, t) {
    for (const p of this.all) {
      if (p.dead) continue;
      const isHover = !this._active && p.square === this._hoverSq && !p.flying;
      const isSel = p.square === this._selectedSq && !p.flying;
      const targetLift = p.dragging ? 0.45 : isSel ? 0.1 + Math.sin(t * 5 + p.phase) * 0.025 : isHover ? 0.06 : 0;
      p.lift += (targetLift - p.lift) * Math.min(1, dt * (p.dragging ? 18 : 12));
      let y = p.lift;
      const breathe = Math.sin(t * 2.2 + p.phase);
      switch (p.type) {
        case 'p': case 'k':
          p.idle.scale.set(1 - breathe * 0.006, 1 + breathe * 0.012, 1 - breathe * 0.006);
          break;
        case 'q':
          y += Math.sin(t * 1.8 + p.phase) * 0.02;
          break;
        default: // vehicles: engine idle shiver
          p.idle.rotation.z = Math.sin(t * 38 + p.phase) * 0.0035;
      }
      p.idle.position.y = y;
      if (p.rotor) {
        p.rotor.rotation.y += dt * 14 * p.rotorSpeed;
        if (p.blur) p.blur.material.opacity = 0.1 + 0.12 * Math.min(1, p.rotorSpeed / 2);
      }
      if (p.tailRotor) p.tailRotor.rotation.x += dt * 30 * p.rotorSpeed;
      if (p.crown) { p.crown.rotation.y += dt * 1.2; p.crown.position.y = p.crownY0 + Math.sin(t * 2 + p.phase) * 0.015; }
      if (p.beam) p.beam.material.opacity = 0.16 * (1 - Math.min(1, p.flying * 3)) * (0.8 + 0.2 * Math.sin(t * 6 + p.phase));
      if (p.wheelSpin) for (const w of p.wheels) w.rotation.x -= p.wheelSpin * dt;
    }
  }

  // ------------------------------------------------------------- animateMove
  async animateMove(args) {
    try {
      return await this._animateMove(args);
    } catch (e) {
      console.error('[world] animateMove failed, snapping', e);
      if (this._active) this._finishActive();
    }
  }

  async _animateMove({ from, to, piece, captured = null, promotion, castle = null }) {
    if (this._active) this._finishActive();
    const tw = this.tweener;
    const token = { cancelled: false };
    const type = piece?.type || this.bySquare.get(from)?.type || 'p';
    const color = piece?.color || this.bySquare.get(from)?.color || 'w';

    // ---- logical bookkeeping first (so visuals can always be snapped) ----
    let mover = this.bySquare.get(from);
    if (!mover || mover.type !== type || mover.color !== color) {
      if (mover) this._remove(mover);
      mover = this._spawn(type, color, from);
    }
    this.bySquare.delete(from);
    let victim = null;
    if (captured) {
      const vsq = captured.square || to;
      const v = this.bySquare.get(vsq);
      if (v && v !== mover) { victim = v; this.bySquare.delete(vsq); }
    }
    const blocker = this.bySquare.get(to);
    if (blocker && blocker !== mover) { if (!victim) victim = blocker; else this._remove(blocker); this.bySquare.delete(to); }
    this.bySquare.set(to, mover);
    mover.square = to; mover.root.userData.square = to;

    let rook = null;
    if (castle && castle.rookFrom && castle.rookTo) {
      rook = this.bySquare.get(castle.rookFrom) || null;
      if (rook) {
        this.bySquare.delete(castle.rookFrom);
        const rb = this.bySquare.get(castle.rookTo);
        if (rb && rb !== rook) { this._remove(rb); }
        this.bySquare.set(castle.rookTo, rook);
        rook.square = castle.rookTo; rook.root.userData.square = castle.rookTo;
      }
    }

    const ctx = { token, mover, victim, rook, to, castle, promotion, color, victimState: victim ? 'pending' : 'none', promoted: false, captured };
    this._active = ctx;

    // a drag-and-drop move: the piece is already over its target, so it just settles instead of replaying the trip
    const dropped = this._drop && this._drop.from === from && this._drop.to === to && mover.dragging;
    this._drop = null;

    const run = async () => {
      this.onFx('move', { type, color, from, to });
      if (castle) this.onFx('castle', { color });
      const onImpact = victim ? () => this._doCapture(ctx) : null;
      const jobs = [dropped ? this._settlePiece(mover, to, token, onImpact) : this._animatePiece(mover, from, to, token, onImpact)];
      if (rook) {
        jobs.push(tw.wait(0.15, token).then(() => (token.cancelled ? null : this._animatePiece(rook, castle.rookFrom, castle.rookTo, token, null))));
      }
      await Promise.all(jobs);
      if (token.cancelled) return;
      if (victim && ctx.victimState === 'pending') this._doCapture(ctx);
      if (promotion && promotion !== 'p') await this._doPromotion(ctx, true);
    };

    const limit = Math.max(3000, 3000 / Math.max(0.1, tw.speed));
    let timer;
    const timeout = new Promise((res) => { timer = setTimeout(() => res('timeout'), limit); });
    const result = await Promise.race([run().then(() => 'done'), timeout]);
    clearTimeout(timer);
    if (result === 'timeout') console.warn('[world] animateMove timeout → snapping');
    if (this._active === ctx) this._finishActive();
  }

  /** Idempotent snap of the active move to its final state. */
  _finishActive() {
    const ctx = this._active;
    if (!ctx) return;
    this._active = null;
    this.tweener.cancel(ctx.token);
    const { mover, rook } = ctx;
    if (!mover.dead) { this._place(mover, ctx.to); mover.wheelSpin = 0; mover.rotorSpeed = 1; mover.dragging = false; }
    if (rook && !rook.dead) { this._place(rook, ctx.castle.rookTo); rook.wheelSpin = 0; }
    if (ctx.victim && ctx.victimState === 'pending') { ctx.victimState = 'gone'; this._remove(ctx.victim); }
    if (ctx.promotion && ctx.promotion !== 'p' && !ctx.promoted) this._doPromotion(ctx, false);
  }

  _doCapture(ctx) {
    if (ctx.victimState !== 'pending') return;
    ctx.victimState = 'flying';
    const v = ctx.victim;
    const vsq = v.square;
    this.effects.playCaptureFx(vsq, { type: v.type, color: v.color });
    this.onFx('explosion', { square: vsq, type: v.type, color: v.color });
    // fling: away from the attacker's approach direction, spinning
    const from = ctx.mover.root.position;
    const dir = new THREE.Vector3().subVectors(v.root.position, from); dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    const vel = new THREE.Vector3(dir.x * 2.6 + (Math.random() - 0.5), 5.2 + Math.random() * 1.5, dir.z * 2.6 + (Math.random() - 0.5));
    const spin = new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 16);
    const p0 = v.root.position.clone();
    const r0 = v.body.rotation.clone();
    const dur = 1.25;
    // victim is no longer on the board logically; fling is a lingering effect with its own tween
    this.tweener.tween(dur, (k) => {
      const t = k * dur;
      v.root.position.set(p0.x + vel.x * t, p0.y + vel.y * t - 0.5 * 12 * t * t, p0.z + vel.z * t);
      v.body.rotation.set(r0.x + spin.x * t, r0.y + spin.y * t, r0.z + spin.z * t);
      const s = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      v.body.scale.setScalar(Math.max(0.001, s));
      if (k > 0.35 && !v._smoke && this.effects.smokePuff) { v._smoke = true; }
    }).then(() => { ctx.victimState = 'gone'; this._remove(v); });
  }

  async _doPromotion(ctx, animated) {
    if (ctx.promoted) return;
    ctx.promoted = true;
    const old = ctx.mover;
    const sq = ctx.to;
    const np = this._spawn(ctx.promotion, ctx.color, sq);
    if (this.bySquare.get(sq) === old) this.bySquare.set(sq, np);
    this._remove(old);
    ctx.mover = np;
    this.effects.promotionFlash && this.effects.promotionFlash(sq, ctx.color);
    this.onFx('upgrade', { square: sq, type: ctx.promotion, color: ctx.color });
    if (!animated) return;
    np.body.scale.setScalar(0.01);
    await this.tweener.tween(0.5, (k) => {
      const s = Math.max(0.01, Ease.outBack(k, 2.2));
      np.body.scale.set(s, s, s);
      np.body.rotation.y = (1 - Ease.outCubic(k)) * Math.PI * 2;
    });
    np.body.scale.set(1, 1, 1); np.body.rotation.y = 0;
  }

  // ------------------------------------------------------------- per-type animation
  _animatePiece(p, from, to, token, onImpact) {
    const a = sqToXZ(from), b = sqToXZ(to);
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const def = teamYaw(p.color);
    const moveYaw = dist > 1e-3 ? yawFor(dx, dz) : def;
    const dur = MOVE_DURATION[p.type] || 0.8;
    const tw = this.tweener;
    const fx = this.effects;
    let impactDone = false;
    const impact = (k) => { if (onImpact && !impactDone && k >= 0.8) { impactDone = true; onImpact(); } };
    const R = p.root, B = p.body;
    // turn toward the travel direction early, back to the team facing at the end
    const facing = (k, tin = 0.18, tout = 0.2) => {
      if (k < tin) return lerpAngle(def, moveYaw, Ease.outCubic(k / tin));
      if (k > 1 - tout) return lerpAngle(moveYaw, def, Ease.inOutCubic((k - (1 - tout)) / tout));
      return moveYaw;
    };
    const setXZ = (k) => { R.position.x = a.x + dx * k; R.position.z = a.z + dz * k; };

    switch (p.type) {
      case 'p': { // street thug: bouncy hops
        const hops = Math.max(2, Math.round(dist * 2));
        return tw.tween(dur, (k) => {
          const e = Ease.inOutQuad(k);
          setXZ(e);
          const ph = (k * hops) % 1;
          R.position.y = Math.sin(Math.PI * ph) * 0.16;
          const squash = ph < 0.12 || ph > 0.9 ? 0.9 : 1.04;
          B.scale.set(2 - squash, squash, 2 - squash);
          B.rotation.x = -0.15 * Math.sin(Math.PI * k);
          R.rotation.y = facing(k, 0.15, 0.15);
          impact(k);
          if (k >= 1) { R.position.y = 0; B.scale.set(1, 1, 1); B.rotation.x = 0; fx.dust(b.x, b.z, 6, 0.5); this.onFx('land', { type: 'p' }); }
        }, { token });
      }
      case 'n': { // sport bike: rev + wheelie, stunt jump arc, nose-down landing
        const H = 0.9 + dist * 0.25;
        p.wheelSpin = 25;
        let dusted = false;
        return tw.tween(dur, (k) => {
          R.rotation.y = facing(k, 0.12, 0.14);
          if (k < 0.18) { // wheelie on the spot
            const w = Ease.outCubic(k / 0.18);
            B.rotation.x = 0.55 * w; B.position.z = 0.12 * w; B.position.y = 0.08 * w;
            setXZ(0);
            if (!dusted) { dusted = true; fx.dust(a.x, a.z, 5, 0.4); }
          } else if (k < 0.86) { // air time
            const j = (k - 0.18) / 0.68;
            setXZ(Ease.inOutSine(j));
            R.position.y = 4 * H * j * (1 - j);
            B.rotation.x = lerp(0.55, -0.35, Ease.inOutQuad(j));
            B.rotation.z = Math.sin(j * Math.PI) * 0.35; // tabletop lean
            B.position.z = lerp(0.12, 0, j); B.position.y = lerp(0.08, 0, j);
          } else { // landing
            const l = (k - 0.86) / 0.14;
            setXZ(1); R.position.y = 0;
            B.rotation.x = -0.35 * (1 - Ease.outBack(l, 3)); B.rotation.z = 0;
            B.scale.set(1, 1 - 0.12 * Math.sin(Math.PI * l), 1);
            if (dusted !== 'land') { dusted = 'land'; fx.dust(b.x, b.z, 10, 0.7); fx.shake(0.08, 0.2); this.onFx('land', { type: 'n' }); }
          }
          impact(k);
          if (k >= 1) { p.wheelSpin = 0; B.rotation.set(0, 0, 0); B.position.set(0, 0, 0); B.scale.set(1, 1, 1); }
        }, { token });
      }
      case 'b': { // touring car: launch, drift diagonally with yaw overshoot, settle
        p.wheelSpin = 40;
        const driftDir = Math.sign(angleDelta(def, moveYaw)) || 1;
        let lastSkid = 0;
        return tw.tween(dur, (k) => {
          const e = Ease.inOutCubic(k);
          setXZ(e);
          // body points into the drift: sideways slip grows mid-move then snaps back with overshoot
          const slip = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.75 * driftDir;
          let yaw;
          if (k < 0.15) yaw = lerpAngle(def, moveYaw, Ease.outCubic(k / 0.15));
          else if (k < 0.78) yaw = moveYaw + slip;
          else { const s = (k - 0.78) / 0.22; yaw = lerpAngle(moveYaw + slip, def, Ease.outBack(s, 2.4)); }
          R.rotation.y = yaw;
          B.rotation.z = -slip * 0.12; // body roll
          B.rotation.x = k < 0.2 ? 0.06 * Math.sin(Math.PI * k / 0.2) : 0; // squat on launch
          if (k - lastSkid > 0.06 && k > 0.12 && k < 0.85) {
            lastSkid = k;
            fx.skid(R.position.x, R.position.z, yaw);
            fx.tireSmoke(R.position.x, R.position.z);
          }
          impact(k);
          if (k >= 1) { p.wheelSpin = 0; B.rotation.set(0, 0, 0); this.onFx('land', { type: 'b' }); }
        }, { token });
      }
      case 'r': { // armored truck: turn, heavy drive with rumble, brake dive
        let rumble = 0;
        return tw.tween(dur, (k) => {
          R.rotation.y = facing(k, 0.2, 0.18);
          const d = k < 0.18 ? 0 : k > 0.86 ? 1 : Ease.inOutQuad((k - 0.18) / 0.68);
          setXZ(d);
          p.wheelSpin = k > 0.15 && k < 0.88 ? 22 : 0;
          const accel = k < 0.35 ? 1 : k > 0.7 && k < 0.9 ? -1 : 0;
          B.rotation.x += ((accel * 0.07) - B.rotation.x) * 0.25;
          B.position.y = Math.abs(Math.sin(k * 40)) * 0.008;
          if (k > 0.18 && k < 0.86 && k - rumble > 0.1) { rumble = k; fx.shake(0.045, 0.18); fx.dust(R.position.x, R.position.z, 2, 0.35); }
          impact(k);
          if (k >= 1) { p.wheelSpin = 0; B.rotation.set(0, 0, 0); B.position.set(0, 0, 0); fx.shake(0.12, 0.25); this.onFx('land', { type: 'r' }); }
        }, { token });
      }
      case 'q': { // helicopter: spin-up, rise, glide banking, land
        const H = 1.5;
        let landed = false;
        return tw.tween(dur, (k) => {
          p.rotorSpeed = 1 + 2.4 * Math.sin(Math.PI * Math.min(1, k * 1.05));
          p.flying = Math.sin(Math.PI * k);
          let y;
          if (k < 0.3) y = H * Ease.outCubic(k / 0.3) * Ease.inQuad(Math.min(1, k / 0.12 + 0.3));
          else if (k < 0.75) y = H;
          else y = H * (1 - Ease.inOutQuad((k - 0.75) / 0.25));
          R.position.y = y;
          const g = k < 0.22 ? 0 : k > 0.82 ? 1 : Ease.inOutSine((k - 0.22) / 0.6);
          setXZ(g);
          R.rotation.y = facing(k, 0.25, 0.22);
          const glide = k > 0.22 && k < 0.82 ? Math.sin(Math.PI * (k - 0.22) / 0.6) : 0;
          B.rotation.x = -0.28 * glide;          // nose down while gliding
          B.rotation.z = 0.08 * Math.sin(k * 9) * glide;
          if (k < 0.1 && !p._wash) { p._wash = true; fx.dust(a.x, a.z, 10, 0.9); }
          if (k > 0.92 && !landed) { landed = true; fx.dust(b.x, b.z, 12, 1.0); this.onFx('land', { type: 'q' }); }
          impact(k);
          if (k >= 1) { p._wash = false; p.flying = 0; p.rotorSpeed = 1; B.rotation.set(0, 0, 0); R.position.y = 0; }
        }, { token });
      }
      case 'k':
      default: { // the boss: swagger walk with side-to-side sway
        const steps = Math.max(2, Math.round(dist * 3));
        return tw.tween(dur, (k) => {
          const e = Ease.inOutSine(k);
          setXZ(e);
          R.rotation.y = facing(k, 0.2, 0.22);
          const ph = k * steps * Math.PI;
          const amp = Math.sin(Math.PI * k);
          B.rotation.z = Math.sin(ph) * 0.14 * amp;
          B.rotation.y = Math.sin(ph) * 0.12 * amp;
          B.position.y = Math.abs(Math.sin(ph)) * 0.04 * amp;
          B.rotation.x = 0.06 * amp; // lean back, chest out
          impact(k);
          if (k >= 1) { B.rotation.set(0, 0, 0); B.position.set(0, 0, 0); this.onFx('land', { type: 'k' }); }
        }, { token });
      }
    }
  }

  cashFor(type) { return CASH[type] || 0; }
}

function isAncestor(a, b) {
  let o = b.parent;
  while (o) { if (o === a) return true; o = o.parent; }
  return false;
}
