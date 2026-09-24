// Neon Mile city dressing: wet asphalt boulevard (along Z), paint, sidewalks, art-deco club strip with neon
// signs, and the distant skyline. Everything is merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET_Y } from '../Arena.js';
import { canvasTexture, speckle, rng } from '../../util.js';

// layout (metres). Street runs along Z; white camera at +Z looks down the boulevard toward -Z.
export const L = {
  roadHalf: 12,        // asphalt |x| < 12
  walkTo: 18.5,        // sidewalk 12 → 18.5, facades at |x| = 18.5
  crossZ: [25, 35],    // cross street (T-junction) behind white
  cross2Z: [-50, -41], // cross street far down the boulevard
  farZ: -150,
  clubZ: 38,           // facade across the T (faces -Z)
  kerbH: 0.16,
};

const FONT = 'Anton, Impact, "Arial Black", sans-serif';

// ---------------------------------------------------------------------------------------- textures
export function neonTextTex(text, color, { outline = '#ffffff', w = 512, h = 128, font = FONT, italic = false, bg = null } = {}) {
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    let fs = Math.round(h * 0.74);
    const f = () => `${italic ? 'italic ' : ''}bold ${fs}px ${font}`;
    g.font = f();
    while (g.measureText(text).width > w * 0.88 && fs > 12) { fs -= 3; g.font = f(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = h * 0.16;
    g.lineWidth = Math.max(4, fs * 0.09); g.strokeStyle = color; g.strokeText(text, w / 2, h / 2 + 2);
    g.shadowBlur = h * 0.05; g.lineWidth = Math.max(1.5, fs * 0.03); g.strokeStyle = outline; g.strokeText(text, w / 2, h / 2 + 2);
  }, { anisotropy: 4 });
}

