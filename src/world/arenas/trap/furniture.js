// Procedural fallbacks for The Trap furniture (also used by the docks hangout corner).
// Metres, +Y up, front faces +Z, origin at base centre. Each returns a THREE.Group of merged meshes.
import * as THREE from 'three';
import { canvasTexture, rng } from '../../util.js';
import { Batcher } from '../docks/batch.js';

function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o }); }
function glow(color, mult = 3) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(mult) });
  m.userData.noShadow = true;
  return m;
}

let _fabricTex = null;
function fabricTex() {
  if (_fabricTex) return _fabricTex;
  const r = rng(17);
  _fabricTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(40,30,20,${0.08 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 16, 4 + r() * 10, r() * 3, 0, Math.PI * 2); g.fill(); }
  }, { repeat: [2, 2] });
  _fabricTex.userData.shared = true;
  return _fabricTex;
}

/** Worn couch. width ≈ 2.1 (3 seats) or custom. */
export function makeCouch({ color = '#7a2e3a', width = 2.1, seats = 3 } = {}) {
  const root = new THREE.Group(); root.name = 'couch';
  const fab = std(color, { map: fabricTex() });
  const fab2 = std(new THREE.Color(color).multiplyScalar(0.8), { map: fabricTex() });
  const leg = std('#2a1d14');
  const b = new Batcher();
  const d = 0.9, armW = 0.2;
  b.box(fab2, [width, 0.3, d], [0, 0.1, 0]);
  const sw = (width - armW * 2) / seats;
  const r = rng(Math.round(width * 100) + seats);
  for (let i = 0; i < seats; i++) {
    const x = -width / 2 + armW + sw * (i + 0.5);
    b.box(fab, [sw - 0.03, 0.17 - r() * 0.04, d - 0.28], [x, 0.4, 0.1], (r() - 0.5) * 0.06);
    b.add(fab, new THREE.BoxGeometry(sw - 0.05, 0.5, 0.22), [x, 0.72, -d / 2 + 0.18], [-0.18 + (r() - 0.5) * 0.08, (r() - 0.5) * 0.05, 0]);
  }
  b.box(fab2, [width, 0.55, 0.16], [0, 0.35, -d / 2 + 0.08]);
  for (const s of [-1, 1]) b.box(fab2, [armW, 0.32, d], [s * (width / 2 - armW / 2), 0.4, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(leg, [0.06, 0.1, 0.06], [x * (width / 2 - 0.08), 0, z * (d / 2 - 0.08)]);
  b.flush(root, { name: 'couch_mesh' });
  root.userData = { seatY: 0.48, seats: Array.from({ length: seats }, (_, i) => -width / 2 + armW + sw * (i + 0.5)) };
  return root;
}

export function makeArmchair({ color = '#3f5a3a' } = {}) {
  const c = makeCouch({ color, width: 0.95, seats: 1 });
  c.name = 'armchair';
  return c;
}

/** Ceiling fluorescent fixture (steady). hang = chain length above the fixture. */
export function makeFluoro({ hang = 0.6, tube = '#e8fbff', mult = 3.2 } = {}) {
  const root = new THREE.Group(); root.name = 'fluoro_light';
  const b = new Batcher();
  b.box(std('#d9dcd8', { roughness: 0.5, metalness: 0.3 }), [1.34, 0.07, 0.3], [0, 0.06, 0]);
  const tubeGeo = new THREE.CylinderGeometry(0.028, 0.028, 1.22, 8); tubeGeo.rotateZ(Math.PI / 2);
  const tm = glow(tube, mult);
  b.add(tm, tubeGeo, [0, 0.03, -0.07]); b.add(tm, tubeGeo, [0, 0.03, 0.07]);
  tubeGeo.dispose();
  if (hang > 0) for (const x of [-0.55, 0.55]) b.box(std('#555'), [0.015, hang, 0.015], [x, 0.12, 0]);
  b.flush(root, { name: 'fluoro_mesh', castShadow: false });
  return root;
}

let _arcadeTex = null;
function arcadeScreen() {
  if (_arcadeTex) return _arcadeTex;
  const r = rng(64);
  _arcadeTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#05030f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff3ea5'; g.font = 'bold 13px monospace'; g.textAlign = 'center';
    g.fillText('PAWN', w / 2, 16); g.fillStyle = '#29e3d6'; g.fillText('INVADERS', w / 2, 30);
    const cols = ['#9dff3c', '#ffd23f', '#ff7a1a'];
    for (let row = 0; row < 3; row++) for (let c = 0; c < 6; c++) {
      g.fillStyle = cols[row];
      const x = 14 + c * 17, y = 42 + row * 13;
      g.fillRect(x, y, 10, 6); g.fillRect(x - 2, y + 4, 2, 4); g.fillRect(x + 10, y + 4, 2, 4); g.fillRect(x + 3, y - 2, 4, 2);
    }
    g.fillStyle = '#ffffff'; g.fillRect(58, 112, 12, 6); g.fillRect(62, 108, 4, 4);
    for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(r() * w, r() * h, 1, 1); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
  });
  _arcadeTex.userData.shared = true;
  return _arcadeTex;
}

