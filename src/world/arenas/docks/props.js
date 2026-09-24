// Procedural fallbacks for the Rustwater Docks set pieces (used when the Blender GLBs are missing) +
// the container texture/geometry used for instancing. All models: metres, +Y up, front faces +Z, origin at base.
import * as THREE from 'three';
import { canvasTexture, rng, glowTexture } from '../../util.js';
import { Batcher } from './batch.js';

// ------------------------------------------------------------------ containers
const BRANDS = ['LEONIDA LINES', 'VICE MARINE', 'KAPPA FREIGHT', 'RUSTWATER', 'GULF & SONS', 'OCEAN GROFT', 'MAKO CARGO', ''];

/** Greyscale corrugated container sheet: u 0..0.8 = long side, 0.8..1 = door end. Tinted per instance. */
export function containerTexture(seed = 1) {
  const r = rng(seed);
  return canvasTexture(512, 128, (g, w, h) => {
    const sideW = Math.round(w * 0.8);
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    // corrugation ribs
    for (let x = 0; x < sideW; x += 8) {
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, 0, 3, h);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 4, 0, 3, h);
    }
    // top / bottom rails + corner posts
    g.fillStyle = 'rgba(20,20,20,0.55)';
    g.fillRect(0, 0, w, 7); g.fillRect(0, h - 9, w, 9); g.fillRect(0, 0, 8, h); g.fillRect(sideW - 8, 0, 8, h);
    // brand stencil (lighter tone)
    const brand = BRANDS[Math.floor(r() * BRANDS.length)];
    if (brand) {
      g.font = '900 34px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(brand, sideW / 2, h * 0.48);
    }
    g.font = 'bold 11px monospace'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillText(`RWDU ${String(100000 + Math.floor(r() * 899999))} 45G1`, 20, 20);
    // rust streaks + dents
    for (let i = 0; i < 40; i++) {
      const x = r() * sideW, len = 10 + r() * 60, top = r() < 0.6 ? 7 : r() * h;
      const grd = g.createLinearGradient(0, top, 0, top + len);
      grd.addColorStop(0, `rgba(${90 + r() * 40},${40 + r() * 20},15,0.55)`); grd.addColorStop(1, 'rgba(90,40,15,0)');
      g.fillStyle = grd; g.fillRect(x, top, 2 + r() * 6, len);
    }
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(r() * sideW, r() * h, 8 + r() * 20, 5 + r() * 10, 0, 0, Math.PI * 2); g.fill(); }
    // door end
    const dx = sideW;
    g.fillStyle = '#c9c9c9'; g.fillRect(dx, 0, w - dx, h);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(dx + (w - dx) / 2 - 1, 6, 2, h - 12);
    g.fillStyle = 'rgba(20,20,20,0.6)'; g.fillRect(dx, 0, w - dx, 7); g.fillRect(dx, h - 9, w - dx, 9); g.fillRect(dx, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
    for (const fx of [0.14, 0.34, 0.66, 0.86]) {
      const x = dx + (w - dx) * fx;
      g.fillStyle = 'rgba(40,40,40,0.8)'; g.fillRect(x - 1.5, 8, 3, h - 16);
      g.fillStyle = 'rgba(30,30,30,0.9)'; g.fillRect(x - 5, h * 0.55, 10, 4);
    }
  });
}

/** Box container geometry, long axis along X (12.2 × 2.6 × 2.44), origin at base centre, UVs for containerTexture. */
export function containerGeometry(L = 12.2, H = 2.6, D = 2.44) {
  const g = new THREE.BoxGeometry(L, H, D);
  g.translate(0, H / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4); // px, nx, py, ny, pz, nz
    const u = uv.getX(i);
    if (face === 0 || face === 1) uv.setX(i, 0.8 + u * 0.2);
    else uv.setX(i, u * 0.8);
    if (face === 2 || face === 3) uv.setY(i, 0.5); // roof: plain grey
  }
  return g;
}

export const CONTAINER_COLORS = ['#c0392b', '#1f6fb2', '#2e8b57', '#e67e22', '#8e44ad', '#d4ac0d', '#16a085', '#7f8c8d',
  '#b03a2e', '#2c3e8f', '#ff6f3c', '#3d8bff', '#ffb347', '#c2185b', '#546e7a', '#6d4c41', '#00897b', '#f4d03f'];

// ------------------------------------------------------------------ shared material helpers
function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...o }); }
function glowMat(color, mult = 3) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(mult) });
  m.userData.noShadow = true;
  return m;
}