function asphaltTex() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#1f1d2b'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, (r) => { const v = 20 + r() * 60; return `rgba(${v + 8},${v},${v + 14},${0.25 + r() * 0.35})`; }, rng(11), [1, 2.2]);
    // patched squares + cracks
    const r = rng(5);
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(10,8,14,${0.15 + r() * 0.15})`; g.fillRect(r() * w, r() * h, 40 + r() * 120, 30 + r() * 90); }
    g.strokeStyle = 'rgba(8,6,10,0.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) {
      g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  }, { repeat: [40, 40] });
}

/** Roughness map: mostly damp, a few glossy puddles (dark = smooth). */
function wetTex() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    const r = rng(77);
    for (let i = 0; i < 16; i++) {
      const x = r() * w, y = r() * h, rad = 12 + r() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(20,20,20,0.95)'); grd.addColorStop(0.7, 'rgba(40,40,40,0.6)'); grd.addColorStop(1, 'rgba(150,150,150,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { srgb: false, repeat: [9, 9] });
}

function concreteTex() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#6d6470'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, (r) => `rgba(${60 + r() * 80},${55 + r() * 70},${65 + r() * 80},0.3)`, rng(3));
    g.strokeStyle = 'rgba(30,24,34,0.6)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); }
  }, { repeat: [1, 1] });
}

/** Window grid texture (map + emissive) — lit windows warm / pink / cyan. */
function windowsTex(r, colors, lit) {
  const W = 128, H = 128, cols = 4, rows = 4;
  const cells = [];
  for (let i = 0; i < cols * rows; i++) cells.push(r() < lit ? colors[Math.floor(r() * colors.length)] : null);
  const draw = (em) => (g) => {
    g.fillStyle = em ? '#000' : '#fff'; g.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / rows;
    cells.forEach((c, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      if (em) { if (!c) return; g.fillStyle = c; g.globalAlpha = 0.6 + r() * 0.4; g.fillRect(x + 7, y + 9, cw - 14, ch - 18); g.globalAlpha = 1; }
      else { g.fillStyle = c ? '#d8d0d8' : '#3a3440'; g.fillRect(x + 7, y + 9, cw - 14, ch - 18); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 4, y + ch - 9, cw - 8, 3); }
    });
  };
  const map = canvasTexture(W, H, draw(false), { repeat: [1, 1], anisotropy: 4 });
  const emissive = canvasTexture(W, H, draw(true), { repeat: [1, 1], anisotropy: 4 });
  return { map, emissive };
}

/** Ground-floor storefront strip: 4 warm glowing shop windows with silhouettes, dark pilasters. */
function storefrontTex() {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#120c18'; g.fillRect(0, 0, w, h);
    const cols = ['#ffb86b', '#ff7ac8', '#8fe9ff', '#ffd98a'];
    const r = rng(33);
    for (let i = 0; i < 4; i++) {
      const x = i * 128 + 12, y = 22, cw = 104, ch = 100;
      const grd = g.createLinearGradient(0, y, 0, y + ch);
      grd.addColorStop(0, cols[i]); grd.addColorStop(1, '#3a1c3a');
      g.fillStyle = grd; g.fillRect(x, y, cw, ch);
      // people / bottles / shelves silhouettes
      g.fillStyle = 'rgba(20,8,24,0.75)';
      for (let k = 0; k < 3; k++) { const px = x + 10 + r() * (cw - 30); g.beginPath(); g.arc(px + 8, y + ch - 52, 7, 0, 7); g.fill(); g.fillRect(px, y + ch - 44, 16, 44); }
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y + 30, cw, 3); g.fillRect(x, y + 60, cw, 3);
    }
    g.fillStyle = '#ff3ea5'; g.fillRect(0, 8, w, 6);
  }, { anisotropy: 4 });
}

// ---------------------------------------------------------------------------------------- builders
export function buildGround(arena, { puddles = true } = {}) {
  const t = (x) => arena.track(x);
  const road = t(asphaltTex());
  const wet = t(wetTex());
  const mat = new THREE.MeshStandardMaterial({
    map: road, roughness: 0.6, metalness: 0.2, envMapIntensity: 1.0, color: 0x8c88aa,
    roughnessMap: puddles ? wet : null,
  });
  const g = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), mat);
  g.rotation.x = -Math.PI / 2; g.position.y = STREET_Y; g.receiveShadow = true; g.name = 'asphalt';
  arena.group.add(g);

  // sidewalks (raised blocks) + kerb
  const walk = [];
  const kerb = [];
  const H = L.kerbH;
  const addBlock = (x0, x1, z0, z1) => {
    const b = new THREE.BoxGeometry(x1 - x0, H, z1 - z0);
    // world-scale UVs (tile ≈ 4 m)
    const uv = b.attributes.uv, pos = b.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + (x0 + x1) / 2) / 4, (pos.getZ(i) + (z0 + z1) / 2) / 4);
    b.translate((x0 + x1) / 2, STREET_Y + H / 2, (z0 + z1) / 2);
    walk.push(b);
  };
  for (const sx of [-1, 1]) {
    const a = sx < 0 ? [-60, -L.roadHalf] : [L.roadHalf, 60];
    addBlock(a[0], a[1], L.farZ, L.cross2Z[0]);
    addBlock(a[0], a[1], L.cross2Z[1], L.crossZ[0]);
    // kerb stones (painted), along the road edge
    for (const [z0, z1] of [[L.farZ, L.cross2Z[0]], [L.cross2Z[1], L.crossZ[0]]]) {
      const k = new THREE.BoxGeometry(0.22, H + 0.02, z1 - z0);
      k.translate(sx * (L.roadHalf + 0.11), STREET_Y + (H + 0.02) / 2, (z0 + z1) / 2);
      kerb.push(k);
    }
  }
  addBlock(-120, 120, L.crossZ[1], 80);
  const cm = t(concreteTex());
  cm.wrapS = cm.wrapT = THREE.RepeatWrapping;
  const walkMesh = new THREE.Mesh(mergeGeometries(walk), new THREE.MeshStandardMaterial({ map: cm, color: 0x9a8aa4, roughness: 0.8, envMapIntensity: 0.4 }));
  walkMesh.receiveShadow = true; walkMesh.name = 'sidewalks';
  const kerbMesh = new THREE.Mesh(mergeGeometries(kerb), new THREE.MeshStandardMaterial({ color: 0xe8dff0, roughness: 0.6 }));
  kerbMesh.receiveShadow = true;
  arena.group.add(walkMesh, kerbMesh);
  walk.forEach((x) => x.dispose()); kerb.forEach((x) => x.dispose());
}

/** Road paint: lane dashes, start line checker strip, burnout marks, lane numbers — one merged mesh, vertex colours. */
export function buildMarkings(arena, { accent = '#ff3ea5' } = {}) {
  const geos = [];
  const col = new THREE.Color();
  const quad = (x, z, w, d, color, rot = 0, y = 0.012) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    if (rot) g.rotateY(rot);
    g.translate(x, STREET_Y + y, z);
    col.set(color);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    geos.push(g);
  };
  const W = '#e9e4ee', Y = '#f2c14e';
  // centre double yellow far down the boulevard + dashed lane lines
  for (let z = -18; z > L.farZ; z -= 1) { if (z < L.cross2Z[1] && z > L.cross2Z[0]) continue; quad(-0.12, z - 0.5, 0.1, 1, Y); quad(0.12, z - 0.5, 0.1, 1, Y); }
  for (const x of [-4.2, 4.2]) for (let z = -18; z > L.farZ; z -= 6) { if (z < L.cross2Z[1] + 1 && z > L.cross2Z[0] - 3) continue; quad(x, z - 1.5, 0.14, 3, W); }
  for (const x of [-4.2, 4.2]) for (let z = 18; z < L.crossZ[0]; z += 6) quad(x, z + 1.5, 0.14, 3, W);
  // drag lanes beside the board (racers): solid lane borders
  for (const sx of [-1, 1]) {
    for (const x of [6.9, 9.8]) quad(sx * x, -4.6, 0.12, 15, W);
  }
  // checkered start strip across the whole road (skipping the board zone)
  const sq = 0.4;
  for (let row = 0; row < 2; row++) {
    for (let x = -L.roadHalf + sq / 2; x < L.roadHalf; x += sq) {
      if (Math.abs(x) < 5.4) continue;
      const k = Math.round((x + 50) / sq) + row;
      quad(x, 0.6 - row * sq, sq, sq, k % 2 ? '#101014' : W, 0, 0.013);
    }
  }
  // gang-colour "START" bars in the corridor (flat paint only)
  quad(0, -7.2, 10.6, 0.25, accent);
  quad(0, 7.2, 10.6, 0.25, accent);
  // burnout marks (dark, slightly curved) behind the racer lanes and on the boulevard
  const r = rng(91);
  const burn = (x0, z0, len, curve, w = 0.24) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const x = x0 + Math.sin(k * 3.1) * curve;
      const z = z0 + k * len;
      const a = Math.atan2(Math.cos(k * 3.1) * curve * 3.1 / len, 1);
      col.setRGB(0.02, 0.02, 0.025);
      quad(x, z, w, len / n + 0.05, '#0a090c', a, 0.011);
    }
  };
  for (const sx of [-1, 1]) {
    burn(sx * 7.8, -10, 6, 0.1); burn(sx * 8.8, -10, 6, -0.1);
  }
  for (let i = 0; i < 8; i++) burn((r() - 0.5) * 14, -20 - r() * 60, 6 + r() * 6, (r() - 0.5) * 2.5, 0.26);
  for (let i = 0; i < 3; i++) burn((r() - 0.5) * 16, 17 + r() * 5, 5, (r() - 0.5) * 3, 0.26);
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, envMapIntensity: 0.5,
  }));
  mesh.receiveShadow = true; mesh.name = 'markings';
  arena.group.add(mesh);
  geos.forEach((g) => g.dispose());
  return mesh;
}

/**
 * Art-deco club strip facing the street + across the T-junction. Returns { signs:[{mesh, base}] } for soft glow.
 */
export function buildStrip(arena, { neonMul = 1, boss = false } = {}) {
  const t = (x) => arena.track(x);
  const r = rng(303);
  const pal = ['#f4a6c8', '#8fd6d0', '#c7a6f4', '#f6d6a8', '#f7c2a2', '#a8c8f4'];
  const wins = [
    windowsTex(r, ['#ffcf7a', '#ffe2a8', '#ffb35c'], 0.45),
    windowsTex(r, ['#ff8ac0', '#ff5fa2', '#ffd0e6'], 0.4),
    windowsTex(r, ['#7ff5ff', '#c9ffff', '#a259ff'], 0.35),
  ];
  wins.forEach((w) => { t(w.map); t(w.emissive); w.map.wrapS = w.map.wrapT = w.emissive.wrapS = w.emissive.wrapT = THREE.RepeatWrapping; });
  const wallMats = wins.map((w) => new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, map: w.map, emissiveMap: w.emissive, emissive: 0xffffff, emissiveIntensity: 1.25 * neonMul + 0.2,
    roughness: 0.75, metalness: 0.05, envMapIntensity: 0.5,
  }));
  const wallGeos = wins.map(() => []);
  const shop = t(storefrontTex());
  shop.wrapS = THREE.RepeatWrapping;
  const shopGeos = [];
  const awnGeos = [];
  const neonGeos = { pink: [], cyan: [], purple: [], gold: [] };
  const col = new THREE.Color();
  const wallK = 0.32 + 0.4 * (1 - neonMul);
  const paint = (g, hex, k = 1) => {
    col.set(hex).multiplyScalar(k);
    const n = g.attributes.position.count; const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  // a building whose street face is at (fx, fz) facing direction `face` (+1/-1 along X, or 'z-' for across the T)
  const building = (cx, cz, w, d, h, alongZ, faceSign) => {
    const g = new THREE.BoxGeometry(alongZ ? d : w, h, alongZ ? w : d);
    const uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5) { uv.setXY(i, 0.02, 0.02); continue; }
      const across = nx > 0.5 ? (alongZ ? w : d) : (alongZ ? d : w);
      uv.setXY(i, uv.getX(i) * across / 3.2, uv.getY(i) * (h - 3.4) / 3.2 + 0.0);
    }
    // push window rows above the storefront: shift geometry up and keep base at street by stretching
    g.translate(cx, STREET_Y + h / 2, cz);
    paint(g, pal[Math.floor(r() * pal.length)], wallK);
    wallGeos[Math.floor(r() * wallGeos.length)].push(g);
    // storefront band on the street face (0.2 .. 3.3 m)
    const sf = new THREE.PlaneGeometry(w - 0.6, 3.0);
    const uvs = sf.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * Math.max(1, Math.round(w / 6)));
    const off = (alongZ ? d : d) / 2 + 0.03;
    if (alongZ) { sf.rotateY(faceSign > 0 ? Math.PI / 2 : -Math.PI / 2); sf.translate(cx + faceSign * off, STREET_Y + 1.7, cz); }
    else { sf.rotateY(faceSign > 0 ? 0 : Math.PI); sf.translate(cx, STREET_Y + 1.7, cz + faceSign * off); }
    shopGeos.push(sf);
    // awning
    const aw = new THREE.BoxGeometry(alongZ ? 1.4 : w - 0.4, 0.12, alongZ ? w - 0.4 : 1.4);
    aw.translate(alongZ ? cx + faceSign * (off + 0.7) : cx, STREET_Y + 3.45, alongZ ? cz : cz + faceSign * (off + 0.7));
    awnGeos.push(paint(aw, ['#ff3ea5', '#2de2e6', '#a259ff', '#f9f871', '#ff7a1a', '#ffffff'][Math.floor(r() * 6)]));
    // neon: roofline + corner fins
    const key = ['pink', 'cyan', 'purple', 'gold'][Math.floor(r() * 4)];
    const tt = 0.09;
    if (alongZ) {
      const x = cx + faceSign * (off - 0.02);
      const e = new THREE.BoxGeometry(tt, tt, w); e.translate(x, STREET_Y + h - 0.35, cz); neonGeos[key].push(e);
      const e2 = new THREE.BoxGeometry(tt, tt, w - 0.4); e2.translate(x + faceSign * 0.02, STREET_Y + 3.62, cz); neonGeos[key].push(e2);
      for (const s of [-1, 1]) { const v = new THREE.BoxGeometry(tt, h - 4, tt); v.translate(x, STREET_Y + 3.6 + (h - 4) / 2, cz + s * (w / 2 - 0.12)); neonGeos[key].push(v); }
    } else {
      const z = cz + faceSign * (off - 0.02);
      const e = new THREE.BoxGeometry(w, tt, tt); e.translate(cx, STREET_Y + h - 0.35, z); neonGeos[key].push(e);
      for (const s of [-1, 1]) { const v = new THREE.BoxGeometry(tt, h - 4, tt); v.translate(cx + s * (w / 2 - 0.12), STREET_Y + 3.6 + (h - 4) / 2, z); neonGeos[key].push(v); }
    }
    // art-deco spire on some roofs
    if (r() < 0.35 && h > 8) {
      const sw = 1.6, sh = 4 + r() * 4;
      const sp = new THREE.BoxGeometry(alongZ ? 1.2 : sw, sh, alongZ ? sw : 1.2);
      const sx = alongZ ? cx + faceSign * (d / 2 - 1.2) : cx, sz = alongZ ? cz : cz + faceSign * (d / 2 - 1.2);
      sp.translate(sx, STREET_Y + h + sh / 2, sz);
      paint(sp, pal[Math.floor(r() * pal.length)], wallK);
      wallGeos[0].push(sp);
      const v = new THREE.BoxGeometry(alongZ ? 0.1 : 0.1, sh, 0.1);
      v.translate(alongZ ? sx + faceSign * 0.62 : sx, STREET_Y + h + sh / 2, alongZ ? sz : sz + faceSign * 0.62);
      neonGeos[key].push(v);
    }
  };
  // street sides
  for (const sx of [-1, 1]) {
    let z = L.crossZ[0] - 0.5;
    while (z > L.farZ + 10) {
      const w = 9 + r() * 7;
      const zc = z - w / 2;
      if (zc + w / 2 > L.cross2Z[0] && zc - w / 2 < L.cross2Z[1]) { z = L.cross2Z[0] - 0.5; continue; }
      const h = 7 + r() * 10 + (Math.abs(zc) > 60 ? r() * 8 : 0);
      building(sx * (L.walkTo + 6), zc, w - 0.4, 12, h, true, -sx);
      z -= w;
    }
  }
  // across the T (behind white): the club block
  for (let x = -70; x < 70;) {
    const w = 10 + r() * 8;
    const xc = x + w / 2;
    building(xc, L.clubZ + 6, w - 0.4, 12, Math.abs(xc) < 10 ? 13 : 8 + r() * 10, false, -1);
    x += w;
  }
  const meshes = [];
  wallMats.forEach((m, i) => {
    if (!wallGeos[i].length) return;
    const mesh = new THREE.Mesh(mergeGeometries(wallGeos[i]), m); mesh.receiveShadow = false; meshes.push(mesh);
  });
  const shopMat = new THREE.MeshBasicMaterial({ map: shop, color: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + 0.35 * neonMul) });
  meshes.push(new THREE.Mesh(mergeGeometries(shopGeos), shopMat));
  meshes.push(new THREE.Mesh(mergeGeometries(awnGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x220a22 })));
  const NC = { pink: 0xff3ea5, cyan: 0x2de2e6, purple: 0xa259ff, gold: 0xf9f871 };
  const neonMats = {};
  for (const k in neonGeos) {
    if (!neonGeos[k].length) continue;
    neonMats[k] = new THREE.MeshBasicMaterial({ color: new THREE.Color(NC[k]).multiplyScalar(2.2 * neonMul) });
    meshes.push(new THREE.Mesh(mergeGeometries(neonGeos[k]), neonMats[k]));
  }
  meshes.forEach((m) => { m.name = 'strip'; arena.group.add(m); });
  [...wallGeos.flat(), ...shopGeos, ...awnGeos, ...Object.values(neonGeos).flat()].forEach((g) => g.dispose());

  // ---- signs (text on canvas; steady; a couple breathe very slowly)
  const signs = [];
  const sign = (text, color, w, h, pos, yaw, { outline, mul = 2.0, breathe = false, italic = false, bg = null, tw = 512, th = 128 } = {}) => {
    const tex = t(neonTextTex(text, color, { outline, italic, bg, w: tw, h: th }));
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, depthWrite: !!bg, side: THREE.DoubleSide, color: new THREE.Color(1, 1, 1).multiplyScalar(mul * neonMul * 0.6) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(...pos); mesh.rotation.y = yaw;
    arena.group.add(mesh);
    signs.push({ mesh, base: mul * neonMul * 0.6, breathe, ph: r() * 6 });
    return mesh;
  };
  const fx = L.walkTo - 0.05; // facade plane
  const Y = STREET_Y;
  // left side (x<0) faces +X, right side faces -X
  sign('VELVET', '#a259ff', 8, 2, [-fx + 0.1, Y + 5.6, -9], Math.PI / 2, { outline: '#f9f871', mul: 2.3, breathe: true, italic: true });
  sign('LUCKY 7 CASINO', '#f9f871', 9, 1.8, [fx - 0.1, Y + 5.4, -12], -Math.PI / 2, { outline: '#ff3ea5', mul: 2.1 });
  sign('CLUB MALIBOO', '#ff3ea5', 9, 1.9, [-fx + 0.1, Y + 5.8, -28], Math.PI / 2, { outline: '#ffffff', mul: 2.2, italic: true });
  sign('BOTTLE SERVICE', '#2de2e6', 8, 1.4, [fx - 0.1, Y + 5.0, -30], -Math.PI / 2, { mul: 2.0 });
  sign('NEON MILE', '#ff7a1a', 8, 2.0, [-fx + 0.1, Y + 5.2, 8], Math.PI / 2, { outline: '#fff3c4', mul: 2.0 });
  sign('OPEN 24/7', '#9dff3c', 5, 1.2, [fx - 0.1, Y + 4.4, 6], -Math.PI / 2, { mul: 1.8 });
  sign('FLAMINGO MOTEL', '#ff5fa2', 9, 1.8, [fx - 0.1, Y + 6.2, -52], -Math.PI / 2, { mul: 2.0 });
  sign('LIQUOR', '#2de2e6', 5, 1.3, [-fx + 0.1, Y + 4.4, -56], Math.PI / 2, { mul: 1.8 });
  // vertical blade signs (face the boulevard, readable from the cinematic camera)
  const blade = (text, color, x, z, h) => {
    const s = sign(text.split('').join(' '), color, 1.3, h, [x, Y + 4 + h / 2, z], 0, { mul: 2.0, tw: 128, th: 512 });
    s.material.map.dispose();
    const tex = t(canvasTexture(128, 512, (g, w, hh) => {
      g.clearRect(0, 0, w, hh);
      g.fillStyle = 'rgba(20,6,30,0.85)'; g.fillRect(8, 4, w - 16, hh - 8);
      g.strokeStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 14; g.strokeRect(12, 8, w - 24, hh - 16);
      const n = text.length; const fs = Math.min(90, (hh - 40) / n);
      g.font = `bold ${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < n; i++) { g.lineWidth = 4; g.strokeStyle = color; g.strokeText(text[i], w / 2, 26 + fs / 2 + i * fs); g.fillStyle = '#fff6fb'; g.fillText(text[i], w / 2, 26 + fs / 2 + i * fs); }
    }, { anisotropy: 4 }));
    s.material.map = tex; s.material.transparent = true;
    return s;
  };
  blade('HOTEL', '#2de2e6', -fx + 1.2, -18, 5.5);
  blade('BAR', '#ff3ea5', fx - 1.2, -22, 3.6);
  blade('CLUB', '#f9f871', -fx + 1.2, -40, 4.5);
  blade('SLOTS', '#a259ff', fx - 1.2, -37, 5);
  // across the T, readable from the black camera's cinematic side
  const cz = L.clubZ + 6 - 6 - 0.08;
  sign(boss ? 'VELVET SYNDICATE' : 'VELVET', '#a259ff', boss ? 16 : 12, 3, [0, Y + 6.8, cz], Math.PI, { outline: '#f9f871', mul: 2.4, breathe: true, italic: true });
  sign('BOTTLE SERVICE FOR YOUR BAD IDEAS', '#f9f871', 14, 1.1, [0, Y + 4.6, cz], Math.PI, { mul: 1.7 });
  return { signs };
}

