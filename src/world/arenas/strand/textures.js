// Sunset Strand — procedural canvas textures (all ≤ 512 px).
import * as THREE from 'three';
import { canvasTexture, speckle, rng } from '../../util.js';

/** Sun-bleached boardwalk planks running along X. 512 px ≈ 4 m × 4 m. */
export function plankTexture(time) {
  const r = rng(11);
  const night = time === 'night';
  const tones = ['#c99e70', '#bf9163', '#d4ad80', '#b48456', '#c7a07a', '#a98a6c', '#d8b893'];
  return canvasTexture(512, 512, (g, w, h) => {
    const ph = 26; // plank pitch in px (≈ 0.2 m)
    for (let y = 0, row = 0; y < h; y += ph, row++) {
      // two or three planks per row with staggered butt joints
      let x = -((row * 173) % 300);
      while (x < w) {
        const len = 220 + r() * 260;
        g.fillStyle = tones[Math.floor(r() * tones.length)];
        g.fillRect(x, y, len, ph - 3);
        // grain streaks
        for (let k = 0; k < 7; k++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '90,60,35' : '255,235,205'},${0.08 + r() * 0.1})`;
          g.fillRect(x + r() * len, y + 2 + r() * (ph - 8), 30 + r() * 120, 1 + r() * 1.5);
        }
        // nails
        g.fillStyle = 'rgba(60,45,35,0.8)';
        g.fillRect(x + 8, y + 5, 3, 3); g.fillRect(x + 8, y + ph - 10, 3, 3);
        g.fillRect(x + len - 12, y + 5, 3, 3); g.fillRect(x + len - 12, y + ph - 10, 3, 3);
        // butt joint
        g.fillStyle = 'rgba(55,38,26,0.85)';
        g.fillRect(x + len - 2, y, 2, ph - 3);
        x += len;
      }
      g.fillStyle = 'rgba(52,36,24,0.95)';
      g.fillRect(0, y + ph - 3, w, 3);
    }
    // sand dusting + sticky spots ("held together by gum")
    speckle(g, w, h, 1400, (rr) => `rgba(240,215,165,${0.15 + rr() * 0.25})`, r, [1, 3]);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = ['rgba(255,110,170,0.55)', 'rgba(90,210,220,0.5)', 'rgba(60,40,30,0.25)'][i % 3];
      g.beginPath(); g.arc(r() * w, r() * h, 1.5 + r() * 2.5, 0, Math.PI * 2); g.fill();
    }
    if (night) { g.fillStyle = 'rgba(20,20,60,0.05)'; g.fillRect(0, 0, w, h); }
  }, { repeat: [1, 1] });
}

/** Warm sand with ripples, shells and footprints. */
export function sandTexture() {
  const r = rng(23);
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#efd3a2'; g.fillRect(0, 0, w, h);
    // big soft tonal blotches
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 30 + r() * 90;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.5 ? '255,236,200' : '214,176,120';
      grd.addColorStop(0, `rgba(${c},0.22)`); grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
    // wind ripples
    g.strokeStyle = 'rgba(190,150,100,0.18)'; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, len = 30 + r() * 70;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 4 - r() * 4, x + len, y); g.stroke();
    }
    speckle(g, w, h, 5000, (rr) => (rr() < 0.5 ? `rgba(180,140,90,${0.25 + rr() * 0.3})` : `rgba(255,248,230,${0.3 + rr() * 0.4})`), r, [1, 2]);
    // footprints
    g.fillStyle = 'rgba(175,135,85,0.35)';
    for (let t = 0; t < 3; t++) {
      let x = r() * w, y = r() * h; const a = r() * Math.PI * 2;
      for (let s = 0; s < 9; s++) {
        const side = s % 2 ? 1 : -1;
        g.save(); g.translate(x + Math.cos(a + Math.PI / 2) * side * 5, y + Math.sin(a + Math.PI / 2) * side * 5); g.rotate(a);
        g.beginPath(); g.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
        x += Math.cos(a) * 20; y += Math.sin(a) * 20;
      }
    }
    // shells
    for (let i = 0; i < 18; i++) {
      g.fillStyle = ['#fff4ec', '#ffc9b5', '#f7e3c6'][i % 3];
      g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 2, 1.5 + r() * 1.5, r() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [1, 1] });
}

/**
 * Sign atlas: 8 rows of 512×64 neon-ish signs. Returns { tex, rows: {key: rowIndex} } — use signUV(row) for UVs.
 */
export const SIGNS = [
  { key: 'tacos', text: 'TACO BOMBA', color: '#ff9f1c', bg: '#2a1030' },
  { key: 'surf', text: 'SURF & TURF RENTALS', color: '#2ee6d6', bg: '#0f2a3a' },
  { key: 'ice', text: 'BRAIN FREEZE', color: '#ff7ab8', bg: '#fff1f6' },
  { key: 'pawn', text: 'GOLD GRILLZ PAWN', color: '#ffd23f', bg: '#1d1a3a' },
  { key: 'tattoo', text: 'INK ME UP', color: '#b06cff', bg: '#16102a' },
  { key: 'arcade', text: 'PIXEL PALACE', color: '#44f0ff', bg: '#1a0f3a' },
  { key: 'pier', text: 'PELICAN PIER', color: '#fff2c4', bg: '#e8546a' },
  { key: 'strand', text: 'SUNSET STRAND', color: '#ffe29a', bg: '#ff6f61' },
];
export function signAtlas() {
  return canvasTexture(512, 512, (g, w) => {
    SIGNS.forEach((s, i) => {
      const y = i * 64;
      g.fillStyle = s.bg; g.fillRect(0, y, w, 64);
      g.strokeStyle = s.color; g.lineWidth = 4; g.strokeRect(6, y + 6, w - 12, 52);
      g.font = 'bold 38px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 38;
      while (g.measureText(s.text).width > w - 40 && size > 18) { size -= 2; g.font = `bold ${size}px "Arial Black", Impact, sans-serif`; }
      g.shadowColor = s.color; g.shadowBlur = 10;
      g.fillStyle = s.color; g.fillText(s.text, w / 2, y + 34);
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(s.text, w / 2, y + 34);
    });
  }, { anisotropy: 4 });
}
export function signIndex(key) { return Math.max(0, SIGNS.findIndex((s) => s.key === key)); }

/** Soft round glow for bulbs (Points). */
export function bulbTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { anisotropy: 1 });
}

/** Painted deck logo (transparent) — reads correctly from the black camera (text "up" = +Z). */
export function deckLogoTexture(boss) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2);
    // sun half-disc with stripes
    const grd = g.createLinearGradient(0, -100, 0, 20);
    grd.addColorStop(0, boss ? '#ffe29a' : '#ffd23f'); grd.addColorStop(1, boss ? '#ff9f1c' : '#ff5f8f');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 10, 92, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(0,0,0,0)';
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) g.fillRect(-100, -10 - i * 18, 200, 5 + i);
    g.globalCompositeOperation = 'source-over';
    g.font = 'bold 44px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(30,20,50,0.85)';
    g.strokeText('SUNSET STRAND', 0, 50);
    g.fillStyle = '#fff4e0'; g.fillText('SUNSET STRAND', 0, 50);
    g.font = 'bold 18px Arial, sans-serif';
    g.fillStyle = '#2ec4d6'; g.fillText(boss ? 'BOSS NIGHT · VIP ONLY' : 'WHERE HUSTLES GO TO GET A TAN', 0, 90);
    g.restore();
  }, { anisotropy: 8 });
}

/** Striped fabric (cabana / awnings with UVs). */
export function stripeTexture(a, b, n = 8) {
  return canvasTexture(128, 16, (g, w, h) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * w) / n, 0, w / n + 1, h); }
  }, { anisotropy: 2 });
}