export function glowSprite(color, size, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  }));
  s.material.map.userData.shared = true;
  s.scale.set(size, size, 1);
  return s;
}

// ------------------------------------------------------------------ gantry crane
/** STS crane, boom toward local -Z (water), landside +Z. Returns group with nodes Trolley/Spreader + userData. */
export function makeCrane({ color = '#3d8bff', gauge = 11, span = 13, withContainer = false, containerColor = '#e67e22' } = {}) {
  const root = new THREE.Group(); root.name = 'crane';
  const steel = std(color, { roughness: 0.55, metalness: 0.35 });
  const dark = std('#2b2e33', { roughness: 0.6, metalness: 0.5 });
  const white = std('#e8e6df', { roughness: 0.6 });
  const red = glowMat('#ff2a1a', 4);
  const b = new Batcher();
  const hz = gauge / 2, hx = span / 2;
  const top = 21, boomY = 23;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(steel, [1.0, top, 1.0], [sx * hx, 1.2, sz * hz]);
      // bogies
      b.box(dark, [1.6, 1.2, 2.6], [sx * hx, 0, sz * hz]);
    }
    // sill beams (low) + portal beams along z
    b.box(steel, [0.9, 1.0, gauge + 1], [sx * hx, 7, 0]);
    b.box(steel, [1.0, 1.6, gauge + 1], [sx * hx, top, 0]);
    // diagonal braces
    b.beam(steel, [sx * hx, 8, hz], [sx * hx, top, -hz], 0.45);
    // boom girders
    b.box(steel, [0.9, 1.7, 46], [sx * 2.6, boomY - 1.7 / 2 + 0.85 - 0.85, -9]);
    // A-frame
    b.beam(steel, [sx * 2.6, boomY, -4], [sx * 2.2, boomY + 12, 1.5], 0.8);
    b.beam(steel, [sx * 2.6, boomY, 7], [sx * 2.2, boomY + 12, 1.5], 0.8);
    // stays to boom tip and backreach
    b.beam(dark, [sx * 2.2, boomY + 12, 1.5], [sx * 2.6, boomY + 1.2, -31], 0.18);
    b.beam(dark, [sx * 2.2, boomY + 12, 1.5], [sx * 2.6, boomY + 1.2, 13], 0.18);
  }
  // cross beams (along x)
  for (const sz of [-1, 1]) {
    b.box(steel, [span + 1, 1.8, 1.2], [0, top - 0.2, sz * hz]);
    b.box(steel, [span + 1, 0.9, 0.9], [0, 7, sz * hz]);
  }
  b.box(steel, [6.2, 0.8, 1.0], [0, boomY + 11.6, 1.5]);
  for (let z = -30; z <= 12; z += 6) b.box(dark, [5.6, 0.25, 0.5], [0, boomY + 1.5, z]);
  // machinery house + walkway
  b.box(white, [6.4, 3.2, 7], [0, boomY + 1.6, 9.5]);
  b.box(dark, [6.6, 0.3, 7.2], [0, boomY + 4.8, 9.5]);
  b.box(dark, [7.4, 0.15, 46], [0, boomY + 1.65, -9]);
  // warning lamps
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const p of [[2.6, boomY + 2.2, -31], [-2.6, boomY + 2.2, -31], [0, boomY + 12.8, 1.5], [hx, top + 1.8, hz], [-hx, top + 1.8, hz], [hx, top + 1.8, -hz], [-hx, top + 1.8, -hz]]) {
    b.add(red, lampGeo, p);
  }
  lampGeo.dispose();
  const meshes = b.flush(root, { name: 'crane_static' });
  meshes.forEach((m) => { if (m.material === red) m.castShadow = false; });

  // trolley + spreader
  const trolley = new THREE.Group(); trolley.name = 'Trolley';
  trolley.position.set(0, boomY, -20);
  const tb = new Batcher();
  tb.box(dark, [5.4, 1.1, 3.4], [0, -0.2, 0]);
  tb.box(white, [1.8, 1.9, 2.0], [1.6, -2.4, 0.3]);
  const glass = glowMat('#ffd9a0', 1.6);
  tb.box(glass, [1.85, 0.7, 2.05], [1.6, -1.6, 0.3]);
  tb.flush(trolley, { name: 'trolley_mesh' });
  const spreader = new THREE.Group(); spreader.name = 'Spreader';
  spreader.position.y = -10;
  const sb = new Batcher();
  sb.box(std('#ffc21a', { roughness: 0.5, metalness: 0.4 }), [12.4, 0.5, 2.6], [0, 0, 0]);
  sb.box(dark, [2.4, 0.7, 1.2], [0, 0.5, 0]);
  sb.flush(spreader, { name: 'spreader_mesh' });
  if (withContainer) {
    const c = new THREE.Mesh(containerGeometry(), new THREE.MeshStandardMaterial({ color: containerColor, map: containerTexture(77), roughness: 0.6, metalness: 0.3 }));
    c.position.y = -2.62; c.castShadow = true;
    spreader.add(c);
  }
  trolley.add(spreader);
  // cables (unit length, scaled on Y each frame)
  const cableGeo = new THREE.BoxGeometry(0.06, 1, 0.06); cableGeo.translate(0, -0.5, 0);
  const cableMat = std('#1a1a1a');
  const cables = new THREE.Group(); cables.name = 'Cables';
  for (const [x, z] of [[-2, -0.9], [2, -0.9], [-2, 0.9], [2, 0.9]]) {
    const c = new THREE.Mesh(cableGeo, cableMat); c.position.set(x, -0.3, z); cables.add(c);
  }
  trolley.add(cables);
  root.add(trolley);
  root.userData = { trolley, spreader, cables, boomY, lamps: red };
  return root;
}

