// Procedural graffiti + grime canvas textures shared by the docks hangout corner and The Trap.
// Everything is drawn once at build time (≤ 512 px), deterministic per seed.
import * as THREE from 'three';
import { canvasTexture, rng } from '../../util.js';

export const SPRAY = ['#ff3ea5', '#29e3d6', '#ffd23f', '#ff7a1a', '#a259ff', '#3d8bff', '#9dff3c', '#ff4d4d', '#ffffff', '#ffb347'];
const FONTS = ['900 {s}px "Arial Black", Impact, sans-serif', 'bold {s}px Impact, "Arial Black", sans-serif',
  'italic 900 {s}px "Trebuchet MS", "Arial Black", sans-serif'];
const WORDS = ['VICE', 'RWD', 'L64', 'HUSTLE', 'GAMBIT', 'KING ME', 'CHECK', 'NO REFUNDS', 'LEONIDA', 'VI', 'TRAP',
  'ZERO QS', 'ROOK IT', 'PAWN STARS', 'MATE', 'DOCKBOYZ', 'CASH ONLY', 'BISHOP'];

const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];

function font(i, s) { return FONTS[i % FONTS.length].replace('{s}', Math.round(s)); }

/** Wobbly per-letter text: returns total width. mode 'fill' | 'stroke'. */
function wobbleText(g, text, x, y, size, r, fi, draw) {
  g.font = font(fi, size);
  let cx = x;
  const out = [];
  for (const ch of text) {
    const w = g.measureText(ch).width;
    out.push({ ch, x: cx + w / 2, y: y + (r() - 0.5) * size * 0.14, rot: (r() - 0.5) * 0.28, s: 0.9 + r() * 0.22 });
    cx += w * 0.9;
  }
  const total = cx - x;
  if (draw) for (const l of out) draw(l);
  return { total, letters: out };
}

/** A "piece": bubble letters with outline, 3D shadow, gradient fill, highlights, drips. */
function piece(g, r, text, cx, cy, maxW, maxH) {
  const fi = Math.floor(r() * FONTS.length);
  let size = maxH * 0.8;
  g.font = font(fi, size);
  const measure = () => { g.font = font(fi, size); return [...text].reduce((a, ch) => a + g.measureText(ch).width * 0.9, 0); };
  let w = measure();
  if (w > maxW) { size *= maxW / w; w = measure(); }
  const x0 = cx - w / 2, y0 = cy;
  const c1 = pick(SPRAY, r), c2 = pick(SPRAY, r), outline = r() < 0.75 ? '#111018' : '#ffffff', shadow = pick(['#111018', '#2b1a4a', '#3a0f2a'], r);
  const { letters } = wobbleText(g, text, x0, y0, size, r, fi, null);
  const each = (fn) => letters.forEach((l) => {
    g.save(); g.translate(l.x, l.y); g.rotate(l.rot); g.scale(l.s, l.s);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(fi, size); fn(l.ch); g.restore();
  });
  // soft overspray glow
  g.shadowColor = c1; g.shadowBlur = size * 0.25;
  // 3D block shadow
  g.fillStyle = shadow;
  for (let k = 6; k >= 1; k--) each((ch) => g.fillText(ch, size * 0.018 * k, size * 0.022 * k));
  g.shadowBlur = 0;
  // outline
  g.lineJoin = 'round'; g.strokeStyle = outline; g.lineWidth = size * 0.16;
  each((ch) => g.strokeText(ch, 0, 0));
  // gradient fill
  const grd = g.createLinearGradient(0, y0 - size / 2, 0, y0 + size / 2);
  grd.addColorStop(0, c1); grd.addColorStop(0.55, c1); grd.addColorStop(0.6, c2); grd.addColorStop(1, c2);
  g.fillStyle = grd;
  each((ch) => g.fillText(ch, 0, 0));
  // inner stripe
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = size * 0.03;
  each((ch) => g.strokeText(ch, -size * 0.02, -size * 0.03));
  // highlights
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const l of letters) if (r() < 0.6) {
    g.beginPath(); g.arc(l.x - size * 0.12, l.y - size * 0.2, size * 0.035, 0, Math.PI * 2); g.fill();
  }
  // drips
  g.strokeStyle = c2; g.lineCap = 'round';
  for (const l of letters) if (r() < 0.5) {
    const dx = l.x + (r() - 0.5) * size * 0.3, dy = l.y + size * 0.3, len = size * (0.15 + r() * 0.5);
    g.lineWidth = size * (0.02 + r() * 0.025);
    g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx, dy + len); g.stroke();
    g.fillStyle = c2; g.beginPath(); g.arc(dx, dy + len, g.lineWidth * 0.8, 0, Math.PI * 2); g.fill();
  }
}

