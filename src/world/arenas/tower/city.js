// Nocturno Tower: the Vice City skyline far below the roof. Everything here is merged / instanced:
//   towers (1 draw call, procedural window shader) · crowns & neon trims (3) · spires (1) · beacons (1 points)
//   ground carpet + bay (2) · highway light streams (1 shader) · cloud wisps (1 instanced) · bay bridge (2)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, glowTex, rand } from './kit.js';

export const CITY_Y = -170;

// ------------------------------------------------------------------ tower window shader
function towerMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uFacade: { value: new THREE.Color('#0d1330') },
      uWinA: { value: new THREE.Color('#ffc978').multiplyScalar(1.25) },   // warm office
      uWinB: { value: new THREE.Color('#fff0d6').multiplyScalar(1.15) },   // white
      uWinC: { value: new THREE.Color('#5ff0ff').multiplyScalar(1.1) },    // teal
      uWinD: { value: new THREE.Color('#ff7ac0').multiplyScalar(1.1) },    // pink
    }]),
    vertexShader: /* glsl */`
      attribute vec4 aInfo;   // seed, style, litRatio, baseY
      varying vec3 vWorld; varying vec3 vN; varying vec4 vInfo;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = normal; vInfo = aInfo;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uFacade, uWinA, uWinB, uWinC, uWinD;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vInfo;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN);
        float seed = vInfo.x, style = vInfo.y, lit = vInfo.z, baseY = vInfo.w;
        vec3 col;
        if (n.y > 0.5) {
          col = uFacade * 0.7;
        } else {
          float u = (abs(n.x) > 0.5 ? vWorld.z : vWorld.x) + n.x * 31.0 + n.z * 57.0;
          float h = vWorld.y - baseY;
          float cw = mix(2.2, 3.4, fract(seed * 7.13));
          float fh = mix(3.0, 4.0, fract(seed * 3.71));
          vec2 g = vec2(u / cw, h / fh);
          vec2 cell = floor(g); vec2 f = fract(g);
          float win; float cover;
          if (style < 0.5) { win = step(0.16, f.x) * step(f.x, 0.84) * step(0.24, f.y) * step(f.y, 0.8); cover = 0.38; }
          else if (style < 1.5) { win = step(0.18, f.y) * step(f.y, 0.86) * step(0.03, f.x) * step(f.x, 0.97); cover = 0.64; }
          else { win = step(0.34, f.x) * step(f.x, 0.66) * step(0.08, f.y) * step(f.y, 0.92); cover = 0.28; }
          float r1 = hash(cell + seed * 13.1);
          float r2 = hash(cell.yx * 1.7 + seed * 5.3);
          float on = step(r1, lit) * step(0.14, hash(vec2(cell.y, seed * 9.1)));
          vec3 wc = r2 < 0.5 ? uWinA : (r2 < 0.8 ? uWinB : (r2 < 0.92 ? uWinC : uWinD));
          if (seed > 0.8) wc = r2 < 0.6 ? uWinC : uWinB;           // a few cool-glass towers
          vec3 litC = wc * (0.55 + 0.75 * hash(cell + 3.3));
          vec3 darkC = uFacade * 1.8 + vec3(0.012, 0.02, 0.05);
          vec3 nearC = mix(uFacade, mix(darkC, litC, on), win);
          vec3 avgLit = (uWinA * 0.55 + uWinB * 0.3 + uWinC * 0.15) * 0.9;
          vec3 farC = mix(uFacade, mix(darkC, avgLit, lit * 0.86), cover);
          vec2 fw = fwidth(g);
          float aa = clamp(max(fw.x, fw.y) * 2.2 - 0.35, 0.0, 1.0);
          col = mix(nearC, farC, aa);
          col *= mix(0.45, 1.0, smoothstep(0.0, 70.0, h));        // darker street canyons
        }
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

/** Appends a box (bottom at y0, top at y1) with per-vertex aInfo to the arrays. */
function pushBox(list, x, z, w, d, y0, y1, info, rotY = 0) {
  const g = new THREE.BoxGeometry(w, y1 - y0, d).toNonIndexed();
  g.deleteAttribute('uv');
  if (rotY) g.rotateY(rotY);
  g.translate(x, (y0 + y1) / 2, z);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set(info, i * 4);
  g.setAttribute('aInfo', new THREE.BufferAttribute(a, 4));
  list.push(g);
}

/** Outline (4 thin bars) around a w×d rectangle at height y — merged neon crowns. */
function pushOutline(list, x, z, w, d, y, t = 0.5, rotY = 0) {
  const parts = [[0, d / 2, w + t, t], [0, -d / 2, w + t, t], [w / 2, 0, t, d + t], [-w / 2, 0, t, d + t]];
  for (const [ox, oz, lw, ld] of parts) {
    const g = new THREE.BoxGeometry(lw, t, ld);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.translate(ox, 0, oz);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    list.push(g);
  }
}

export function buildCity(arena, parent, { seed = 7310, quality = 'high' } = {}) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const low = quality === 'low';
  const towers = [];
  const crowns = { teal: [], pink: [], gold: [] };
  const spires = [];
  const beacons = [];
  const BAY_A0 = -0.55, BAY_A1 = 0.5; // bay sector (towards +x), open water beyond ~150 m
  const inBay = (a, d) => d > 150 && d < 380 && a > BAY_A0 && a < BAY_A1;

  // Nocturno Tower itself (we stand on its roof): body drops to the street
  pushBox(towers, 0, 0, 44.6, 34.6, CITY_Y, -0.75, [0.33, 1, 0.55, CITY_Y]);
  pushBox(towers, 0, 0, 50, 40, CITY_Y, CITY_Y + 18, [0.12, 0, 0.7, CITY_Y]); // podium

  // generic towers
  const N = low ? 300 : 480;
  let placed = 0, tries = 0;
  while (placed < N && tries < N * 4) {
    tries++;
    const a = r() * Math.PI * 2 - Math.PI;
    const d = 48 + Math.pow(r(), 0.75) * 395;
    if (inBay(a, d)) continue;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const w = rand(r, 9, 16) + d * 0.02, dd = rand(r, 9, 16) + d * 0.02;
    let top = -d * rand(r, 0.02, 0.2) - 4;
    if (r() < 0.14) top += rand(r, 10, 30);
    top = Math.min(top, -5 - d * 0.01);
    const hgt = top - CITY_Y;
    const info = [r(), Math.floor(r() * 3), rand(r, 0.25, 0.6), CITY_Y];
    const rot = r() < 0.25 ? r() * 0.8 : 0;
    if (hgt > 90 && r() < 0.5) {
      const split = top - hgt * rand(r, 0.12, 0.25);
      pushBox(towers, x, z, w, dd, CITY_Y, split, info, rot);
      pushBox(towers, x, z, w * 0.68, dd * 0.68, split, top, info, rot);
      if (r() < 0.35) crowns[['teal', 'pink', 'gold'][Math.floor(r() * 3)]].push([x, z, w * 0.68, dd * 0.68, top - 0.3, rot]);
    } else {
      pushBox(towers, x, z, w, dd, CITY_Y, top, info, rot);
      if (r() < 0.3) crowns[['teal', 'pink', 'gold'][Math.floor(r() * 3)]].push([x, z, w, dd, top - 0.3, rot]);
    }
    if (hgt > 110 && r() < 0.45) beacons.push(x, top + 1.2, z);
    placed++;
  }

  // landmark towers (art-deco setbacks, neon crowns, spires) around the compass so every view gets one
  const LM = [
    { a: -1.95, d: 105, w: 20, top: -10, c: 'teal', sp: 26 },
    { a: -1.25, d: 165, w: 24, top: -18, c: 'gold', sp: 34 },
    { a: -2.55, d: 190, w: 18, top: -24, c: 'pink', sp: 20 },
    { a: 1.3, d: 120, w: 22, top: -12, c: 'pink', sp: 24 },
    { a: 1.95, d: 175, w: 26, top: -16, c: 'gold', sp: 40 },
    { a: 0.75, d: 200, w: 18, top: -26, c: 'teal', sp: 22 },
    { a: 3.0, d: 140, w: 20, top: -14, c: 'gold', sp: 28 },
    { a: -0.75, d: 230, w: 20, top: -30, c: 'pink', sp: 18 },
  ];
  for (const L of LM) {
    const x = Math.cos(L.a) * L.d, z = Math.sin(L.a) * L.d;
    const info = [0.85 + r() * 0.1, 1, 0.55, CITY_Y];
    const h = L.top - CITY_Y;
    const y1 = CITY_Y + h * 0.72, y2 = CITY_Y + h * 0.9;
    const rot = r() * 0.6;
    pushBox(towers, x, z, L.w, L.w, CITY_Y, y1, info, rot);
    pushBox(towers, x, z, L.w * 0.74, L.w * 0.74, y1, y2, info, rot);
    pushBox(towers, x, z, L.w * 0.5, L.w * 0.5, y2, L.top, info, rot);
    crowns[L.c].push([x, z, L.w, L.w, y1 - 0.4, rot], [x, z, L.w * 0.74, L.w * 0.74, y2 - 0.4, rot], [x, z, L.w * 0.5, L.w * 0.5, L.top - 0.4, rot]);
    const sp = new THREE.ConeGeometry(L.w * 0.09, L.sp, 6);
    sp.deleteAttribute('uv');
    sp.translate(x, L.top + L.sp / 2, z);
    spires.push(sp);
    beacons.push(x, L.top + L.sp + 0.6, z);
  }

  const out = { update: null, mats: {} };
  const tMat = towerMaterial();
  const tMesh = new THREE.Mesh(mergeGeometries(towers, false), tMat);
  towers.forEach((g) => g.dispose());
  tMesh.name = 'city_towers';
  tMesh.frustumCulled = false;
  parent.add(tMesh);

  const neonCol = { teal: '#3ff3ff', pink: '#ff5fb0', gold: '#ffc84a' };
  for (const k in crowns) {
    const list = [];
    for (const [x, z, w, d, y, rot] of crowns[k]) pushOutline(list, x, z, w, d, y, 0.7, rot);
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(neonCol[k]).multiplyScalar(2.4) }));
    list.forEach((g) => g.dispose());
    m.name = 'city_crowns_' + k;
    parent.add(m);
  }
  const spMesh = new THREE.Mesh(mergeGeometries(spires, false), new THREE.MeshStandardMaterial({ color: '#8c93a8', metalness: 0.9, roughness: 0.3, emissive: '#1a2040' }));
  spires.forEach((g) => g.dispose());
  parent.add(spMesh);

  // aviation lights on tall towers: one Points draw call, steady soft red (shared slow breathing)
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  const bMat = new THREE.PointsMaterial({ size: 3.2, map: glowTex(64, 0.25), color: new THREE.Color('#ff3030').multiplyScalar(2.2), transparent: true, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending });
  const bPts = new THREE.Points(bGeo, bMat);
  bPts.frustumCulled = false;
  parent.add(bPts);
  out.mats.beacons = bMat;

  // ground carpet: street grid of lights (only seen when leaning over the edge)
  const gridTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#05060f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,170,80,0.9)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    g.fillStyle = 'rgba(255,230,190,0.9)';
    for (let i = 0; i < 90; i++) g.fillRect(Math.floor(r() * 4) * 64 - 1 + (r() < 0.5 ? 0 : r() * 64), Math.floor(r() * 4) * 64 - 1, 3, 3);
  }, { repeat: [40, 40] });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(470, 48), new THREE.MeshBasicMaterial({ map: gridTex, color: '#8a7a9a' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = CITY_Y;
  parent.add(ground);

  // the bay: dark glossy water reflecting the sky + a shimmer of city light
  const bayShape = new THREE.Shape();
  bayShape.moveTo(Math.cos(BAY_A0) * 150, Math.sin(BAY_A0) * 150);
  for (let i = 0; i <= 16; i++) { const a = BAY_A0 + (BAY_A1 - BAY_A0) * (i / 16); bayShape.lineTo(Math.cos(a) * (150 + Math.sin(i * 1.3) * 8), Math.sin(a) * (150 + Math.sin(i * 1.3) * 8)); }
  for (let i = 16; i >= 0; i--) { const a = BAY_A0 + (BAY_A1 - BAY_A0) * (i / 16); bayShape.lineTo(Math.cos(a) * 470, Math.sin(a) * 470); }
  const bayGeo = new THREE.ShapeGeometry(bayShape, 1);
  bayGeo.rotateX(Math.PI / 2);
  const bay = new THREE.Mesh(bayGeo, new THREE.MeshStandardMaterial({ color: '#070b1c', roughness: 0.12, metalness: 0.6, envMapIntensity: 1.4, side: THREE.DoubleSide }));
  bay.position.y = CITY_Y + 0.3;
  parent.add(bay);

  // bay bridge: two lit pylons + cables across the water (the pylons poke up into the view)
  {
    const bridgeParts = [], lightParts = [];
    const bx = 280, span = 260;
    for (const zz of [-span / 2, span / 2]) {
      const pyl = new THREE.BoxGeometry(6, 150, 6); pyl.deleteAttribute('uv'); pyl.translate(bx, CITY_Y + 75, zz); bridgeParts.push(pyl);
      const l = new THREE.BoxGeometry(6.6, 1.2, 6.6); l.deleteAttribute('uv'); l.deleteAttribute('normal'); l.translate(bx, CITY_Y + 150, zz); lightParts.push(l);
    }
    const deck = new THREE.BoxGeometry(14, 3, span + 200); deck.deleteAttribute('uv'); deck.translate(bx, CITY_Y + 40, 0); bridgeParts.push(deck);
    // suspension cable light strings (catenary made of small boxes)
    for (const side of [-5, 5]) {
      for (let i = 0; i <= 40; i++) {
        const k = i / 40; const zz = -span / 2 + span * k;
        const y = CITY_Y + 150 - Math.sin(k * Math.PI) * 100;
        const b = new THREE.BoxGeometry(0.9, 0.9, 0.9); b.deleteAttribute('uv'); b.deleteAttribute('normal'); b.translate(bx + side, y, zz); lightParts.push(b);
      }
    }
    const bm = new THREE.Mesh(mergeGeometries(bridgeParts, false), new THREE.MeshStandardMaterial({ color: '#1a1f38', roughness: 0.6, metalness: 0.4 }));
    const lm = new THREE.Mesh(mergeGeometries(lightParts, false), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.2) }));
    bridgeParts.concat(lightParts).forEach((g) => g.dispose());
    parent.add(bm, lm);
  }

  // highway ribbon with moving head/tail light streams (one shader, uniform time only)
  const hwMat = new THREE.ShaderMaterial({
    fog: true, transparent: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 } }]),
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uT; varying vec2 vUv;
      #include <fog_pars_fragment>
      float hash(float x){ return fract(sin(x * 91.3) * 43758.5453); }
      void main(){
        float lane = vUv.y;
        float dir = lane < 0.5 ? 1.0 : -1.0;
        float laneIdx = floor(lane * 4.0);
        float x = vUv.x * 600.0 + dir * uT * (6.0 + laneIdx * 0.9);
        float cell = floor(x);
        float f = fract(x);
        float car = step(0.45, hash(cell + laneIdx * 17.0)) * smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.2, 0.3, f));
        float laneF = fract(lane * 4.0);
        car *= smoothstep(0.2, 0.35, laneF) * (1.0 - smoothstep(0.65, 0.8, laneF));
        vec3 head = vec3(1.4, 1.25, 1.0), tail = vec3(1.6, 0.12, 0.08);
        vec3 col = vec3(0.03, 0.03, 0.05) + (lane < 0.5 ? head : tail) * car;
        float edge = step(lane, 0.03) + step(0.97, lane);
        col += vec3(1.0, 0.6, 0.25) * edge * 0.8;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rr = 250 + Math.sin(i * 2.1) * 35;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, CITY_Y + 12, Math.sin(a) * rr));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const S = 360, W = 18;
    const pos = new Float32Array((S + 1) * 2 * 3), uv = new Float32Array((S + 1) * 2 * 2), idx = [];
    const p = new THREE.Vector3(), tg = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= S; i++) {
      const k = i / S;
      curve.getPointAt(k % 1, p); curve.getTangentAt(k % 1, tg);
      side.crossVectors(tg, up).normalize().multiplyScalar(W / 2);
      pos.set([p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z], i * 6);
      uv.set([k, 0, k, 1], i * 4);
      if (i < S) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    hg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    hg.setIndex(idx);
    const hw = new THREE.Mesh(hg, hwMat);
    hw.material.side = THREE.DoubleSide;
    hw.frustumCulled = false;
    parent.add(hw);
  }

  // drifting cloud wisps between the towers (instanced planes facing the centre; the group turns slowly)
  const cloudTex = canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) {
      const x = w * (0.15 + r() * 0.7), y = h * (0.35 + r() * 0.3), rad = h * (0.2 + r() * 0.3);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.28)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
  });
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, color: '#6f6aa8', transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide });
  const CN = low ? 14 : 26;
  const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), cloudMat, CN);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < CN; i++) {
    const a = (i / CN) * Math.PI * 2 + r() * 0.2;
    const d = rand(r, 120, 360);
    dummy.position.set(Math.cos(a) * d, rand(r, -85, -25), Math.sin(a) * d);
    dummy.lookAt(0, dummy.position.y, 0);
    const sc = rand(r, 90, 170);
    dummy.scale.set(sc, sc * rand(r, 0.22, 0.34), 1);
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.frustumCulled = false;
  clouds.renderOrder = 2;
  const cloudPivot = new THREE.Group();
  cloudPivot.add(clouds);
  parent.add(cloudPivot);

  out.update = (dt, t, reduced) => {
    hwMat.uniforms.uT.value = reduced ? t * 0.3 : t;
    cloudPivot.rotation.y += dt * (reduced ? 0.0012 : 0.004);
  };
  return out;
}
