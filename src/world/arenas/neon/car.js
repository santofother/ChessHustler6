// Neon Mile cars: procedural low-poly tuner coupe / muscle car (fallback when the car GLBs are missing) and a
// CarFleet that draws every car of one model with a handful of InstancedMeshes (body colour, rims, stripes and
// underglow per instance). Car convention: metres, front faces +Z, origin at the base centre.
import * as THREE from 'three';
import { partsFromObject, normalizeParts, InstSet, poolTex } from './inst.js';

// ------------------------------------------------------------------------------------ materials
function mats() {
  return {
    body: Object.assign(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.3, envMapIntensity: 1.25 }), { name: 'TINT_Body' }),
    stripe: Object.assign(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4, envMapIntensity: 1 }), { name: 'TINT_Stripe' }),
    rims: Object.assign(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.22, envMapIntensity: 1.4 }), { name: 'TINT_Rims' }),
    trim: Object.assign(new THREE.MeshStandardMaterial({ color: 0x15131a, metalness: 0.3, roughness: 0.55 }), { name: 'TRIM' }),
    tyre: Object.assign(new THREE.MeshStandardMaterial({ color: 0x0d0c10, metalness: 0, roughness: 0.85 }), { name: 'TYRE' }),
    glass: Object.assign(new THREE.MeshStandardMaterial({ color: 0x0b0f1c, metalness: 0.9, roughness: 0.06, envMapIntensity: 1.6 }), { name: 'GLASS' }),
    head: Object.assign(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(1.7) }), { name: 'EMISSIVE_Headlight' }),
    tail: Object.assign(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1030).multiplyScalar(1.5) }), { name: 'EMISSIVE_Taillight' }),
  };
}

/** Side profile (z, y) extruded across the car width, centred on x. */
function profile(points, width, bevel = 0.05) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x → +Z (front), extrusion → X
  return g;
}

function box(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

function wheel(root, m, x, z, r = 0.33, w = 0.26) {
  const side = Math.sign(x);
  const tyre = new THREE.CylinderGeometry(r, r, w, 18); tyre.rotateZ(Math.PI / 2); tyre.translate(x, r, z);
  root.add(new THREE.Mesh(tyre, m.tyre));
  const rimGeos = [];
  const disc = new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.03, 14); disc.rotateZ(Math.PI / 2); disc.translate(x + side * (w / 2 + 0.005), r, z);
  rimGeos.push(disc);
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.BoxGeometry(0.02, r * 1.28, 0.055);
    sp.rotateX((k / 5) * Math.PI);
    sp.translate(x + side * (w / 2 + 0.02), r, z);
    rimGeos.push(sp);
  }
  rimGeos.forEach((g) => root.add(new THREE.Mesh(g, m.rims)));
  const hub = new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.012, 14); hub.rotateZ(Math.PI / 2); hub.translate(x + side * (w / 2 + 0.03), r, z);
  root.add(new THREE.Mesh(hub, m.trim));
}