/** A quick scribbled tag (thin, single colour, slanted). */
function tag(g, r, text, x, y, size) {
  g.save();
  g.translate(x, y); g.rotate(-0.15 + (r() - 0.5) * 0.2); g.transform(1, 0, -0.3, 1, 0, 0);
  g.font = `italic bold ${Math.round(size)}px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const col = pick(SPRAY, r);
  g.shadowColor = col; g.shadowBlur = size * 0.2;
  g.lineWidth = size * 0.08; g.strokeStyle = col; g.strokeText(text, 0, 0);
  g.fillStyle = col; g.fillText(text, 0, 0);
  g.shadowBlur = 0;
  // underline swoosh
  g.lineWidth = size * 0.06; g.beginPath();
  const w = g.measureText(text).width;
  g.moveTo(-size * 0.2, size * 0.55); g.quadraticCurveTo(w * 0.5, size * 0.9, w + size * 0.3, size * 0.35); g.stroke();
  g.restore();
}

function crown(g, r, x, y, s) {
  const col = pick(['#ffd23f', '#ffb347', '#ffffff'], r);
  g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.3);
  g.lineJoin = 'round'; g.lineWidth = s * 0.12; g.strokeStyle = '#111018'; g.fillStyle = col;
  g.beginPath();
  g.moveTo(-s, s * 0.5); g.lineTo(-s, -s * 0.3); g.lineTo(-s * 0.5, s * 0.1); g.lineTo(0, -s * 0.6);
  g.lineTo(s * 0.5, s * 0.1); g.lineTo(s, -s * 0.3); g.lineTo(s, s * 0.5); g.closePath();
  g.stroke(); g.fill();
  g.fillStyle = '#111018';
  for (const px of [-1, 0, 1]) { g.beginPath(); g.arc(px * s * (px ? 1 : 0), (px ? -s * 0.3 : -s * 0.6) - s * 0.12, s * 0.1, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

function stars(g, r, n, w, h) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = 4 + r() * 10;
    g.save(); g.translate(x, y); g.rotate(r());
    g.strokeStyle = pick(SPRAY, r); g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k < 5; k++) { const a = (k * 4 * Math.PI) / 5; g.lineTo(Math.cos(a) * s, Math.sin(a) * s); }
    g.closePath(); g.stroke(); g.restore();
  }
}

/**
 * Transparent graffiti decal texture.
 * @param seed  deterministic seed
 * @param opts  { w, h, words:[main, ...], tags:n, extras:bool }
 */
export function graffitiTexture(seed = 1, { w = 512, h = 256, words = null, tags = 3, extras = true } = {}) {
  const r = rng(seed * 7919 + 3);
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    const main = words?.[0] || pick(WORDS, r);
    // faint older buffed-out patches under the piece
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${40 + r() * 40},${40 + r() * 40},${50 + r() * 40},0.25)`;
      g.fillRect(r() * w * 0.7, r() * h * 0.6, w * (0.2 + r() * 0.3), h * (0.2 + r() * 0.3));
    }
    piece(g, r, main, w * 0.5, h * 0.5, w * 0.86, h * 0.62);
    for (let i = 0; i < tags; i++) {
      const t = words?.[i + 1] || pick(WORDS, r);
      const x = r() < 0.5 ? r() * w * 0.25 : w * 0.55 + r() * w * 0.3;
      tag(g, r, t, x, r() < 0.5 ? h * (0.1 + r() * 0.12) : h * (0.82 + r() * 0.1), h * (0.08 + r() * 0.05));
    }
    if (extras) {
      if (r() < 0.6) crown(g, r, w * (0.1 + r() * 0.8), h * 0.18, h * 0.08);
      stars(g, r, 4, w, h);
    }
  });
}

/** Opaque grimy concrete wall texture (tileable-ish) with optional brick courses. */
export function wallTexture(seed = 3, { w = 512, h = 512, base = '#6d6862', brick = false, stains = true } = {}) {
  const r = rng(seed);
  return canvasTexture(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // mottling
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h, rad = 6 + r() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const v = r() < 0.5 ? '0,0,0' : '255,255,255';
      grd.addColorStop(0, `rgba(${v},${0.03 + r() * 0.06})`); grd.addColorStop(1, `rgba(${v},0)`);
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    if (brick) {
      const bh = h / 16, bw = w / 6;
      for (let row = 0; row < 16; row++) for (let c = -1; c < 7; c++) {
        const x = c * bw + (row % 2) * bw / 2, y = row * bh;
        g.fillStyle = `rgba(${120 + r() * 60},${60 + r() * 30},${45 + r() * 20},${0.35 + r() * 0.3})`;
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
      g.fillStyle = 'rgba(30,26,24,0.35)';
      for (let row = 0; row <= 16; row++) g.fillRect(0, row * bh - 1, w, 2);
    } else {
      // formwork panel seams + tie holes
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, 0, w, 2); g.fillRect(0, h / 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 2, h);
      for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        g.beginPath(); g.arc(x * w, y * h, 5, 0, Math.PI * 2); g.fill();
      }
    }
    if (stains) {
      // water streaks from the top + dirt at the bottom
      for (let i = 0; i < 26; i++) {
        const x = r() * w, len = h * (0.1 + r() * 0.5), ww = 4 + r() * 18;
        const grd = g.createLinearGradient(0, 0, 0, len);
        grd.addColorStop(0, 'rgba(20,16,12,0.35)'); grd.addColorStop(1, 'rgba(20,16,12,0)');
        g.fillStyle = grd; g.fillRect(x, 0, ww, len);
      }
      const grd = g.createLinearGradient(0, h * 0.8, 0, h);
      grd.addColorStop(0, 'rgba(15,12,10,0)'); grd.addColorStop(1, 'rgba(15,12,10,0.5)');
      g.fillStyle = grd; g.fillRect(0, h * 0.8, w, h * 0.2);
    }
    // speckle
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.1)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  }, { repeat: [1, 1] });
}