export function makeArcade({ color = '#6a2cff', trim = '#29e3d6' } = {}) {
  const root = new THREE.Group(); root.name = 'arcade_cabinet';
  const body = std(color, { roughness: 0.5 });
  const black = std('#111116', { roughness: 0.6 });
  const b = new Batcher();
  b.box(body, [0.72, 1.0, 0.75], [0, 0, 0]);
  b.box(black, [0.66, 0.9, 0.5], [0, 1.0, -0.12]);
  b.add(black, new THREE.BoxGeometry(0.7, 0.08, 0.36), [0, 1.03, 0.25], [0.25, 0, 0]);
  b.box(body, [0.72, 0.28, 0.6], [0, 1.55, -0.05]);
  for (const s of [-1, 1]) b.box(body, [0.04, 1.85, 0.8], [s * 0.36, 0, -0.02]);
  b.box(glow(trim, 2.2), [0.66, 0.2, 0.02], [0, 1.6, 0.26]);
  // buttons
  const btn = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8);
  ['#ff3ea5', '#ffd23f', '#29e3d6', '#9dff3c'].forEach((c, i) => b.add(glow(c, 1.6), btn, [0.05 + i * 0.07, 1.1, 0.3], [0.25, 0, 0]));
  b.add(black, new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), [-0.15, 1.12, 0.3], [0.25, 0, 0]);
  b.add(glow('#ff3030', 1.6), new THREE.SphereGeometry(0.03, 8, 6), [-0.15, 1.18, 0.31]);
  btn.dispose();
  b.flush(root, { name: 'arcade_mesh' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.5), new THREE.MeshBasicMaterial({ map: arcadeScreen(), color: new THREE.Color(1.5, 1.5, 1.5) }));
  screen.position.set(0, 1.33, 0.14); screen.rotation.x = -0.18;
  root.add(screen);
  return root;
}

export function makePoolTable({ felt = '#1f7a4d', wood = '#5a3620' } = {}) {
  const root = new THREE.Group(); root.name = 'pool_table';
  const w = std(wood, { roughness: 0.55 });
  const f = std(felt, { roughness: 0.95 });
  const b = new Batcher();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(w, [0.16, 0.62, 0.16], [x * 1.05, 0, z * 0.52]);
  b.box(w, [2.5, 0.18, 1.4], [0, 0.62, 0]);
  b.box(f, [2.3, 0.02, 1.2], [0, 0.8, 0]);
  for (const s of [-1, 1]) { b.box(w, [2.5, 0.07, 0.1], [0, 0.8, s * 0.65]); b.box(w, [0.1, 0.07, 1.4], [s * 1.2, 0.8, 0]); }
  const pocket = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10);
  for (const [x, z] of [[-1.14, -0.59], [0, -0.6], [1.14, -0.59], [-1.14, 0.59], [0, 0.6], [1.14, 0.59]]) b.add(std('#050505'), pocket, [x, 0.815, z]);
  pocket.dispose();
  const ball = new THREE.SphereGeometry(0.03, 10, 8);
  const cols = ['#ffffff', '#ffd23f', '#1f4fd8', '#d62828', '#6a2c91', '#ff7a1a', '#1f7a4d', '#7a1f1f', '#111111'];
  const r = rng(8);
  cols.forEach((c) => b.add(std(c, { roughness: 0.25 }), ball, [(r() - 0.3) * 1.8, 0.84, (r() - 0.5) * 0.9]));
  ball.dispose();
  b.flush(root, { name: 'pool_mesh' });
  return root;
}
