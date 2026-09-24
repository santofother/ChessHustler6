// Board: 8x8 street tiles (concrete crosswalk / wet asphalt), raised plinth with red/white kerb,
// coordinate paint, neon under-lip, and the highlight overlay system.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ALL_SQUARES, sqToXZ, isLightSquare, canvasTexture, speckle, rng } from './util.js';

export const BOARD_TOP = 0;          // y of the tile tops
export const STREET_Y = -0.42;        // y of the surrounding street

const HL_Y = 0.012;

/** Default surround = the original street-race look (used when an arena's boardStyle is null). */
export const SURROUND_DEFAULT = {
  frame: '#2d2733', frameText: '#f7efe4', frameLine: '#ffc34d',
  plinth: '#4a4250', plinthMap: 'concrete',
  kerb: 'race', kerbColors: null,
  neon: ['#29e3d6', '#ff5fa2'], neonIntensity: 3.0,
};
const KERB_COLORS = {
  race: ['#d8232f', '#f1ede6'], gold: ['#d4af37', '#8a6a1c'], hazard: ['#f2c200', '#161616'],
  planks: ['#9a6b43', '#6e4a2c'], rope: ['#8b1030', '#d4af37'],
};
function autoText(bg) {
  const c = new THREE.Color(bg);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
  return lum > 0.22 ? '#1a1418' : '#f7efe4';
}

