// kit.js — shared procedural helpers for arenas (docs/arenas/ARENAS_SPEC.md §3 "kit.js").
// Every helper creates fresh geometries/materials/textures and returns objects you add under `this.group`, so the
// Arena base class disposes them with the arena. Nothing here flashes: any animated light is a slow soft pulse
// (period ≥ 1.5 s, ≤ 35 % amplitude) and holds still with prefers-reduced-motion.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, speckle, rng } from '../util.js';
import { STREET_Y } from '../Board.js';

export { canvasTexture, speckle, rng, STREET_Y, mergeGeometries };

// ======================================================================= motion helpers
/** Soft 0..1 sine pulse (period clamped ≥ 1.5 s); 0.5 when reduced motion. */
export function softPulse(t, period = 3, phase = 0, reduced = false) {
  if (reduced) return 0.5;
  const p = Math.max(1.5, period);
  return 0.5 + 0.5 * Math.sin((t / p) * Math.PI * 2 + phase);
}

/** base × (1 ± amp·pulse), amp clamped to 0.35 — use for emissive/neon breathing. */
export function breathe(base, t, { period = 3, phase = 0, amp = 0.25, reduced = false } = {}) {
  const a = Math.min(0.35, Math.max(0, amp));
  return base * (1 - a + 2 * a * softPulse(t, period, phase, reduced));
}

// ======================================================================= props
/**
 * Wrap a (GLB) model so its feet sit on y=0 and it is centred on x/z; scaled to `height` unless the native size
 * is already within ×0.5..×2 of it (GLBs are authored in metres). userData.size / userData.alongZ describe it.
 */
export function normalizeProp(root, { height, keepScale = true } = {}) {
  const holder = new THREE.Group();
  const inner = root.clone(true);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  let s = height && size.y > 1e-4 ? height / size.y : 1;
  if (keepScale && s > 0.5 && s < 2) s = 1;
  inner.scale.multiplyScalar(s);
  inner.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  const c = b2.getCenter(new THREE.Vector3());
  inner.position.x -= c.x; inner.position.z -= c.z; inner.position.y -= b2.min.y;
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  holder.add(inner);
  holder.userData.size = b2.getSize(new THREE.Vector3());
  holder.userData.alongZ = holder.userData.size.z > holder.userData.size.x;
  return holder;
}
/** Longest horizontal extent of a normalizeProp() holder. */
export function propLength(holder) {
  const s = holder.userData.size;
  return Math.max(0.2, Math.max(s.x, s.z));
}

// ======================================================================= textures
export function glowTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