// ------------------------------------------------------------------ forklift
export function makeForklift({ color = '#ffc21a' } = {}) {
  const root = new THREE.Group(); root.name = 'forklift';
  const body = std(color, { roughness: 0.45, metalness: 0.3 });
  const black = std('#1b1b1f', { roughness: 0.8 });
  const grey = std('#50545c', { roughness: 0.5, metalness: 0.6 });
  const b = new Batcher();
  b.box(body, [1.12, 0.62, 2.0], [0, 0.28, -0.1]);
  b.box(body, [1.12, 0.75, 0.5], [0, 0.4, -1.05]); // counterweight
  b.box(black, [0.6, 0.12, 0.5], [0, 0.9, -0.35]); // seat
  b.box(black, [0.6, 0.55, 0.1], [0, 1.0, -0.62]);
  b.beam(black, [0, 0.95, 0.35], [0, 1.35, 0.15], 0.06);
  b.cyl(black, 0.16, 0.16, 0.04, [0, 1.35, 0.15], 0, 12);
  for (const [x, z] of [[-0.52, 0.55], [0.52, 0.55], [-0.52, -0.95], [0.52, -0.95]]) b.box(black, [0.07, 1.35, 0.07], [x, 0.9, z]);
  b.box(black, [1.14, 0.08, 1.6], [0, 2.25, -0.2]);
  for (let i = -2; i <= 2; i++) b.box(grey, [0.04, 0.05, 1.5], [i * 0.22, 2.2, -0.2]);
  // mast
  b.box(grey, [0.1, 2.3, 0.14], [-0.38, 0.12, 1.0]);
  b.box(grey, [0.1, 2.3, 0.14], [0.38, 0.12, 1.0]);
  b.box(grey, [0.86, 0.1, 0.12], [0, 2.3, 1.0]);
  // wheels
  const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.26, 14); wheel.rotateZ(Math.PI / 2);
  const wheelR = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 14); wheelR.rotateZ(Math.PI / 2);
  b.add(black, wheel, [-0.56, 0.3, 0.55]); b.add(black, wheel, [0.56, 0.3, 0.55]);
  b.add(black, wheelR, [-0.54, 0.24, -0.85]); b.add(black, wheelR, [0.54, 0.24, -0.85]);
  wheel.dispose(); wheelR.dispose();
  // beacon + lights
  const amber = glowMat('#ffab2e', 2.2);
  b.cyl(amber, 0.08, 0.1, 0.16, [0.35, 2.3, -0.8], 0, 8);
  const head = glowMat('#fff3d6', 3);
  b.box(head, [0.14, 0.1, 0.04], [-0.46, 2.1, 0.64]); b.box(head, [0.14, 0.1, 0.04], [0.46, 2.1, 0.64]);
  b.flush(root, { name: 'forklift_body' });
  // forks
  const forks = new THREE.Group(); forks.name = 'Forks'; forks.position.set(0, 0.12, 1.1);
  const fb = new Batcher();
  fb.box(grey, [0.9, 0.55, 0.06], [0, 0, 0]);
  fb.box(grey, [0.1, 0.05, 1.1], [-0.28, 0, 0.55]); fb.box(grey, [0.1, 0.05, 1.1], [0.28, 0, 0.55]);
  // pallet + load (crates wrapped in plastic)
  const wood = std('#9a7048', { roughness: 0.9 });
  fb.box(wood, [1.0, 0.13, 1.1], [0, 0.05, 0.6]);
  fb.box(std('#6a5a48', { roughness: 0.85 }), [0.95, 0.6, 1.0], [0, 0.18, 0.6]);
  fb.box(std('#3d8bff', { roughness: 0.4 }), [0.5, 0.35, 0.45], [0.2, 0.78, 0.5]);
  fb.flush(forks, { name: 'forks_mesh' });
  root.add(forks);
  root.userData = { forks, seat: new THREE.Vector3(0, 0.62, -0.35) };
  return root;
}