export class Board {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'board';
    this.tiles = [];                  // meshes with userData.square (raycast targets)
    this.tileBySquare = new Map();
    this.overlayGroup = new THREE.Group();
    this.overlayGroup.name = 'highlights';
    this.group.add(this.overlayGroup);
    this._pools = {};
    this._active = [];
    this._hoverSq = null;
    this._time = 0;
  }

  build() {
    this._buildTiles();
    this._buildGrout();
    this._built = true;
    this._buildSurround(this._style || null);
    this._buildHighlightAssets();
    return this.group;
  }

  // ---------------------------------------------------------------- tiles
  _buildTiles() {
    const r = rng(1234);
    const lightTex = [], darkTex = [];
    for (let v = 0; v < 4; v++) {
      lightTex.push(makeConcreteTextures(1000 + v));
      darkTex.push(makeAsphaltTextures(2000 + v));
    }
    const lightMats = lightTex.map(({ map, rough, bump }) => new THREE.MeshStandardMaterial({
      map, roughnessMap: rough, roughness: 1, metalness: 0, bumpMap: bump, bumpScale: 0.6,
      envMapIntensity: 0.5,
    }));
    const darkMats = darkTex.map(({ map, rough, bump }) => new THREE.MeshStandardMaterial({
      map, roughnessMap: rough, roughness: 1, metalness: 0.05, bumpMap: bump, bumpScale: 0.8,
      envMapIntensity: 1.5,
    }));
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.9 });
    const geo = twoGroupBox(0.985, 0.12, 0.985); // [sides+bottom, top] → 2 draw calls per tile instead of 6
    geo.translate(0, -0.06, 0);
    for (const sq of ALL_SQUARES) {
      const light = isLightSquare(sq);
      const top = light ? lightMats[Math.floor(r() * 4)] : darkMats[Math.floor(r() * 4)];
      const mats = [sideMat, top];
      const m = new THREE.Mesh(geo, mats);
      const { x, z } = sqToXZ(sq);
      m.position.set(x, BOARD_TOP, z);
      // random 180° flip keeps variety without breaking the crosswalk stripe direction
      if (r() < 0.5) m.rotation.y = Math.PI;
      m.receiveShadow = true;
      m.userData.square = sq;
      m.name = 'tile_' + sq;
      this.tiles.push(m);
      this.tileBySquare.set(sq, m);
      this.group.add(m);
    }
  }

  _buildGrout() {
    // grout slab directly under the tiles (not part of the per-arena surround)
    const grout = new THREE.Mesh(new THREE.BoxGeometry(8.02, 0.1, 8.02), new THREE.MeshStandardMaterial({ color: 0x141218, roughness: 0.9 }));
    grout.position.y = -0.1;
    grout.receiveShadow = true;
    this.group.add(grout);
  }

  // ---------------------------------------------------------------- plinth, frame, kerb (per-arena surround)
  /**
   * Restyle everything around the tiles (docs/arenas/ARENAS_SPEC.md "Board surround"). null = default street-race
   * look. Safe to call before build() and repeatedly (old surround is disposed). Tiles/highlights never change.
   */
  setSurround(style = null) {
    this._style = style || null;
    if (!this._built) return;
    this._disposeSurround();
    this._buildSurround(this._style);
  }

  _disposeSurround() {
    const g = this._surround;
    if (!g) return;
    g.removeFromParent();
    const seen = new Set();
    g.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'roughnessMap', 'bumpMap', 'metalnessMap']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
        m.dispose();
      }
    });
    this._surround = null;
  }

  _buildSurround(style) {
    const s = { ...SURROUND_DEFAULT, ...(style || {}) };
    if (!style || !style.frameText) s.frameText = style && style.frame ? autoText(s.frame) : SURROUND_DEFAULT.frameText;
    const g = new THREE.Group();
    g.name = 'surround';
    this._surround = g;
    this.group.add(g);

    // painted frame with coordinates
    const frameSize = 9.0;
    const glow = (Array.isArray(s.neon) && s.neon[1]) || (Array.isArray(s.neon) && s.neon[0]) || '#ff5fa2';
    const frameTop = new THREE.MeshStandardMaterial({ map: makeFrameTexture(s.frame, s.frameText, glow, s.frameLine), roughness: 0.75, metalness: 0.05 });
    const frameSide = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.frame).multiplyScalar(0.95), roughness: 0.8 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(frameSize, 0.1, frameSize), [frameSide, frameSide, frameTop, frameSide, frameSide, frameSide]);
    frame.position.y = -0.052;
    frame.receiveShadow = true;
    g.add(frame);

    // plinth body down to street level
    const plinthH = BOARD_TOP - 0.1 - STREET_Y;
    const pmap = s.plinthMap === 'none' ? null : makePlinthTexture(s.plinthMap, s.plinth);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: pmap ? 0xffffff : s.plinth, map: pmap,
      roughness: s.plinthMap === 'steel' ? 0.45 : s.plinthMap === 'marble' ? 0.35 : 0.85,
      metalness: s.plinthMap === 'steel' ? 0.6 : 0,
    });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.7, plinthH, 9.7), plinthMat);
    plinth.position.y = STREET_Y + plinthH / 2;
    plinth.receiveShadow = true; plinth.castShadow = true;
    g.add(plinth);

    // neon under-lip strips (static colours — never blink)
    if (Array.isArray(s.neon) && s.neon.length) {
      const k = s.neonIntensity ?? 3;
      const mats = s.neon.slice(0, 2).map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
      const stripGeo = new THREE.BoxGeometry(9.72, 0.035, 0.035);
      for (let i = 0; i < 4; i++) {
        const strip = new THREE.Mesh(stripGeo, mats[(i + 1) % mats.length] || mats[0]);
        const a = (i * Math.PI) / 2;
        strip.position.set(Math.sin(a) * 4.86, STREET_Y + 0.06, Math.cos(a) * 4.86);
        strip.rotation.y = a;
        g.add(strip);
      }
    }

    // kerb ring just outside the frame
    const depth = 0.36, outer = frameSize / 2 + depth;
    const colors = s.kerbColors || KERB_COLORS[s.kerb] || KERB_COLORS.race;
    if (s.kerb !== 'none') {
      if (s.kerb === 'race') this._raceKerb(g, frameSize, depth, colors);
      else if (s.kerb === 'rope') this._ropeKerb(g, frameSize, colors);
      else this._stripKerb(g, frameSize, depth, s.kerb, colors);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(outer * 2, 0.12, outer * 2),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(s.plinth).multiplyScalar(0.6), roughness: 0.9 }));
      skirt.position.y = -0.16;
      g.add(skirt);
    }
  }

  _raceKerb(g, frameSize, depth, colors) {
    const mats = colors.slice(0, 2).map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 }));
    const seg = 0.5, outer = frameSize / 2 + depth;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(depth, 0); shape.lineTo(depth, 0.04); shape.lineTo(0, 0.1); shape.lineTo(0, 0);
    const kerbGeo = new THREE.ExtrudeGeometry(shape, { depth: seg - 0.01, bevelEnabled: false });
    kerbGeo.translate(0, 0, -(seg - 0.01) / 2);
    kerbGeo.computeVertexNormals();
    const perSide = Math.round((outer * 2) / seg);
    let idx = 0;
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      for (let i = 0; i < perSide; i++) {
        const t = -outer + seg / 2 + i * seg;
        const k = new THREE.Mesh(kerbGeo, mats[idx++ % mats.length]);
        const lx = frameSize / 2, lz = t;
        k.position.set(Math.cos(a) * lx + Math.sin(a) * lz, -0.1, -Math.sin(a) * lx + Math.cos(a) * lz);
        k.rotation.y = a;
        k.receiveShadow = true;
        g.add(k);
      }
    }
  }

  /** Continuous sloped ring (gold trim / hazard stripes / planks). */
  _stripKerb(g, frameSize, depth, kind, colors) {
    const outer = frameSize / 2 + depth;
    const len = outer * 2;
    let mat;
    if (kind === 'gold') {
      mat = new THREE.MeshStandardMaterial({ color: colors[0], metalness: 0.9, roughness: 0.28 });
    } else {
      const tex = kind === 'hazard' ? hazardTexture(colors) : planksTexture(colors);
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(len / (kind === 'hazard' ? 1.0 : 2.4), 1);
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'hazard' ? 0.6 : 0.8 });
    }
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(depth, 0); shape.lineTo(depth, 0.04); shape.lineTo(0, 0.1); shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2);
    // planar UVs: u along the side, v across
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getZ(i) + len / 2) / len, pos.getX(i) / depth);
    geo.computeVertexNormals();
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const k = new THREE.Mesh(geo, mat);
      const lx = frameSize / 2;
      k.position.set(Math.cos(a) * lx, -0.1, -Math.sin(a) * lx);
      k.rotation.y = a;
      k.receiveShadow = true;
      g.add(k);
    }
  }

  /** Velvet rope on short brass posts (VIP line). colors: [rope, post]. */
  _ropeKerb(g, frameSize, colors) {
    const r = frameSize / 2 + 0.2;
    const postMat = new THREE.MeshStandardMaterial({ color: colors[1] || '#d4af37', metalness: 0.9, roughness: 0.3 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: colors[0] || '#8b1030', roughness: 0.7 });
    const postGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.32, 10); postGeo.translate(0, 0.16, 0);
    const knobGeo = new THREE.SphereGeometry(0.05, 10, 8); knobGeo.translate(0, 0.34, 0);
    const baseGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.03, 12);
    const posts = [];
    const n = 4; // posts per side (excluding the far corner)
    for (let side = 0; side < 4; side++) for (let i = 0; i < n; i++) {
      const t = -r + (i * 2 * r) / n;
      const a = (side * Math.PI) / 2;
      posts.push([Math.cos(a) * r - Math.sin(a) * t, -Math.sin(a) * r - Math.cos(a) * t]);
    }
    const y = -0.1;
    for (const [x, z] of posts) {
      for (const geo of [postGeo, knobGeo, baseGeo]) {
        const m = new THREE.Mesh(geo, postMat);
        m.position.set(x, y, z);
        m.castShadow = geo === postGeo;
        g.add(m);
      }
    }
    const ropeGeos = [];
    for (let i = 0; i < posts.length; i++) {
      const [x0, z0] = posts[i], [x1, z1] = posts[(i + 1) % posts.length];
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        pts.push(new THREE.Vector3(x0 + (x1 - x0) * f, y + 0.3 - Math.sin(Math.PI * f) * 0.1, z0 + (z1 - z0) * f));
      }
      ropeGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.022, 5, false));
    }
    const rope = new THREE.Mesh(mergeGeometries(ropeGeos), ropeMat);
    ropeGeos.forEach((x) => x.dispose());
    g.add(rope);
  }

  // ---------------------------------------------------------------- highlights
  _buildHighlightAssets() {
    this._hlGeo = new THREE.PlaneGeometry(0.97, 0.97);
    this._hlGeo.rotateX(-Math.PI / 2);
    const mk = (tex, color, mult, opacity = 1) => new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(color).multiplyScalar(mult), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true,
    });
    this._hlMats = {
      selected: mk(hlTexture('selected'), 0x29e3d6, 2.4),
      move: mk(hlTexture('move'), 0x29e3d6, 2.2),
      capture: mk(hlTexture('capture'), 0xff2d55, 2.6),
      lastMove: mk(hlTexture('fill'), 0xff9a3c, 0.9, 0.6),
      check: mk(hlTexture('check'), 0xff1e3c, 3.0),
      hover: mk(hlTexture('hover'), 0xffffff, 1.1, 0.8),
    };
    this._hover = new THREE.Mesh(this._hlGeo, this._hlMats.hover);
    this._hover.visible = false;
    this._hover.renderOrder = 5;
    this.overlayGroup.add(this._hover);
  }

  _acquire(type) {
    const pool = (this._pools[type] ||= []);
    let m = pool.find((p) => !p.visible);
    if (!m) {
      m = new THREE.Mesh(this._hlGeo, this._hlMats[type]);
      m.renderOrder = { lastMove: 1, move: 3, capture: 3, selected: 4, check: 2 }[type] || 2;
      pool.push(m);
      this.overlayGroup.add(m);
    }
    m.visible = true;
    return m;
  }

  clearHighlights() {
    for (const k in this._pools) for (const m of this._pools[k]) m.visible = false;
  }

  highlight({ selected = null, moves = [], captures = [], lastMove = null, check = null } = {}) {
    this.clearHighlights();
    const place = (type, sq, lift = 0) => {
      if (!sq || typeof sq !== 'string' || sq.length < 2) return;
      const m = this._acquire(type);
      const { x, z } = sqToXZ(sq);
      m.position.set(x, HL_Y + lift, z);
    };
    if (lastMove) { place('lastMove', lastMove.from); place('lastMove', lastMove.to); }
    if (check) place('check', check, 0.001);
    for (const sq of moves || []) place('move', sq, 0.002);
    for (const sq of captures || []) place('capture', sq, 0.002);
    if (selected) place('selected', selected, 0.003);
  }

  setHover(sq) {
    this._hoverSq = sq;
    if (!sq) { this._hover.visible = false; return; }
    const { x, z } = sqToXZ(sq);
    this._hover.position.set(x, HL_Y + 0.004, z);
    this._hover.visible = true;
  }

  update(dt, t) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 5);
    this._hlMats.move.opacity = 0.7 + 0.3 * Math.sin(t * 4);
    this._hlMats.capture.opacity = 0.75 + 0.25 * Math.sin(t * 6);
    this._hlMats.check.opacity = pulse;
    this._hlMats.selected.opacity = 0.85 + 0.15 * Math.sin(t * 3);
  }
}