/** Glowing outlined neon lettering on a transparent canvas (1024 × 256). */
export function neonTextTexture(text, color = '#ff5fa2', { font = 'Anton, Impact, "Arial Black", sans-serif', fill = false } = {}) {
  const W = 1024, H = 256;
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    let fs = 170;
    g.font = `bold ${fs}px ${font}`;
    while (g.measureText(text).width > W * 0.92 && fs > 20) { fs -= 6; g.font = `bold ${fs}px ${font}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 30;
    if (fill) { g.fillStyle = color; g.fillText(text, W / 2, H / 2); }
    g.lineWidth = 10; g.strokeStyle = color; g.strokeText(text, W / 2, H / 2);
    g.shadowBlur = 8; g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.strokeText(text, W / 2, H / 2);
  });
}

/** The pink→orange "VI" logo. */
export function viTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 380px Anton, Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const grd = g.createLinearGradient(0, 80, w, h - 60);
    grd.addColorStop(0, '#ff5fa2'); grd.addColorStop(0.55, '#ff7a6a'); grd.addColorStop(1, '#ffb347');
    g.shadowColor = '#ff5fa2'; g.shadowBlur = 40;
    g.fillStyle = grd; g.fillText('VI', w / 2, h / 2 + 20);
    g.shadowBlur = 0; g.lineWidth = 6; g.strokeStyle = 'rgba(255,240,250,0.9)'; g.strokeText('VI', w / 2, h / 2 + 20);
  });
}

/** Sponsor banner (512 × 100): text on a coloured strip with top/bottom rules. */
export function bannerTexture(text, fg = '#ffffff', bg = '#1b1036') {
  return canvasTexture(512, 100, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    g.font = 'bold 62px Anton, Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 3);
  });
}

/** Building window texture pair { map, emissive } (4×4 windows, `litRatio` lit in `colors`). */
export function windowTexture(r, colors, litRatio) {
  const W = 128, H = 128, cols = 4, rows = 4;
  const lit = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) lit.push(r() < litRatio ? colors[Math.floor(r() * colors.length)] : null);
  const alpha = lit.map(() => 0.55 + r() * 0.45);
  const draw = (emissive) => (g) => {
    g.fillStyle = emissive ? '#000' : '#ffffff'; g.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = lit[y * cols + x];
      if (emissive) {
        if (!c) continue;
        g.fillStyle = c; g.globalAlpha = alpha[y * cols + x];
        g.fillRect(x * cw + 6, y * ch + 8, cw - 12, ch - 16);
        g.globalAlpha = 1;
      } else {
        g.fillStyle = c ? '#ddd' : '#555';
        g.fillRect(x * cw + 6, y * ch + 8, cw - 12, ch - 16);
      }
    }
  };
  const map = canvasTexture(W, H, draw(false));
  const emissive = canvasTexture(W, H, draw(true));
  map.wrapS = map.wrapT = emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  map.magFilter = emissive.magFilter = THREE.NearestFilter;
  return { map, emissive };
}

// ======================================================================= sky
/**
 * Sunset sky dome with a warm (sun) side and a cool night side, streaky clouds and faint static stars.
 * Returns { mesh, uniforms, update(t) }. Colours: horizon, low, mid, high, zenith, night, ground.
 */
export function sunsetSky({ sunDir = [-0.35, 0.16, -1], horizon = '#ffb24a', low = '#ff6f7d', mid = '#b03a86', high = '#3a1c5c',
  zenith = '#140c2c', night = '#241447', ground = '#2a1530', clouds = 0.8, stars = 1, reducedMotion = false } = {}) {
  const uniforms = {
    sunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    cHorizon: { value: new THREE.Color(horizon) }, cLow: { value: new THREE.Color(low) },
    cMid: { value: new THREE.Color(mid) }, cHigh: { value: new THREE.Color(high) },
    cZenith: { value: new THREE.Color(zenith) }, cNight: { value: new THREE.Color(night) },
    cGround: { value: new THREE.Color(ground) }, time: { value: 0 }, clouds: { value: clouds }, stars: { value: stars },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, cHorizon, cLow, cMid, cHigh, cZenith, cNight, cGround;
      uniform float time, clouds, stars;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float sunAmt = max(dot(d, sunDir), 0.0);
        float side = smoothstep(-0.6, 0.9, dot(normalize(vec2(d.x,d.z)), normalize(vec2(sunDir.x,sunDir.z))));
        vec3 warm = mix(cHorizon, cLow, smoothstep(0.0, 0.07, h));
        warm = mix(warm, cMid, smoothstep(0.06, 0.2, h));
        warm = mix(warm, cHigh, smoothstep(0.18, 0.42, h));
        warm = mix(warm, cZenith, smoothstep(0.4, 0.95, h));
        vec3 cool = mix(mix(cMid*0.55, cNight, smoothstep(0.0, 0.18, h)), cZenith, smoothstep(0.3, 0.9, h));
        vec3 col = mix(cool, warm, side);
        col += vec3(1.0,0.55,0.25) * pow(sunAmt, 6.0) * 0.55;
        col += vec3(1.0,0.72,0.4) * pow(sunAmt, 60.0) * 1.6;
        col += vec3(1.0,0.9,0.7) * smoothstep(0.9993, 0.9997, sunAmt) * 12.0;
        if (h > -0.02 && clouds > 0.0) {
          vec2 uv = d.xz / (h + 0.12);
          float n = fbm(uv * vec2(0.9, 3.2) + vec2(time*0.004, 0.0));
          float band = smoothstep(0.55, 0.8, n) * smoothstep(0.35, 0.03, h) * smoothstep(-0.02, 0.03, h);
          vec3 cloudLit = mix(vec3(0.55,0.2,0.4), vec3(1.2,0.55,0.35), pow(sunAmt, 3.0) * side);
          col = mix(col, cloudLit, band * clouds);
        }
        if (h > 0.15 && stars > 0.0) {
          vec2 sp = floor(d.xz / (h + 0.3) * 260.0);
          // static stars with a very slow, shallow shimmer (period ≥ 6 s, ±20 %) — no twinkle/flash
          float st = step(0.9975, hash(sp)) * (1.0 - side) * smoothstep(0.15, 0.5, h);
          col += vec3(st) * stars * (0.7 + 0.15 * sin(time * 0.9 + hash(sp) * 30.0));
        }
        col = mix(col, cGround, smoothstep(0.0, -0.08, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  mesh.name = 'sky'; mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, uniforms, update: (t) => { uniforms.time.value = reducedMotion ? 0 : t; } };
}

// ======================================================================= palms
function trunkMaterial() {
  const tex = canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#6b5440'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) {
      g.fillStyle = 'rgba(40,28,20,0.7)'; g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(160,130,100,0.35)'; g.fillRect(0, y + 4, w, 2);
    }
  }, { repeat: [2, 6] });
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
}
function frondMaterial() {
  const tex = canvasTexture(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#3c6a2a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    for (let y = 8; y < h - 4; y += 7) {
      const k = y / h;
      const len = (w / 2 - 4) * Math.sin(Math.PI * (1 - k) * 0.95 + 0.1);
      g.strokeStyle = `rgb(${40 + k * 40},${95 + k * 50},${35 + k * 20})`; g.lineWidth = 4;
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 - len, y - 16); g.stroke();
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + len, y - 16); g.stroke();
    }
  });
  return new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, color: 0xb8c9a0 });
}
function frondGeometry() {
  const L = 2.6, W = 0.9;
  const g = new THREE.PlaneGeometry(W, L, 4, 10);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const k = (y + L / 2) / L;
    pos.setXYZ(i, x * (1 - 0.3 * k), -Math.pow(k, 2) * 1.5 + k * 0.5 - Math.abs(x) * 0.35, -k * L);
  }
  g.computeVertexNormals();
  return g;
}
function buildPalm(r, mats) {
  const palm = new THREE.Group();
  const H = 5.2 + r() * 1.8;
  const lean = new THREE.Vector3((r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6);
  const pts = [];
  for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push(new THREE.Vector3(lean.x * k * k, k * H, lean.z * k * k)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const TS = 24, RS = 8;
  const geo = new THREE.TubeGeometry(curve, TS, 0.16, RS, false);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    const k = i / TS;
    curve.getPointAt(k, p);
    const taper = 1.25 - 0.55 * k + (k < 0.05 ? 0.4 * (1 - k / 0.05) : 0);
    for (let j = 0; j <= RS; j++) {
      const idx = i * (RS + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(p).multiplyScalar(taper).add(p);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const trunk = new THREE.Mesh(geo, mats.trunk);
  trunk.castShadow = true;
  palm.add(trunk);
  const crown = new THREE.Group();
  crown.position.copy(curve.getPointAt(1));
  palm.add(crown);
  const nuts = new THREE.Mesh(mats.nutGeo, mats.nut);
  nuts.scale.set(1.2, 0.8, 1.2); nuts.position.y = -0.15;
  crown.add(nuts);
  const n = 9 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / n) * Math.PI * 2 + r() * 0.3;
    const f = new THREE.Mesh(mats.frondGeo, mats.frond);
    f.rotation.x = -0.25 - r() * 0.5 + (i % 3 === 0 ? -0.35 : 0);
    f.scale.setScalar(0.9 + r() * 0.35);
    f.castShadow = true;
    f.userData.frond = true;
    pivot.add(f);
    crown.add(pivot);
  }
  return palm;
}

/**
 * Palms at spots [[x, z, (y)], …]. Uses the palm GLB (ctx.models.palm) when given, else procedural palms with
 * swaying fronds. Returns { group, update(t) } — call update in Arena.update for the gentle frond sway.
 */
export function addPalms(spots, { glb = null, seed = 42, height = 6, scale = [0.85, 1.35], reducedMotion = false, y = STREET_Y } = {}) {
  const group = new THREE.Group(); group.name = 'palms';
  const r = rng(seed);
  const fronds = [];
  let make;
  if (glb) {
    const tmpl = normalizeProp(glb, { height });
    make = () => tmpl.clone();
  } else {
    const mats = { trunk: trunkMaterial(), frond: frondMaterial(), frondGeo: frondGeometry(),
      nut: new THREE.MeshStandardMaterial({ color: 0x4a3a1c, roughness: 0.8 }), nutGeo: new THREE.SphereGeometry(0.22, 8, 6) };
    const variants = [0, 1, 2].map((i) => buildPalm(rng(seed * 7 + 100 + i), mats));
    make = (i) => {
      const p = variants[i % variants.length].clone();
      p.traverse((o) => { if (o.userData.frond) fronds.push({ o, bx: o.rotation.x, bz: o.rotation.z, ph: r() * 6.28 }); });
      return p;
    };
  }
  spots.forEach(([x, z, py], i) => {
    const p = make(i);
    p.scale.setScalar(scale[0] + r() * (scale[1] - scale[0]));
    p.position.set(x, py ?? y, z);
    p.rotation.y = r() * Math.PI * 2;
    group.add(p);
  });
  const k = reducedMotion ? 0.35 : 1;
  return {
    group, fronds,
    update(t) {
      for (const f of fronds) {
        f.o.rotation.x = f.bx + Math.sin(t * 1.3 * k + f.ph) * 0.035 * k;
        f.o.rotation.z = f.bz + Math.sin(t * 0.9 * k + f.ph * 1.7) * 0.025 * k;
      }
    },
  };
}

// ======================================================================= street lights
/**
 * Street lamps at spots [[x, z], …] with the arm pointing toward `toward` (default: the board, along ±X).
 * Emissive heads + additive glow sprites; only the first `maxLights` get real PointLights (no shadows).
 * Returns { group, lights }.
 */
export function addStreetLights(spots, { glb = null, height = 4.6, color = 0xffa04a, intensity = 14, distance = 11, maxLights = 4, y = STREET_Y } = {}) {
  const group = new THREE.Group(); group.name = 'streetlights';
  const H = height;
  let lampTmpl = null, lampOff = null;
  if (glb) {
    lampTmpl = normalizeProp(glb, { height: H });
    const bb = new THREE.Box3();
    lampTmpl.updateMatrixWorld(true);
    lampTmpl.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => /LAMP|EMISSIVE|BULB|LIGHT/i.test(m.name || ''))) bb.expandByObject(o);
    });
    if (!bb.isEmpty()) { const c = bb.getCenter(new THREE.Vector3()); lampOff = { x: c.x, y: c.y, z: c.z }; }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2a33, metalness: 0.7, roughness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb866).multiplyScalar(5) });
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color(color).multiplyScalar(1.4), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
  });
  const geos = lampTmpl ? null : {
    pole: new THREE.CylinderGeometry(0.06, 0.1, H, 10), arm: new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6),
    head: new THREE.BoxGeometry(0.55, 0.1, 0.24), bulb: new THREE.BoxGeometry(0.44, 0.03, 0.17), base: new THREE.CylinderGeometry(0.16, 0.2, 0.4, 10),
  };
  const lights = [];
  spots.forEach(([x, z], i) => {
    const inward = Math.sign(-x) || 1;
    let lamp;
    let lightPos = new THREE.Vector3(x + inward * 1.2, y + H - 0.3, z);
    if (lampTmpl) {
      lamp = lampTmpl.clone();
      if (lampOff && Math.hypot(lampOff.x, lampOff.z) > 0.1) {
        lamp.rotation.y = Math.atan2(inward, 0) - Math.atan2(lampOff.x, lampOff.z);
        lightPos = new THREE.Vector3(x + inward * Math.hypot(lampOff.x, lampOff.z), y + lampOff.y - 0.15, z);
      } else lamp.rotation.y = inward > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      lamp = new THREE.Group();
      const pole = new THREE.Mesh(geos.pole, poleMat); pole.position.y = H / 2; pole.castShadow = true;
      const arm = new THREE.Mesh(geos.arm, poleMat); arm.rotation.z = Math.PI / 2; arm.position.set(inward * 0.62, H - 0.05, 0);
      const head = new THREE.Mesh(geos.head, poleMat); head.position.set(inward * 1.2, H - 0.08, 0);
      const bulb = new THREE.Mesh(geos.bulb, lampMat); bulb.position.set(inward * 1.2, H - 0.14, 0);
      const base = new THREE.Mesh(geos.base, poleMat); base.position.y = 0.2;
      lamp.add(pole, arm, head, bulb, base);
    }
    lamp.position.set(x, y, z);
    group.add(lamp);
    if (i < maxLights) {
      const pl = new THREE.PointLight(color, intensity, distance, 1.6);
      pl.position.copy(lightPos);
      group.add(pl);
      lights.push(pl);
    }
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(lightPos); glow.position.y += 0.1;
    glow.scale.setScalar(1.6);
    group.add(glow);
  });
  return { group, lights };
}

// ======================================================================= skyline
/**
 * Procedural city skyline: merged boxes with lit-window textures, neon roof trims and antennas with slow soft
 * aviation beacons. opts: { seed, clusters: [{ count, angle, spread, dist:[min,max], height:[min,max], size:[min,max] }],
 * keepClear(x, z) → true to skip a spot, beacons: true }. Returns { group, update(t) }.
 */
export function buildSkyline({ seed = 2024, clusters = null, keepClear = null, beacons = true, facades = ['#221a2e', '#2c2038', '#1c1826', '#33253a'],
  windowColors = [['#ffcf7a', '#ffe2a8', '#ffb35c'], ['#7ff5ff', '#29e3d6', '#c9ffff'], ['#ff8ac0', '#ff5fa2', '#ffd0e6'], ['#ffe9c7', '#fff2da']],
  lit = [0.38, 0.3, 0.3, 0.22], neon = { teal: 0x29e3d6, pink: 0xff5fa2, gold: 0xffc34d }, emissiveIntensity = 1.6, reducedMotion = false, y = STREET_Y } = {}) {
  const group = new THREE.Group(); group.name = 'skyline';
  const r = rng(seed);
  const mats = windowColors.map((cols, i) => {
    const t = windowTexture(r, cols, lit[i] ?? 0.3);
    return new THREE.MeshStandardMaterial({
      color: facades[i % facades.length], map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity,
      roughness: 0.55, metalness: 0.3, envMapIntensity: 0.6,
    });
  });
  const geos = mats.map(() => []);
  const neonKeys = Object.keys(neon);
  const neonTops = Object.fromEntries(neonKeys.map((k) => [k, []]));
  const antennas = [];
  const place = (x, z, w, d, h) => {
    if (keepClear && keepClear(x, z)) return;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5) { uv.setXY(i, 0, 0); continue; }
      uv.setXY(i, uv.getX(i) * (nx > 0.5 ? d : w) / 3, uv.getY(i) * h / 3);
    }
    g.translate(x, y + h / 2, z);
    geos[Math.floor(r() * mats.length)].push(g);
    if (neonKeys.length && r() < 0.55) {
      const key = neonKeys[Math.floor(r() * neonKeys.length)];
      const t = 0.18;
      for (const [ox, oz, lw, ld] of [[0, d / 2, w, t], [0, -d / 2, w, t], [w / 2, 0, t, d], [-w / 2, 0, t, d]]) {
        const e = new THREE.BoxGeometry(lw + 0.05, t, ld + 0.05);
        e.translate(x + ox, y + h - 0.2, z + oz);
        neonTops[key].push(e);
      }
    }
    if (h > 28 && r() < 0.7) antennas.push([x, y + h, z, 3 + r() * 5]);
  };
  const cl = clusters || [
    { count: 55, angle: -Math.PI / 2, spread: Math.PI * 1.25, dist: [48, 118], height: [8, 63] },
    { count: 45, angle: 0, spread: Math.PI * 2, dist: [50, 120], height: [6, 36], clearFront: true },
  ];
  for (const c of cl) {
    for (let i = 0; i < c.count; i++) {
      const a = c.angle + (r() - 0.5) * c.spread;
      const dist = c.dist[0] + r() * (c.dist[1] - c.dist[0]);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (c.clearFront && z > -10 && Math.abs(x) < 26) continue;
      const hgt = c.height[0] + Math.pow(r(), 1.6) * (c.height[1] - c.height[0]);
      const sz = c.size || [4, 12];
      place(x, z, sz[0] + r() * (sz[1] - sz[0]), sz[0] + r() * (sz[1] - sz[0]), hgt);
    }
  }
  mats.forEach((m, i) => {
    if (!geos[i].length) { m.map.dispose(); m.emissiveMap.dispose(); m.dispose(); return; }
    const mesh = new THREE.Mesh(mergeGeometries(geos[i]), m);
    geos[i].forEach((g) => g.dispose());
    mesh.name = 'skyline_' + i;
    group.add(mesh);
  });
  for (const k of neonKeys) {
    if (!neonTops[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(neonTops[k]), new THREE.MeshBasicMaterial({ color: new THREE.Color(neon[k]).multiplyScalar(3.5) }));
    neonTops[k].forEach((g) => g.dispose());
    group.add(m);
  }
  // antennas + aviation beacons: one merged mesh each, beacon brightness breathes slowly (no on/off blinking)
  let beaconMat = null;
  if (antennas.length) {
    const antGeos = [], beaconGeos = [];
    for (const [x, ay, z, h] of antennas) {
      antGeos.push(new THREE.CylinderGeometry(0.08, 0.15, h, 6).translate(x, ay + h / 2, z));
      if (beacons) beaconGeos.push(new THREE.SphereGeometry(0.35, 8, 6).translate(x, ay + h + 0.2, z));
    }
    group.add(new THREE.Mesh(mergeGeometries(antGeos), new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.6, roughness: 0.5 })));
    antGeos.forEach((g) => g.dispose());
    if (beaconGeos.length) {
      beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(4) });
      group.add(new THREE.Mesh(mergeGeometries(beaconGeos), beaconMat));
      beaconGeos.forEach((g) => g.dispose());
    }
  }
  return {
    group,
    update(t) {
      if (beaconMat) beaconMat.color.setRGB(1, 0.125, 0.125).multiplyScalar(breathe(4, t, { period: 3.2, amp: 0.3, reduced: reducedMotion }));
    },
  };
}

// ======================================================================= neon signs
/**
 * Flat neon sign (plane with a neon texture). opts: { width, height, mult (brightness), pulse: {period, amp} | null }.
 * Returns the mesh; if `pulse` is set, mesh.userData.update(t, reduced) breathes it slowly.
 */
export function neonSign(texture, { width = 6, height = 1.5, mult = 2.4, pulse = null, doubleSide = true } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(mult),
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  if (pulse) {
    const ph = Math.random() * 6.28;
    m.userData.update = (t, reduced = false) => mat.color.setScalar(breathe(mult, t, { period: pulse.period ?? 3, amp: pulse.amp ?? 0.2, phase: ph, reduced }));
  }
  return m;
}

// ======================================================================= festoon / string lights
/**
 * A sagging string of warm bulbs between two points (festoon lights across a street / terrace).
 * from/to: [x, y, z]; opts: { sag, bulbs, colors, size, intensity }. Bulbs are one InstancedMesh (+ a thin wire).
 */
export function festoon(from, to, { sag = 0.8, bulbs = 16, colors = ['#ffd27a', '#ff9f5a', '#ff6fa8', '#8ff7ff'], size = 0.07, intensity = 3 } = {}) {
  const group = new THREE.Group(); group.name = 'festoon';
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const p = a.clone().lerp(b, k);
    p.y -= Math.sin(Math.PI * k) * sag;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.012, 4, false), new THREE.MeshBasicMaterial({ color: 0x151218 }));
  group.add(wire);
  const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < bulbs; i++) {
    const p = curve.getPointAt((i + 0.5) / bulbs);
    p.y -= size * 1.4;
    bulb.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
    bulb.setColorAt(i, c.set(colors[i % colors.length]).multiplyScalar(intensity));
  }
  bulb.instanceMatrix.needsUpdate = true;
  if (bulb.instanceColor) bulb.instanceColor.needsUpdate = true;
  group.add(bulb);
  return group;
}

// ======================================================================= water
/**
 * Water plane with slowly drifting ripples (scrolling procedural normal map; no flashing highlights).
 * opts: { size:[w,d], color, roughness, y }. Returns { mesh, update(t) }.
 */
export function waterPlane({ size = [200, 200], color = '#0f6f86', roughness = 0.18, metalness = 0.1, y = STREET_Y - 0.3, repeat = 24, reducedMotion = false } = {}) {
  const r = rng(909);
  const S = 128;
  const nrm = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    const hts = new Float32Array(S * S);
    const waves = Array.from({ length: 6 }, () => ({ kx: Math.round(1 + r() * 4), ky: Math.round(1 + r() * 4), ph: r() * 6.28, a: 0.5 + r() }));
    for (let yy = 0; yy < S; yy++) for (let x = 0; x < S; x++) {
      let h = 0;
      for (const w of waves) h += w.a * Math.sin(((x * w.kx + yy * w.ky) / S) * Math.PI * 2 + w.ph);
      hts[yy * S + x] = h;
    }
    for (let yy = 0; yy < S; yy++) for (let x = 0; x < S; x++) {
      const dx = hts[yy * S + ((x + 1) % S)] - hts[yy * S + ((x - 1 + S) % S)];
      const dy = hts[((yy + 1) % S) * S + x] - hts[((yy - 1 + S) % S) * S + x];
      const i = (yy * S + x) * 4;
      img.data[i] = 128 - dx * 20; img.data[i + 1] = 128 - dy * 20; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: [repeat, repeat] });
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  mesh.name = 'water';
  return {
    mesh,
    update(t) {
      if (reducedMotion) return;
      nrm.offset.set((t * 0.004) % 1, (t * 0.0025) % 1);
    },
  };
}