/** Posters / flyers sheet (notice board). */
export function posterTexture(seed = 5, { w = 512, h = 320, cork = true } = {}) {
  const r = rng(seed);
  const titles = ['MISSING: MY BIKE', 'LOST CAT', 'CHESS NITE FRI', 'DJ PAWNSTAR', 'ROOM 4 RENT', 'NO LOITERING',
    'UNION MTG 8PM', 'CASH 4 GOLD', 'VICE FM 94.1', 'KNIGHT CLUB', 'REWARD $$$', 'FRESH KICKS'];
  return canvasTexture(w, h, (g) => {
    g.fillStyle = cork ? '#9a7048' : '#3a3a3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? 'rgba(60,35,15,0.35)' : 'rgba(200,160,110,0.25)'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = '#5b3a1e'; g.lineWidth = 14; g.strokeRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      const pw = 70 + r() * 70, ph = pw * (1.1 + r() * 0.4);
      const x = 14 + r() * (w - pw - 28), y = 14 + r() * (h - ph - 28);
      g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate((r() - 0.5) * 0.18);
      const paper = pick(['#f4efe2', '#ffe66d', '#ff9fc9', '#9ee6ff', '#ffffff', '#c7f59b', '#ffb347'], r);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-pw / 2 + 3, -ph / 2 + 4, pw, ph);
      g.fillStyle = paper; g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.fillStyle = '#1a1a1a'; g.textAlign = 'center';
      g.font = `900 ${Math.round(pw * 0.13)}px "Arial Black", Impact, sans-serif`;
      const t = pick(titles, r).split(' ');
      t.forEach((word, k) => g.fillText(word, 0, -ph * 0.3 + k * pw * 0.14));
      if (r() < 0.6) { g.fillStyle = pick(SPRAY, r); g.fillRect(-pw * 0.35, 0, pw * 0.7, ph * 0.22); }
      g.fillStyle = 'rgba(30,30,30,0.6)';
      for (let k = 0; k < 4; k++) g.fillRect(-pw * 0.38, ph * 0.28 + k * 6 - 8, pw * (0.5 + r() * 0.26), 2);
      if (r() < 0.5) for (let k = 0; k < 6; k++) g.fillRect(-pw / 2 + k * pw / 6 + 3, ph / 2 - 16, 2, 14); // tear-off tabs
      g.fillStyle = pick(['#d62828', '#3d8bff', '#ffd23f'], r);
      g.beginPath(); g.arc(0, -ph / 2 + 6, 5, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  });
}

/** Hand-painted sign text on a plank / board. */
export function signTexture(lines, { w = 512, h = 256, bg = '#1c2a22', fg = '#f4efe2', accent = '#ffd23f', chalk = false } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (chalk) {
      const r = rng(11);
      for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(r() * w, r() * h, 3 + r() * 20, 1 + r() * 3); }
    }
    g.strokeStyle = '#5b3a1e'; g.lineWidth = 16; g.strokeRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const txt = typeof ln === 'string' ? ln : ln.t;
      const col = typeof ln === 'string' ? (i === 0 ? accent : fg) : ln.c;
      const size = (typeof ln === 'object' && ln.s) || (i === 0 ? h * 0.24 : h * 0.16);
      g.font = chalk ? `bold ${Math.round(size)}px "Comic Sans MS", "Segoe Print", sans-serif` : `900 ${Math.round(size)}px "Arial Black", Impact, sans-serif`;
      g.fillStyle = col;
      const tw = g.measureText(txt).width;
      if (tw > w * 0.9) { g.save(); g.translate(w / 2, 0); g.scale((w * 0.9) / tw, 1); g.fillText(txt, 0, h * (0.5 + (i - (n - 1) / 2) * 0.27)); g.restore(); }
      else g.fillText(txt, w / 2, h * (0.5 + (i - (n - 1) / 2) * 0.27));
    });
  });
}

/** Material helper for decals (transparent, no depth write, polygon offset against z-fighting). */
export function decalMaterial(map, { opacity = 0.95, emissive = 0.0 } = {}) {
  return new THREE.MeshStandardMaterial({
    map, transparent: true, opacity, depthWrite: false, roughness: 0.8, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    emissive: emissive ? new THREE.Color(0xffffff) : new THREE.Color(0), emissiveMap: emissive ? map : null, emissiveIntensity: emissive,
  });
}