/** BoxGeometry re-indexed into two groups: 0 = all sides + bottom, 1 = top (+Y). */
function twoGroupBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const idx = g.index.array;
  const side = [], top = [];
  for (const gr of g.groups) for (let i = gr.start; i < gr.start + gr.count; i++) (gr.materialIndex === 2 ? top : side).push(idx[i]);
  g.setIndex([...side, ...top]);
  g.clearGroups();
  g.addGroup(0, side.length, 0);
  g.addGroup(side.length, top.length, 1);
  return g;
}

// ======================================================================== textures
function makeConcreteTextures(seed) {
  const r = rng(seed);
  const S = 256;
  const stripes = (g, paint) => {
    // crosswalk bars run along Z (from white's view they look like a zebra crossing)
    const n = 3, bw = S * 0.17, gap = (S - n * bw) / (n + 1);
    for (let i = 0; i < n; i++) {
      const x0 = gap + i * (bw + gap);
      g.fillStyle = paint;
      g.fillRect(x0, S * 0.05, bw, S * 0.9);
    }
  };
  const map = canvasTexture(S, S, (g) => {
    g.fillStyle = '#c3b3a0'; g.fillRect(0, 0, S, S);
    // warm sun-bleach gradient
    const grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, 'rgba(255,220,180,0.18)'); grd.addColorStop(1, 'rgba(90,70,80,0.12)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 2600, (rr) => `rgba(${60 + rr * 80},${55 + rr * 70},${60 + rr * 60},${0.15 + rr * 0.2})`, r);
    speckle(g, S, S, 600, (rr) => `rgba(255,245,230,${0.15 + rr * 0.2})`, r);
    stripes(g, 'rgba(248,244,236,0.92)');
    // wear on paint
    speckle(g, S, S, 900, (rr) => `rgba(170,155,140,${0.35 + rr * 0.4})`, r, [1, 4]);
    // cracks
    g.strokeStyle = 'rgba(40,34,38,0.45)'; g.lineWidth = 1.2;
    for (let c = 0; c < 2; c++) {
      g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y);
      for (let i = 0; i < 8; i++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    // bevel shade at the edge
    g.strokeStyle = 'rgba(40,30,40,0.35)'; g.lineWidth = 6; g.strokeRect(0, 0, S, S);
  });
  const rough = canvasTexture(S, S, (g) => {
    g.fillStyle = 'rgb(0,225,0)'; g.fillRect(0, 0, S, S);
    stripes(g, 'rgb(0,150,0)');
  }, { srgb: false });
  const bump = canvasTexture(S, S, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 3000, (rr) => `rgba(${rr > 0.5 ? 255 : 0},${rr > 0.5 ? 255 : 0},${rr > 0.5 ? 255 : 0},0.25)`, r);
    stripes(g, 'rgba(255,255,255,0.35)');
  }, { srgb: false });
  return { map, rough, bump };
}

