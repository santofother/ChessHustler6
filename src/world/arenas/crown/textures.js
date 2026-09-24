// Crown Hills — small canvas textures (all ≤ 512 px): marble, hedge, lawn stripes, arched windows, skyline windows,
// HOA banner. Every texture is owned by the arena (disposed with the materials that use it).
import { canvasTexture, rng } from '../../util.js';

function veins(g, w, h, r, { count = 7, color = 'rgba(120,110,105,', alpha = [0.08, 0.22], width = [0.6, 2.2] } = {}) {
  for (let i = 0; i < count; i++) {
    let x = r() * w, y = r() * h;
    const ang = r() * Math.PI;
    g.strokeStyle = color + (alpha[0] + r() * (alpha[1] - alpha[0])).toFixed(3) + ')';
    g.lineWidth = width[0] + r() * (width[1] - width[0]);
    g.beginPath(); g.moveTo(x, y);
    const steps = 18 + Math.floor(r() * 16);
    let a = ang;
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * w * 0.035; y += Math.sin(a) * h * 0.035;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

/** Cream marble floor: 2×2 large tiles per texture with veins and thin warm grout. */
export function marbleFloorTexture(repeat = [1, 1]) {
  const r = rng(404);
  return canvasTexture(512, 512, (g, w, h) => {
    const cols = ['#f3ede2', '#efe7da', '#f5f0e6', '#ece3d4'];
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      g.fillStyle = cols[(tx + ty * 2) % 4];
      g.fillRect(tx * w / 2, ty * h / 2, w / 2, h / 2);
    }
    // soft clouds
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h, rad = 20 + r() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(${200 + r() * 30},${185 + r() * 30},${170 + r() * 30},0.10)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
    veins(g, w, h, r, { count: 9, color: 'rgba(150,135,120,', alpha: [0.06, 0.18] });
    veins(g, w, h, r, { count: 4, color: 'rgba(190,160,110,', alpha: [0.08, 0.16], width: [0.5, 1.2] });
    g.fillStyle = 'rgba(160,140,115,0.55)';
    g.fillRect(0, 0, w, 2); g.fillRect(0, h / 2 - 1, w, 2);
    g.fillRect(0, 0, 2, h); g.fillRect(w / 2 - 1, 0, 2, h);
  }, { repeat });
}

/** Dark green marble (inlay band / fountain accents). */
export function darkMarbleTexture() {
  const r = rng(77);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#16322b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(40,80,68,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
    veins(g, w, h, r, { count: 8, color: 'rgba(200,225,210,', alpha: [0.12, 0.3], width: [0.5, 1.4] });
  }, { repeat: [1, 1] });
}

/** Clipped hedge leaves (tileable noise). */
export function hedgeTexture() {
  const r = rng(12);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2f5a2c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, s = 2 + r() * 5;
      const v = r();
      g.fillStyle = v < 0.33 ? 'rgba(20,50,22,0.7)' : v < 0.66 ? 'rgba(70,120,55,0.6)' : 'rgba(110,160,80,0.45)';
      g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [1, 1] });
}

/** Polo lawn with mowing stripes (stripes along V). */
export function lawnTexture() {
  const r = rng(5);
  return canvasTexture(256, 256, (g, w, h) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#4f8a3a' : '#5d9a44';
      g.fillRect((i * w) / 4, 0, w / 4, h);
    }
    for (let i = 0; i < 3500; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(30,70,25,0.25)' : 'rgba(140,190,90,0.18)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 3);
    }
  }, { repeat: [1, 1] });
}

