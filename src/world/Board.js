// Board: 8x8 street tiles (concrete crosswalk / wet asphalt), raised plinth with red/white kerb,
// coordinate paint, neon under-lip, and the highlight overlay system.
import * as THREE from 'three';
import { ALL_SQUARES, sqToXZ, isLightSquare, canvasTexture, speckle, rng } from './util.js';

export const BOARD_TOP = 0;          // y of the tile tops
export const STREET_Y = -0.42;        // y of the surrounding street

const HL_Y = 0.012;

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
    this._buildPlinth();
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
    const geo = new THREE.BoxGeometry(0.985, 0.12, 0.985);
    geo.translate(0, -0.06, 0);
    for (const sq of ALL_SQUARES) {
      const light = isLightSquare(sq);
      const top = light ? lightMats[Math.floor(r() * 4)] : darkMats[Math.floor(r() * 4)];
      const mats = [sideMat, sideMat, top, sideMat, sideMat, sideMat];
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

  // ---------------------------------------------------------------- plinth, frame, kerb
  _buildPlinth() {
    // grout slab directly under tiles
    const grout = new THREE.Mesh(
      new THREE.BoxGeometry(8.02, 0.1, 8.02),
      new THREE.MeshStandardMaterial({ color: 0x141218, roughness: 0.9 }),
    );
    grout.position.y = -0.1;
    grout.receiveShadow = true;
    this.group.add(grout);

    // painted frame with coordinates
    const frameTex = makeFrameTexture();
    const frameSize = 9.0;
    const frameTop = new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.75, metalness: 0.05 });
    const frameSide = new THREE.MeshStandardMaterial({ color: 0x2b2530, roughness: 0.8 });
    const frameGeo = new THREE.BoxGeometry(frameSize, 0.1, frameSize);
    const frame = new THREE.Mesh(frameGeo, [frameSide, frameSide, frameTop, frameSide, frameSide, frameSide]);
    frame.position.y = -0.052;
    frame.receiveShadow = true;
    this.group.add(frame);

    // plinth body down to street level
    const plinthH = BOARD_TOP - 0.1 - STREET_Y;
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x4a4250, roughness: 0.85, map: makeConcreteSideTexture() });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.7, plinthH, 9.7), plinthMat);
    plinth.position.y = STREET_Y + plinthH / 2;
    plinth.receiveShadow = true; plinth.castShadow = true;
    this.group.add(plinth);

    // neon under-lip strips (teal on long sides, pink on short) — bloom candy
    const neonTeal = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x29e3d6).multiplyScalar(3.0) });
    const neonPink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5fa2).multiplyScalar(3.0) });
    const stripGeo = new THREE.BoxGeometry(9.72, 0.035, 0.035);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(stripGeo, i % 2 ? neonTeal : neonPink);
      const a = (i * Math.PI) / 2;
      s.position.set(Math.sin(a) * 4.86, STREET_Y + 0.06, Math.cos(a) * 4.86);
      s.rotation.y = a;
      this.group.add(s);
    }

    // red/white kerb ring (race-track style) around the frame
    const kerbRed = new THREE.MeshStandardMaterial({ color: 0xd8232f, roughness: 0.55 });
    const kerbWhite = new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.55 });
    const seg = 0.5, depth = 0.36, outer = frameSize / 2 + depth;
    // sloped kerb block: a trapezoid prism (taller on the inside)
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
        const k = new THREE.Mesh(kerbGeo, (idx++ % 2) ? kerbRed : kerbWhite);
        // local: x = outward offset, z = along side
        const lx = frameSize / 2, lz = t;
        k.position.set(Math.cos(a) * lx + Math.sin(a) * lz, -0.1, -Math.sin(a) * lx + Math.cos(a) * lz);
        k.rotation.y = a;
        k.castShadow = false; k.receiveShadow = true;
        this.group.add(k);
      }
    }
    // kerb side skirt
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(outer * 2, 0.12, outer * 2),
      new THREE.MeshStandardMaterial({ color: 0x302a36, roughness: 0.9 }));
    skirt.position.y = -0.16;
    this.group.add(skirt);
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

function makeFrameTexture() {
  const S = 1024, B = S * (0.5 / 9); // border width in px (0.5 of 9 units)
  return canvasTexture(S, S, (g) => {
    g.fillStyle = '#2d2733'; g.fillRect(0, 0, S, S);
    const r = rng(55);
    speckle(g, S, S, 9000, (rr) => `rgba(${90 + rr * 60},${80 + rr * 50},${90 + rr * 60},0.25)`, r, [1, 3]);
    // thin yellow road line around the playing field
    g.strokeStyle = '#ffc34d'; g.lineWidth = 5;
    g.strokeRect(B - 9, B - 9, S - 2 * B + 18, S - 2 * B + 18);
    g.font = `bold ${Math.round(B * 0.62)}px "Bebas Neue", Anton, Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cell = (S - 2 * B) / 8;
    const paint = (txt, x, y, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.shadowColor = 'rgba(255,95,162,0.9)'; g.shadowBlur = 10;
      g.fillStyle = '#f7efe4'; g.fillText(txt, 0, 0); g.restore();
    };
    for (let i = 0; i < 8; i++) {
      const f = String.fromCharCode(65 + i);
      const c = B + cell * (i + 0.5);
      paint(f, c, S - B / 2, 0);                 // white side (bottom of texture = +z)
      paint(f, c, B / 2, Math.PI);               // black side
      const rank = String(8 - i);
      paint(rank, B / 2, c, 0);                   // left (a-file side)
      paint(rank, S - B / 2, c, Math.PI);
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

function makeConcreteSideTexture() {
  const t = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#5a5060'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, (rr) => `rgba(${40 + rr * 80},${30 + rr * 70},${50 + rr * 70},0.3)`, rng(8));
    // graffiti-ish tags
    g.globalAlpha = 0.5;
    g.fillStyle = '#ff5fa2'; g.fillRect(20, 20, 40, 6);
    g.fillStyle = '#29e3d6'; g.fillRect(140, 30, 30, 5);
    g.globalAlpha = 1;
  }, { repeat: [4, 1] });
  return t;
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