/** Distant towers ring (merged, window-lit) — visible from the cinematic camera. */
export function buildSkyline(arena, { neonMul = 1 } = {}) {
  const t = (x) => arena.track(x);
  const r = rng(808);
  const texs = [
    windowsTex(r, ['#ffcf7a', '#ffe2a8'], 0.35),
    windowsTex(r, ['#ff8ac0', '#ffd0e6'], 0.3),
    windowsTex(r, ['#7ff5ff', '#c9ffff'], 0.28),
  ];
  const facade = ['#1d1628', '#261a34', '#1a1824'];
  const mats = texs.map((tx, i) => {
    t(tx.map); t(tx.emissive);
    tx.map.wrapS = tx.map.wrapT = tx.emissive.wrapS = tx.emissive.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ color: facade[i], map: tx.map, emissiveMap: tx.emissive, emissive: 0xffffff, emissiveIntensity: 1.3 * neonMul + 0.3, roughness: 0.6, metalness: 0.3 });
  });
  const geos = mats.map(() => []);
  const tops = [];
  const place = (x, z, w, d, h) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5) { uv.setXY(i, 0.02, 0.02); continue; }
      uv.setXY(i, uv.getX(i) * (nx > 0.5 ? d : w) / 3, uv.getY(i) * h / 3);
    }
    g.translate(x, STREET_Y + h / 2, z);
    geos[Math.floor(r() * geos.length)].push(g);
    if (r() < 0.5) { const e = new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1); e.translate(x, STREET_Y + h - 0.3, z); tops.push(e); }
  };
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const dist = 70 + r() * 90;
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    const downBoulevard = z < -60 && Math.abs(x) < 30;
    place(x, z, 6 + r() * 10, 6 + r() * 10, (downBoulevard ? 30 : 12) + Math.pow(r(), 1.5) * 60);
  }
  mats.forEach((m, i) => { if (geos[i].length) { const mesh = new THREE.Mesh(mergeGeometries(geos[i]), m); mesh.name = 'skyline'; arena.group.add(mesh); } });
  if (tops.length) arena.group.add(new THREE.Mesh(mergeGeometries(tops), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3ea5).multiplyScalar(1.6 * neonMul + 0.3) })));
  [...geos.flat(), ...tops].forEach((g) => g.dispose());
}
