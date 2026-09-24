// Neon Mile background crowd: hundreds of cheap low-poly spectators drawn with a few InstancedMeshes
// (shirt / pants / skin / hair colours per instance, two poses: arms down, one arm up filming with a phone).
// They bounce to the music in the vertex shader (no per-frame CPU cost). The animated, reacting people up front
// come from NpcCrowd; these fill the street edges behind them like the crowd in docs/ref_street_race.png.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET_Y } from '../Arena.js';
import { injectLife } from './inst.js';

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c', '#6b4226'];
const HAIRS = ['#1b1b1b', '#3b2314', '#6a4e42', '#d6b370', '#b55239', '#2b2b2b', '#ff3ea5', '#a259ff'];
const TOPS = ['#ff3ea5', '#a259ff', '#2de2e6', '#f9f871', '#ffffff', '#111111', '#ff7a1a', '#ffd23f', '#e63946', '#8ecae6', '#6a4c93', '#f4a6c8', '#2a9d8f'];
const BOTTOMS = ['#111111', '#1d3557', '#2b2d42', '#3c1642', '#343a40', '#e9e4ee', '#5a4a3a'];

function geo() {
  const cyl = (rt, rb, h, y, x = 0, seg = 5) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, 0); return g; };
  const legs = mergeGeometries([cyl(0.075, 0.06, 0.82, 0.41, -0.09), cyl(0.075, 0.06, 0.82, 0.41, 0.09), cyl(0.18, 0.17, 0.14, 0.85)]);
  const torso = cyl(0.19, 0.17, 0.6, 1.12, 0, 7);
  const armsDown = mergeGeometries([cyl(0.05, 0.045, 0.62, 1.1, -0.245, 4), cyl(0.05, 0.045, 0.62, 1.1, 0.245, 4)]);
  const up = cyl(0.05, 0.045, 0.6, 0, 0, 5); up.translate(0, 0.3, 0); up.rotateZ(-0.25); up.rotateX(-0.35); up.translate(0.24, 1.38, 0);
  const armsUp = mergeGeometries([cyl(0.05, 0.045, 0.62, 1.1, -0.245, 5), up]);
  const head = new THREE.SphereGeometry(0.12, 7, 4); head.translate(0, 1.58, 0);
  const hair = new THREE.SphereGeometry(0.128, 7, 2, 0, Math.PI * 2, 0, Math.PI * 0.5); hair.translate(0, 1.6, -0.01);
  const phone = new THREE.PlaneGeometry(0.07, 0.12); phone.translate(0, 0, 0); phone.rotateX(-0.35); phone.translate(0.39, 1.98, 0.22);
  [legs, armsDown, armsUp].forEach((g) => g.computeVertexNormals());
  return { legs, torso, armsDown, armsUp, head, hair, phone };
}

/**
 * spots: [{ x, z, yaw, up: bool, scale }]. uni: shared { uTime, uAmp }. rnd: seeded rng.
 * Returns { group, count }.
 */
export function buildFillerCrowd(arena, spots, uni, rnd, { tops = TOPS } = {}) {
  const g = geo();
  const group = new THREE.Group(); group.name = 'filler-crowd';
  const std = () => injectLife(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }), uni, { bob: 0.07, speed: 1 });
  const mTop = std(), mBot = std(), mSkin = std(), mHair = std();
  const mPhone = injectLife(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfe8ff).multiplyScalar(1.6), side: THREE.DoubleSide }), uni, { bob: 0.07, speed: 1 });
  const ups = spots.filter((s) => s.up), downs = spots.filter((s) => !s.up);
  const all = [...downs, ...ups];
  const n = all.length;
  const mk = (geom, mat, count) => { const m = new THREE.InstancedMesh(geom, mat, Math.max(1, count)); m.count = count; group.add(m); return m; };
  const legs = mk(g.legs, mBot, n), torso = mk(g.torso, mTop, n), head = mk(g.head, mSkin, n), hair = mk(g.hair, mHair, n);
  const armsD = mk(g.armsDown, mTop, downs.length), armsU = mk(g.armsUp, mTop, ups.length), phones = mk(g.phone, mPhone, ups.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  all.forEach((sp, i) => {
    const sc = sp.scale || (0.9 + rnd() * 0.18);
    p.set(sp.x, sp.y ?? STREET_Y, sp.z); q.setFromAxisAngle(up, sp.yaw || 0); s.set(sc, sc * (0.95 + rnd() * 0.1), sc);
    m.compose(p, q, s);
    for (const im of [legs, torso, head, hair]) im.setMatrixAt(i, m);
    const top = c.set(pick(tops));
    torso.setColorAt(i, top);
    if (i < downs.length) { armsD.setMatrixAt(i, m); armsD.setColorAt(i, top); }
    else { const k = i - downs.length; armsU.setMatrixAt(k, m); armsU.setColorAt(k, top); phones.setMatrixAt(k, m); }
    legs.setColorAt(i, c.set(pick(BOTTOMS)));
    head.setColorAt(i, c.set(pick(SKINS)));
    hair.setColorAt(i, c.set(pick(HAIRS)));
  });
  for (const im of group.children) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = false; im.receiveShadow = true;
  }
  arena.group.add(group);
  return { group, count: n };
}
