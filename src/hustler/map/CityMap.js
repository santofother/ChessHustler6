// Hustler Mode — interactive City Map (pure view).
//
//   const map = new CityMap(rootEl);   // builds its DOM inside rootEl, hidden initially
//   map.onAction = (name, payload) => {};  // 'play' {nodeId} | 'defend' {challengeId} | 'puzzles' | 'menu' | 'stats' | 'audio'
//   map.show(view); map.update(view); map.hide();
//   map.focus(nodeId);      // pan/zoom to a node and open its card   (returns a Promise)
//   map.celebrate(nodeId);  // animate a node flipping to owned        (returns a Promise)
//
// Renders whatever `view` (HUSTLER_SPEC §4.4) it is given — no game rules, no lore/balance imports.
// Optional extras it understands if present: node.ownedSince (game no), node.lockReason, view.playerColors.

import './cityMap.css';
import { PIECE_PATHS, PIECE_NAMES, STAR_PATH, pieceSvg, signalSvg, batterySvg } from '../../ui/icons.js';
import * as L from './layout.js';

const PLAYER_COLORS = { primary: '#29e3d6', accent: '#ff5fa2' };
const FALLBACK_NH_COLORS = {
  nh1: { primary: '#ff9a3c', accent: '#ffd36b' },
  nh2: { primary: '#7fd46b', accent: '#c6ff3d' },
  nh3: { primary: '#ff5fa2', accent: '#ffc2dc' },
  nh4: { primary: '#8a7dff', accent: '#c9c2ff' },
  downtown: { primary: '#ffcc4d', accent: '#fff1b8' },
};

const ICONS = {
  lock: 'M6.5 10.5V8a5.5 5.5 0 0 1 11 0v2.5h1.3v10.8H5.2V10.5z M9.3 10.5h5.4V8a2.7 2.7 0 0 0-5.4 0z',
  flag: 'M5 22V2.6h1.9v1.1h12.6l-2.8 4.6l2.8 4.6H6.9V22z',
  warn: 'M12 2.2l10.6 19H1.4z M10.8 9v6.2h2.4V9z M10.8 16.8v2.4h2.4v-2.4z',
  crown: 'M2.5 7.5l5.2 4.2L12 4.5l4.3 7.2l5.2-4.2l-2.2 11H4.7z M4.8 20.2h14.4v1.8H4.8z',
  pawn: PIECE_PATHS.p,
  king: PIECE_PATHS.k,
  star: STAR_PATH,
};
const LINE = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  puzzle: '<path d="M4 4h6v2.2a2 2 0 1 0 4 0V4h6v6h-2.2a2 2 0 1 0 0 4H20v6h-6v-2.2a2 2 0 1 0-4 0V20H4z"/>',
  log: '<path d="M5 4h14v16H5z"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  audio: '<path d="M4 9.2h3.8L13 5v14l-5.2-4.2H4z"/><path d="M16.5 8.8a4.6 4.6 0 0 1 0 6.4"/><path d="M19 6.3a8 8 0 0 1 0 11.4"/>',
  legend: '<circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="M11 7h9M11 17h9"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
};
const lineSvg = (n, cls = '') =>
  `<svg class="gcm-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE[n] || ''}</svg>`;
