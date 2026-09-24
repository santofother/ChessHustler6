// Crown Hills — the mansion: marble podium + grand steps (always procedural) and a Miami-Mediterranean / art-deco
// villa (procedural fallback for mansion.glb): arched loggia, glowing french doors, tower with a gold crown crest,
// terracotta hip roofs, roof-terrace wings, bougainvillea. Main facade faces +Z; front of the main block at zF.
import * as THREE from 'three';
import { Batch } from './batch.js';
import { balustrade, urn } from './props.js';

const PYR = (w, h, d) => {
  const g = new THREE.ConeGeometry(1, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale((w / 2) / Math.SQRT1_2, h, (d / 2) / Math.SQRT1_2);
  g.translate(0, h / 2, 0);
  return g;
};

/** Window quad (arched texture via alphaTest) facing +Z. */
function win(B, key, x, y, z, w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  B.put(key, g, x, y + h / 2, z);
}

/** Podium + steps + flanking balustrades. Returns loggia floor height. */
export function podium(B, y0, { zFront = -27, halfW = 22, zBack = -44 } = {}) {
  const h = 0.6;
  B.box('stone', halfW * 2, h, zFront - zBack, 0, y0 + h / 2, (zFront + zBack) / 2);
  B.box('marble', halfW * 2 + 0.2, 0.08, 0.5, 0, y0 + h + 0.04, zFront - 0.2);
  // grand steps
  for (let i = 0; i < 4; i++) {
    const d = (4 - i) * 0.4, sh = (i + 1) * 0.15;
    B.box('marble', 14 - i * 0.4, sh, d, 0, y0 + sh / 2, zFront + d / 2);
  }
  // cheek walls with urns
  for (const sx of [-1, 1]) {
    B.box('marble', 0.6, 0.85, 1.9, sx * 7.3, y0 + 0.425, zFront + 0.9);
    urn(B, sx * 7.3, y0 + 0.85, zFront + 1.2, 0.8, 'marble', 'flowerPink');
  }
  const yP = y0 + h;
  balustrade(B, -halfW, zFront - 0.25, -11.6, zFront - 0.25, yP, { postEvery: 5.2 });
  balustrade(B, 11.6, zFront - 0.25, halfW, zFront - 0.25, yP, { postEvery: 5.2 });
  return yP;
}

/** Procedural villa. yP = loggia floor height. */
export function villa(B, yP, { zF = -30 } = {}) {
  const FL = 4.2; // floor height
  // ---- main block
  const mw = 26, md = 10;
  B.box('stucco', mw, FL * 2, md, 0, yP + FL, zF - md / 2);
  B.box('peach', mw + 0.1, 0.28, md + 0.1, 0, yP + FL + 0.05, zF - md / 2);
  B.box('white', mw + 0.8, 0.38, md + 0.8, 0, yP + FL * 2 + 0.19, zF - md / 2);
  B.box('peach', mw + 0.4, 0.14, md + 0.4, 0, yP + FL * 2 - 0.12, zF - md / 2);
  B.put('roof', PYR(mw + 0.8, 3.2, md + 0.8), 0, yP + FL * 2 + 0.38, zF - md / 2);
  // ---- loggia (arcade)
  const aw = 22, ad = 0.5, az = zF + 1.7; // arcade front face z
  const n = 7, pitch = aw / n, archR = 1.12, spring = 2.35;
  const shape = new THREE.Shape();
  shape.moveTo(-aw / 2, 0); shape.lineTo(aw / 2, 0); shape.lineTo(aw / 2, FL); shape.lineTo(-aw / 2, FL); shape.lineTo(-aw / 2, 0);
  for (let i = 0; i < n; i++) {
    const cx = -aw / 2 + (i + 0.5) * pitch;
    const hole = new THREE.Path();
    hole.moveTo(cx - archR, 0); hole.lineTo(cx - archR, spring);
    hole.absarc(cx, spring, archR, Math.PI, 0, true);
    hole.lineTo(cx + archR, 0); hole.lineTo(cx - archR, 0);
    shape.holes.push(hole);
  }
  const arc = new THREE.ExtrudeGeometry(shape, { depth: ad, bevelEnabled: false, curveSegments: 10 });
  B.put('stucco', arc, 0, yP, az - ad);
  // loggia ceiling / balcony slab + balcony balustrade
  B.box('white', aw + 0.4, 0.22, az - zF + 0.2, 0, yP + FL + 0.11, (az + zF) / 2);
  balustrade(B, -aw / 2, az - 0.2, aw / 2, az - 0.2, yP + FL + 0.22, { postEvery: pitch, urns: false });
  // half columns + gold capitals in front of the piers
  for (let i = 0; i <= n; i++) {
    const cx = -aw / 2 + i * pitch;
    B.put('white', new THREE.CylinderGeometry(0.2, 0.23, spring + 0.2, 10), cx, yP + (spring + 0.2) / 2, az + 0.08);
    B.put('gold', new THREE.BoxGeometry(0.55, 0.1, 0.3), cx, yP + spring + 0.25, az + 0.08);
  }
  // ground floor french doors behind each arch; the middle one is the grand door
  for (let i = 0; i < n; i++) {
    const cx = -aw / 2 + (i + 0.5) * pitch;
    const mid = i === (n - 1) / 2;
    win(B, mid ? 'win2' : 'win', cx, yP, zF + 0.02, mid ? 2.0 : 1.7, mid ? 3.3 : 3.0);
    if (mid) B.put('gold', new THREE.TorusGeometry(1.08, 0.06, 6, 16, Math.PI), cx, yP + 2.3, zF + 0.04);
  }
  // wall sconces on the piers either side of the grand door
  for (const sx of [-1, 1]) {
    B.put('globe', new THREE.SphereGeometry(0.13, 8, 6), sx * pitch / 2, yP + 2.9, az + 0.25);
    B.put('gold', new THREE.CylinderGeometry(0.04, 0.06, 0.25, 6), sx * pitch / 2, yP + 2.7, az + 0.2);
  }
  // upper floor windows (behind the balcony)
  const n2 = 9;
  for (let i = 0; i < n2; i++) {
    const cx = -mw / 2 + (i + 0.5) * (mw / n2);
    if (Math.abs(cx) < 3.7) continue; // tower
    win(B, i % 3 === 1 ? 'win2' : 'win', cx, yP + FL + 0.75, zF + 0.02, 1.25, 2.4);
    B.box('white', 1.5, 0.12, 0.2, cx, yP + FL + 3.25, zF + 0.1);
  }
  // ---- tower
  const tw = 7.2, td = 3.6, th = 14.2, tz = zF + 0.25;
  B.box('stucco', tw, th, td, 0, yP + th / 2, tz - td / 2);
  // art-deco fins
  for (const sx of [-1, 1]) {
    B.box('peach', 0.35, th - FL * 2 + 0.2, 0.25, sx * (tw / 2 - 0.25), yP + FL * 2 + (th - FL * 2) / 2, tz + 0.1);
    B.box('peach', 0.35, th - FL * 2 - 1.2, 0.25, sx * (tw / 2 - 0.95), yP + FL * 2 + (th - FL * 2 - 1.2) / 2, tz + 0.1);
  }
  win(B, 'win2', 0, yP + FL * 2 + 0.7, tz + 0.02, 1.9, 3.3);
  B.box('white', tw + 0.7, 0.4, td + 0.7, 0, yP + th + 0.2, tz - td / 2);
  B.put('roof', PYR(tw + 0.7, 3.0, td + 0.7), 0, yP + th + 0.4, tz - td / 2);
  // crest
  B.put('gold', new THREE.TorusGeometry(0.85, 0.09, 8, 28), 0, yP + FL * 2 + 4.9, tz + 0.08);
  B.put('marbleDark', new THREE.CircleGeometry(0.8, 24), 0, yP + FL * 2 + 4.9, tz + 0.05);
  crown(B, 0, yP + FL * 2 + 4.62, tz + 0.12, 0.62);
  crown(B, 0, yP + th + 3.35, tz - td / 2, 0.5, true);
  // ---- wings (single storey + roof terrace)
  for (const sx of [-1, 1]) {
    const wx = sx * 17.2, wwid = 8.4, wd = 7.5, wh = 5.2, wz = zF - 0.9;
    B.box('stucco', wwid, wh, wd, wx, yP + wh / 2, wz - wd / 2);
    B.box('peach', wwid + 0.1, 0.22, wd + 0.1, wx, yP + wh - 0.6, wz - wd / 2);
    B.box('white', wwid + 0.5, 0.3, wd + 0.5, wx, yP + wh + 0.15, wz - wd / 2);
    balustrade(B, wx - wwid / 2, wz - 0.05, wx + wwid / 2, wz - 0.05, yP + wh + 0.3, { postEvery: wwid / 2, urns: true, urnKey: 'terracotta', flowerKey: 'flowerPink' });
    for (const ox of [-2.1, 2.1]) {
      win(B, 'win', wx + ox, yP + 0.35, wz + 0.02, 1.55, 3.2);
      B.box('white', 1.9, 0.12, 0.25, wx + ox, yP + 3.7, wz + 0.1);
    }
    // bougainvillea clumps climbing the corner
    for (let k = 0; k < 6; k++) {
      const fx = wx + sx * (wwid / 2 - 0.1) - sx * (k % 2) * 0.5;
      B.put(k % 3 === 0 ? 'flowerRed' : 'flowerPink', new THREE.IcosahedronGeometry(0.45 + (k % 3) * 0.12, 1), fx, yP + 0.9 + k * 0.75, wz + 0.2, k, 1, 0.8, 0.6);
    }
  }
  // bougainvillea draped along the loggia top
  for (let i = 0; i < 8; i++) {
    const x = -aw / 2 + i * pitch + (i % 2 ? 0.3 : -0.3);
    B.put(i % 3 === 0 ? 'flowerRed' : 'flowerPink', new THREE.IcosahedronGeometry(0.38, 1), x, yP + FL - 0.1, az + 0.25, i, 1.2, 0.7, 0.7);
  }
}

/** Gold crown ornament. */
export function crown(B, x, y, z, s = 1, round = false) {
  const m = Batch.mat(x, y, z, 0, 0, 0, s);
  const band = round ? new THREE.CylinderGeometry(0.55, 0.5, 0.3, 14, 1, true) : new THREE.BoxGeometry(1.1, 0.25, 0.08);
  band.translate(0, 0.15, 0);
  B.add('gold', band, m); band.dispose();
  const pts = round ? 7 : 5;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const px = round ? Math.cos(a) * 0.52 : -0.44 + i * 0.22;
    const pz = round ? Math.sin(a) * 0.52 : 0;
    const hgt = round ? 0.45 : (i === 2 ? 0.5 : i % 2 ? 0.3 : 0.4);
    const c = new THREE.ConeGeometry(0.08, hgt, 5); c.translate(px, 0.3 + hgt / 2, pz);
    B.add('gold', c, m); c.dispose();
    const b = new THREE.SphereGeometry(0.06, 6, 4); b.translate(px, 0.32 + hgt, pz);
    B.add('gold', b, m); b.dispose();
  }
  if (round) { const b = new THREE.SphereGeometry(0.16, 8, 6); b.translate(0, 0.6, 0); B.add('gold', b, m); b.dispose(); }
}
