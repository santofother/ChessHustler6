// Shared helpers for the world module (math, easing, tweens, canvas textures).
import * as THREE from 'three';

// ---- board coordinates (PLAN §1.2) -------------------------------------------------
export function sqToXZ(sq) {
  const fileIdx = sq.charCodeAt(0) - 97;
  const rankIdx = +sq[1] - 1;
  return { x: fileIdx - 3.5, z: 3.5 - rankIdx };
}
export function xzToSq(x, z) {
  const f = Math.round(x + 3.5);
  const r = Math.round(3.5 - z);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return String.fromCharCode(97 + f) + (r + 1);
}
export function isLightSquare(sq) {
  const f = sq.charCodeAt(0) - 97;
  const r = +sq[1] - 1;
  return (f + r) % 2 === 1;
}
export const ALL_SQUARES = (() => {
  const out = [];
  for (let r = 1; r <= 8; r++) for (let f = 0; f < 8; f++) out.push(String.fromCharCode(97 + f) + r);
  return out;
})();

// Facing: models face -Z at rotation 0. Returns the yaw that makes the model face (dx,dz).
export function yawFor(dx, dz) { return Math.atan2(-dx, -dz); }
export function teamYaw(color) { return color === 'b' ? Math.PI : 0; }
export function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}
export function angleDelta(a, b) {
  return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;

// ---- easing ------------------------------------------------------------------------
export const Ease = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  inCubic: (k) => k * k * k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outQuart: (k) => 1 - Math.pow(1 - k, 4),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
  inBack: (k, s = 1.70158) => (s + 1) * k * k * k - s * k * k,
  outElastic: (k) => {
    if (k === 0 || k === 1) return k;
    return Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (k) => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  },
};

// ---- tween scheduler (driven by the render loop so setAnimSpeed works) ---------------
export class Tweener {
  constructor() { this.list = []; this.speed = 1; }
  /** fn(k) called with 0..1; resolves when done or cancelled. token groups tweens for cancel(). */
  tween(duration, fn, { delay = 0, token = null } = {}) {
    if (token && token.cancelled) return Promise.resolve(false);
    return new Promise((resolve) => {
      this.list.push({ t: -delay, dur: Math.max(1e-4, duration), fn, resolve, token, started: false });
    });
  }
  wait(seconds, token = null) { return this.tween(seconds, () => {}, { token }); }
  update(dt) {
    dt *= this.speed;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const tw = list[i];
      if (tw.token && tw.token.cancelled) { list.splice(i--, 1); tw.resolve(false); continue; }
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      try { tw.fn(k); } catch (e) { console.error('[world] tween error', e); }
      if (k >= 1) { list.splice(i--, 1); tw.resolve(true); }
    }
  }
  cancel(token) {
    token.cancelled = true;
    for (let i = 0; i < this.list.length; i++) {
      const tw = this.list[i];
      if (tw.token === token) { this.list.splice(i--, 1); tw.resolve(false); }
    }
  }
}

// ---- seeded random -----------------------------------------------------------------
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- canvas textures ---------------------------------------------------------------
export function canvasTexture(w, h, draw, { srgb = true, repeat = null, anisotropy = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

/** Adds speckle noise to a 2d context. */
export function speckle(g, w, h, count, colorFn, r = rng(7), size = [1, 2.5]) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colorFn(r);
    const s = size[0] + r() * (size[1] - size[0]);
    g.fillRect(r() * w, r() * h, s, s);
  }
}

/** A soft radial sprite texture (used for glows / particles). */
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  _glowTex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  return _glowTex;
}

let _smokeTex = null;
export function smokeTexture() {
  if (_smokeTex) return _smokeTex;
  const r = rng(99);
  _smokeTex = canvasTexture(128, 128, (g, w, h) => {
    for (let i = 0; i < 14; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.4, y = h / 2 + (r() - 0.5) * h * 0.4, rad = w * (0.18 + r() * 0.2);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
  });
  return _smokeTex;
}

export function formatCash(n) {
  return '+$' + Math.round(n).toLocaleString('en-US');
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.userData.shared) m.dispose();
  });
}