const fillSvg = (d, cls = '') => `<svg class="gcm-ico gcm-ico--fill ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;

const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'];
const STATUS_TEXT = { locked: 'LOCKED', available: 'UP FOR GRABS', owned: 'YOUR TURF', contested: 'UNDER ATTACK' };
const NH_STATUS_TEXT = { locked: 'LOCKED', open: 'OPEN', controlled: 'CONTROLLED' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const polyD = (pts) => 'M' + pts.map((p) => p.join(',')).join('L') + 'Z';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let INSTANCE = 0;

export class CityMap {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.onAction = null;
    this.view = null;
    this.visible = false;
    this.selected = null;
    this.k = 1;
    this.tx = 0;
    this.ty = 0;
    this._fitted = false;
    this._userMoved = false;
    this._pointers = new Map();
    this._anim = null;
    this._uid = `gcm${++INSTANCE}`;
    this._mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = !!this._mq?.matches;

    this._build();
    this._bind();
  }

  /* ================================================================ public API */

  show(view) {
    if (view) this.update(view);
    this.el.hidden = false;
    this.el.classList.remove('is-out');
    this.el.classList.add('is-in');
    this.visible = true;
    this._syncMotion();
    requestAnimationFrame(() => {
      if (!this._fitted) {
        this.fit(false);
        this._fitted = true;
      } else this._apply();
      this._measureLabels();
    });
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this._closeCard();
    this._toggleLog(false);
    this._hideTip();
    this.el.classList.remove('is-in');
    this.el.hidden = true;
    this.svg.pauseAnimations?.();
  }

  update(view) {
    this.view = view || this.view;
    if (!this.view) return;
    const v = this.view;
    const pc = v.playerColors || PLAYER_COLORS;
    this.el.style.setProperty('--pc', pc.primary);
    this.el.style.setProperty('--pc2', pc.accent);
    this._renderTop();
    this._renderTerritories();
    this._renderRoads();
    this._renderNodes();
    this._renderChallenge();
    this._renderLog();
    if (this.selected) {
      if (this._node(this.selected)) this._renderCard(this.selected);
      else this._closeCard();
    }
    if (this.visible) requestAnimationFrame(() => this._measureLabels());
  }

  /** Pan/zoom to a node and open its card. */
  focus(nodeId, { animate = true } = {}) {
    const pos = L.NODES[nodeId];
    if (!pos) return Promise.resolve();
    this._fitted = true; // don't let a pending first-show fit override this
    this._hideTip();
    this._openCard(nodeId);
    const { w, h } = this._size();
    const k = clamp(Math.max(this.k, this._fitK() * 1.9), this._minK(), this._maxK());
    const [cx, cy] = this._focusCenter(w, h);
    return this._animateTo(k, cx - pos[0] * k, cy - pos[1] * k, animate ? 700 : 0);
  }

  /** Animate a node flipping to owned. */
  celebrate(nodeId) {
    const g = this.nodeEls[nodeId];
    const pos = L.NODES[nodeId];
    if (!g || !pos) return Promise.resolve();
    const n = this._node(nodeId);
    if (n && n.status !== 'owned') g.dataset.status = 'owned';
    g.classList.remove('is-celebrate');
    void g.getBoundingClientRect();
    g.classList.add('is-celebrate');

    const fx = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    fx.setAttribute('class', 'gcm-fx');
    fx.setAttribute('transform', `translate(${pos[0]},${pos[1]})`);
    const s = this._markerScale();
    let inner = `<g class="gcm-fx__s" transform="scale(${(s / this.k).toFixed(4)})">`;
    inner += '<circle class="gcm-fx__ring" r="26"/><circle class="gcm-fx__ring gcm-fx__ring--2" r="26"/>';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      inner += `<g transform="rotate(${((a * 180) / Math.PI).toFixed(1)})"><path class="gcm-fx__spark" style="animation-delay:${(i % 3) * 0.06}s" d="M0,-4 L4,0 L0,4 L-4,0Z"/></g>`;
    }
    const label = n?.type === 'boss' ? 'HOOD TAKEN' : n?.type === 'city' ? 'CITY IS YOURS' : 'STREET TAKEN';
    inner += `<g class="gcm-fx__tag"><rect x="-58" y="-62" width="116" height="26" rx="5"/><text y="-43">${label}</text></g>`;
    inner += '</g>';
    fx.innerHTML = inner;
    this.fxLayer.appendChild(fx);
    return new Promise((res) =>
      setTimeout(() => {
        fx.remove();
        g.classList.remove('is-celebrate');
        res();
      }, this.reducedMotion ? 1600 : 2600),
    );
  }

  /** Fit the whole city in view. */
  fit(animate = true) {
    const { w, h } = this._size();
    const b = L.FIT_BOX;
    const k = this._fitK();
    const [cx, cy] = this._fitCenter(w, h);
    const tx = cx - (b.x + b.w / 2) * k;
    const ty = cy - (b.y + b.h / 2) * k;
    this._userMoved = false;
    if (animate) return this._animateTo(k, tx, ty, 500);
    this.k = k;
    this.tx = tx;
    this.ty = ty;
    this._apply();
    return Promise.resolve();
  }

  zoomBy(f, sx, sy) {
    const { w, h } = this._size();
    if (sx == null) [sx, sy] = [w / 2, (h + this._topH()) / 2];
    const k = clamp(this.k * f, this._minK(), this._maxK());
    const r = k / this.k;
    this.tx = sx - (sx - this.tx) * r;
    this.ty = sy - (sy - this.ty) * r;
    this.k = k;
    this._userMoved = true;
    this._apply();
  }

  panBy(dx, dy) {
    this.tx += dx;
    this.ty += dy;
    this._userMoved = true;
    this._apply();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKey);
    this._ro?.disconnect();
    this.el.remove();
  }

  /* ================================================================ DOM build */

  _build() {
    const id = this._uid;
    const el = document.createElement('div');
    el.className = 'gcm-root';
    el.hidden = true;
    el.setAttribute('role', 'application');
    el.setAttribute('aria-label', 'City map');
    el.style.setProperty('--gsun', `url(#${id}-sunset)`);

    const terr = Object.entries(L.TERRITORIES);
    const land = `<path d="${L.LAND_PATH}"/><path d="${L.ISLAND_PATH}"/>`;

    // ---- decoration strings
    const blocks = L.BLOCKS.map(
      (b) => `<rect class="is-${b.tone || 'condo'}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1.5"/>`,
    ).join('');
    const bShadow = L.BUILDINGS.map(
      (b) => `<rect x="${b.x + b.z * 0.7}" y="${b.y + b.z}" width="${b.w}" height="${b.h}" rx="1.5"/>`,
    ).join('');
    const bTops = L.BUILDINGS.map(
      (b) =>
        `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1.5" style="--z:${(b.z / 14).toFixed(2)}"/>` +
        (b.z > 9 ? `<rect class="gcm-bld__roof" x="${b.x + b.w * 0.3}" y="${b.y + b.h * 0.3}" width="${b.w * 0.4}" height="${b.h * 0.4}" rx="1"/>` : ''),
    ).join('');
    const parks = L.PARKS.map(
      ([x, y, rx, ry, r]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})"/>`,
    ).join('');
    // nh1 beach: pier + ferris wheel, umbrellas, palms
    const [px, py, pw, ph] = L.PIER;
    const [fx, fy, fr] = L.FERRIS;
    let spokes = '';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      spokes += `M0,0 L${(Math.cos(a) * fr).toFixed(1)},${(Math.sin(a) * fr).toFixed(1)} `;
    }
    const piers =
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="2"/>` +
      `<rect x="${px - 14}" y="${py + ph - 6}" width="${pw + 28}" height="22" rx="3"/>` +
      `<g class="gcm-ferris" transform="translate(${fx},${fy})"><g class="gcm-ferris__wheel"><circle r="${fr}"/><path d="${spokes}"/>` +
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.39;
        return `<circle class="gcm-ferris__cab" cx="${(Math.cos(a) * fr).toFixed(1)}" cy="${(Math.sin(a) * fr).toFixed(1)}" r="2.6"/>`;
      }).join('') +
      '</g></g>';
    const umbrellas = L.UMBRELLAS.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${c}"/>`).join('');
    const palms = L.PALMS.map(
      ([x, y]) =>
        `<g transform="translate(${x},${y})"><path d="M0,0 l-6,-3 M0,0 l6,-3 M0,0 l-4,5 M0,0 l5,4 M0,0 l0,-7"/></g>`,
    ).join('');
    // nh2 port
    const containers = L.CONTAINERS.map(
      (c) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="1" fill="${c.c}"/>`,
    ).join('');
    const cranes = L.CRANES.map(
      ([x, y]) => `<g transform="translate(${x},${y})"><rect x="-5" y="-8" width="10" height="16" rx="1"/><path d="M0,-5 L34,-5 M0,5 L34,5 M8,-5 L8,5 M20,-5 L20,5 M32,-5 L32,5"/></g>`,
    ).join('');
    const ships = L.SHIPS.map(([x, y, len]) => {
      let deck = '';
      for (let i = 0; i < Math.floor((len - 34) / 12); i++) deck += `<rect x="-7" y="${18 + i * 12}" width="14" height="10" rx="1"/>`;
      return `<g transform="translate(${x},${y})"><path class="gcm-ship__hull" d="M0,0 L11,14 L11,${len} L-11,${len} L-11,14Z"/><g class="gcm-ship__deck">${deck}</g><rect class="gcm-ship__bridge" x="-9" y="${len - 16}" width="18" height="10" rx="1.5"/></g>`;
    }).join('');
    // nh3 neon strip
    const neon =
      `<path class="gcm-neon__glow" d="${L.NEON_STRIP}"/><path class="gcm-neon__road" d="${L.NEON_STRIP}"/><path class="gcm-neon__line" d="${L.NEON_STRIP}"/>` +
      L.NEON_SIGNS.map(([x, y, c]) => `<circle class="gcm-neon__sign" cx="${x}" cy="${y}" r="3.2" style="--nc:${c}"/>`).join('');
    // nh4 hills
    const hills =
      L.CONTOURS.map((d) => `<path class="gcm-contour" d="${d}"/>`).join('') +
      `<g class="gcm-polo"><rect x="${L.POLO[0]}" y="${L.POLO[1]}" width="${L.POLO[2]}" height="${L.POLO[3]}" rx="4"/><path d="M${L.POLO[0] + L.POLO[2] / 2},${L.POLO[1] + 4} v${L.POLO[3] - 8}"/></g>` +
      L.MANSIONS.map(
        (m) =>
          `<g class="gcm-mansion"><rect class="gcm-mansion__lawn" x="${m.x - 6}" y="${m.y - 6}" width="${m.w + 12}" height="${m.h + 18}" rx="4"/><rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="1.5"/>` +
          (m.pool ? `<rect class="gcm-mansion__pool" x="${m.x + 2}" y="${m.y + m.h + 3}" width="${m.w * 0.55}" height="5" rx="1.5"/>` : '') +
          '</g>',
      ).join('') +
      `<g class="gcm-helipad" transform="translate(${L.HELIPAD[0]},${L.HELIPAD[1]})"><circle r="${L.HELIPAD[2]}"/><path d="M-4,-5 v10 M4,-5 v10 M-4,0 h8"/></g>`;
    const boats = L.BOATS.map(
      ([x, y, r]) =>
        `<g transform="translate(${x},${y}) rotate(${r})"><path class="gcm-boat__wake" d="M-2,6 Q-6,22 -12,40 M2,6 Q6,22 12,40"/><path class="gcm-boat__hull" d="M0,-9 L4,-2 L4,7 L-4,7 L-4,-2Z"/></g>`,
    ).join('');

    const hw = L.HIGHWAYS.map(
      (h) =>
        `<path id="${id}-${h.id}" class="gcm-hw__base" d="${h.d}" style="stroke-width:${h.lanes > 1 ? 13 : 9}"/>` +
        `<path class="gcm-hw__line" d="${h.d}"/>`,
    ).join('');
    let traffic = '';
    L.HIGHWAYS.forEach((h, hi) => {
      const n = h.lanes > 1 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const dur = 34 + ((hi * 7 + i * 5) % 18);
        const rev = i % 2 === 1;
        const off = h.lanes > 1 ? (rev ? 2.6 : -2.6) : 0;
        traffic +=
          `<g class="gcm-car ${rev ? 'is-rev' : ''}"><circle r="2.3" cy="${off}"/>` +
          `<animateMotion dur="${dur}s" repeatCount="indefinite" begin="-${((i * dur) / n).toFixed(1)}s" rotate="auto"` +
          (rev ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : '') +
          `><mpath href="#${id}-${h.id}"/></animateMotion></g>`;
      }
    });

    const terrFills = terr
      .map(([tid, t]) => `<path class="gcm-terr" data-terr="${tid}" d="${polyD(t.poly)}"/>`)
      .join('');
    const terrBorders = terr
      .map(([tid, t]) => `<path class="gcm-terr-border" data-terr="${tid}" d="${polyD(t.poly)}"/>`)
      .join('');
    const terrFog = terr.map(([tid, t]) => `<path class="gcm-fog" data-terr="${tid}" d="${polyD(t.poly)}"/>`).join('');
    const terrLabels = terr
      .map(
        ([tid, t]) =>
          `<g class="gcm-tlabel" data-terr="${tid}" transform="translate(${t.label[0]},${t.label[1]})">` +
          `<text class="gcm-tlabel__name" text-anchor="middle"></text>` +
          `<text class="gcm-tlabel__sub" text-anchor="middle" y="20"></text></g>` +
          '',
      )
      .join('');

    const svg = `
<svg class="gcm-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="false">
  <defs>
    <clipPath id="${id}-land">${land}</clipPath>
    <clipPath id="${id}-beachclip"><path d="M330,760 L1110,760 L1175,700 L1260,700 L1260,1000 L330,1000Z"/></clipPath>
    <linearGradient id="${id}-ocean" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b2a4a"/><stop offset=".55" stop-color="#0a1f3d"/><stop offset="1" stop-color="#0d1330"/>
    </linearGradient>
    <radialGradient id="${id}-glint" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffb070" stop-opacity=".32"/><stop offset=".6" stop-color="#ff5fa2" stop-opacity=".08"/><stop offset="1" stop-color="#ff5fa2" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-sunset" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff5fa2"/><stop offset=".55" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ffd36b"/>
    </linearGradient>
    <linearGradient id="${id}-land-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b1f4d"/><stop offset="1" stop-color="#261a40"/>
    </linearGradient>
    <pattern id="${id}-waves" width="90" height="46" patternUnits="userSpaceOnUse">
      <path d="M6,12 q8,-5 16,0 M52,34 q8,-5 16,0 M70,8 q6,-4 12,0 M24,38 q5,-3 10,0" fill="none" stroke="#7ff4ea" stroke-opacity=".16" stroke-width="1.4" stroke-linecap="round"/>
      <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="90 23" dur="60s" repeatCount="indefinite"/>
    </pattern>
    <pattern id="${id}-grid" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
      <path d="M0,0 H26 M0,0 V26" fill="none" stroke="#fff" stroke-opacity=".045" stroke-width="1"/>
    </pattern>
    <pattern id="${id}-fog" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="14" fill="#130c24" fill-opacity=".62"/>
      <path d="M0,0 V14" stroke="#fff" stroke-opacity=".05" stroke-width="5"/>
    </pattern>
    <pattern id="${id}-stripes" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
      <path d="M0,0 V18" stroke="var(--pc2)" stroke-opacity=".16" stroke-width="5"/>
    </pattern>
    <filter id="${id}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <g class="gcm-vp">
    <rect class="gcm-ocean" x="-1600" y="-1600" width="4800" height="4200" fill="url(#${id}-ocean)"/>
    <rect class="gcm-waves" x="-1600" y="-1600" width="4800" height="4200" fill="url(#${id}-waves)"/>
    <ellipse class="gcm-glint" cx="1480" cy="900" rx="420" ry="260" fill="url(#${id}-glint)"/>
    <g class="gcm-boats">${boats}</g>
    <g class="gcm-shallows">${land}</g>
    <g class="gcm-ships">${ships}</g>
    <g class="gcm-piers">${piers}</g>
    <g class="gcm-land" fill="url(#${id}-land-g)">${land}</g>
    <g clip-path="url(#${id}-land)">
      <g class="gcm-terrs">${terrFills}</g>
      <rect class="gcm-gridtex" x="-400" y="-400" width="2400" height="1800" fill="url(#${id}-grid)"/>
      <g class="gcm-parks">${parks}</g>
      <g class="gcm-hills">${hills}</g>
      <g class="gcm-blocks">${blocks}</g>
      <g class="gcm-bld-shadow">${bShadow}</g>
      <g class="gcm-bld">${bTops}</g>
      <g clip-path="url(#${id}-beachclip)"><g class="gcm-beach-coast"><path d="${L.LAND_PATH}"/></g></g>
      <g class="gcm-port"><path class="gcm-port__island" d="${L.ISLAND_PATH}"/></g>
      <g class="gcm-containers">${containers}</g>
      <g class="gcm-neon">${neon}</g>
      <g class="gcm-turf"></g>
    </g>
    <g class="gcm-water"><path d="${L.RIVER_PATH}"/><path d="${L.CANAL_PATH}"/></g>
    <g class="gcm-cranes">${cranes}</g>
    <g class="gcm-hw">${hw}</g>
    <g class="gcm-traffic">${traffic}</g>
    <g class="gcm-umbrellas">${umbrellas}</g>
    <g class="gcm-palms">${palms}</g>
    <g clip-path="url(#${id}-land)"><g class="gcm-borders">${terrBorders}</g></g>
    <g class="gcm-roads"></g>
    <g clip-path="url(#${id}-land)"><g class="gcm-fogs" style="--fog:url(#${id}-fog)">${terrFog}</g></g>
    <g class="gcm-tlabels">${terrLabels}</g>
    <g class="gcm-nodes"></g>
    <g class="gcm-fxl"></g>
  </g>
</svg>`;

    el.innerHTML = `
<div class="gcm-bg"></div>
${svg}
<div class="gcm-vignette"></div>
<header class="gcm-top">
  <div class="gcm-top__gang">
    <span class="gcm-top__chip"></span>
    <div class="gcm-top__gangtext">
      <span class="gcm-top__kicker">HUSTLER MODE · <b data-f="game">GAME 1</b></span>
      <b class="gcm-top__name" data-f="gang">YOUR GANG</b>
    </div>
  </div>
  <div class="gcm-top__right">
    <div class="gcm-top__money">
      <span class="gcm-top__cash" data-f="cash">$0</span>
      <span class="gcm-top__inc" data-f="income">+$0 / GAME</span>
    </div>
    <nav class="gcm-top__btns">
      <button class="gcm-btn gcm-btn--hot" data-act="puzzles" type="button">${lineSvg('puzzle')}<span>PUZZLES</span><i class="gcm-badge" data-f="puz"></i></button>
      <button class="gcm-btn" data-ui="log" type="button" aria-expanded="false">${lineSvg('log')}<span>NEWS</span><i class="gcm-badge gcm-badge--dim" data-f="logn"></i></button>
      <button class="gcm-btn" data-act="stats" type="button">${lineSvg('stats')}<span>STATS</span></button>
      <button class="gcm-btn" data-act="audio" type="button">${lineSvg('audio')}<span>AUDIO</span></button>
      <button class="gcm-btn" data-act="menu" type="button">${lineSvg('menu')}<span>MENU</span></button>
    </nav>
  </div>
</header>
<section class="gcm-chal" hidden aria-live="polite"></section>
<aside class="gcm-legend is-collapsed">
  <button class="gcm-legend__head" type="button" data-ui="legend" aria-expanded="false">${lineSvg('legend')}<span>MAP KEY</span>${lineSvg('chev', 'gcm-legend__chev')}</button>
  <div class="gcm-legend__body"></div>
</aside>
<div class="gcm-zoom">
  <button class="gcm-zbtn" type="button" data-ui="zin" aria-label="Zoom in">${lineSvg('plus')}</button>
  <button class="gcm-zbtn" type="button" data-ui="zout" aria-label="Zoom out">${lineSvg('minus')}</button>
  <button class="gcm-zbtn" type="button" data-ui="fit" aria-label="Fit city">${lineSvg('fit')}</button>
</div>
<div class="gcm-tip" hidden></div>
<aside class="gcm-card" aria-hidden="true"><div class="gcm-card__screen"></div></aside>
<aside class="gcm-log" aria-hidden="true">
  <div class="gcm-log__head"><span class="gcm-log__kicker">VICE CITY WIRE</span><b>STREET NEWS</b>
    <button class="gcm-x" type="button" data-ui="logclose" aria-label="Close news">${lineSvg('close')}</button></div>
  <ol class="gcm-log__list"></ol>
</aside>`;
    this.rootEl.appendChild(el);
    this.el = el;
    this.svg = el.querySelector('.gcm-svg');
    this.vp = el.querySelector('.gcm-vp');
    this.nodesLayer = el.querySelector('.gcm-nodes');
    this.roadsLayer = el.querySelector('.gcm-roads');
    this.turfLayer = el.querySelector('.gcm-turf');
    this.fxLayer = el.querySelector('.gcm-fxl');
    this.card = el.querySelector('.gcm-card');
    this.cardScreen = el.querySelector('.gcm-card__screen');
    this.tip = el.querySelector('.gcm-tip');
    this.chal = el.querySelector('.gcm-chal');
    this.logEl = el.querySelector('.gcm-log');
    this.legend = el.querySelector('.gcm-legend');
    this.f = {};
    el.querySelectorAll('[data-f]').forEach((n) => (this.f[n.dataset.f] = n));

    // legend (mini markers drawn with the same CSS as the map)
    const lm = (status, type, label) =>
      `<li><svg viewBox="-24 -24 48 48" class="gcm-legend__m"><g class="gcm-node" data-status="${status}" data-type="${type}">${this._markerInner(type, status, true)}</g></svg><span>${label}</span></li>`;
    el.querySelector('.gcm-legend__body').innerHTML = `<ul>
      ${lm('available', 'street', 'Up for grabs')}
      ${lm('owned', 'street', 'Your turf')}
      ${lm('contested', 'street', 'Under attack — defend it')}
      ${lm('locked', 'street', 'Locked')}
      ${lm('available', 'boss', 'Neighborhood boss')}
      ${lm('available', 'city', 'City boss')}
      <li><span class="gcm-legend__sw gcm-legend__sw--mine"></span><span>Controlled neighborhood</span></li>
      <li><span class="gcm-legend__sw gcm-legend__sw--rival"></span><span>Rival territory</span></li>
      <li><span class="gcm-legend__sw gcm-legend__sw--fog"></span><span>Locked territory</span></li>
    </ul>
    <p class="gcm-legend__keys"><kbd>Drag</kbd> pan · <kbd>Wheel</kbd> zoom · <kbd>Esc</kbd> close</p>`;
    if (typeof innerWidth === 'number' && innerWidth > 1100 && innerHeight > 820) this._toggleLegend(true);

    // node markers (created once; data-status drives the look)
    this.nodeEls = {};
    for (const [nid, [x, y]] of Object.entries(L.NODES)) {
      const type = nid === 'city_boss' ? 'city' : nid.endsWith('_boss') ? 'boss' : 'street';
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'gcm-node');
      g.setAttribute('transform', `translate(${x},${y})`);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.dataset.node = nid;
      g.dataset.type = type;
      g.dataset.status = 'locked';
      g.style.display = 'none';
      g.innerHTML = `<g class="gcm-node__s">${this._markerInner(type, 'locked', false)}
        <g class="gcm-node__label" transform="translate(0,${type === 'city' ? 44 : type === 'boss' ? 36 : 27})">
          <rect class="gcm-node__lbg" x="-30" y="-9" width="60" height="18" rx="4"/>
          <text class="gcm-node__ltxt" y="4.6" text-anchor="middle"></text></g></g>`;
      this.nodesLayer.appendChild(g);
      this.nodeEls[nid] = g;
    }
  }

  /** Inner marker graphics for a node type; status-specific parts are toggled via CSS. */
  _markerInner(type, status, legend) {
    const R = type === 'city' ? 25 : type === 'boss' ? 18 : 12;
    let body;
    if (type === 'city') body = `<rect class="gcm-node__body" x="${-R * 0.78}" y="${-R * 0.78}" width="${R * 1.56}" height="${R * 1.56}" rx="7" transform="rotate(45)"/>`;
    else body = `<circle class="gcm-node__body" r="${R}"/>`;
    const is = type === 'city' ? 1.15 : type === 'boss' ? 0.92 : 0.66;
    const icon = (name, d) =>
      `<path class="gcm-node__icon gcm-node__icon--${name}" fill-rule="evenodd" transform="translate(${-12 * is},${-12 * is}) scale(${is})" d="${d}"/>`;
    const hub = legend ? 0.8 : 1;
    return `<g class="gcm-node__b" ${legend ? `transform="scale(${type === 'city' ? 0.62 : type === 'boss' ? 0.8 : 1})"` : ''}>
      ${legend ? '' : `<circle class="gcm-node__hit" r="${R + 12}"/>`}
      <circle class="gcm-node__halo" r="${(R + 9) * hub}"/>
      <circle class="gcm-node__ring" r="${R + 5}"/>
      <circle class="gcm-node__target" r="${R + 11}"/>
      ${type === 'city' ? `<circle class="gcm-node__crownring" r="${R + 3}"/>` : ''}
      ${body}
      ${icon('lock', ICONS.lock)}
      ${icon('go', type === 'street' ? ICONS.pawn : ICONS.crown)}
      ${icon('flag', ICONS.flag)}
      <g class="gcm-node__warn" transform="translate(${R * 0.78},${-R * 0.9})"><circle r="7"/><path d="M-.9,-3.6 h1.8 l-.3,4.3 h-1.2z M-1,1.8 h2 v2 h-2z"/></g>
      ${type !== 'street' ? `<g class="gcm-node__stars" transform="translate(0,${-R - 7})">${[-1, 0, 1].map((i) => `<path transform="translate(${i * 9 - 4},-4) scale(.34)" d="${STAR_PATH}"/>`).join('')}</g>` : ''}
    </g>`;
  }

  /* ================================================================ events */

  _bind() {
    const el = this.el;
    // HTML buttons
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !el.contains(b)) return;
      if (b.disabled) return;
      const act = b.dataset.act;
      if (act) {
        const payload = b.dataset.node ? { nodeId: b.dataset.node } : b.dataset.chal ? { challengeId: b.dataset.chal } : undefined;
        this._emit(act, payload);
        return;
      }
      switch (b.dataset.ui) {
        case 'zin': return this.zoomBy(1.35);
        case 'zout': return this.zoomBy(1 / 1.35);
        case 'fit': return this.fit(true);
        case 'close': return this._closeCard();
        case 'log': return this._toggleLog();
        case 'logclose': return this._toggleLog(false);
        case 'legend': return this._toggleLegend();
        case 'showtarget': return this.view?.challenge && this.focus(this.view.challenge.targetNodeId);
      }
    });

    // pointer pan / pinch / click
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button > 0) return;
      this._stopAnim();
      const nodeEl = e.target.closest?.('.gcm-node[data-node]');
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._down = { x: e.clientX, y: e.clientY, node: nodeEl?.dataset.node || null, moved: false, type: e.pointerType };
      } else {
        if (this._down) this._down.moved = true;
        this._pinch = this._pinchState();
      }
      try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    svg.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') this._hoverAt(e);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this._pointers.size >= 2) {
        const s = this._pinchState();
        if (this._pinch && s) {
          const f = s.d / (this._pinch.d || 1);
          const rect = svg.getBoundingClientRect();
          this.tx += s.x - this._pinch.x;
          this.ty += s.y - this._pinch.y;
          this.zoomBy(f, s.x - rect.left, s.y - rect.top);
        }
        this._pinch = s;
        return;
      }
      if (!this._down) return;
      if (!this._down.moved && Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > 5) {
        this._down.moved = true;
        this.el.classList.add('is-dragging');
        this._hideTip();
      }
      if (this._down.moved) this.panBy(dx, dy);
    });
    const up = (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinch = null;
      if (this._pointers.size === 0) {
        const d = this._down;
        this._down = null;
        this.el.classList.remove('is-dragging');
        if (d && !d.moved && e.type === 'pointerup') {
          if (d.node) this._select(d.node);
          else if (this.selected) this._closeCard();
        }
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && !this._pointers.size && this._hideTip());
    svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this._stopAnim();
        const rect = svg.getBoundingClientRect();
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.zoomBy(Math.exp(-dy * 0.0016), e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );
    // keyboard selection on focused markers
    svg.addEventListener('keydown', (e) => {
      const n = e.target.closest?.('.gcm-node[data-node]');
      if (n && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.stopPropagation();
        this._select(n.dataset.node);
      }
    });
    svg.addEventListener('focusin', (e) => {
      const n = e.target.closest?.('.gcm-node[data-node]');
      if (n) this._showTip(n.dataset.node);
    });
    svg.addEventListener('focusout', () => this._hideTip());

    // global keys (only while visible)
    this._onKey = (e) => {
      if (!this.visible) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let handled = true;
      switch (e.key) {
        case 'Escape':
          if (this.logEl.classList.contains('is-open')) this._toggleLog(false);
          else if (this.selected) this._closeCard();
          else handled = false;
          break;
        case 'ArrowLeft': this.panBy(70, 0); break;
        case 'ArrowRight': this.panBy(-70, 0); break;
        case 'ArrowUp': this.panBy(0, 70); break;
        case 'ArrowDown': this.panBy(0, -70); break;
        case '+': case '=': this.zoomBy(1.25); break;
        case '-': case '_': this.zoomBy(0.8); break;
        case '0': this.fit(true); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', this._onKey);

    // resize: keep the city fitted unless the user moved it; otherwise keep centre
    if (typeof ResizeObserver === 'function') {
      let last = null;
      this._ro = new ResizeObserver(() => {
        const s = this._size();
        if (!this.visible || !s.w) return;
        if (last && (last.w !== s.w || last.h !== s.h)) {
          if (!this._userMoved) this.fit(false);
          else {
            this.tx += (s.w - last.w) / 2;
            this.ty += (s.h - last.h) / 2;
            this._apply();
          }
        }
        last = s;
      });
      this._ro.observe(this.el);
    }
    this._mq?.addEventListener?.('change', () => {
      this.reducedMotion = this._mq.matches;
      this._syncMotion();
    });
    document.fonts?.ready?.then(() => this._measureLabels());
  }

  _emit(name, payload) {
    if (typeof this.onAction === 'function') this.onAction(name, payload);
  }

  _pinchState() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  _syncMotion() {
    this.el.classList.toggle('is-reduced', this.reducedMotion);
    if (!this.svg.pauseAnimations) return;
    if (this.reducedMotion || !this.visible) this.svg.pauseAnimations();
    else this.svg.unpauseAnimations();
  }

  /* ================================================================ camera */

  _size() {
    const r = this.el.getBoundingClientRect();
    return { w: r.width || innerWidth, h: r.height || innerHeight };
  }
  _isNarrow() {
    return this._size().w <= 640;
  }
  _topH() {
    const t = this.el.querySelector('.gcm-top');
    let h = t ? t.getBoundingClientRect().height : 64;
    if (!this.chal.hidden) {
      const r = this.chal.getBoundingClientRect();
      if (r.height) h = Math.max(h, r.bottom - this.el.getBoundingClientRect().top + 4);
    }
    return h;
  }
  _cardW() {
    if (!this.selected || this._isNarrow()) return 0;
    return this.card.getBoundingClientRect().width + 24;
  }
  _fitK() {
    const { w, h } = this._size();
    const b = L.FIT_BOX;
    const pad = this._isNarrow() ? 8 : 28;
    const aw = Math.max(100, w - pad * 2);
    const ah = Math.max(100, h - this._topH() - pad * 2);
    return Math.min(aw / b.w, ah / b.h);
  }
  _fitCenter(w, h) {
    return [w / 2, (h + this._topH()) / 2];
  }
  _focusCenter(w, h) {
    const cw = this._cardW();
    if (this._isNarrow()) {
      const sheet = Math.min(h * 0.62, this.card.getBoundingClientRect().height || h * 0.6);
      return [w / 2, this._topH() + (h - this._topH() - sheet) / 2];
    }
    return [(w - cw) / 2, (h + this._topH()) / 2];
  }
  _minK() {
    return this._fitK() * 0.7;
  }
  _maxK() {
    return Math.max(3, this._fitK() * 5);
  }
  _markerScale() {
    // markers keep ~constant screen size; they grow a little when zoomed in
    return clamp(Math.pow(this.k, 0.35), 0.72, 1.3);
  }

  _clampPan() {
    const { w, h } = this._size();
    const b = L.FIT_BOX;
    // keep at least part of the city on screen; generous so edge nodes can be centred beside the card
    const mx = w * 0.6;
    const my = h * 0.6;
    this.tx = clamp(this.tx, w - (b.x + b.w) * this.k - mx, -b.x * this.k + mx);
    this.ty = clamp(this.ty, h - (b.y + b.h) * this.k - my, -b.y * this.k + my);
  }

  _apply() {
    if (!this._anim) this._clampPan();
    this.vp.setAttribute('transform', `translate(${this.tx.toFixed(2)},${this.ty.toFixed(2)}) scale(${this.k.toFixed(5)})`);
    const s = (this._markerScale() / this.k).toFixed(4);
    if (s !== this._lastS) {
      this._lastS = s;
      for (const g of Object.values(this.nodeEls)) g.firstElementChild.setAttribute('transform', `scale(${s})`);
      this.fxLayer.querySelectorAll('.gcm-fx__s').forEach((g) => g.setAttribute('transform', `scale(${s})`));
    }
    this.el.classList.toggle('is-far', this.k < 0.55);
    if (this._tipNode) this._positionTip(this._tipNode);
  }

  _animateTo(k, tx, ty, dur) {
    this._stopAnim();
    if (this.reducedMotion || !this.visible || dur <= 0) {
      this.k = k;
      this.tx = tx;
      this.ty = ty;
      this._apply();
      return Promise.resolve();
    }
    const from = { k: this.k, tx: this.tx, ty: this.ty };
    const t0 = performance.now();
    return new Promise((res) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = ease(t);
        // interpolate in screen space around the target for a stable zoom path
        this.k = from.k + (k - from.k) * e;
        this.tx = from.tx + (tx - from.tx) * e;
        this.ty = from.ty + (ty - from.ty) * e;
        this._anim = t < 1 ? requestAnimationFrame(step) : null;
        this._apply();
        if (t >= 1) res();
      };
      this._anim = requestAnimationFrame(step);
      this._animRes = res;
    });
  }
  _stopAnim() {
    if (this._anim) {
      cancelAnimationFrame(this._anim);
      this._anim = null;
      this._animRes?.();
    }
  }

  /* ================================================================ render */

  _node(id) {
    return this.view?.nodes?.find((n) => n.id === id) || null;
  }
  _nh(id) {
    return this.view?.neighborhoods?.find((n) => n.id === id) || null;
  }
  _nhColors(nh) {
    return nh?.colors || FALLBACK_NH_COLORS[nh?.id] || FALLBACK_NH_COLORS.nh1;
  }

  _renderTop() {
    const v = this.view;
    this.f.gang.textContent = v.gangName || 'Your Gang';
    this.f.game.textContent = `GAME ${v.gameNo ?? 1}`;
    this.f.cash.textContent = money(v.cash);
    this.f.income.textContent = `+${money(v.incomePerGame)} / GAME`;
    this.f.income.classList.toggle('is-zero', !v.incomePerGame);
    const u = v.puzzles?.unsolved ?? 0;
    this.f.puz.textContent = u > 99 ? '99+' : u ? String(u) : '';
    this.f.puz.hidden = !u;
    const pb = this.el.querySelector('[data-act="puzzles"]');
    pb.title = v.puzzles?.rewardHint ? `Solve puzzles for cash — ${v.puzzles.rewardHint}` : 'Solve chess puzzles for extra cash';
    const n = v.log?.length || 0;
    this.f.logn.textContent = n ? String(Math.min(n, 99)) : '';
    this.f.logn.hidden = !n;
  }

  _renderTerritories() {
    const v = this.view;
    const byId = Object.fromEntries((v.neighborhoods || []).map((n) => [n.id, n]));
    // downtown may not be listed; derive its status from city_boss
    for (const tid of Object.keys(L.TERRITORIES)) {
      let nh = byId[tid];
      if (!nh && tid === 'downtown') {
        const cb = this._node('city_boss');
        nh = { id: 'downtown', name: cb?.name || 'Downtown', status: !cb || cb.status === 'locked' ? 'locked' : cb.status === 'owned' ? 'controlled' : 'open', owned: cb?.status === 'owned' ? 1 : 0, total: 1 };
      }
      const status = nh?.status || 'locked';
      const col = this._nhColors(nh || { id: tid });
      this.el.querySelectorAll(`[data-terr="${tid}"]`).forEach((n) => {
        n.dataset.status = status;
        n.style.setProperty('--tc', col.primary);
        n.style.setProperty('--ta', col.accent);
      });
      const lab = this.el.querySelector(`.gcm-tlabel[data-terr="${tid}"]`);
      lab.querySelector('.gcm-tlabel__name').textContent = (nh?.name || tid).toUpperCase();
      let sub = NH_STATUS_TEXT[status] || '';
      if (status === 'open' && nh?.total) sub = `${nh.owned || 0}/${nh.total} STREETS HELD`;
      if (status === 'controlled') sub = '★ CONTROLLED ★';
      if (status === 'locked' && nh?.vibe) sub = `LOCKED · ${String(nh.vibe).toUpperCase()}`;
      lab.querySelector('.gcm-tlabel__sub').textContent = sub;
    }

    // turf blobs under owned nodes
    let turf = '';
    for (const n of v.nodes || []) {
      const p = L.NODES[n.id];
      if (!p || (n.status !== 'owned' && n.status !== 'contested')) continue;
      const r = n.type === 'city' ? 120 : n.type === 'boss' ? 95 : 70;
      turf += `<circle class="gcm-turf__blob ${n.status === 'contested' ? 'is-contested' : ''}" cx="${p[0]}" cy="${p[1]}" r="${r}"/>`;
    }
    this.turfLayer.innerHTML = turf;
  }

  _renderRoads() {
    const st = {};
    for (const n of this.view.nodes || []) st[n.id] = n.status;
    let base = '';
    let top = '';
    for (const [a, b, bend] of L.ROADS) {
      const A = L.NODES[a];
      const B = L.NODES[b];
      if (!A || !B || !st[a] || !st[b]) continue;
      const mx = (A[0] + B[0]) / 2;
      const my = (A[1] + B[1]) / 2;
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx + (-dy / len) * bend;
      const cy = my + (dx / len) * bend;
      const d = `M${A[0]},${A[1]} Q${cx.toFixed(1)},${cy.toFixed(1)} ${B[0]},${B[1]}`;
      const mine = (s) => s === 'owned' || s === 'contested';
      const cls = mine(st[a]) && mine(st[b]) ? 'is-mine' : st[a] === 'locked' || st[b] === 'locked' ? 'is-locked' : 'is-open';
      base += `<path class="gcm-road__base ${cls}" d="${d}"/>`;
      top += `<path class="gcm-road__line ${cls}" d="${d}"/>`;
    }
    this.roadsLayer.innerHTML = base + top;
  }

  _renderNodes() {
    const v = this.view;
    const seen = new Set();
    const target = v.challenge?.targetNodeId;
    for (const n of v.nodes || []) {
      const g = this.nodeEls[n.id];
      if (!g) {
        if (!this._warned?.[n.id]) {
          (this._warned ||= {})[n.id] = 1;
          console.warn(`[CityMap] no layout position for node "${n.id}"`);
        }
        continue;
      }
      seen.add(n.id);
      g.style.display = '';
      g.dataset.status = n.status || 'locked';
      g.dataset.type = n.type || g.dataset.type;
      g.classList.toggle('is-target', n.id === target);
      g.classList.toggle('is-selected', n.id === this.selected);
      const stars = g.querySelectorAll('.gcm-node__stars path');
      const nStars = n.type === 'city' ? 3 : 2;
      stars.forEach((s, i) => s.classList.toggle('is-on', i < nStars || (i === 1 && n.type !== 'street')));
      const t = g.querySelector('.gcm-node__ltxt');
      const name = String(n.name || n.id).toUpperCase();
      if (t.textContent !== name) {
        t.textContent = name;
        g._lw = 0;
      }
      g.setAttribute('aria-label', `${n.name || n.id} — ${STATUS_TEXT[n.status] || n.status}${n.leader?.alias ? ', leader ' + n.leader.alias : ''}`);
    }
    for (const [id, g] of Object.entries(this.nodeEls)) if (!seen.has(id)) g.style.display = 'none';
  }

  _measureLabels() {
    for (const g of Object.values(this.nodeEls)) {
      if (g.style.display === 'none') continue;
      const t = g.querySelector('.gcm-node__ltxt');
      let w = 0;
      try { w = t.getComputedTextLength(); } catch { /* ignore */ }
      if (!w) w = t.textContent.length * 6.2;
      const r = g.querySelector('.gcm-node__lbg');
      r.setAttribute('x', (-w / 2 - 6).toFixed(1));
      r.setAttribute('width', (w + 12).toFixed(1));
    }
  }

  _renderChallenge() {
    const c = this.view.challenge;
    if (!c) {
      this.chal.hidden = true;
      this.chal.innerHTML = '';
      this.el.classList.remove('has-chal');
      return;
    }
    const target = this._node(c.targetNodeId);
    const a = c.attacker || {};
    const left = c.gamesLeft;
    this.chal.hidden = false;
    this.el.classList.add('has-chal');
    this.chal.innerHTML = `
      <div class="gcm-chal__lights" aria-hidden="true"></div>
      ${this._portrait(a.portrait, 'sm')}
      <div class="gcm-chal__txt">
        <span class="gcm-chal__kicker">${fillSvg(ICONS.warn)} TURF WAR${left != null ? ` · ${left} GAME${left === 1 ? '' : 'S'} LEFT` : ''}</span>
        <b class="gcm-chal__who">${esc(a.alias ? `“${a.alias}”` : a.name || 'A rival')} ${a.gangName ? `<em>of ${esc(a.gangName)}</em>` : ''}</b>
        <p class="gcm-chal__msg">${esc(c.message || `wants ${target?.name || 'your turf'}.`)}</p>
        ${target ? `<span class="gcm-chal__tgt">${lineSvg('pin')} ${esc(target.name)}</span>` : ''}
      </div>
      <div class="gcm-chal__btns">
        <button class="gcm-cta gcm-cta--sm gcm-cta--defend" type="button" data-act="defend" data-chal="${esc(c.id)}">DEFEND</button>
        <button class="gcm-btn gcm-btn--ghost" type="button" data-ui="showtarget">${lineSvg('pin')}<span>SHOW</span></button>
      </div>`;
  }

  _renderLog() {
    const log = this.view.log || [];
    this.logEl.querySelector('.gcm-log__list').innerHTML = log.length
      ? log.map((e) => `<li><span class="gcm-log__g">GAME ${esc(e.gameNo)}</span><p>${esc(e.text)}</p></li>`).join('')
      : '<li class="is-empty"><p>Quiet on the streets. For now.</p></li>';
  }

  _toggleLog(force) {
    const open = force ?? !this.logEl.classList.contains('is-open');
    this.logEl.classList.toggle('is-open', open);
    this.logEl.setAttribute('aria-hidden', String(!open));
    this.el.querySelector('[data-ui="log"]').setAttribute('aria-expanded', String(open));
    if (open && this._isNarrow()) this._closeCard();
  }
  _toggleLegend(force) {
    const open = force ?? this.legend.classList.contains('is-collapsed');
    this.legend.classList.toggle('is-collapsed', !open);
    this.legend.querySelector('[data-ui="legend"]').setAttribute('aria-expanded', String(open));
  }

  /* ---------------- tooltip */

  _hoverAt(e) {
    const n = e.target.closest?.('.gcm-node[data-node]');
    const id = n?.dataset.node || null;
    if (id === this._tipNode) return;
    if (id) this._showTip(id);
    else this._hideTip();
  }
  _showTip(id) {
    const n = this._node(id);
    if (!n) return;
    this._tipNode = id;
    const nh = this._nh(n.neighborhoodId);
    const kind = n.type === 'city' ? 'CITY BOSS' : n.type === 'boss' ? 'NEIGHBORHOOD BOSS' : 'STREET';
    this.tip.innerHTML = `<span class="gcm-tip__k">${kind}${nh ? ' · ' + esc(nh.name) : ''}</span>
      <b>${esc(n.name)}</b>
      <span class="gcm-tip__row"><i class="gcm-dot" data-status="${esc(n.status)}"></i>${STATUS_TEXT[n.status] || esc(n.status)}${n.leader?.alias ? ` · “${esc(n.leader.alias)}”` : ''}</span>
      ${n.status === 'owned' && n.income ? `<span class="gcm-tip__inc">+${money(n.income)} / game</span>` : ''}`;
    this.tip.hidden = false;
    this._positionTip(id);
  }
  _positionTip(id) {
    const p = L.NODES[id];
    if (!p) return;
    const { w } = this._size();
    const x = this.tx + p[0] * this.k;
    const y = this.ty + p[1] * this.k;
    const tw = this.tip.offsetWidth || 180;
    const off = 30 * this._markerScale();
    this.tip.style.left = `${clamp(x - tw / 2, 8, w - tw - 8)}px`;
    this.tip.style.top = `${y - off - (this.tip.offsetHeight || 60) - 4}px`;
  }
  _hideTip() {
    this._tipNode = null;
    this.tip.hidden = true;
  }

  /* ---------------- card */

  _select(id) {
    if (!this._node(id)) return;
    this._hideTip();
    this._openCard(id);
    // nudge the camera so the node isn't under the card
    const p = L.NODES[id];
    const { w, h } = this._size();
    const x = this.tx + p[0] * this.k;
    const y = this.ty + p[1] * this.k;
    const cw = this._cardW();
    let dx = 0;
    let dy = 0;
    if (this._isNarrow()) {
      const sheetTop = h - Math.min(h * 0.64, this.card.getBoundingClientRect().height || h * 0.6);
      if (y > sheetTop - 50) dy = sheetTop - 50 - y - 40;
      if (y < this._topH() + 40) dy = this._topH() + 60 - y;
    } else if (x > w - cw - 60) dx = w - cw - 120 - x;
    if (dx || dy) this._animateTo(this.k, this.tx + dx, this.ty + dy, 380);
  }

  _openCard(id) {
    const prev = this.selected;
    this.selected = id;
    Object.entries(this.nodeEls).forEach(([nid, g]) => g.classList.toggle('is-selected', nid === id));
    this._renderCard(id);
    this.card.classList.add('is-open');
    this.card.setAttribute('aria-hidden', 'false');
    this.el.classList.add('has-card');
    if (this._isNarrow()) this._toggleLog(false);
    if (prev !== id) this.cardScreen.querySelector('.gcm-card__body')?.scrollTo?.(0, 0);
  }

  _closeCard() {
    if (!this.selected) return;
    this.selected = null;
    Object.values(this.nodeEls).forEach((g) => g.classList.remove('is-selected'));
    this.card.classList.remove('is-open');
    this.card.setAttribute('aria-hidden', 'true');
    this.el.classList.remove('has-card');
  }

  _portrait(p, size = 'lg') {
    p = p || {};
    const bg = p.bg || '#3a2a66';
    const fg = p.fg || '#fff';
    return `<div class="gcm-por gcm-por--${size}" style="--pbg:${esc(bg)};--pfg:${esc(fg)}">
      <span class="gcm-por__ini">${esc(p.initials || '??')}</span>
      ${p.emoji ? `<span class="gcm-por__emo">${esc(p.emoji)}</span>` : ''}</div>`;
  }

  _army(army, withKing = true) {
    const a = army || {};
    const items = [];
    if (withKing) items.push(['k', 1]);
    for (const t of PIECE_ORDER) if (a[t]) items.push([t, a[t]]);
    return `<ul class="gcm-army">${items
      .map(
        ([t, c]) =>
          `<li title="${esc(PIECE_NAMES[t] || t)}"><span class="gcm-army__ico gcm-army__ico--${t}">${pieceSvg(t)}</span><b>×${c}</b><small>${esc(PIECE_NAMES[t] || t)}</small></li>`,
      )
      .join('')}</ul>`;
  }

  _stars(n) {
    const d = clamp(Math.round(n || 0), 0, 5);
    let s = '';
    for (let i = 0; i < 5; i++) s += `<svg class="gcm-star ${i < d ? 'is-on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
    return `<span class="gcm-stars" aria-label="Difficulty ${d} of 5">${s}</span>`;
  }

  _lockReason(n) {
    if (n.lockReason) return n.lockReason;
    const nh = this._nh(n.neighborhoodId);
    if (n.type === 'city') return 'Control every neighborhood before the City Boss will take your call.';
    if (nh && nh.status === 'locked') return `${nh.name} is off-limits for now. Take over a neighboring hood to get in.`;
    if (n.type === 'boss') return `Hold all ${nh?.total || 3} streets in ${nh?.name || 'this neighborhood'} to call out the boss.`;
    return 'Not reachable yet.';
  }

  _renderCard(id) {
    const n = this._node(id);
    if (!n) return;
    const v = this.view;
    const nh = this._nh(n.neighborhoodId);
    const L_ = n.leader || {};
    const col = this._nhColors(nh || { id: n.neighborhoodId });
    const chal = v.challenge && v.challenge.targetNodeId === id ? v.challenge : null;
    const kind = n.type === 'city' ? 'CITY BOSS' : n.type === 'boss' ? 'NEIGHBORHOOD BOSS' : 'STREET';
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const status = n.status || 'locked';

    // action
    let action = '';
    if (status === 'available') {
      const label = n.type === 'city' ? 'FACE THE CITY BOSS' : n.type === 'boss' ? 'TAKE THE NEIGHBORHOOD' : 'HIT THE STREET';
      action = `<button class="gcm-cta ${n.type !== 'street' ? 'gcm-cta--boss' : ''}" type="button" data-act="play" data-node="${esc(id)}">${label}${lineSvg('chev')}</button>`;
    } else if (status === 'contested' && chal) {
      action = `<button class="gcm-cta gcm-cta--defend" type="button" data-act="defend" data-chal="${esc(chal.id)}">DEFEND ${esc(n.name).toUpperCase()}</button>`;
    } else if (status === 'contested') {
      action = `<div class="gcm-note gcm-note--warn">${fillSvg(ICONS.warn)}<span>Rivals are circling this block.</span></div>`;
    } else if (status === 'owned') {
      action = `<div class="gcm-note gcm-note--mine">${fillSvg(ICONS.flag)}<span>Your turf${n.ownedSince != null ? ` since game ${esc(n.ownedSince)}` : ''} · paying <b>+${money(n.income)}</b> every game.</span></div>`;
    } else {
      action = `<button class="gcm-cta is-locked" type="button" disabled>${fillSvg(ICONS.lock)} LOCKED</button>
        <p class="gcm-card__reason">${esc(this._lockReason(n))}</p>`;
    }

    const bounty = n.captureBounty || {};
    const bountyItems = PIECE_ORDER.filter((t) => bounty[t]).map(
      (t) => `<li title="${esc(PIECE_NAMES[t])}">${pieceSvg(t)}<b>${money(bounty[t])}</b></li>`,
    );

    const chalBlock = chal
      ? `<section class="gcm-card__sec gcm-card__chal">
          <h4>${fillSvg(ICONS.warn)} INCOMING · ${chal.gamesLeft != null ? `${esc(chal.gamesLeft)} GAME${chal.gamesLeft === 1 ? '' : 'S'} LEFT` : 'NOW'}</h4>
          <div class="gcm-lead gcm-lead--sm">${this._portrait(chal.attacker?.portrait, 'sm')}
            <div><b>${esc(chal.attacker?.name || 'Rival')}</b><span>${chal.attacker?.alias ? `“${esc(chal.attacker.alias)}” · ` : ''}${esc(chal.attacker?.gangName || '')}</span></div></div>
          ${chal.message ? `<p class="gcm-sms">${esc(chal.message)}</p>` : ''}
          <div class="gcm-card__lbl">THEIR CREW</div>${this._army(chal.army)}
        </section>`
      : '';

    this.cardScreen.innerHTML = `
      <div class="gcm-sb"><span>${time}</span><span class="gcm-sb__notch"></span><span class="gcm-sb__r">${signalSvg()}${batterySvg()}</span></div>
      <button class="gcm-x gcm-card__x" type="button" data-ui="close" aria-label="Close">${lineSvg('close')}</button>
      <div class="gcm-card__grab" aria-hidden="true"></div>
      <div class="gcm-card__body">
        <header class="gcm-card__head" style="--tc:${esc(col.primary)}">
          <span class="gcm-card__kicker">${esc(nh?.name || '')}${nh ? ' · ' : ''}${kind}</span>
          <h3>${esc(n.name)}</h3>
          <div class="gcm-card__chips">
            <span class="gcm-chip" data-status="${esc(status)}">${STATUS_TEXT[status] || esc(status)}</span>
            ${n.tier != null ? `<span class="gcm-chip gcm-chip--dim">TIER ${esc(n.tier)}</span>` : ''}
          </div>
          ${n.blurb ? `<p class="gcm-card__blurb">${esc(n.blurb)}</p>` : ''}
        </header>
        <section class="gcm-card__sec">
          <div class="gcm-lead">${this._portrait(L_.portrait)}
            <div class="gcm-lead__txt">
              <b>${esc(L_.name || 'Unknown')}</b>
              ${L_.alias ? `<span class="gcm-lead__alias">“${esc(L_.alias)}”</span>` : ''}
              <span class="gcm-lead__meta">${esc(L_.title || '')}${L_.title && L_.gangName ? ' · ' : ''}${esc(L_.gangName || '')}</span>
            </div>
          </div>
          ${L_.blurb ? `<p class="gcm-sms">${esc(L_.blurb)}</p>` : ''}
          <div class="gcm-diff"><span class="gcm-card__lbl">HEAT</span>${this._stars(n.difficulty)}${n.botLabel ? `<span class="gcm-diff__bot">${esc(n.botLabel)}</span>` : ''}</div>
        </section>
        ${chalBlock}
        <section class="gcm-card__sec">
          <div class="gcm-card__lbl">${status === 'owned' ? 'THEY USED TO RUN' : 'THEIR CREW'}</div>
          ${this._army(n.army)}
        </section>
        <section class="gcm-card__sec gcm-pay">
          <div class="gcm-pay__cell"><span>WIN</span><b class="is-cash">${money(n.reward?.win)}</b></div>
          <div class="gcm-pay__cell"><span>STANDOFF</span><b class="is-draw">${money(n.reward?.standoff)}</b></div>
          <div class="gcm-pay__cell"><span>INCOME</span><b class="is-inc">+${money(n.income)}<small>/game</small></b></div>
          ${bountyItems.length ? `<div class="gcm-pay__bounty"><span class="gcm-card__lbl">BOUNTIES · PER PIECE TAKEN</span><ul>${bountyItems.join('')}</ul></div>` : ''}
        </section>
      </div>
      <footer class="gcm-card__foot">${action}</footer>`;
  }
}

export default CityMap;
