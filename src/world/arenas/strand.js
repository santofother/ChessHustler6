// Sunset Strand Boardwalk (Hustler district nh1) — "Where hustles go to get a tan."
// The board sits on a sun-bleached boardwalk deck above the sand. Beach side (−Z, seen from the white camera):
// railing + stairs, umbrellas, loungers, lifeguard tower, volleyball, sandcastle kids, turquoise sea with slow
// waves, Pelican Pier with a ferris wheel. Boardwalk side (+Z, seen from the black camera): pastel strip-mall
// storefronts with small neon, benches, bikes, walkers. Long sides: food cart queue, chatting groups, a speaker
// with dancers (boss: a VIP cabana). Variants: time day|dusk(default)|night, boss.
// Contract: docs/arenas/ARENAS_SPEC.md. Everything here has a procedural fallback; GLBs are used when present.
import * as THREE from 'three';
import { Arena, STREET_Y } from './Arena.js';
import { rng } from '../util.js';
import { Batch, mtx, unit, instancify } from './strand/batch.js';
import * as P from './strand/props.js';
import { plankTexture, sandTexture, signAtlas, bulbTexture, deckLogoTexture } from './strand/textures.js';
import { createSea } from './strand/water.js';

const DECK_Y = STREET_Y;          // boardwalk deck top (= street level of the board)
const DECK_FRONT = -8.4;          // beach-side edge of the deck
const DECK_BACK = 30;
const SHOP_Z = 19;                // storefront faces
const SAND_TOP = -1.02;
const SHORE = -25;                // mean waterline (z)
const WATER_Y = -1.32;
const PIER_X = -24;
const PIER_W = 7;
const TAU = Math.PI * 2;

/** Sand height: flat under the deck, gentle slope to the waterline, then under water. */
export function sandY(x, z) {
  let y;
  if (z >= -10) y = SAND_TOP;
  else if (z >= -19.5) y = SAND_TOP + ((WATER_Y - 0.02) - SAND_TOP) * ((-10 - z) / 9.5);
  else if (z >= -26) y = (WATER_Y - 0.02) + (-0.1) * ((-19.5 - z) / 6.5);
  else y = (WATER_Y - 0.12) - 2.2 * Math.min(1, (-26 - z) / 44);
  if (z > -18 && z < -10) y += 0.05 * Math.sin(x * 0.31) * Math.sin(z * 0.53 + 1.1);
  return y;
}

const TIMES = {
  day: {
    sky: { zenith: '#2a78d0', top: '#4fa3e6', mid: '#93d3f0', horizon: '#e4f5f2', bottom: '#cfeaf0', sunDir: [0.35, 0.75, -0.55], sunColor: '#fff6dc', sunGlow: 0.45, stars: 0 },
    sun: { color: '#fff0da', intensity: 3.1, dir: [0.55, 1.35, -0.55] },
    hemi: ['#d2efff', '#e9cf9e', 1.25],
    sea: { shallow: '#52f0dc', deep: '#1aa8c6', far: '#2c86c4', foam: '#ffffff', wet: '#9a7a52', glint: '#ffffff', sunDir: [0.35, 0.75, -0.55] },
    fog: { color: '#d4ecf2', near: 70, far: 360 }, background: '#e4f5f2',
    exposure: 1.0, bloom: { strength: 0.3, radius: 0.4, threshold: 0.95 }, env: 1.0,
    glow: 1.0, sign: 1.0, bulbs: 0.0, skyline: '#9fbfd6', skylineWin: null,
  },
  dusk: {
    sky: { zenith: '#35297a', top: '#8a52a6', mid: '#ff8a8e', horizon: '#ffbe84', bottom: '#f6ae8a', sunDir: [-0.22, 0.055, -0.97], sunColor: '#ffcf7a', sunGlow: 0.7, stars: 0 },
    sun: { color: '#ffc48c', intensity: 2.7, dir: [-0.85, 0.62, -0.9] },
    hemi: ['#ffc6b4', '#d8a070', 1.15],
    sea: { shallow: '#46e2d2', deep: '#189cb2', far: '#5d6aa8', foam: '#fff6ea', wet: '#8a6a48', glint: '#c98a58', sunDir: [-0.22, 0.1, -0.97] },
    fog: { color: '#f5b08e', near: 60, far: 330 }, background: '#ffbe84',
    exposure: 1.0, bloom: { strength: 0.55, radius: 0.5, threshold: 0.86 }, env: 0.8,
    glow: 1.35, sign: 1.15, bulbs: 0.75, skyline: '#c07896', skylineWin: '#ffd9a0',
  },
  night: {
    sky: { zenith: '#05061a', top: '#0f1238', mid: '#27205c', horizon: '#56346e', bottom: '#1a1030', sunDir: [0.28, 0.2, -0.94], sunColor: '#d6ddff', sunGlow: 0.5, stars: 0.9 },
    sun: { color: '#a8b6ff', intensity: 1.15, dir: [0.4, 0.9, -1.0] },
    hemi: ['#5058a8', '#35243c', 0.85],
    sea: { shallow: '#1c6280', deep: '#0d3150', far: '#171c42', foam: '#c4d8ff', wet: '#2e2838', glint: '#e2e8ff', sunDir: [0.28, 0.2, -0.94] },
    fog: { color: '#221c44', near: 45, far: 260 }, background: '#221c44',
    exposure: 1.1, bloom: { strength: 0.85, radius: 0.55, threshold: 0.78 }, env: 0.5,
    glow: 2.6, sign: 1.9, bulbs: 1.0, skyline: '#1c1838', skylineWin: '#ffcf80',
  },
};

const UMB = [['#ff5f8f', '#fff4e0'], ['#2ec4d6', '#ffffff'], ['#ffd23f', '#ff9f1c'], ['#ff6f61', '#fff4e0'], ['#7a5cff', '#ffffff'], ['#1f9aa8', '#ffe29a'], ['#ff9f1c', '#fff4e0']];
const BOSS_UMB = [['#ff9f1c', '#ffe29a']];