// ------------------------------------------------------------------ tugboat
export function makeTugboat({ hull = '#b3261e', band = '#3d8bff', accent = '#ffb347' } = {}) {
  const root = new THREE.Group(); root.name = 'tugboat';
  const shape = new THREE.Shape();
  // top-view outline in (x, z) with bow at +z (drawn in x/y, then rotated)
  shape.moveTo(-2, -6.5); shape.lineTo(2, -6.5); shape.lineTo(2.1, 2); shape.quadraticCurveTo(2, 5.5, 0, 7.2);
  shape.quadraticCurveTo(-2, 5.5, -2.1, 2); shape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
  hullGeo.rotateX(Math.PI / 2); // extrusion goes down (-y); shape y → +z (bow forward)
  hullGeo.translate(0, 1.2, 0);   // hull spans y -1.2 .. 1.2
  const b = new Batcher();
  const hullM = std(hull, { roughness: 0.5 });
  b.add(hullM, hullGeo, [0, 0, 0]);
  const fender = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false });
  fender.rotateX(Math.PI / 2); fender.scale(1.06, 1, 1.03); fender.translate(0, 1.45, 0);
  b.add(std('#1b1b1f', { roughness: 0.9 }), fender, [0, 0, 0]);
  hullGeo.dispose(); fender.dispose();
  const white = std('#ecebe4', { roughness: 0.6 });
  b.box(white, [3.0, 1.8, 5.2], [0, 1.2, -0.6]);
  b.box(white, [2.4, 1.6, 2.4], [0, 3.0, 0.4]);
  b.box(std('#2b2e33'), [2.7, 0.15, 2.8], [0, 4.6, 0.4]);
  const win = glowMat('#ffd48a', 2.0);
  b.box(win, [2.45, 0.55, 2.2], [0, 3.8, 0.4]);
  b.box(win, [3.05, 0.35, 4.0], [0, 2.1, -0.6]);
  // funnel in gang colours
  b.box(std(band, { roughness: 0.5 }), [1.0, 1.6, 1.0], [0, 3.0, -2.2]);
  b.box(std(accent, { roughness: 0.5 }), [1.02, 0.4, 1.02], [0, 3.9, -2.2]);
  b.box(std('#1b1b1f'), [1.02, 0.3, 1.02], [0, 4.3, -2.2]);
  // mast + nav lights (steady)
  b.box(std('#2b2e33'), [0.1, 2.4, 0.1], [0, 4.75, 0.8]);
  b.add(glowMat('#ffffff', 4), new THREE.SphereGeometry(0.14, 8, 6), [0, 7.2, 0.8]);
  b.add(glowMat('#ff2020', 4), new THREE.SphereGeometry(0.12, 8, 6), [-1.25, 4.8, 0.9]);
  b.add(glowMat('#20ff60', 4), new THREE.SphereGeometry(0.12, 8, 6), [1.25, 4.8, 0.9]);
  // bow tyre fender + side tyres
  const tyre = new THREE.TorusGeometry(0.35, 0.14, 6, 12);
  for (let i = 0; i < 4; i++) { b.add(std('#111'), tyre, [2.15, 0.8, -4 + i * 2], [0, Math.PI / 2, 0]); b.add(std('#111'), tyre, [-2.15, 0.8, -4 + i * 2], [0, Math.PI / 2, 0]); }
  tyre.dispose();
  b.flush(root, { name: 'tug_mesh' });
  root.userData = { stack: new THREE.Vector3(0, 4.5, -2.2) };
  return root;
}