/** 90s JDM tuner coupe, ≈ 4.4 × 1.8 × 1.25 m. */
export function buildTuner() {
  const m = mats();
  const root = new THREE.Group();
  const W = 1.82;
  const top = [[2.2, 0.6], [1.92, 0.7], [0.55, 0.84], [-1.75, 0.88], [-2.12, 0.86]];
  root.add(new THREE.Mesh(profile([[-2.18, 0.3], [2.1, 0.3], [2.24, 0.42], ...top, [-2.22, 0.7], [-2.2, 0.36]], W, 0.07), m.body));
  // greenhouse + roof
  root.add(new THREE.Mesh(profile([[0.62, 0.8], [0.62, 0.84], [-0.1, 1.17], [-1.0, 1.2], [-1.82, 0.88], [-1.82, 0.8]], 1.5, 0.05), m.glass));
  root.add(new THREE.Mesh(box(1.34, 0.05, 0.88, 0, 1.2, -0.56), m.body));
  // racing stripes following the top line (hood → roof → trunk)
  for (const sx of [-0.2, 0.2]) {
    const g = profile(top.map(([z, y]) => [z, y + 0.012]).concat([...top].reverse().map(([z, y]) => [z, y + 0.002])), 0.16, 0.0001);
    g.translate(sx, 0, 0);
    root.add(new THREE.Mesh(g, m.stripe));
    root.add(new THREE.Mesh(box(0.16, 0.012, 0.9, sx, 1.232, -0.56), m.stripe));
  }
  // side skirt stripe
  for (const sx of [-1, 1]) root.add(new THREE.Mesh(box(0.02, 0.07, 3.2, sx * 0.925, 0.52, 0.1), m.stripe));
  // aero + trim
  root.add(new THREE.Mesh(box(1.86, 0.05, 0.36, 0, 1.12, -1.98), m.trim)); // wing
  for (const sx of [-0.62, 0.62]) {
    root.add(new THREE.Mesh(box(0.05, 0.26, 0.14, sx, 0.98, -1.98), m.trim));
    root.add(new THREE.Mesh(box(0.03, 0.2, 0.4, sx * 1.5, 1.12, -1.98), m.trim)); // end plates
  }
  root.add(new THREE.Mesh(box(1.8, 0.1, 0.22, 0, 0.3, 2.14), m.trim)); // front lip
  root.add(new THREE.Mesh(box(0.9, 0.1, 0.03, 0, 0.44, 2.245), m.trim)); // intake
  for (const sx of [-1, 1]) root.add(new THREE.Mesh(box(0.06, 0.1, 2.3, sx * 0.9, 0.3, 0.05), m.trim));
  root.add(new THREE.Mesh(box(1.7, 0.12, 0.08, 0, 0.36, -2.2), m.trim)); // diffuser
  // lights
  for (const sx of [-1, 1]) {
    root.add(new THREE.Mesh(box(0.46, 0.07, 0.12, sx * 0.58, 0.6, 2.14, -0.5), m.head));
    root.add(new THREE.Mesh(box(0.5, 0.09, 0.04, sx * 0.55, 0.74, -2.215), m.tail));
  }
  root.add(new THREE.Mesh(box(0.5, 0.04, 0.04, 0, 0.74, -2.215), m.tail));
  for (const sx of [-0.8, 0.8]) for (const z of [-1.36, 1.38]) wheel(root, m, sx, z);
  return root;
}

/** 80s Miami muscle car, ≈ 4.8 × 1.9 × 1.3 m. */
export function buildMuscle() {
  const m = mats();
  const root = new THREE.Group();
  const W = 1.9;
  const top = [[2.4, 0.74], [0.75, 0.86], [-1.62, 0.88], [-2.36, 0.86]];
  root.add(new THREE.Mesh(profile([[-2.38, 0.32], [2.36, 0.32], [2.42, 0.5], ...top, [-2.42, 0.6]], W, 0.06), m.body));
  root.add(new THREE.Mesh(profile([[0.62, 0.82], [0.62, 0.86], [-0.15, 1.24], [-1.1, 1.25], [-1.62, 0.88], [-1.62, 0.82]], 1.56, 0.04), m.glass));
  root.add(new THREE.Mesh(box(1.42, 0.05, 0.9, 0, 1.25, -0.62), m.body));
  for (const sx of [-0.24, 0.24]) {
    const g = profile(top.map(([z, y]) => [z, y + 0.012]).concat([...top].reverse().map(([z, y]) => [z, y + 0.002])), 0.2, 0.0001);
    g.translate(sx, 0, 0);
    root.add(new THREE.Mesh(g, m.stripe));
  }
  root.add(new THREE.Mesh(box(0.6, 0.12, 0.9, 0, 0.9, 1.4), m.trim)); // hood scoop
  root.add(new THREE.Mesh(box(1.9, 0.12, 0.12, 0, 0.4, 2.44), m.rims)); // chrome bumpers
  root.add(new THREE.Mesh(box(1.9, 0.12, 0.12, 0, 0.42, -2.44), m.rims));
  root.add(new THREE.Mesh(box(1.2, 0.18, 0.03, 0, 0.6, 2.43), m.trim)); // grille
  for (const sx of [-1, 1]) {
    root.add(new THREE.Mesh(box(0.28, 0.14, 0.05, sx * 0.72, 0.6, 2.43), m.head));
    root.add(new THREE.Mesh(box(0.55, 0.1, 0.04, sx * 0.55, 0.66, -2.43), m.tail));
    root.add(new THREE.Mesh(box(0.06, 0.1, 2.6, sx * 0.95, 0.34, 0), m.trim));
  }
  for (const sx of [-0.84, 0.84]) for (const z of [-1.5, 1.52]) wheel(root, m, sx, z, 0.35, 0.3);
  return root;
}