export default class StrandArena extends Arena {
  async build() {
    const v = this.variant || {};
    const time = TIMES[v.time] ? v.time : 'dusk';
    const T = TIMES[time];
    const boss = !!v.boss;
    const low = this.ctx.quality === 'low';
    this.time = time; this.boss = boss;
    this._anim = { palms: null, gulls: null, ball: null, swimmers: null, flags: [], fires: [], bob: [] };
    const r = rng(1701);

    // ------------------------------------------------------------ sky + light
    this.addSky(T.sky);
    this.addHemi(T.hemi[0], T.hemi[1], T.hemi[2]);
    this.addSun({ color: T.sun.color, intensity: T.sun.intensity, dir: T.sun.dir });

    // ------------------------------------------------------------ GLBs (parallel, all optional)
    const names = {
      ferris: 'models/arenas/strand/ferris_wheel.glb', tower: 'models/arenas/strand/lifeguard_tower.glb',
      umbrella: 'models/arenas/strand/beach_umbrella.glb', surfboard: 'models/arenas/strand/surfboard.glb',
      pier: 'models/arenas/strand/pier_section.glb', net: 'models/arenas/strand/volleyball_net.glb',
      cart: 'models/props/food_cart.glb', lounger: 'models/props/lounge_chair.glb', cooler: 'models/props/cooler.glb',
      speaker: 'models/props/speaker_stack.glb', plant: 'models/props/plant_pot.glb',
    };
    const keys = Object.keys(names);
    const loaded = await Promise.all(keys.map((k) => this.glb(names[k])));
    const G = Object.fromEntries(keys.map((k, i) => [k, loaded[i]]));
    this.usedGlbs = keys.filter((k) => G[k]);

    // ------------------------------------------------------------ shared materials
    const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    glow.color.setScalar(T.glow);
    const atlas = signAtlas();
    const signMat = new THREE.MeshBasicMaterial({ map: atlas });
    signMat.color.setScalar(T.sign);
    this.flatMat = flat;
    const B = new Batch();            // flat props
    const E = new Batch();            // glowing bits
    const S = new Batch({ uv: true }); // signs
    const bulbs = [];                 // [x,y,z] warm string-light bulbs

    // ------------------------------------------------------------ ground: deck, sand, sea
    this._ground(B, time);
    const sea = createSea({ shoreZ: SHORE, waterY: WATER_Y, colors: T.sea, reducedMotion: this.reducedMotion });
    this.group.add(sea);
    this.sea = sea;

    // railing along the beach edge (gap for the centre stairs and the pier entrance)
    P.railing(B, E, { z: DECK_FRONT + 0.12, x0: -70, x1: 70, y: DECK_Y, gaps: [[-2.4, 2.4], [-8.8, -6.8], [6.8, 8.8], [PIER_X - PIER_W / 2 - 0.4, PIER_X + PIER_W / 2 + 0.4]], bulbs });
    // centre stairs down to the sand
    for (let i = 0; i < 5; i++) {
      const top = DECK_Y - (i + 1) * ((DECK_Y - SAND_TOP) / 5);
      B.box(4.6, DECK_Y - top + 0.02, 0.4, 0, (DECK_Y + top) / 2 - 0.12, DECK_FRONT - 0.2 - i * 0.38, i % 2 ? '#c49a6c' : '#b98e62');
    }
    for (const sx of [-2.4, 2.4]) B.box(0.2, 1.2, 0.2, sx, DECK_Y + 0.5, DECK_FRONT + 0.1, '#e9dcc4');
    // side stairs (walkers loop from the deck lanes down to the beach and back)
    for (const cx of [-7.8, 7.8]) {
      for (let i = 0; i < 5; i++) {
        const top = DECK_Y - (i + 1) * ((DECK_Y - SAND_TOP) / 5);
        B.box(1.9, DECK_Y - top + 0.02, 0.4, cx, (DECK_Y + top) / 2 - 0.12, DECK_FRONT - 0.2 - i * 0.38, i % 2 ? '#c49a6c' : '#b98e62');
      }
      for (const sx of [-1.0, 1.0]) B.box(0.2, 1.2, 0.2, cx + sx, DECK_Y + 0.5, DECK_FRONT + 0.1, '#e9dcc4');
    }

    // ------------------------------------------------------------ palms (instanced)
    this._palms(r);

    // ------------------------------------------------------------ lamp posts + bunting
    const lampSpots = [];
    for (const x of [-44, -34, -14, 12, 22, 34, 44]) lampSpots.push([x, DECK_FRONT + 0.5, 0]);
    for (const x of [-40, -28, -16, 16, 28, 40]) lampSpots.push([x, SHOP_Z - 3.2, 0]);
    for (const [x, z] of lampSpots) {
      P.lampPost(B, E, P.frame(x, DECK_Y, z, 0));
      bulbs.push([x - 0.42, DECK_Y + 3.72, z], [x + 0.42, DECK_Y + 3.72, z]);
    }
    this._bunting(B, [[-44, DECK_FRONT + 0.5], [-34, DECK_FRONT + 0.5]], 4.0);
    this._bunting(B, [[12, DECK_FRONT + 0.5], [22, DECK_FRONT + 0.5], [34, DECK_FRONT + 0.5], [44, DECK_FRONT + 0.5]], 4.0, boss);

    // ------------------------------------------------------------ storefront strip (boardwalk side)
    P.storefronts(B, E, S, { z0: SHOP_Z, x0: -52, x1: 52, y: DECK_Y, time, r, winLit: time !== 'day' });
    // hotels / skyline behind the shops (for orbiting cameras)
    for (let i = 0; i < 7; i++) {
      const x = -60 + i * 20 + (r() - 0.5) * 6, h = 14 + r() * 20, w = 12 + r() * 6;
      B.box(w, h, 10, x, DECK_Y + h / 2, SHOP_Z + 18 + r() * 8, ['#fde2d0', '#d6f0ea', '#e6dcff', '#fff0cc'][i % 4]);
      for (let f = 1; f < h / 3.2 - 1; f++) E.box(w - 2, 0.35, 0.1, x, DECK_Y + f * 3.2, SHOP_Z + 12.9 + (r() < 0.5 ? 0 : 0), time === 'day' ? '#9fd6e4' : '#ffcf8a');
    }

    // ------------------------------------------------------------ pier + ferris wheel
    const pierTop = 1.3;
    const pier = P.pier(B, E, S, { x: PIER_X, zStart: DECK_FRONT, zEnd: -104, deckY: DECK_Y, topY: pierTop, rampTo: -24, waterY: WATER_Y, width: PIER_W, lamps: bulbs });
    // wide deck under the wheel
    B.box(18, 0.3, 20, PIER_X, pierTop - 0.15, -64, '#b58a60');
    for (let x = -8; x <= 8; x += 4) for (let z = -8; z <= 8; z += 4) B.cyl(0.2, pierTop - WATER_Y + 3, PIER_X + x, (pierTop + WATER_Y - 3) / 2, -64 + z, '#6e5238', 0, 0, 0, 'cyl6');
    for (const sx of [-9, 9]) B.box(0.1, 0.9, 20, PIER_X + sx, pierTop + 0.45, -64, '#f2eadb');
    this._ferris(G.ferris, flat, time, boss, [PIER_X, pierTop, -64]);

    // ------------------------------------------------------------ beach
    this._beach(B, E, G, r, time, boss);

    // ------------------------------------------------------------ deck life (long sides + back)
    this._deck(B, E, S, G, r, time, boss);

    // ------------------------------------------------------------ sea life: boat, floats, swimmers, gulls, skyline
    this._seaLife(flat, time, r);
    this._gulls(time);
    this._skyline(T, time, r);

    // ------------------------------------------------------------ bulbs (warm string lights / lamp halos)
    if (T.bulbs > 0) {
      const tex = bulbTexture();
      const pos = new Float32Array(bulbs.length * 3);
      bulbs.forEach((b, i) => pos.set(b, i * 3));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ map: tex, color: time === 'night' ? '#ffd7a0' : '#ffe0b0', size: time === 'night' ? 0.75 : 0.45, transparent: true, opacity: T.bulbs, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(g, m);
      pts.name = 'bulbs';
      this.group.add(pts);
      this.bulbPoints = pts;
    }

    // ------------------------------------------------------------ bake batches
    const bm = B.build(flat, { name: 'strand_props' });
    const em = E.build(glow, { name: 'strand_glow', shadow: false, receive: false });
    const sm = S.build(signMat, { name: 'strand_signs', shadow: false, receive: false });
    [bm, em, sm].forEach((m) => m && this.group.add(m));

    // ------------------------------------------------------------ people
    this._people(r, time, boss, low);

    // ------------------------------------------------------------ mood + board surround
    this.mood = {
      background: T.background,
      fog: { ...T.fog },
      exposure: T.exposure,
      bloom: { ...T.bloom },
      envIntensity: T.env,
    };
    this.boardStyle = {
      frame: boss ? '#3a1f12' : '#1d6b74', frameText: boss ? '#ffe29a' : '#fff4e0',
      plinth: '#b98e62', plinthMap: 'wood',
      kerb: boss ? 'gold' : 'rope', kerbColors: boss ? ['#ff9f1c', '#ffe29a'] : ['#f4e1c1', '#c9a47a'],
      neon: time === 'day' ? null : boss ? ['#ff9f1c', '#ffe29a'] : ['#2ec4d6', '#ff7ab8'],
      neonIntensity: time === 'night' ? 3.0 : 2.0,
    };
    const warm = time === 'night' ? '#ffb070' : '#ffc890';
    this.buildEnvMap([
      { color: T.sky.horizon, pos: [0, 4, -40], size: [120, 20], mult: 1.2 },
      { color: warm, pos: [0, 8, 40], size: [80, 12], mult: time === 'night' ? 1.6 : 0.8 },
    ]);
  }