/** Arched window with warm interior light (alpha outside the arch). Used as map + emissiveMap. */
export function archWindowTexture(kind = 0) {
  const r = rng(31 + kind);
  return canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const arch = () => {
      g.beginPath();
      g.moveTo(8, h - 4); g.lineTo(8, w / 2 + 4);
      g.arc(w / 2, w / 2 + 4, w / 2 - 8, Math.PI, 0);
      g.lineTo(w - 8, h - 4); g.closePath();
    };
    // frame
    g.fillStyle = '#efe4d0'; g.beginPath();
    g.moveTo(2, h); g.lineTo(2, w / 2 + 2); g.arc(w / 2, w / 2 + 2, w / 2 - 2, Math.PI, 0); g.lineTo(w - 2, h); g.closePath(); g.fill();
    arch();
    const grd = g.createLinearGradient(0, 0, 0, h);
    if (kind === 1) { grd.addColorStop(0, '#ffe2a6'); grd.addColorStop(0.6, '#ffb566'); grd.addColorStop(1, '#e98a45'); }
    else { grd.addColorStop(0, '#fff0c8'); grd.addColorStop(0.55, '#ffd08a'); grd.addColorStop(1, '#f2a35c'); }
    g.fillStyle = grd; g.fill();
    // chandelier glow blob
    g.save(); arch(); g.clip();
    const cx = w / 2 + (r() - 0.5) * 20, cy = h * 0.42;
    const gl = g.createRadialGradient(cx, cy, 0, cx, cy, 40);
    gl.addColorStop(0, 'rgba(255,255,235,0.9)'); gl.addColorStop(1, 'rgba(255,255,235,0)');
    g.fillStyle = gl; g.fillRect(0, 0, w, h);
    // curtains
    g.fillStyle = kind === 1 ? 'rgba(170,60,55,0.55)' : 'rgba(240,225,200,0.55)';
    g.fillRect(8, 0, 18, h); g.fillRect(w - 26, 0, 18, h);
    g.restore();
    // mullions
    g.strokeStyle = '#efe4d0'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 4);
    for (let y = w / 2 + 30; y < h - 10; y += 46) { g.moveTo(8, y); g.lineTo(w - 8, y); }
    g.stroke();
  }, { anisotropy: 4 });
}

/** Distant skyline windows (dark facade, warm/cool lit windows). Returns {map, emissive}. */
export function skylineTexture(seed = 3, palette = ['#ffd08a', '#ffe6b8', '#9fe8ff', '#ff9ec8'], lit = 0.4) {
  const draw = (emissiveOnly) => (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = emissiveOnly ? '#000' : '#2a2540'; g.fillRect(0, 0, w, h);
    const cw = 16, ch = 16;
    for (let y = 2; y < h; y += ch) for (let x = 2; x < w; x += cw) {
      const on = r() < lit;
      const c = palette[Math.floor(r() * palette.length)];
      if (emissiveOnly) { if (on) { g.fillStyle = c; g.fillRect(x + 2, y + 3, cw - 6, ch - 7); } }
      else { g.fillStyle = on ? c : '#3c3656'; g.fillRect(x + 2, y + 3, cw - 6, ch - 7); }
    }
  };
  const map = canvasTexture(256, 256, draw(false), { repeat: [1, 1], anisotropy: 2 });
  const emissive = canvasTexture(256, 256, draw(true), { repeat: [1, 1], anisotropy: 2 });
  return { map, emissive };
}

/** Crown Hills HOA banner: crimson with cream crown + "CH" monogram and gold fringe. */
export function bannerTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#b3242a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e5383b'; g.fillRect(8, 0, w - 16, h - 22);
    g.strokeStyle = '#f4ede0'; g.lineWidth = 3; g.strokeRect(14, 10, w - 28, h - 44);
    // crown
    g.fillStyle = '#f4d38a';
    const cy = 80;
    g.beginPath(); g.moveTo(30, cy + 26); g.lineTo(30, cy - 6); g.lineTo(46, cy + 10); g.lineTo(64, cy - 16); g.lineTo(82, cy + 10);
    g.lineTo(98, cy - 6); g.lineTo(98, cy + 26); g.closePath(); g.fill();
    g.fillRect(28, cy + 30, 72, 8);
    g.fillStyle = '#f4ede0'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CH', w / 2, 170);
    // fringe
    g.fillStyle = '#e0b04a';
    for (let x = 0; x < w; x += 8) g.fillRect(x, h - 22, 5, 22);
  });
}

/** Tiny white "light dot" texture used by the lantern/bulb sprites. */
export function dotTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

/** Vertical beam fade (uplights): bright at the bottom (v=0), transparent at the top. */
export function beamTexture() {
  return canvasTexture(8, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { anisotropy: 1 });
}