// ------------------------------------------------------------------------------------ fleet
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const _c = new THREE.Color();

/**
 * Draws `slots` cars of one model. slot = { x, z, yaw, body, rims, stripe, glow, glowI, y? }.
 * `glb` (optional) = GLB root following the car_* conventions; otherwise the procedural builder is used.
 */
export class CarFleet {
  constructor(slots, { glb = null, kind = 'tuner', track, name = 'cars' }) {
    this.slots = slots.map((s) => ({ y: 0, glowI: 1, pitch: 0, roll: 0, ...s }));
    let parts;
    if (glb) {
      parts = partsFromObject(glb, { emissiveBoost: 1.8 });
      const L = kind === 'muscle' ? 4.8 : 4.4;
      normalizeParts(parts, { length: L });
      for (const p of parts) {
        if (p.key.startsWith('EMISSIVE_Underglow')) {
          p.material.dispose();
          p.material = new THREE.MeshBasicMaterial({ color: 0xffffff, name: 'EMISSIVE_Underglow' });
        } else if (p.key.startsWith('TINT_')) {
          p.material.color?.set(0xffffff);
        }
      }
    } else {
      const obj = kind === 'muscle' ? buildMuscle() : buildTuner();
      parts = partsFromObject(obj, { keepMaterials: true });
      // drop the (unused) duplicate materials the builder made: parts reference one material per key already
      obj.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    // soft light pool on the asphalt (underglow) — its own additive part
    const poolGeo = new THREE.PlaneGeometry(kind === 'muscle' ? 3.0 : 2.9, kind === 'muscle' ? 6.0 : 5.6);
    poolGeo.rotateX(-Math.PI / 2); poolGeo.translate(0, 0.025, 0);
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex(track), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    poolMat.name = 'POOL';
    parts.push({ key: 'POOL', geometry: poolGeo, material: poolMat, noShadow: true, renderOrder: 1 });
    this.set = new InstSet(parts, this.slots.length, { castShadow: true, culled: false, name });
    this.group = this.set.group;
    this.slots.forEach((s, i) => this._place(i));
    this.slots.forEach((s, i) => {
      this.set.setColor(i, 'TINT_Body', _c.set(s.body || '#ff3ea5'));
      this.set.setColor(i, 'TINT_Rims', _c.set(s.rims || '#d9d9e0'));
      this.set.setColor(i, 'TINT_Stripe', _c.set(s.stripe || '#f1ede6'));
      this._glow(i, 1);
    });
    this.set.commit();
    this._pool = this.set.meshFor('POOL');
    this._ug = this.set.meshFor('EMISSIVE_Underglow');
  }

  _place(i) {
    const s = this.slots[i];
    _p.set(s.x, s.y, s.z);
    _q.setFromEuler(_e.set(s.pitch, s.yaw, s.roll, 'YXZ'));
    _m4.compose(_p, _q, _s);
    this.set.setMatrix(i, _m4);
  }

  _glow(i, k) {
    const s = this.slots[i];
    const col = s.glow ? _c.set(s.glow).multiplyScalar(s.glowI * k * 0.9) : _c.setRGB(0, 0, 0);
    for (const m of this._pool || this.set.meshFor('POOL')) m.setColorAt(i, col);
    if (s.glow) _c.set(s.glow).multiplyScalar(2.2 * k);
    for (const m of this._ug || this.set.meshFor('EMISSIVE_Underglow')) m.setColorAt(i, _c);
  }

  /** Moves car i (and flags the upload). */
  move(i, x, z, yaw, y = 0, pitch = 0, roll = 0) {
    const s = this.slots[i];
    s.x = x; s.z = z; s.yaw = yaw; s.y = y; s.pitch = pitch; s.roll = roll;
    this._place(i);
    this._dirtyM = true;
  }

  /** Sets underglow multiplier for car i (breathing). */
  glow(i, k) { this._glow(i, k); this._dirtyC = true; }

  flush() {
    if (this._dirtyM) { this.set.dirtyMatrices(); this._dirtyM = false; }
    if (this._dirtyC) {
      for (const m of this.set.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this._dirtyC = false;
    }
  }
}