  // ================================================================== ground
  _ground(B, time) {
    // deck (plank texture)
    const W = 150, D = DECK_BACK - DECK_FRONT;
    const ptex = plankTexture(time);
    ptex.wrapS = ptex.wrapT = THREE.RepeatWrapping;
    ptex.repeat.set(W / 4, D / 4);
    const deckMat = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.86, metalness: 0, color: time === 'night' ? '#b7aab8' : '#ffffff' });
    const deckGeo = new THREE.PlaneGeometry(W, D); deckGeo.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, DECK_Y, (DECK_FRONT + DECK_BACK) / 2);
    deck.receiveShadow = true; deck.name = 'deck';
    this.group.add(deck);
    // fascia + support posts along the beach edge
    B.box(W, DECK_Y - SAND_TOP + 0.1, 0.12, 0, (DECK_Y + SAND_TOP) / 2 - 0.05, DECK_FRONT - 0.02, '#8a6a4a');
    B.box(W, 0.12, 0.2, 0, DECK_Y - 0.06, DECK_FRONT - 0.04, '#e9dcc4');
    for (let x = -74; x <= 74; x += 2.5) B.box(0.22, DECK_Y - SAND_TOP + 0.2, 0.22, x, (DECK_Y + SAND_TOP) / 2 - 0.1, DECK_FRONT - 0.12, '#6e5238');
    // sand
    const stex = sandTexture();
    stex.wrapS = stex.wrapT = THREE.RepeatWrapping;
    stex.repeat.set(300 / 6, 100 / 6);
    const sandGeo = new THREE.PlaneGeometry(300, 100, 75, 50); sandGeo.rotateX(-Math.PI / 2);
    sandGeo.translate(0, 0, -7 - 50);
    const p = sandGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, sandY(p.getX(i), p.getZ(i)));
    sandGeo.computeVertexNormals();
    const sandMat = new THREE.MeshStandardMaterial({ map: stex, roughness: 0.95, color: time === 'night' ? '#b0a4b8' : '#ffffff' });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.receiveShadow = true; sand.name = 'sand';
    this.group.add(sand);
  }

  // ================================================================== palms
  _palms(r) {
    const spots = [];
    for (const x of [-10.2, 10.2, -18, 17, 26, -33, 36, -42, 46, -52, 55]) spots.push([x, DECK_FRONT + 0.8, DECK_Y]);
    for (const x of [-7.6, 7.6, -22, 21, -34, 33, -47, 46]) spots.push([x, SHOP_Z - 4.6, DECK_Y]);
    for (const [x, z] of [[-15.5, -12.5], [22.5, -13], [-37, -15], [31, -11.5], [-45, -12], [48, -14]]) spots.push([x, z, sandY(x, z)]);
    const mats = [];
    this._palmBase = [];
    for (const [x, z, y] of spots) {
      const s = 0.85 + r() * 0.4, yaw = r() * TAU;
      mats.push(mtx(x, y, z, 0, yaw, 0, s));
      this._palmBase.push({ x, y, z, s, yaw, ph: r() * TAU });
    }
    let tmpl = null;
    const src = this.ctx.models?.palm;
    if (src) {
      tmpl = this.prop(src.clone(true), { height: 6.2 });
    } else {
      tmpl = buildPalmTemplate(this.flatMat);
    }
    const { group, meshes } = instancify(tmpl, mats);
    if (!src) tmpl.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    group.name = 'palms';
    this.group.add(group);
    this._anim.palms = meshes;
  }

  // ================================================================== bunting (pennant strings between posts)
  _bunting(B, pts, y, boss = false) {
    const cols = boss ? ['#ff9f1c', '#ffe29a', '#1c1a24'] : ['#ff5f8f', '#ffd23f', '#2ec4d6', '#ffffff', '#7a5cff', '#ff9f1c'];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.55);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const sag = Math.sin(t * Math.PI) * 0.8;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, yy = DECK_Y + y - sag;
        if (k < n) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.38, 0, 0.2, 0, 0, -0.2, 0, 0, 0, -0.38, 0], 3));
          g.computeVertexNormals();
          const tt = (k + 0.5) / n;
          B.add(g, mtx(x0 + (x1 - x0) * tt, DECK_Y + y - Math.sin(tt * Math.PI) * 0.8, z0 + (z1 - z0) * tt, 0, Math.atan2(z1 - z0, x1 - x0) * -1, 0), cols[k % cols.length]);
          g.dispose();
        }
        if (k > 0) {
          const tp = (k - 1) / n;
          B.rod([x0 + (x1 - x0) * tp, DECK_Y + y - Math.sin(tp * Math.PI) * 0.8, z0 + (z1 - z0) * tp], [x, yy, z], 0.012, '#f4f4f4');
        }
      }
    }
  }

  // ================================================================== ferris wheel
  _ferris(glb, mat, time, boss, [x, y, z]) {
    const yaw = Math.atan2(z, -x); // local +X toward the board
    const gcols = boss ? ['#ff9f1c', '#ffe29a', '#1c1a24'] : ['#ff7ab8', '#2ec4d6', '#ffd23f', '#7a5cff', '#ff9f1c', '#52e0a0'];
    if (glb) {
      const holder = this.prop(glb);
      const gondolas = [];
      let wheel = null;
      glb.traverse((o) => {
        if (o.name === 'Wheel') wheel = o;
        if (/^Gondola_/.test(o.name)) gondolas.push(o);
      });
      gondolas.forEach((gd, i) => this.tint(gd, { TINT_Gondola: gcols[i % gcols.length] }));
      const bulbI = time === 'night' ? 3.0 : time === 'dusk' ? 1.4 : 0.4;
      this.tint(glb, { EMISSIVE_Bulbs: '#ffe7b0' }, { intensity: bulbI });
      holder.position.set(x, y, z);
      holder.rotation.y = yaw;
      this.group.add(holder);
      this.ferris = { glb: true, wheel, gondolas, angle: 0 };
      return;
    }
    const fw = P.ferrisWheel({ gondolaColors: gcols, bulbTex: bulbTexture(), time, mat });
    fw.root.position.set(x, y, z);
    fw.root.rotation.y = yaw;
    this.group.add(fw.root);
    this.ferris = { glb: false, ...fw, angle: 0.3, _o: new THREE.Object3D() };
    this._updateFerris(0, 0);
  }

  _updateFerris(dt, t) {
    const f = this.ferris;
    if (!f) return;
    f.angle += dt * (this.reducedMotion ? 0.02 : 0.055);
    if (f.glb) {
      if (f.wheel) f.wheel.rotation.x = f.angle;
      for (const g of f.gondolas) g.rotation.x = -f.angle;
      return;
    }
    f.wheel.rotation.x = f.angle;
    const o = f._o;
    for (let i = 0; i < f.n; i++) {
      const a = (i / f.n) * TAU - f.angle; // spoke i after the wheel rotation
      // rotation.x = +angle maps local (0, sin, cos) → hang point
      const yy = f.hubY + Math.sin(a) * f.radius, zz = Math.cos(a) * f.radius;
      // Rx(angle) applied to base point (0, sin(i), cos(i))
      o.position.set(0, yy, zz);
      o.rotation.set(0, 0, this.reducedMotion ? 0 : Math.sin(t * 0.8 + i) * 0.04);
      o.updateMatrix();
      f.gondolas.setMatrixAt(i, o.matrix);
    }
    f.gondolas.instanceMatrix.needsUpdate = true;
  }

  // ================================================================== beach
  _beach(B, E, G, r, time, boss) {
    const night = time === 'night';
    // --- umbrellas (+ loungers / towels under them)
    const umbSpots = [
      [-9.8, -12.4, 'L'], [-20.6, -17.4, 'T'], [-19.5, -12.2, 'L'], [-11.2, -19.0, 'T'], [-3.6, -19.6, 'T'],
      [8.6, -12.2, 'L'], [21.5, -16.8, 'L'], [26.5, -12.2, 'T'], [-33.5, -12.8, 'L'], [-40, -17, 'T'],
      [33, -16.5, 'L'], [40, -12.5, 'T'], [4.8, -21.3, null],
    ];
    const umbMats = [], colA = [], colB = [];
    const loungers = [], towels = [];
    umbSpots.forEach(([x, z, kind], i) => {
      const y = sandY(x, z);
      const pal = (boss && i % 3 === 0 ? BOSS_UMB[0] : UMB[i % UMB.length]);
      umbMats.push(mtx(x, y, z, (r() - 0.5) * 0.12, r() * TAU, (r() - 0.5) * 0.12, 1));
      colA.push(pal[0]); colB.push(pal[1]);
      B.cyl(0.03, 2.2, x, y + 1.05, z, '#f4f4f4', 0, 0, 0, 'cyl6');
      if (kind === 'L') { loungers.push([x - 0.45, z + 0.6, 0.12, i]); loungers.push([x + 0.55, z + 0.5, -0.1, i + 3]); }
      if (kind === 'T') { towels.push([x - 0.5, z + 0.9, r() * 0.6 - 0.3, i]); towels.push([x + 0.6, z + 0.4, r() * 0.6 - 0.3, i + 2]); }
    });
    if (G.umbrella) {
      const tmpl = this.prop(G.umbrella);
      const { group } = instancify(tmpl, umbMats, { colors: { TINT_Canopy2: colB, TINT_Canopy: colA } });
      this.group.add(group);
    } else {
      const [ga, gb] = P.umbrellaCanopyGeos();
      const ma = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide });
      const mb = ma.clone();
      const ia = new THREE.InstancedMesh(ga, ma, umbMats.length), ib = new THREE.InstancedMesh(gb, mb, umbMats.length);
      const c = new THREE.Color();
      umbMats.forEach((m, i) => { ia.setMatrixAt(i, m); ib.setMatrixAt(i, m); ia.setColorAt(i, c.set(colA[i])); ib.setColorAt(i, c.set(colB[i])); });
      for (const im of [ia, ib]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); this.group.add(im); }
    }
    this._sitSpots = [];
    const cushions = ['#ffffff', '#2ec4d6', '#ff8fb1', '#ffd23f', '#9ee6d0'];
    if (G.lounger) {
      const tmpl = this.prop(G.lounger);
      const lm = loungers.map(([x, z, yaw]) => mtx(x, sandY(x, z), z, 0, yaw, 0, 1));
      const { group } = instancify(tmpl, lm, { colors: { TINT_Cushion: loungers.map((l) => cushions[l[3] % cushions.length]) } });
      this.group.add(group);
    } else {
      for (const [x, z, yaw, i] of loungers) P.lounger(B, P.frame(x, sandY(x, z), z, yaw), cushions[i % cushions.length]);
    }
    for (const [x, z, yaw] of loungers) this._sitSpots.push({ x, z: z + 0.25, y: sandY(x, z) - 0.1, yaw: yaw + Math.PI, kind: 'lounger' });
    const towelCols = [['#ff5f8f', '#fff4e0'], ['#2ec4d6', '#ffd23f'], ['#7a5cff', '#ffffff'], ['#ff9f1c', '#ff5f8f'], ['#52e0a0', '#ffffff']];
    for (const [x, z, yaw, i] of towels) {
      const tc = towelCols[i % towelCols.length];
      P.towel(B, P.frame(x, sandY(x, z), z, yaw), tc[0], tc[1]);
      this._sitSpots.push({ x, z, y: sandY(x, z), yaw: yaw + Math.PI, kind: 'towel' });
    }
    // bags / coolers / flip-flops
    const coolerSpots = [[-8.6, -13.4], [-13.3, -15.2], [9.9, -13.0], [-2.2, -19.4], [22.4, -15.7]];
    if (G.cooler) {
      const tmpl = this.prop(G.cooler);
      const { group } = instancify(tmpl, coolerSpots.map(([x, z]) => mtx(x, sandY(x, z), z, 0, r() * TAU, 0, 1)), { colors: { TINT_Body: ['#2ec4d6', '#ff5f61', '#1f6f78', '#ffd23f', '#ff8fb1'] } });
      this.group.add(group);
    } else {
      coolerSpots.forEach(([x, z], i) => P.cooler(B, P.frame(x, sandY(x, z), z, r() * TAU), ['#2ec4d6', '#ff5f61', '#1f6f78', '#ffd23f', '#ff8fb1'][i]));
    }
    for (const [x, z, c] of [[-10.7, -13.8, '#ffd23f'], [-4.5, -18.3, '#ff5f8f'], [20.5, -16.2, '#7bdff2']]) P.beachBag(B, P.frame(x, sandY(x, z), z, r() * TAU), c);

    // --- lifeguard tower (faces the sea)
    const tx = -15.2, tz = -19.2, ty = sandY(tx, tz);
    let standAt, flagAt;
    if (G.tower) {
      const h = this.prop(G.tower);
      this.tint(G.tower, { TINT_Hut: '#ff8fb1', TINT_Trim: '#2ec4d6' });
      h.position.set(tx, ty, tz); h.rotation.y = Math.PI;
      this.group.add(h);
      const sz = h.userData.size;
      standAt = [tx, ty + sz.y * 0.47, tz - 0.6];
      flagAt = null;
    } else {
      const res = P.lifeguardTower(B, P.frame(tx, ty, tz, Math.PI));
      standAt = res.standAt; flagAt = res.flagAt;
    }
    this._lifeguard = standAt;
    if (flagAt) this._flag(flagAt, '#ff3b30', '#ffd23f', Math.PI);

    // --- surf rental rack by the stairs
    const boards = [['#ff5f8f', '#fff4e0'], ['#2ec4d6', '#ffffff'], ['#ffd23f', '#ff5f61'], ['#7a5cff', '#ffe29a'], ['#ff9f1c', '#1f6f78']];
    const sbx = -11.6, sbz = -10.9;
    if (G.surfboard) {
      const src = G.surfboard;
      src.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(src).getSize(new THREE.Vector3());
      if (bb.y < 0.5) src.rotation.x = bb.z > bb.x ? -Math.PI / 2 : 0;
      if (bb.y < 0.5 && bb.x > bb.z) src.rotation.z = Math.PI / 2;
      const tmpl = this.prop(src);
      const mts = boards.map((_, i) => mtx(sbx - i * 0.62, sandY(sbx, sbz) - 0.3, sbz, -0.18, 0.05 * (i - 2), 0.05 * (i - 2), 1));
      const { group } = instancify(tmpl, mts, { colors: { TINT_Board: boards.map((b) => b[0]) } });
      this.group.add(group);
    } else {
      boards.forEach(([c, s], i) => P.surfboardInto(B, P.frame(sbx - i * 0.62, sandY(sbx, sbz) - 0.25, sbz, 0), c, s, 0.05 * (i - 2)));
    }
    B.box(3.4, 0.08, 0.08, sbx - 1.24, sandY(sbx, sbz) + 1.05, sbz + 0.12, '#e9dcc4');
    for (const dx of [0.35, -2.85]) B.box(0.08, 1.1, 0.08, sbx + dx, sandY(sbx, sbz) + 0.55, sbz + 0.12, '#e9dcc4');

    // --- volleyball court (net along Z)
    const vx = 13.6, vz = -17.4, vy = sandY(vx, vz);
    if (G.net) {
      const h = this.prop(G.net);
      h.position.set(vx, vy, vz); h.rotation.y = Math.PI / 2;
      this.group.add(h);
    } else {
      P.volleyballNet(B, P.frame(vx, vy, vz, Math.PI / 2));
    }
    this._court = { x: vx, z: vz, y: vy };
    const ballB = P.beachBall(0.13);
    const ball = ballB.build(this.flatMat, { name: 'volleyball' });
    ball.matrixAutoUpdate = true;
    this.group.add(ball);
    this._anim.ball = ball;

    // --- sandcastle + kids spot
    if (!night) P.sandcastle(B, P.frame(1.6, sandY(1.6, -19.4), -19.4, 0.3));
    // --- dune grass along the deck edge
    for (let i = 0; i < 40; i++) {
      const x = (r() - 0.5) * 120, z = DECK_FRONT - 0.6 - r() * 1.6;
      if (Math.abs(x) < 3.5 || Math.abs(x - PIER_X) < 4.5) continue;
      P.duneGrass(B, x, sandY(x, z) - 0.02, z, r);
    }
    // --- night bonfire
    if (night) {
      const fx = -1.4, fz = -19.8, fy = sandY(fx, fz);
      const FB = new Batch();
      P.bonfire(FB);
      const m = FB.build(this.flatMat, { name: 'bonfire' });
      m.position.set(fx, fy, fz); m.matrixAutoUpdate = true;
      this.group.add(m);
      const flameMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const flameMat2 = new THREE.MeshBasicMaterial({ color: '#ffd36a', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const cone = new THREE.ConeGeometry(0.42, 1.2, 7);
      cone.translate(0, 0.6, 0);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(cone, i === 1 ? flameMat2 : flameMat);
        f.position.set(fx + (i - 1) * 0.18, fy + 0.1, fz + (i % 2) * 0.12);
        f.scale.setScalar(i === 1 ? 0.7 : 1);
        this.group.add(f);
        this._anim.fires.push({ m: f, base: f.scale.x, ph: i * 1.9 });
      }
      const light = new THREE.PointLight('#ff8a3c', 18, 16, 1.6);
      light.position.set(fx, fy + 1.3, fz);
      this.group.add(light);
      this._anim.fires.push({ light, base: 18, ph: 0.4 });
      this._bonfire = [fx, fz, fy];
    }
  }

  // ================================================================== deck life
  _deck(B, E, S, G, r, time, boss) {
    // food cart (left long side, facing the board)
    const cx = -10.9, cz = -1.1;
    if (G.cart) {
      const h = this.prop(G.cart);
      this.tint(G.cart, { TINT_Canopy: '#ff5f8f' });
      if (time !== 'day') this.tint(G.cart, { EMISSIVE_Sign: '#ffcf6a' }, { intensity: time === 'night' ? 2.5 : 1.4 });
      h.position.set(cx, DECK_Y, cz); h.rotation.y = Math.PI / 2;
      this.group.add(h);
    } else {
      P.foodCart(B, E, S, P.frame(cx, DECK_Y, cz, Math.PI / 2), boss ? '#ff9f1c' : '#ff5f8f', boss ? '#ffe29a' : '#fff4e0');
    }
    // speaker stack (right side) + soft pulsing ring
    const spx = 10.7, spz = 3.4;
    if (G.speaker) {
      const h = this.prop(G.speaker);
      this.tint(G.speaker, { TINT_Cabinet: '#1c1a24', EMISSIVE_Ring: boss ? '#ff9f1c' : '#29e3d6' }, { intensity: 1.5 });
      h.position.set(spx, DECK_Y, spz); h.rotation.y = -Math.PI / 2;
      this.group.add(h);
      const rings = [];
      h.traverse((o) => { if (o.isMesh && o.material?.name?.startsWith('EMISSIVE_Ring')) rings.push(o.material); });
      this._ring = { mats: rings, base: 1.5 };
    } else {
      const ring = P.speakerStack(B, P.frame(spx, DECK_Y, spz, -Math.PI / 2), boss ? '#ff9f1c' : '#29e3d6');
      this.group.add(ring);
      this._ring = { basic: ring.material };
    }
    // bench on the right side (not in boss mode: the cabana takes the spot)
    if (!boss) P.bench(B, P.frame(8.9, DECK_Y, -2.6, -Math.PI / 2), '#2ec4d6');
    else {
      const cab = P.vipCabana(B, E, P.frame(12.6, DECK_Y, -2.2, -Math.PI / 2));
      this._cabana = cab;
      this._flag([9.8, DECK_Y + 3.4, -4.4], '#ff9f1c', '#ffe29a', -Math.PI / 2, 3.4);
      this._flag([9.8, DECK_Y + 3.4, 0.0], '#ffe29a', '#ff9f1c', -Math.PI / 2, 3.4);
    }
    // planters flanking the long sides (low, ≤ 1.1 m)
    const potSpots = [[-9.4, -6.5], [9.4, -6.5], [-7.4, 7.4], [7.4, 7.4], [-4.6, 12.6], [4.6, 12.6]];
    if (G.plant) {
      const tmpl = this.prop(G.plant, { height: 1.1 });
      const { group } = instancify(tmpl, potSpots.map(([x, z]) => mtx(x, DECK_Y, z, 0, r() * TAU, 0, 1)), { colors: { TINT_Pot: ['#ff8fab', '#2ec4d6', '#ffd23f', '#9ee6d0', '#ff8fab', '#2ec4d6'] } });
      this.group.add(group);
    } else {
      potSpots.forEach(([x, z], i) => P.planter(B, P.frame(x, DECK_Y, z, 0), ['#ff8fab', '#2ec4d6', '#ffd23f', '#9ee6d0'][i % 4]));
    }
    // benches on the boardwalk side facing the board (low)
    for (const x of [-2.6, 2.6]) P.bench(B, P.frame(x, DECK_Y, 13.2, Math.PI), ['#ff8fab', '#ffd23f'][x > 0 ? 1 : 0]);
    // beach cruiser bikes on a rack
    for (let i = 0; i < 4; i++) this._bike(B, 8.0 + i * 0.75, 11.8, ['#ff7ab8', '#2ec4d6', '#ffd23f', '#9ee6d0'][i]);
    B.box(3.2, 0.06, 0.06, 9.1, DECK_Y + 0.55, 12.25, '#c0c0c8');
    // trash can + ice cream sign board + skateboard
    B.cyl(0.3, 0.9, -8.2, DECK_Y + 0.45, 11.8, '#1f6f78');
    B.cyl(0.32, 0.08, -8.2, DECK_Y + 0.92, 11.8, '#2ec4d6');
    B.box(0.7, 0.9, 0.06, -9.4, DECK_Y + 0.5, 11.4, '#fff4e0', 0.2, -0.2);
    B.box(0.2, 0.03, 0.8, 5.4, DECK_Y + 0.08, 9.8, '#ff5f61', 0.6);
    // painted deck logo (reads from the black camera)
    const logoTex = deckLogoTexture(boss);
    const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const logoGeo = new THREE.PlaneGeometry(7.2, 3.6); logoGeo.rotateX(-Math.PI / 2); logoGeo.rotateY(Math.PI);
    const logo = new THREE.Mesh(logoGeo, logoMat);
    logo.position.set(0, DECK_Y + 0.006, 9.9);
    logo.receiveShadow = true;
    this.group.add(logo);
    // big "SUNSET STRAND" sign board on poles facing the board, far left of the boardwalk (cinematic)
    const sF = P.frame(-15.5, DECK_Y, 8.8, Math.PI * 0.75);
    for (const sx of [-2.3, 2.3]) B.add(unit('box'), mtx(...sF.p(sx, 2.3, 0), 0, sF.yaw, 0, [0.22, 4.6, 0.22]), '#fff4e0');
    P.signPlane(S, sF, 'strand', 5.2, 0.8, 0, 4.1, 0.05);
    B.add(unit('box'), mtx(...sF.p(0, 4.1, -0.06), 0, sF.yaw, 0, [5.5, 1.0, 0.08]), boss ? '#ff9f1c' : '#ff6f61');
  }

  _bike(B, x, z, col) {
    const y = DECK_Y;
    const wheel = new THREE.TorusGeometry(0.32, 0.035, 5, 16);
    B.add(wheel, mtx(x, y + 0.34, z - 0.5, 0, Math.PI / 2, 0), '#2b2d42');
    B.add(wheel, mtx(x, y + 0.34, z + 0.5, 0, Math.PI / 2, 0), '#2b2d42');
    wheel.dispose();
    B.rod([x, y + 0.34, z - 0.5], [x, y + 0.72, z - 0.05], 0.03, col);
    B.rod([x, y + 0.72, z - 0.05], [x, y + 0.34, z + 0.5], 0.03, col);
    B.rod([x, y + 0.72, z - 0.05], [x, y + 0.9, z + 0.35], 0.03, col);
    B.rod([x, y + 0.34, z - 0.5], [x, y + 0.95, z - 0.4], 0.03, col);
    B.box(0.5, 0.04, 0.04, x, y + 0.97, z - 0.4, '#dddddd');
    B.box(0.14, 0.06, 0.26, x, y + 0.92, z + 0.36, '#6b4a2e');
    B.box(0.28, 0.14, 0.2, x, y + 0.9, z - 0.62, '#f4f4f4');
  }

  // ================================================================== flags (flutter)
  _flag([x, y, z], a, b, yaw = 0, pole = 0) {
    if (!this._flagGeo) {
      const g = new THREE.PlaneGeometry(0.9, 0.55, 6, 2);
      g.translate(0.45, 0, 0);
      const col = [];
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) col.push(0, 0, 0);
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      this._flagGeo = g;
      this._flagBase = Float32Array.from(p.array);
    }
    const g = this._flagGeo.clone();
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { const cc = p.getY(i) > 0 ? ca : cb; c.setXYZ(i, cc.r, cc.g, cc.b); }
    const m = new THREE.Mesh(g, this._flagMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
    m.position.set(x, y, z); m.rotation.y = yaw;
    m.castShadow = true;
    this.group.add(m);
    if (pole) {
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, pole + 0.4, 6), this.flatMat);
      pm.position.set(x, y - pole / 2 + 0.1, z);
      this.group.add(pm);
    }
    this._anim.flags.push({ g, ph: this._anim.flags.length * 1.3 });
  }

  // ================================================================== sea life
  _seaLife(mat, time, r) {
    const boat = P.sailboat(mat);
    boat.matrixAutoUpdate = true;
    boat.position.set(34, WATER_Y, -92);
    boat.rotation.y = 0.6;
    this.group.add(boat);
    this._anim.bob.push({ o: boat, y: WATER_Y - 0.1, amp: 0.12, ph: 0, rock: 0.04, drift: [34, 10] });
    if (time === 'night') return;
    const floats = P.floatToys(mat);
    floats.matrixAutoUpdate = true;
    floats.position.set(3.5, WATER_Y, -30.5);
    this.group.add(floats);
    this._anim.bob.push({ o: floats, y: WATER_Y + 0.02, amp: 0.06, ph: 1.2, rock: 0.05 });
    // swimmers (heads + shoulders, instanced)
    const sg = P.swimmerGeometry(mat);
    const spots = [[-1.8, -31.2], [-0.6, -32.4], [6.2, -34], [-13, -30.2], [11.5, -29.6]];
    const sm = new THREE.InstancedMesh(sg, mat, spots.length);
    const skins = ['#f1c27d', '#8d5524', '#e0ac69', '#c68642', '#ffdbac'];
    const c = new THREE.Color();
    spots.forEach((_, i) => sm.setColorAt(i, c.set(skins[i])));
    sm.frustumCulled = false;
    this.group.add(sm);
    this._anim.swimmers = { mesh: sm, spots, o: new THREE.Object3D() };
  }

  _gulls(time) {
    const geo = P.gullGeometry();
    const n = time === 'night' ? 3 : 7;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.frustumCulled = false;
    const list = [];
    for (let i = 0; i < n; i++) {
      list.push({ cx: -6 + (i % 3) * 7, cz: -26 - (i % 2) * 6, rad: 5 + (i % 4) * 2.5, y: 6 + (i % 3) * 1.6, sp: (i % 2 ? 1 : -1) * (0.22 + (i % 3) * 0.05), ph: i * 1.7 });
    }
    this.group.add(im);
    this._anim.gulls = { im, list, o: new THREE.Object3D() };
  }

  _skyline(T, time, r) {
    // hazy Vice City skyline across the bay (left of the pier) + a cruise ship near the sun
    const B = new Batch();
    const base = new THREE.Color(T.skyline);
    for (let i = 0; i < 26; i++) {
      const a = -2.35 + i * 0.022 + (r() - 0.5) * 0.01; // azimuth band left of the pier
      const d = 330 + r() * 40;
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      const h = 18 + r() * 70 * (1 - Math.abs(i - 12) / 16), w = 8 + r() * 12;
      const c = base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.06);
      B.box(w, h, w, x, WATER_Y + h / 2 - 1, z, '#' + c.getHexString(), -a);
      if (T.skylineWin) for (let k = 0; k < h / 6; k++) if (r() < 0.6) B.box(w * 0.7, 0.8, 0.2, x - Math.cos(a) * 0.1, WATER_Y + 3 + k * 5.5, z + (w / 2 + 0.2) * (z > 0 ? -1 : 1), time === 'dusk' ? '#' + base.clone().lerp(new THREE.Color(T.skylineWin), 0.35).getHexString() : T.skylineWin, -a);
    }
    // cruise ship silhouette
    const sx = -40, sz = -310;
    B.box(46, 5, 7, sx, WATER_Y + 2, sz, '#' + base.clone().offsetHSL(0, 0, 0.08).getHexString());
    B.box(34, 4, 6, sx - 2, WATER_Y + 6.5, sz, '#' + base.clone().offsetHSL(0, 0, 0.12).getHexString());
    B.box(20, 3, 5, sx - 4, WATER_Y + 10, sz, '#' + base.clone().offsetHSL(0, 0, 0.14).getHexString());
    B.box(3, 5, 3, sx + 6, WATER_Y + 13, sz, '#' + base.clone().offsetHSL(0, 0, 0.02).getHexString());
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const m = B.build(mat, { name: 'skyline', shadow: false, receive: false });
    this.group.add(m);
  }

  // ================================================================== people
  _people(r, time, boss, low) {
    const crowd = this.crowd;
    if (!crowd) return;
    const night = time === 'night';
    const day = time === 'day';
    const walkers = [];
    const list = [];
    const add = (o) => list.push({ look: 'beach', ...o });
    const walk = (o) => walkers.push({ look: 'beach', anim: 'walk', wander: true, ...o });

    // --- WALKERS (listed first so quality 'low' keeps them). Ground height is followed in update().
    // Grand loop around the board: deck lanes on both long sides → side stairs → across the beach (z −16.6)
    // → back up → across the boardwalk (z +16.7). Stays outside Z0/Z1 and the camera corridors.
    const loop = [[-6.4, 5.5], [-6.4, -6.9], [-7.8, -7.9], [-7.8, -10.6], [-6.6, -12.5], [-6.3, -16.6], [6.3, -16.6],
      [6.6, -12.5], [7.8, -10.6], [7.8, -7.9], [6.4, -6.9], [6.4, 5.5], [6.6, 16.7], [-6.6, 16.7]];
    const rot = (k) => loop.slice(k).concat(loop.slice(0, k));
    const rev = (k) => rot(k).reverse();
    walk({ path: rot(0), speed: 1.1 });
    walk({ path: rev(4), speed: 1.2, body: 'f' });
    walk({ path: rot(7), speed: 1.0, look: 'street' });
    walk({ path: rev(11), speed: 1.3, body: 'f', look: 'club' });
    // taco cart ↔ umbrellas (left) and speaker ↔ volleyball court (right), back and forth
    walk({ path: [[-9.6, -2.6], [-7.9, -6.4], [-7.8, -7.9], [-7.8, -10.6], [-8.6, -13.8]], loop: false, speed: 1.05 });
    walk({ path: [[7.7, 0.6], [7.8, -6.4], [7.8, -7.9], [7.8, -10.6], [7.2, -13.2], [9.0, -14.6]], loop: false, speed: 1.15, body: 'f' });
    // shoreline stroller (wet sand) + boardwalk promenade in front of the shops
    const shoreZ = SHORE + 2.3;
    walk({ path: [[-34, shoreZ], [30, shoreZ + 0.4], [30, shoreZ - 0.3], [-34, shoreZ - 0.2]], speed: 1.0 });
    const bwZ = SHOP_Z - 1.5;
    walk({ path: [[-30, bwZ], [30, bwZ], [30, bwZ + 0.6], [-30, bwZ + 0.6]], speed: 1.2 });
    if (!low) {
      walk({ path: [[26, shoreZ - 0.6], [-28, shoreZ - 0.4], [-28, shoreZ - 1], [26, shoreZ - 1.1]], speed: 1.15, body: 'f' });
      walk({ path: [[30, bwZ + 0.6], [-30, bwZ + 0.6], [-30, bwZ], [30, bwZ]], speed: 1.05, body: 'f', look: 'club' });
      // out along Pelican Pier and back
      walk({ path: [[-14, -6.8], [-24, -7.4], [-24, -20], [-23, -44], [-24, -52]], loop: false, speed: 1.1 });
    }

    // --- near the board, left long side: taco queue + chatting group
    add({ at: [-11.8, -1.1], face: [-10, -1.1], anim: 'talk', colors: { top: '#ffffff' } }); // vendor
    add({ at: [-9.2, -0.4], face: [-10.9, -1.1], anim: 'phone', prop: 'phone' });
    add({ at: [-8.9, 0.8], face: [-10.9, -1.1], anim: 'idle' });
    add({ at: [-8.4, 3.3], face: [-9.3, 3.9], anim: 'talk', prop: 'drink' });
    add({ at: [-9.5, 4.6], face: [-8.8, 3.6], anim: 'drink', prop: 'drink' });
    add({ at: [-10.0, 3.1], face: [-9.0, 3.8], anim: 'idle' });
    add({ at: [-7.7, -4.6], face: 'board', anim: 'phone', prop: 'phone' });
    // --- right long side: dancers by the speaker + bench sitters / drinker
    add({ at: [8.4, 2.5], face: [10.7, 3.4], anim: 'dance', look: 'club' });
    add({ at: [8.9, 4.5], face: [10.7, 3.4], anim: 'dance2' });
    add({ at: [7.7, 4.1], face: [9.5, 3.2], anim: 'dance', look: 'club' });
    add({ at: [7.6, -0.7], face: 'board', anim: 'drink', prop: 'drink' });
    if (!boss) {
      add({ at: [8.95, -2.2], face: [6, -2.2], anim: 'sit' });
      add({ at: [8.95, -3.1], face: [6, -3.1], anim: 'sit', body: 'f' });
    } else {
      const [bx, , bz] = this._cabana.sofa;
      add({ at: [bx, bz], face: [0, bz], anim: 'sit', look: 'suit', colors: { top: '#ff9f1c', bottom: '#1c1a24' }, scale: 1.08 });
      add({ at: [bx, bz + 0.8], face: [0, bz], anim: 'sit', look: 'rich', body: 'f', prop: 'drink' });
      for (const [gx, , gz] of this._cabana.guards) add({ at: [gx, gz], face: 'board', anim: 'crossed', look: 'suit', react: false });
    }
    // --- beach life
    const sits = this._sitSpots || [];
    const loungerSits = sits.filter((s) => s.kind === 'lounger');
    const towelSits = sits.filter((s) => s.kind === 'towel');
    const nL = night ? 0 : day ? 4 : 3;
    loungerSits.slice(0, nL).forEach((s, i) => add({ at: [s.x, s.z], y: s.y, face: s.yaw, anim: 'sit', body: i % 2 ? 'f' : 'm', prop: i === 1 ? 'drink' : null }));
    if (!night) towelSits.slice(0, day ? 3 : 2).forEach((s, i) => add({ at: [s.x, s.z], y: s.y, face: s.yaw, anim: 'sit_ground', prop: i % 2 ? 'phone' : null }));
    if (this._lifeguard) {
      const [lx, ly, lz] = this._lifeguard;
      add({ at: [lx, lz], y: ly, face: [lx, lz - 10], anim: 'crossed', colors: { top: '#ff3b30', bottom: '#ff3b30' }, react: false });
    }
    const c = this._court;
    if (c) {
      const vl = [[-2.8, -1.4], [-2.6, 1.6], [2.9, -1.2], [2.7, 1.5]];
      vl.forEach(([dx, dz], i) => add({ at: [c.x + dx, c.z + dz], y: sandY(c.x + dx, c.z + dz), face: [c.x, c.z + dz], anim: i % 2 ? 'cheer' : 'idle', scale: 0.92 }));
    }
    if (!night) {
      add({ at: [0.7, -18.9], y: sandY(0.7, -18.9), face: [1.6, -19.4], anim: 'sit_ground', scale: 0.62 });
      add({ at: [2.5, -20.1], y: sandY(2.5, -20.1), face: [1.6, -19.4], anim: 'sit_ground', scale: 0.6 });
    } else if (this._bonfire) {
      const [fx, fz, fy] = this._bonfire;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.5;
        add({ at: [fx + Math.cos(a) * 1.7, fz + Math.sin(a) * 1.7], y: fy, face: [fx, fz], anim: i === 2 ? 'talk' : 'sit_ground', prop: i === 1 ? 'drink' : null });
      }
    }
    // window shoppers + a guy checking the bikes
    add({ at: [-11.2, 16.2], face: [-11.2, SHOP_Z], anim: 'talk' });
    add({ at: [-10.2, 16.6], face: [-11.2, 16.2], anim: 'phone', prop: 'phone' });
    add({ at: [11.3, 13.4], face: [9.5, 12], anim: 'idle' });
    if (night || boss) {
      add({ at: [-13.3, 5.5], face: 'board', anim: 'cheer', look: 'club' });
      add({ at: [13.8, 6.2], face: 'board', anim: 'talk', look: 'club', prop: 'drink' });
    }
    if (boss) {
      add({ at: [-12.6, 6.0], face: 'board', anim: 'point', look: 'street', colors: { top: '#ff9f1c' } });
      add({ at: [-12.4, 2.4], face: 'board', anim: 'clap', look: 'street', colors: { top: '#ffe29a' } });
    }
    const all = [...walkers, ...list].map((o) => ({ y: o.path ? this._groundAt(o.path[0][0], o.path[0][1]) : STREET_Y, ...o }));
    const spawned = crowd.spawn(all) || [];
    this._walkers = spawned.filter((n) => n && (n.walker || n.path));
  }

  /** Walkable ground height: deck, stairs, sand, pier ramp. */
  _groundAt(x, z) {
    const onPier = Math.abs(x - PIER_X) <= PIER_W / 2 + 0.2;
    if (onPier && z < DECK_FRONT) return z > -24 ? DECK_Y + (1.3 - DECK_Y) * ((DECK_FRONT - z) / (DECK_FRONT + 24)) : 1.3;
    if (z >= DECK_FRONT) return DECK_Y;
    if (z > DECK_FRONT - 1.9) return DECK_Y + (SAND_TOP - DECK_Y) * ((DECK_FRONT - z) / 1.9);
    return sandY(x, z);
  }

  // ================================================================== per frame
  update(dt, t) {
    const rm = this.reducedMotion;
    const tm = rm ? t * 0.35 : t;
    if (this.sea) this.sea.material.uniforms.uTime.value = t;
    this._updateFerris(dt, t);
    if (this._walkers) {
      for (const n of this._walkers) {
        const p = n.root.position;
        const y = this._groundAt(p.x, p.z);
        p.y += (y - p.y) * Math.min(1, dt * 12);
        n.y = p.y;
      }
    }
    const A = this._anim;
    if (!A) return;
    // palms: gentle whole-tree sway (update every other frame)
    this._frame = (this._frame || 0) + 1;
    if (A.palms && (this._frame & 1) === 0 && !rm) {
      const o = this._tmpO ||= new THREE.Object3D();
      const base = this._palmBase;
      for (let i = 0; i < base.length; i++) {
        const b = base[i];
        o.position.set(b.x, b.y, b.z);
        o.rotation.set(Math.sin(t * 0.7 + b.ph) * 0.012, b.yaw, Math.sin(t * 0.55 + b.ph * 1.3) * 0.016, 'YXZ');
        o.scale.setScalar(b.s);
        o.updateMatrix();
        for (const m of A.palms) m.setMatrixAt(i, o.matrix);
      }
      for (const m of A.palms) m.instanceMatrix.needsUpdate = true;
    }
    // gulls circling
    if (A.gulls) {
      const { im, list, o } = A.gulls;
      for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const a = g.ph + tm * g.sp;
        o.position.set(g.cx + Math.cos(a) * g.rad, g.y + Math.sin(tm * 0.6 + g.ph) * 0.5, g.cz + Math.sin(a) * g.rad);
        const dir = Math.sign(g.sp);
        o.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), -0.28 * dir, 'YXZ');
        const flap = 1 + Math.sin(tm * 4.2 + g.ph) * 0.35 * (0.5 + 0.5 * Math.sin(tm * 0.5 + g.ph));
        o.scale.set(1.3, 1.3 * flap, 1.3);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    // volleyball arcs over the net
    if (A.ball && this._court) {
      const c = this._court;
      const per = 2.6;
      const k = (tm % per) / per, dir = Math.floor(tm / per) % 2 ? 1 : -1;
      const x0 = c.x - 2.7 * dir, x1 = c.x + 2.7 * dir;
      A.ball.position.set(x0 + (x1 - x0) * k, c.y + 2.0 + Math.sin(k * Math.PI) * 2.6, c.z + Math.sin(tm * 0.37) * 1.2);
      A.ball.rotation.x = tm * 3; A.ball.rotation.z = tm * 2;
    }
    // swimmers + floats + boat bob
    if (A.swimmers) {
      const { mesh, spots, o } = A.swimmers;
      for (let i = 0; i < spots.length; i++) {
        o.position.set(spots[i][0] + Math.sin(tm * 0.2 + i) * 0.6, WATER_Y + 0.02 + Math.sin(tm * 1.1 + i * 2.1) * 0.06, spots[i][1]);
        o.rotation.set(0, i * 1.3 + Math.sin(tm * 0.3 + i) * 0.4, 0);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const b of A.bob) {
      b.o.position.y = b.y + Math.sin(tm * 0.9 + b.ph) * b.amp;
      b.o.rotation.z = Math.sin(tm * 0.7 + b.ph) * b.rock;
      if (b.drift) b.o.position.x = b.drift[0] + Math.sin(tm * 0.02) * b.drift[1];
    }
    // flags flutter (vertex wave; few verts)
    if (A.flags.length && !rm) {
      const base = this._flagBase;
      for (const f of A.flags) {
        const p = f.g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3];
          p.setZ(i, Math.sin(x * 5 - t * 4 + f.ph) * 0.07 * x);
        }
        p.needsUpdate = true;
      }
    }
    // speaker ring: soft slow breathing
    if (this._ring) {
      const k = 0.75 + 0.35 * this.pulse(t, 1.8);
      if (this._ring.basic) this._ring.basic.color.setScalar(k * 1.4);
      else for (const m of this._ring.mats) m.emissiveIntensity = this._ring.base * k;
    }
    // bonfire: slow breathing flames + light (no flicker)
    for (const f of A.fires) {
      const p = this.pulse(t, 1.7 + (f.ph % 1), f.ph);
      if (f.m) f.m.scale.set(f.base * (0.92 + 0.08 * p), f.base * (0.85 + 0.25 * p), f.base * (0.92 + 0.08 * p));
      if (f.light) f.light.intensity = f.base * (0.85 + 0.15 * p);
    }
    // confetti
    if (this._confetti) this._updateConfetti(dt);
  }

  // ================================================================== reactions
  react(event) {
    if (event === 'finale') this._burst(260);
    else if (event === 'capture' && !this.reducedMotion) this._burst(40);
  }

  _burst(count) {
    if (!this._confetti) {
      const N = 320;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      const pal = ['#ff5f8f', '#ffd23f', '#2ec4d6', '#ffffff', '#7a5cff', '#ff9f1c'].map((c) => new THREE.Color(c));
      for (let i = 0; i < N; i++) { const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3); pos[i * 3 + 1] = -100; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      this.group.add(pts);
      this._confetti = { pts, N, vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
    }
    const c = this._confetti;
    const pos = c.pts.geometry.attributes.position.array;
    const r = Math.random;
    for (let k = 0; k < count; k++) {
      const i = c.next; c.next = (c.next + 1) % c.N;
      const side = k % 2 ? 1 : -1;
      pos[i * 3] = side * 7.4; pos[i * 3 + 1] = 0.4; pos[i * 3 + 2] = (r() - 0.5) * 6;
      c.vel[i * 3] = -side * (1.2 + r() * 2.2); c.vel[i * 3 + 1] = 5 + r() * 4; c.vel[i * 3 + 2] = (r() - 0.5) * 2;
      c.life[i] = 5 + r() * 3;
    }
  }

  _updateConfetti(dt) {
    const c = this._confetti;
    const pos = c.pts.geometry.attributes.position.array;
    let any = false;
    for (let i = 0; i < c.N; i++) {
      if (c.life[i] <= 0) continue;
      any = true;
      c.life[i] -= dt;
      const vy = c.vel[i * 3 + 1];
      c.vel[i * 3 + 1] = Math.max(-0.9, vy - 9 * dt); // flutter down slowly
      c.vel[i * 3] *= 1 - 0.6 * dt; c.vel[i * 3 + 2] *= 1 - 0.6 * dt;
      pos[i * 3] += (c.vel[i * 3] + Math.sin(c.life[i] * 3 + i) * 0.4) * dt;
      pos[i * 3 + 1] += c.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += c.vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < DECK_Y + 0.05) { pos[i * 3 + 1] = DECK_Y + 0.05; c.vel[i * 3] = c.vel[i * 3 + 2] = 0; }
      if (c.life[i] <= 0) pos[i * 3 + 1] = -100;
    }
    if (any) c.pts.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this._flagGeo?.dispose();
    super.dispose();
  }
}