function makeAsphaltTextures(seed) {
  const r = rng(seed);
  const S = 256;
  const puddles = [];
  for (let i = 0; i < 3; i++) puddles.push({ x: r() * S, y: r() * S, rx: 30 + r() * 60, ry: 20 + r() * 40, a: r() * Math.PI });
  const map = canvasTexture(S, S, (g) => {
    g.fillStyle = '#26232b'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 5000, (rr) => `rgba(${70 + rr * 70},${66 + rr * 60},${72 + rr * 60},${0.25 + rr * 0.35})`, r, [1, 2]);
    speckle(g, S, S, 1500, (rr) => `rgba(8,6,12,${0.3 + rr * 0.4})`, r, [1, 3]);
    // darker wet patches
    for (const p of puddles) {
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.scale(1, p.ry / p.rx);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, p.rx);
      grd.addColorStop(0, 'rgba(10,8,16,0.3)'); grd.addColorStop(1, 'rgba(10,8,16,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, p.rx, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // tar-seal lines
    g.strokeStyle = 'rgba(10,8,14,0.7)'; g.lineWidth = 2.5;
    g.beginPath(); let x = r() * S, y = 0; g.moveTo(x, y);
    for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 60; y += S / 6; g.lineTo(x, y); } g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 6; g.strokeRect(0, 0, S, S);
  });
  const rough = canvasTexture(S, S, (g) => {
    g.fillStyle = 'rgb(0,175,0)'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 2500, (rr) => `rgb(0,${120 + rr * 120},0)`, r, [1, 3]);
    for (const p of puddles) {
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.scale(1, p.ry / p.rx);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, p.rx);
      grd.addColorStop(0, 'rgba(0,30,0,0.95)'); grd.addColorStop(0.5, 'rgba(0,60,0,0.6)'); grd.addColorStop(1, 'rgba(0,175,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, p.rx, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }, { srgb: false });
  const bump = canvasTexture(S, S, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 6000, (rr) => (rr > 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'), r, [1, 2]);
  }, { srgb: false });
  return { map, rough, bump };
}

function makeFrameTexture(base = '#2d2733', text = '#f7efe4', glow = '#ff5fa2', line = '#ffc34d') {
  const S = 1024, B = S * (0.5 / 9); // border width in px (0.5 of 9 units)
  const c = new THREE.Color(base);
  const light = autoText(base) !== '#f7efe4';
  return canvasTexture(S, S, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    const r = rng(55);
    const hsl = c.getHSL({});
    speckle(g, S, S, 9000, (rr) => `hsla(${hsl.h * 360},${hsl.s * 100}%,${(light ? 45 : 50) + rr * 25}%,0.18)`, r, [1, 3]);
    g.strokeStyle = line; g.lineWidth = 5;
    g.strokeRect(B - 9, B - 9, S - 2 * B + 18, S - 2 * B + 18);
    g.font = `bold ${Math.round(B * 0.62)}px "Bebas Neue", Anton, Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cell = (S - 2 * B) / 8;
    const paint = (txt, x, y, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.shadowColor = light ? 'rgba(0,0,0,0.25)' : glow; g.shadowBlur = light ? 4 : 10;
      g.fillStyle = text; g.fillText(txt, 0, 0); g.restore();
    };
    for (let i = 0; i < 8; i++) {
      const f = String.fromCharCode(65 + i);
      const cc = B + cell * (i + 0.5);
      paint(f, cc, S - B / 2, 0);                 // white side (bottom of texture = +z)
      paint(f, cc, B / 2, Math.PI);               // black side
      const rank = String(8 - i);
      paint(rank, B / 2, cc, 0);                   // left (a-file side)
      paint(rank, S - B / 2, cc, Math.PI);
    }
    // corner "VI" marks
    g.font = `bold ${Math.round(B * 0.55)}px Anton, Impact, sans-serif`;
    for (const [x, y] of [[B / 2, B / 2], [S - B / 2, B / 2], [B / 2, S - B / 2], [S - B / 2, S - B / 2]]) {
      g.save(); g.translate(x, y); g.shadowColor = '#ff9a3c'; g.shadowBlur = 12;
      const grd = g.createLinearGradient(-B / 3, -B / 3, B / 3, B / 3);
      grd.addColorStop(0, '#ff5fa2'); grd.addColorStop(1, '#ffb347');
      g.fillStyle = grd; g.fillText('VI', 0, 2); g.restore();
    }
  });
}

/** Plinth side texture: concrete (graffiti tags) | wood | marble | steel, tinted from `color`. */
function makePlinthTexture(kind, color) {
  const col = new THREE.Color(color);
  const hex = '#' + col.getHexString();
  const shade = (k) => '#' + col.clone().multiplyScalar(k).getHexString();
  const r = rng(8);
  if (kind === 'wood') {
    return canvasTexture(256, 64, (g, w, h) => {
      g.fillStyle = hex; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        g.fillStyle = shade(0.6); g.fillRect(0, y, w, 2);
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; g.fillRect(r() * w, y + 3 + r() * 11, 20 + r() * 60, 1); }
        g.fillStyle = shade(0.55); g.fillRect(((y * 7) % w) + 40, y, 2, 16);
      }
    }, { repeat: [4, 1] });
  }
  if (kind === 'marble') {
    return canvasTexture(256, 64, (g, w, h) => {
      g.fillStyle = hex; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 600, (rr) => `rgba(255,255,255,${0.05 + rr * 0.1})`, r, [1, 3]);
      g.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        g.strokeStyle = `rgba(90,80,90,${0.2 + r() * 0.25})`;
        g.beginPath(); let x = r() * w, y = 0; g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (r() - 0.3) * 40; y += h / 6; g.lineTo(x, y); }
        g.stroke();
      }
    }, { repeat: [4, 1] });
  }
  if (kind === 'steel') {
    return canvasTexture(256, 64, (g, w, h) => {
      g.fillStyle = hex; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) { g.fillStyle = `rgba(255,255,255,${r() * 0.06})`; g.fillRect(0, y, w, 1); }
      g.fillStyle = shade(0.5);
      for (let x = 8; x < w; x += 32) { g.fillRect(x, 6, 3, 3); g.fillRect(x, h - 9, 3, 3); }
      g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
    }, { repeat: [4, 1] });
  }
  // concrete (default): speckled with a couple of faint graffiti tags
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, (rr) => `rgba(${40 + rr * 80},${30 + rr * 70},${50 + rr * 70},0.3)`, r);
    g.globalAlpha = 0.5;
    g.fillStyle = '#ff5fa2'; g.fillRect(20, 20, 40, 6);
    g.fillStyle = '#29e3d6'; g.fillRect(140, 30, 30, 5);
    g.globalAlpha = 1;
  }, { repeat: [4, 1] });
}

function hazardTexture([a = '#f2c200', b = '#161616'] = []) {
  return canvasTexture(128, 32, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = b;
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
    speckle(g, w, h, 300, (rr) => `rgba(0,0,0,${rr * 0.15})`, rng(4));
  });
}

function planksTexture([a = '#9a6b43', b = '#6e4a2c'] = []) {
  const r = rng(12);
  return canvasTexture(256, 32, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = b; g.fillRect(x, 0, 3, h); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 20 + r() * 40, 1); }
  });
}

function hlTexture(kind) {
  const S = 128;
  return canvasTexture(S, S, (g) => {
    g.clearRect(0, 0, S, S);
    const glowRect = (inset, width, alpha) => {
      g.strokeStyle = `rgba(255,255,255,${alpha})`; g.lineWidth = width;
      g.strokeRect(inset, inset, S - inset * 2, S - inset * 2);
    };
    if (kind === 'selected') {
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(6, 6, S - 12, S - 12);
      for (let i = 0; i < 6; i++) glowRect(6 + i * 2, 2, 0.12 + i * 0.12);
      glowRect(8, 4, 1);
    } else if (kind === 'move') {
      const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.28);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.62, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.15)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S * 0.28, 0, Math.PI * 2); g.fill();
    } else if (kind === 'capture') {
      g.strokeStyle = 'white'; g.lineWidth = 7; g.lineCap = 'round';
      const L = 26, m = 12;
      for (const [x, y, sx, sy] of [[m, m, 1, 1], [S - m, m, -1, 1], [m, S - m, 1, -1], [S - m, S - m, -1, -1]]) {
        g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke();
      }
      g.lineWidth = 3;
      g.beginPath(); g.arc(S / 2, S / 2, 22, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(S / 2, S / 2 - 34); g.lineTo(S / 2, S / 2 - 12); g.moveTo(S / 2, S / 2 + 12); g.lineTo(S / 2, S / 2 + 34);
      g.moveTo(S / 2 - 34, S / 2); g.lineTo(S / 2 - 12, S / 2); g.moveTo(S / 2 + 12, S / 2); g.lineTo(S / 2 + 34, S / 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(4, 4, S - 8, S - 8);
    } else if (kind === 'fill') {
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(3, 3, S - 6, S - 6);
      glowRect(4, 3, 0.9);
    } else if (kind === 'check') {
      const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.62);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.45)');
      grd.addColorStop(1, 'rgba(255,255,255,0.1)');
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
      glowRect(5, 5, 1);
    } else if (kind === 'hover') {
      glowRect(5, 3, 0.8);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(5, 5, S - 10, S - 10);
    }
  });
}