// ------------------------------------------------------------------ oil drum fire
let _flameTex = null;
export function flameTexture() {
  if (_flameTex) return _flameTex;
  const r = rng(31);
  _flameTex = canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.45, y = h * (0.55 + r() * 0.35), rw = w * (0.12 + r() * 0.2), rh = h * (0.2 + r() * 0.3);
      const grd = g.createRadialGradient(x, y, 0, x, y - rh * 0.3, rh);
      grd.addColorStop(0, 'rgba(255,230,150,0.5)'); grd.addColorStop(0.35, 'rgba(255,140,40,0.35)');
      grd.addColorStop(0.7, 'rgba(200,50,10,0.15)'); grd.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(x, y - rh * 0.3, rw, rh, 0, 0, Math.PI * 2); g.fill();
    }
    // fade the top + bottom edges
    g.globalCompositeOperation = 'destination-in';
    const f = g.createLinearGradient(0, 0, 0, h);
    f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.35, 'rgba(0,0,0,1)'); f.addColorStop(0.92, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = f; g.fillRect(0, 0, w, h);
  });
  _flameTex.userData.shared = true;
  return _flameTex;
}

/** Rusty drum with a soft animated fire (planes + glow). userData.flames for update. */
export function makeDrumFire({ withFire = true, drum = null } = {}) {
  const root = new THREE.Group(); root.name = 'drum_fire';
  if (drum) root.add(drum);
  else {
    const rust = std('#6b3a1f', { roughness: 0.95, metalness: 0.25 });
    const b = new Batcher();
    b.cyl(rust, 0.3, 0.3, 0.88, [0, 0, 0], 0, 14);
    for (const y of [0.02, 0.3, 0.6, 0.86]) b.cyl(std('#4a2612', { roughness: 0.9 }), 0.315, 0.315, 0.04, [0, y, 0], 0, 14);
    b.cyl(std('#1a0d06', { roughness: 1 }), 0.27, 0.27, 0.02, [0, 0.85, 0], 0, 12);
    b.flush(root, { name: 'drum' });
  }
  const flames = [];
  if (withFire) {
    const mat = new THREE.MeshBasicMaterial({
      map: flameTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      color: new THREE.Color(1.25, 0.95, 0.7),
    });
    const geo = new THREE.PlaneGeometry(0.75, 1.3); geo.translate(0, 0.65, 0);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(geo, mat);
      f.position.y = 0.72; f.rotation.y = (i / 3) * Math.PI;
      f.renderOrder = 5;
      root.add(f); flames.push(f);
    }
    const glow = glowSprite(0xff8a3a, 2.2, 0.32); glow.position.y = 1.2; root.add(glow);
    flames.push(glow);
  }
  root.userData = { flames };
  return root;
}

// ------------------------------------------------------------------ small dock props (into a batcher)
export function addBollard(b, mats, x, z, y) {
  b.cyl(mats.bollard, 0.2, 0.24, 0.5, [x, y, z], 0, 10);
  b.cyl(mats.bollard, 0.3, 0.3, 0.1, [x, y + 0.5, z], 0, 10);
  b.cyl(mats.hazard, 0.301, 0.301, 0.05, [x, y + 0.53, z], 0, 10);
}

export function addPallet(b, mats, x, z, y, yaw = 0, stack = 1) {
  for (let i = 0; i < stack; i++) b.box(mats.wood, [1.2, 0.14, 1.0], [x, y + i * 0.15, z], yaw);
}

/** Light mast (fallback). Returns group; lamp heads face `yaw` direction. */
export function makeLightMast({ height = 13, lampColor = '#ffae4a' } = {}) {
  const root = new THREE.Group(); root.name = 'light_mast';
  const pole = std('#5d636b', { roughness: 0.5, metalness: 0.6 });
  const b = new Batcher();
  b.cyl(pole, 0.14, 0.28, height, [0, 0, 0], 0, 8);
  b.box(std('#3a3f45'), [0.9, 0.5, 0.9], [0, 0, 0]);
  b.box(pole, [2.6, 0.14, 0.2], [0, height - 0.2, 0]);
  const lamp = glowMat(lampColor, 5);
  for (const x of [-1.1, -0.37, 0.37, 1.1]) {
    b.box(std('#2b2e33'), [0.6, 0.35, 0.5], [x, height - 0.6, 0.15], 0);
    b.box(lamp, [0.5, 0.06, 0.4], [x, height - 0.64, 0.15]);
  }
  b.flush(root, { name: 'mast_mesh' });
  const glow = glowSprite(new THREE.Color(lampColor), 6, 0.45); glow.position.set(0, height - 0.7, 0.2); root.add(glow);
  root.userData = { glow, head: height - 0.7 };
  return root;
}