// ------------------------------------------------------------------ procedural palm template (fallback)
function buildPalmTemplate(mat) {
  const B = new Batch();
  const H = 5.6, segs = 7;
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= segs; i++) {
    const k = i / segs;
    const p = new THREE.Vector3(0.9 * k * k, k * H, 0.2 * k * k);
    B.rod(prev, p, 0.2 - 0.08 * k, i % 2 ? '#7a5c40' : '#6b4f36', 'cyl');
    prev = p;
  }
  const top = prev.clone();
  B.add(unit('sphere'), mtx(top.x, top.y - 0.15, top.z, 0, 0, 0, 0.45), '#4a3a1c');
  const fr = 9;
  for (let i = 0; i < fr; i++) {
    const a = (i / fr) * TAU;
    const L = 2.6;
    const g = new THREE.BufferGeometry();
    const pts = [];
    const seg = 4;
    for (let s = 0; s < seg; s++) {
      const k0 = s / seg, k1 = (s + 1) / seg;
      const w0 = 0.45 * Math.sin(Math.PI * (0.15 + 0.85 * k0)), w1 = 0.45 * Math.sin(Math.PI * (0.15 + 0.85 * k1));
      const y0 = 0.4 * k0 - 1.4 * k0 * k0, y1 = 0.4 * k1 - 1.4 * k1 * k1;
      const x0 = k0 * L, x1 = k1 * L;
      pts.push(x0, y0, -w0, x1, y1, -w1, x1, y1 + 0.05, w1, x0, y0, -w0, x1, y1 + 0.05, w1, x0, y0 + 0.05, w0);
      pts.push(x0, y0, -w0, x1, y1 + 0.05, w1, x1, y1, -w1, x0, y0, -w0, x0, y0 + 0.05, w0, x1, y1 + 0.05, w1);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeVertexNormals();
    B.add(g, mtx(top.x, top.y, top.z, 0, a, 0.1 * (i % 3)), (x) => (x > 1.5 ? '#5fae45' : '#3f8a37'));
    g.dispose();
  }
  const m = B.build(mat, { name: 'palm_tmpl' });
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}
