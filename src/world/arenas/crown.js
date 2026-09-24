// Crown Hills Estate (nh4) — the board is inlaid in the white marble terrace of a gated Miami-Mediterranean mansion
// during a blue-hour garden party: infinity pool over the bay, tiered fountain, parterres & topiary, gold rearing
// horse, DJ + champagne bar, valet cars at the gate, polo lawn, Vice City skyline across the water and a slow yacht.
// Variants: time 'day' | 'dusk' (default) | 'night'; boss → Chairwoman's gala (crimson HOA banners, lanterns, throne).
// Static scenery is baked into a handful of merged meshes (crown/batch.js). Spec: docs/arenas/ARENAS_SPEC.md.
import * as THREE from 'three';
import { Arena, STREET_Y } from './Arena.js';
import { rng } from '../util.js';
import { Batch, floorRect, wallQuad } from './crown/batch.js';
import {
  marbleFloorTexture, darkMarbleTexture, hedgeTexture, lawnTexture, archWindowTexture, skylineTexture,
  bannerTexture, beamTexture, dotTexture,
} from './crown/textures.js';
import { poolMaterial, fallMaterial, swayPatch, wavePatch } from './crown/water.js';
import {
  balustrade, urn, hedge, topiary, boxBall, lampPost, lounger, umbrella, cocktailTable, fountain, horseStatue,
  luxuryCar, golfCart, speakerStack, pottedPalm, djBooth, bar, throne, garland, bannerMesh, flamingo, yacht,
  poloRider, disposeShared,
} from './crown/props.js';
import { podium, villa } from './crown/mansion.js';

const Y0 = STREET_Y;          // terrace level
const YL = STREET_Y - 1.2;    // polo lawn level (west, below the terrace wall)
const YW = -8.6;              // bay water level
const POOL = { x0: -8, x1: 8, z0: 17, z1: 31 };
const EDGE_Z = 31;            // bay-side edge of the estate

// ------------------------------------------------------------------ time-of-day presets
const TIMES = {
  day: {
    sky: { zenith: '#3f7fd0', top: '#6fa6e6', mid: '#b9d4f0', horizon: '#ffe2bf', bottom: '#5a6f8a', sunDir: [-0.7, 0.28, -0.65], sunColor: '#fff0cc', sunGlow: 0.55 },
    hemi: ['#d8e6ff', '#8c7a5c', 1.15], sun: { color: '#fff0d8', intensity: 2.6, dir: [-0.55, 0.75, -0.4] },
    fog: { color: '#d9d4e0', near: 70, far: 420 }, exposure: 1.0, bloom: { strength: 0.32, radius: 0.4, threshold: 0.95 },
    env: 0.7, win: 0.35, globe: 0.4, pool: 0.12, poolLight: 0, sky2: '#bcd6f2', water: '#2d6fa8', stars: 0, beams: 0.0,
    skylineLit: 0.35, lantern: 0.6, fill: 0,
  },
  dusk: {
    sky: { zenith: '#2f3a86', top: '#5e5fb0', mid: '#b99ad0', horizon: '#ffbf94', bottom: '#3a3458', sunDir: [-0.75, 0.05, -0.62], sunColor: '#ffb27a', sunGlow: 0.75, stars: 0.15 },
    hemi: ['#a898e0', '#5e4c44', 0.8], sun: { color: '#ffc49c', intensity: 1.75, dir: [-0.6, 0.6, -0.45] },
    fog: { color: '#b49ac4', near: 60, far: 360 }, exposure: 0.97, bloom: { strength: 0.45, radius: 0.5, threshold: 0.92 },
    env: 0.6, win: 1.25, globe: 1.6, pool: 0.4, poolLight: 14, sky2: '#9f8fd0', water: '#3a4a8a', stars: 0.15, beams: 0.16,
    skylineLit: 0.45, lantern: 1.8, fill: 2.5,
  },
  night: {
    sky: { zenith: '#050822', top: '#0d1640', mid: '#1c2860', horizon: '#3c3a70', bottom: '#0a0b1e', sunDir: [0.45, 0.32, 0.8], sunColor: '#c8d4ff', sunGlow: 0.35, stars: 0.9 },
    hemi: ['#5563b0', '#241c30', 0.75], sun: { color: '#b4c4ff', intensity: 0.85, dir: [0.35, 0.75, -0.55] },
    fog: { color: '#1c2150', near: 55, far: 320 }, exposure: 1.0, bloom: { strength: 0.55, radius: 0.5, threshold: 0.9 },
    env: 0.45, win: 1.2, globe: 2.0, pool: 0.6, poolLight: 22, sky2: '#34407a', water: '#141c44', stars: 0.9, beams: 0.2,
    skylineLit: 0.55, lantern: 2.2, fill: 4,
  },
};

export default class CrownArena extends Arena {
  async build() {
    const v = this.variant || {};
    const boss = !!v.boss;
    const timeKey = TIMES[v.time] ? v.time : boss ? 'night' : 'dusk';
    const T = (this.T = TIMES[timeKey]);
    this.timeKey = timeKey;
    this.boss = boss;
    this.time = { value: 0 };
    const low = this.ctx.quality === 'low';
    const r = rng(1904);

    // ---- GLBs (all optional, loaded in parallel)
    const P = 'models/arenas/crown/';
    const [gMansion, gTopiary, gFountain, gBalustrade, gHorse, gCart, gLounger, gPot, gCar, gCar2, gSpeaker] = await Promise.all([
      this.glb(P + 'mansion.glb'), this.glb(P + 'topiary.glb'), this.glb(P + 'fountain.glb'), this.glb(P + 'balustrade.glb'),
      this.glb(P + 'horse_statue.glb'), this.glb(P + 'golf_cart.glb'),
      this.glb('models/props/lounge_chair.glb'), this.glb('models/props/plant_pot.glb'), this.glb('models/props/car_luxury.glb'),
      this.glb('models/props/car_muscle.glb'), this.glb('models/props/speaker_stack.glb'),
    ]);
    this.usedGlbs = Object.entries({ mansion: gMansion, topiary: gTopiary, fountain: gFountain, balustrade: gBalustrade, horse_statue: gHorse,
      golf_cart: gCart, lounge_chair: gLounger, plant_pot: gPot, car_luxury: gCar, car_muscle: gCar2, speaker_stack: gSpeaker })
      .filter(([, g]) => !!g).map(([k]) => k);

    // ---- sky, lights
    this.addSky({ ...T.sky, stars: T.stars });
    this.hemi = this.addHemi(new THREE.Color(T.hemi[0]), new THREE.Color(T.hemi[1]), T.hemi[2]);
    this.addSun({ color: new THREE.Color(T.sun.color), intensity: T.sun.intensity, dir: T.sun.dir });
    if (T.poolLight) {
      const pl = new THREE.PointLight(0x46e8e0, T.poolLight, 22, 1.6);
      pl.position.set(0, -0.05, 24);
      this.addLight(pl);
      this.poolLight = pl;
    }
    if (T.fill) {
      // warm "party light" fill over the terrace so pieces keep their colour at dusk/night
      const fl = new THREE.PointLight(0xffd6a0, T.fill * 4, 30, 1.2);
      fl.position.set(0, 9, 2);
      this.addLight(fl);
    }

    // ---- materials (keys used by the Batch)
    const M = this._materials(T, boss);
    const B = new Batch();
    const glbMat = (map) => (mat) => {
      const n = mat?.name || '';
      for (const k in map) if (n.startsWith(k)) return map[k];
      return null;
    };
    const placeGlb = (root, x, y, z, yaw, height, map) => {
      const holder = this.prop(root, { height });
      B.addObject(holder, Batch.mat(x, y, z, 0, yaw), glbMat(map));
    };

    // ================================================================ ground
    // terrace marble (with the pool cut out)
    B.add('floor', floorRect(-18, -44, 18, POOL.z0, Y0, 3));
    B.add('floor', floorRect(-18, POOL.z0, POOL.x0, EDGE_Z, Y0, 3));
    B.add('floor', floorRect(POOL.x1, POOL.z0, 18, EDGE_Z, Y0, 3));
    // grounds (east / north) + driveway pavers + polo lawn (west, lower)
    B.add('grass', floorRect(18, -400, 400, EDGE_Z, Y0 - 0.02, 4));
    B.add('grass', floorRect(-18, -400, 18, -44, Y0 - 0.02, 4));
    B.add('pave', floorRect(18, -30, 36, 26, Y0 - 0.005, 2));
    B.add('pave', floorRect(36, 2, 400, 8, Y0 - 0.008, 2));
    B.add('lawn', floorRect(-400, -400, -18, EDGE_Z, YL, 12));
    // walls: terrace → lawn, estate → bay
    B.add('stone', wallQuad(-18, -44, -18, EDGE_Z, YL, Y0, 2));
    B.add('rock', wallQuad(-18, EDGE_Z, 400, EDGE_Z, YW - 1, Y0, 4));
    B.add('rock', wallQuad(-400, EDGE_Z, -18, EDGE_Z, YW - 1, YL, 4));
    B.box('stone', 36.4, 0.5, 0.6, 0, Y0 - 0.25, EDGE_Z + 0.3); // cap band under the edge
    // board inlay band (dark green marble + gold lines) in the apron
    this._inlay(B);
    // pool
    this._pool(B, M);

    // ================================================================ mansion
    const yP = podium(B, Y0, { zFront: -27 });
    if (gMansion) placeGlb(this.tint(gMansion, {}), 0, yP, -36, 0, 11, { TINT_Wall: 'stucco', TINT_Roof: 'roof', EMISSIVE_Windows: 'winPlain', GLASS: 'glass' });
    else villa(B, yP, { zF: -30 });

    // ================================================================ gardens
    // fountain (between the board and the mansion steps)
    if (gFountain) {
      const f = this.prop(gFountain, { height: 3.4 });
      B.addObject(f, Batch.mat(0, Y0, -20, 0, 0, 0, 1.35), glbMat({ TINT_Stone: 'marble', WATER: 'fall' }));
    } else fountain(B, 0, -20, Y0, 2.6);
    // parterres flanking the fountain
    for (const sx of [-1, 1]) {
      const xa = sx * 4.4, xb = sx * 11;
      const [x0, x1] = sx < 0 ? [xb, xa] : [xa, xb];
      hedge(B, x0, -24.6, x1, -24.1, 0.55, Y0);
      hedge(B, x0, -17.5, x1, -17.0, 0.55, Y0);
      hedge(B, sx < 0 ? x0 : x1 - 0.5, -24.1, sx < 0 ? x0 + 0.5 : x1, -17.5, 0.55, Y0);
      hedge(B, sx < 0 ? x1 - 0.5 : x0, -24.1, sx < 0 ? x1 : x0 + 0.5, -21.3, 0.55, Y0);
      hedge(B, sx < 0 ? x1 - 0.5 : x0, -19.8, sx < 0 ? x1 : x0 + 0.5, -17.5, 0.55, Y0);
      B.box('soil', Math.abs(x1 - x0) - 1, 0.1, 6.6, (x0 + x1) / 2, Y0 + 0.05, -20.8);
      // flower rows
      for (let i = 0; i < 4; i++) {
        const key = boss ? (i % 2 ? 'flowerRed' : 'flowerWhite') : ['flowerPink', 'flowerWhite', 'flowerRed', 'flowerPink'][i];
        B.box(key, Math.abs(x1 - x0) - 1.4, 0.28, 0.9, (x0 + x1) / 2, Y0 + 0.24, -23.1 + i * 1.6);
      }
      boxBall(B, (x0 + x1) / 2, -20.8, Y0 + 0.1, 0.55);
      for (const cz of [-24.35, -17.25]) for (const cx of [x0, x1]) {
        if (gTopiary) placeGlb(this.tint(gTopiary.clone(), {}), cx, Y0, cz, 0, 1.8, { TINT_Leaves: 'hedge' });
        else topiary(B, cx, cz, Y0, 0, 1);
      }
    }
    // low boxwood balls along the camera corridors (≤ 1.2 m)
    for (const sx of [-1, 1]) for (const z of [-9, -12.5, 9.5, 13]) boxBall(B, sx * 5.2, z, Y0, 0.42);
    // side hedges + topiary rhythm along the terrace edges
    for (const sx of [-1, 1]) {
      for (const z of [-17, -7, 13]) hedge(B, sx * 16.9 - 0.45, z - 1.8, sx * 16.9 + 0.45, z + 1.8, 1.15, Y0);
      if (sx < 0) hedge(B, -17.35, 1.2, -16.45, 4.8, 1.15, Y0);
      for (const z of [-22, -12, -2, 8]) {
        if (sx > 0 && z === 8) continue;
        const kind = z === -2 ? 1 : 0;
        if (gTopiary) placeGlb(this.tint(gTopiary.clone(), {}), sx * 14.6, Y0, z + 5, 0, 1.8, { TINT_Leaves: 'hedge' });
        else topiary(B, sx * 14.6, z + 5, Y0, kind, 1.05);
      }
    }
    // balustrades at the terrace edges (+ gap for the driveway on the east)
    const bal = (x0, z0, x1, z1, y = Y0, o = {}) => {
      if (gBalustrade) {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2));
        const yaw = Math.atan2(-(z1 - z0), x1 - x0);
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n;
          const seg = this.prop(gBalustrade.clone(), {});
          B.addObject(seg, Batch.mat(x0 + (x1 - x0) * k, y, z0 + (z1 - z0) * k, 0, yaw, 0, len / n / 2, 1, 1), glbMat({ TINT_Stone: 'marble' }));
        }
      } else balustrade(B, x0, z0, x1, z1, y, o);
    };
    const bFlowers = boss ? 'flowerRed' : 'flowerPink';
    bal(-17.8, -26, -17.8, EDGE_Z - 0.2, Y0, { postEvery: 5.7, flowerKey: bFlowers });
    bal(17.8, -26, 17.8, 1.5, Y0, { postEvery: 5.5, flowerKey: bFlowers });
    bal(17.8, 9.5, 17.8, EDGE_Z - 0.2, Y0, { postEvery: 5.4, flowerKey: bFlowers });
    bal(-17.8, EDGE_Z - 0.2, POOL.x0 - 0.5, EDGE_Z - 0.2, Y0, { postEvery: 4.8, flowerKey: bFlowers });
    bal(POOL.x1 + 0.5, EDGE_Z - 0.2, 17.8, EDGE_Z - 0.2, Y0, { postEvery: 4.8, flowerKey: bFlowers });
    // driveway gate piers on the terrace edge
    for (const z of [1.2, 9.8]) {
      B.box('marble', 0.8, 1.6, 0.8, 17.8, Y0 + 0.8, z);
      urn(B, 17.8, Y0 + 1.6, z, 0.8, 'marble', bFlowers);
    }

    // ================================================================ palms (+ uplights)
    const palmSpots = [
      [-16.3, -22], [-16.3, -12], [-16.3, -2], [-16.3, 8], [16.3, -22], [16.3, -12], [16.3, 14],
      [-10.2, 30], [10.2, 30], [-16, 22], [16, 22], [-23.5, -30], [23.5, -31], [-12.5, -30.5], [12.5, -30.5],
      [20.5, -24], [20.5, 22], [31, -24], [-26, 22], [-30, -12], [-36, -38], [44, -20], [46, 20],
    ];
    this._palms(B, palmSpots);

    // ================================================================ lamps, party furniture
    const globes = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) globes.push(...lampPost(B, sx * 7.3, sz * 7.7, Y0, { h: 3.0 }));
    for (const sx of [-1, 1]) globes.push(...lampPost(B, sx * 9.2, 16.8, Y0, { h: 3.0 }), ...lampPost(B, sx * 12.2, -26.2, Y0, { h: 3.4, twin: true }));
    // west: champagne bar + cocktail tables
    bar(B, -12.3, 1.2, Y0, Math.PI / 2, 5);
    cocktailTable(B, -9.6, -6.2, Y0);
    cocktailTable(B, -10.2, 9.2, Y0);
    // east: DJ booth + speakers
    djBooth(B, 13.2, -3, Y0, -Math.PI / 2);
    for (const z of [-5.4, -0.6]) {
      if (gSpeaker) placeGlb(this.tint(gSpeaker.clone(), { TINT_Cabinet: '#1b1a22', EMISSIVE_Ring: '#ffcf7a' }, { intensity: 1.2 }), 13.4, Y0, z, -Math.PI / 2, 1.7, {});
      else speakerStack(B, 13.4, z, Y0, -Math.PI / 2);
    }
    cocktailTable(B, 9.8, 8.2, Y0);
    cocktailTable(B, 9.9, -7.6, Y0);
    // potted palms around the bar and DJ
    for (const [x, z] of [[-12.6, -2.2], [-12.6, 4.6], [13.6, -7.3], [13.6, 1.4]]) {
      if (gPot) placeGlb(this.tint(gPot.clone(), { TINT_Pot: '#efe7da' }), x, Y0, z, r() * 6, 1.6, {});
      else pottedPalm(B, x, z, Y0, 1.1);
    }
    // pool deck: loungers + umbrellas
    const loungerSpots = [];
    for (const sx of [-1, 1]) for (const [i, x] of [10.2, 12.4, 14.6].entries()) {
      const key = i === 1 ? 'cushionPink' : 'cushion';
      loungerSpots.push([sx * x, 24.2]);
      if (gLounger) placeGlb(this.tint(gLounger.clone(), { TINT_Cushion: i === 1 ? '#f7c6d9' : '#fbf7ef' }), sx * x, Y0, 24.2, 0, 0.9, {});
      else lounger(B, sx * x, 24.2, Y0, 0, key);
    }
    for (const sx of [-1, 1]) for (const x of [11.3, 13.5]) umbrella(B, sx * x, 22.6, Y0, x === 11.3 ? 'canvas' : 'canvasMint');
    // pool towels stack + little table
    B.box('teak', 0.6, 0.45, 0.6, -15.6, Y0 + 0.225, 20.2);
    B.box('cushionPink', 0.5, 0.18, 0.4, -15.6, Y0 + 0.54, 20.2);

    // ================================================================ gold horse (polo pride)
    if (gHorse) placeGlb(this.tint(gHorse, { TINT_Gold: '#d9a93a' }), -13.4, Y0, -14.2, 0.78, 4.4, { TINT_Gold: 'gold' });
    else horseStatue(B, -13.4, -14.2, Y0, 0.78, 1.05);

    // ================================================================ driveway, cars, gate
    const carSpots = [[25.2, -17, -Math.PI / 2, 'carWhite'], [25.2, -10.5, -Math.PI / 2, 'carBlack'], [27.5, 17.5, Math.PI, 'carGold']];
    for (const [x, z, yaw, key] of carSpots) {
      const glbCar = key === 'carGold' ? (gCar2 || gCar) : gCar;
      if (glbCar) {
        const col = { carWhite: '#f4f1ea', carBlack: '#15151c', carGold: '#d6a940' }[key];
        placeGlb(this.tint(glbCar.clone(), { TINT_Body: col, TINT_Rims: '#d9d9e0', EMISSIVE_Headlight: '#fff2d8', EMISSIVE_Taillight: '#ff3030', EMISSIVE_Underglow: '#000000' }, { intensity: 0.8 }),
          x, Y0, z, yaw, 1.4, { GLASS: 'carGlass' });
      } else luxuryCar(B, x, z, Y0, yaw, key, { long: key === 'carGold' ? 4.7 : 5.2, convertible: key === 'carGold' });
    }
    // valet podium
    B.box('teak', 0.6, 1.1, 0.45, 21.6, Y0 + 0.55, -13.8);
    B.box('gold', 0.66, 0.05, 0.5, 21.6, Y0 + 1.12, -13.8);
    umbrella(B, 21.6, -12.6, Y0, 'canvas', 2.4);
    // roundabout planter with palm-less topiary ring
    B.put('marble', new THREE.CylinderGeometry(3.2, 3.3, 0.45, 28), 27, Y0 + 0.225, 4.2);
    B.put('hedge', new THREE.CylinderGeometry(3.0, 3.0, 0.2, 28), 27, Y0 + 0.5, 4.2);
    urn(B, 27, Y0 + 0.55, 4.2, 1.5, 'marble', bFlowers);
    this._gate(B, globes);
    // golf cart down on the polo lawn
    if (gCart) placeGlb(this.tint(gCart, { TINT_Body: '#f4f1ea' }), -22.5, YL, -4, 0.4, 1.8, {});
    else golfCart(B, -22.5, -4, YL, 0.4, 'cartWhite');

    // ================================================================ polo lawn, hills, skyline, bay
    this._polo(B, M);
    this._distance(B, M, T);

    // ================================================================ boss gala decor
    if (boss) this._gala(B, M, globes);

    // ================================================================ flush statics
    const cast = new Set(['marble', 'hedge', 'gold', 'iron', 'teak', 'cushion', 'cushionPink', 'canvas', 'canvasMint', 'cloth', 'stucco', 'palm:0', 'palm:1', 'palm:2', 'palm:3', 'palm:4', 'leaf', 'carWhite', 'carBlack', 'carGold', 'speaker', 'crimson']);
    this.meshes = B.flush(this.group, M, { cast });
    for (const k of ['lawn', 'grass', 'rock', 'hill', 'tree', 'sky0', 'sky1', 'sky2', 'water', 'fall', 'beam', 'pave']) {
      const m = this.meshes[k]; if (m) { m.castShadow = false; if (k !== 'lawn' && k !== 'grass' && k !== 'pave') m.receiveShadow = false; }
    }
    // palms/flowers sway via their materials (shared uniform); fountain/pool via shaders
    this.globes = globes;

    // ================================================================ moving bits
    this._movers(M);

    // ================================================================ mood + board surround
    this.buildEnvMap([
      { color: '#ffcf8a', pos: [0, 6, -40], size: [30, 10], mult: T.win * 1.6 },
      { color: '#46e8e0', pos: [0, -2, 30], size: [16, 6], mult: 1.2 + T.pool * 2 },
    ]);
    this.mood = {
      background: T.sky.horizon,
      fog: T.fog,
      exposure: T.exposure,
      bloom: T.bloom,
      envIntensity: T.env,
    };
    this.boardStyle = {
      frame: '#efe6d6', frameText: '#4a3826',
      plinth: '#e6dccb', plinthMap: 'marble',
      kerb: 'gold', kerbColors: boss ? ['#c9303a', '#f4ede0'] : ['#c99a3e', '#f4ede0'],
      neon: timeKey === 'day' ? null : boss ? ['#ffcf7a', '#e5383b'] : ['#ffd49a', '#ffd49a'],
      neonIntensity: timeKey === 'night' ? 1.9 : 1.3,
    };

    // ================================================================ people
    this._people(low, boss, loungerSpots);
  }

  // ------------------------------------------------------------------ materials
  _materials(T, boss) {
    const S = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
    const E = (color, intensity, o = {}) => new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: intensity, roughness: 0.5, ...o });
    const floorTex = marbleFloorTexture();
    const dark = darkMarbleTexture();
    const hedgeTex = hedgeTexture();
    const lawnTex = lawnTexture();
    const win1 = archWindowTexture(0), win2 = archWindowTexture(1);
    const t = this.time;
    const M = {
      floor: S('#ffffff', { map: floorTex, roughness: 0.5, envMapIntensity: 0.45 }),
      marble: S('#f4eee4', { roughness: 0.42, envMapIntensity: 0.55 }),
      marbleDark: S('#ffffff', { map: dark, roughness: 0.35, envMapIntensity: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      inlayGold: S('#d8a94a', { metalness: 0.85, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      stone: S('#ddd0bb', { roughness: 0.8 }),
      rock: S('#8a7a68', { roughness: 0.95 }),
      gold: S('#e0ae45', { metalness: 0.9, roughness: 0.28, envMapIntensity: 1.2 }),
      stucco: S('#f3e5cc', { roughness: 0.85 }),
      peach: S('#f0ae8c', { roughness: 0.8 }),
      white: S('#fbf6ec', { roughness: 0.7 }),
      roof: S('#c4633e', { roughness: 0.75, flatShading: true }),
      terracotta: S('#c77650', { roughness: 0.8 }),
      win: S('#ffffff', { map: win1, emissiveMap: win1, emissive: '#ffffff', emissiveIntensity: T.win, alphaTest: 0.5, roughness: 0.4 }),
      win2: S('#ffffff', { map: win2, emissiveMap: win2, emissive: '#ffffff', emissiveIntensity: T.win * 1.1, alphaTest: 0.5, roughness: 0.4 }),
      winPlain: E('#ffc878', T.win),
      glass: S('#2a3350', { roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.6 }),
      hedge: S('#ffffff', { map: hedgeTex, roughness: 0.95 }),
      leaf: S('#3f7a3a', { roughness: 0.8, side: THREE.DoubleSide }),
      grass: S('#4d7a3c', { map: lawnTex, roughness: 1 }),
      lawn: S('#ffffff', { map: lawnTex, roughness: 1 }),
      soil: S('#4a3526', { roughness: 1 }),
      pave: S('#d9c9ae', { roughness: 0.85 }),
      iron: S('#1c1b22', { metalness: 0.6, roughness: 0.45 }),
      globe: E('#ffe2a8', T.globe, { color: '#fff4e0' }),
      lantern: E(boss ? '#ff6a4a' : '#ffc36a', T.lantern, { color: '#ffe0c0' }),
      teak: S('#9a6b45', { roughness: 0.7 }),
      cushion: S('#fbf7ef', { roughness: 0.9 }),
      cushionPink: S('#f7bfd3', { roughness: 0.9 }),
      canvas: S('#f6efe0', { roughness: 0.9, side: THREE.DoubleSide }),
      canvasMint: S('#a8e3cf', { roughness: 0.9, side: THREE.DoubleSide }),
      cloth: S('#fbf8f2', { roughness: 0.9 }),
      glassware: S('#dfeff5', { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 }),
      champagne: E('#f6d27a', 0.35, { color: '#f7e2a6', roughness: 0.15, metalness: 0.3 }),
      bottleGreen: S('#1f4a2c', { roughness: 0.2 }),
      bottleAmber: S('#8a4a14', { roughness: 0.2 }),
      flowerPink: S('#ff5fa2', { roughness: 0.85, flatShading: true }),
      flowerRed: S('#e5383b', { roughness: 0.85, flatShading: true }),
      flowerWhite: S('#fdf6ee', { roughness: 0.85, flatShading: true }),
      speaker: S('#1b1a22', { roughness: 0.6 }),
      ringGlow: E('#ffcf7a', 1.1),
      chrome: S('#e6e6ee', { metalness: 1, roughness: 0.18 }),
      tire: S('#141417', { roughness: 0.9 }),
      carGlass: S('#1a2030', { metalness: 0.6, roughness: 0.08, envMapIntensity: 1.4 }),
      leather: S('#e8dcc6', { roughness: 0.7 }),
      carWhite: S('#f4f1ea', { metalness: 0.4, roughness: 0.25, envMapIntensity: 1.1 }),
      carBlack: S('#15151c', { metalness: 0.6, roughness: 0.2, envMapIntensity: 1.3 }),
      carGold: S('#d6a940', { metalness: 0.8, roughness: 0.25, envMapIntensity: 1.2 }),
      cartWhite: S('#f4f1ea', { roughness: 0.4 }),
      headlight: E('#fff2d8', 0.6 + T.globe * 0.3),
      taillight: E('#ff3030', 0.5 + T.globe * 0.2),
      crimson: S(boss ? '#c9303a' : '#b3242a', { roughness: 0.75 }),
      crimsonDark: S('#6a1a22', { roughness: 0.7 }),
      water: S(T.water, { roughness: 0.18, metalness: 0.1, envMapIntensity: 1.2 }),
      pool: poolMaterial(t, { sky: T.sky2, glow: T.pool, edge: [16, 14] }),
      fwater: poolMaterial(t, { deep: '#2aa8c0', shallow: '#8ff0ee', sky: T.sky2, glow: T.pool + 0.1, scale: 1.1, edge: [3, 3], speed: 0.9 }),
      fall: fallMaterial(t, { opacity: 0.6, color: '#bff4ff' }),
      beam: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd49a').multiplyScalar(T.beams), map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }),
      tree: S('#2d4a32', { roughness: 1, flatShading: true }),
      hill: S('#56685e', { roughness: 1 }),
      white2: S('#ffffff', { roughness: 0.6 }),
      yHull: S('#f7f7f4', { roughness: 0.35, envMapIntensity: 1 }),
      yGlass: S('#141a2a', { roughness: 0.1, metalness: 0.6, emissive: '#3a2a10', emissiveIntensity: T.win * 0.6 }),
      yStripe: S('#1d2a4a', { roughness: 0.4 }),
      yLight: E('#ffe0a8', 0.8 + T.globe),
      sign: S('#ffffff', { roughness: 0.6 }),
    };
    // skyline materials
    for (let i = 0; i < 3; i++) {
      const tx = skylineTexture(10 + i, i === 1 ? ['#9fe8ff', '#ffe6b8'] : ['#ffd08a', '#ffe6b8', '#ff9ec8'], T.skylineLit);
      M['sky' + i] = S(['#3a3458', '#2e3050', '#453a5c'][i], { map: tx.map, emissiveMap: tx.emissive, emissive: '#ffffff', emissiveIntensity: 0.6 + T.win * 0.6, roughness: 0.6 });
    }
    M.balus = M.marble; // balustrades: same look, no shadow casting (lots of small tris)
    return (this.M = M);
  }

  // ------------------------------------------------------------------ inlay band around the board
  _inlay(B) {
    const band = (inner, outer, key, y) => {
      const s = new THREE.Shape();
      s.moveTo(-outer, -outer); s.lineTo(outer, -outer); s.lineTo(outer, outer); s.lineTo(-outer, outer); s.lineTo(-outer, -outer);
      const h = new THREE.Path();
      h.moveTo(-inner, -inner); h.lineTo(-inner, inner); h.lineTo(inner, inner); h.lineTo(inner, -inner); h.lineTo(-inner, -inner);
      s.holes.push(h);
      const g = new THREE.ShapeGeometry(s);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv, p = g.attributes.position;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.5, p.getZ(i) / 2.5);
      B.put(key, g, 0, y, 0);
    };
    band(5.38, 6.15, 'marbleDark', Y0 + 0.003);
    band(5.42, 5.47, 'inlayGold', Y0 + 0.005);
    band(6.06, 6.11, 'inlayGold', Y0 + 0.005);
    // compass-star medallions in the two camera corridors + runner lines to the fountain / pool
    for (const cz of [-11.6, 11.6]) {
      const star = new THREE.Shape();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 0.62 : i % 4 === 0 ? 1.75 : 1.2;
        const px = Math.sin(a) * rr, pz = Math.cos(a) * rr;
        if (i === 0) star.moveTo(px, pz); else star.lineTo(px, pz);
      }
      const sg = new THREE.ShapeGeometry(star); sg.rotateX(-Math.PI / 2);
      B.put('inlayGold', sg, 0, Y0 + 0.006, cz);
      const disc = new THREE.RingGeometry(1.95, 2.3, 40); disc.rotateX(-Math.PI / 2);
      B.put('marbleDark', disc, 0, Y0 + 0.004, cz);
      const ring = new THREE.RingGeometry(2.3, 2.36, 40); ring.rotateX(-Math.PI / 2);
      B.put('inlayGold', ring, 0, Y0 + 0.006, cz);
      for (const sx of [-1, 1]) {
        const s0 = Math.sign(cz);
        B.put('marbleDark', new THREE.PlaneGeometry(0.16, 8.6).rotateX(-Math.PI / 2), sx * 1.4, Y0 + 0.004, s0 * 11.5);
      }
    }
    // corner diamonds
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const d = new THREE.CircleGeometry(0.34, 4);
      d.rotateX(-Math.PI / 2);
      B.put('inlayGold', d, sx * 5.77, Y0 + 0.006, sz * 5.77);
    }
  }

  // ------------------------------------------------------------------ infinity pool
  _pool(B) {
    const { x0, x1, z0, z1 } = POOL;
    const w = x1 - x0, d = z1 - z0;
    const water = new THREE.PlaneGeometry(w, d);
    water.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(water, this.M.pool);
    mesh.position.set((x0 + x1) / 2, Y0 - 0.03, (z0 + z1) / 2);
    mesh.receiveShadow = false;
    this.group.add(mesh);
    // coping on three sides, flush infinity edge on the bay side
    B.box('marble', 0.45, 0.07, d, x0 - 0.2, Y0 + 0.035, (z0 + z1) / 2);
    B.box('marble', 0.45, 0.07, d, x1 + 0.2, Y0 + 0.035, (z0 + z1) / 2);
    B.box('marble', w + 0.85, 0.07, 0.45, 0, Y0 + 0.035, z0 - 0.2);
    // steps into the pool (visible through the water as lighter bands)
    // overflow sheet down the wall to the catch basin
    const sheet = new THREE.PlaneGeometry(w, 2.4);
    B.put('fall', sheet, 0, Y0 - 1.24, z1 + 0.03);
    B.box('stone', w + 1, 0.5, 1.2, 0, Y0 - 2.65, z1 + 0.6);
    const catchG = new THREE.PlaneGeometry(w, 1.0); catchG.rotateX(-Math.PI / 2);
    B.put('fwater', catchG, 0, Y0 - 2.39, z1 + 0.6);
  }

  // ------------------------------------------------------------------ palms (GLB from ctx.models or procedural)
  _palms(B, spots) {
    const r = rng(77);
    const glb = this.ctx.models?.palm;
    const M = this.M;
    const beams = [];
    if (glb) {
      const tmpl = this.prop(glb.clone(true), { height: 6.5 });
      const keyFor = new Map();
      tmpl.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (keyFor.has(m)) continue;
          const key = 'palm:' + keyFor.size;
          const c = m.clone(); c.userData = {};
          swayPatch(c, this.time, { base: Y0, amp: 0.0022 });
          M[key] = c;
          keyFor.set(m, key);
        }
      });
      for (const [x, z] of spots) {
        const y = x < -18 ? YL : Y0;
        const s = 0.85 + r() * 0.4;
        B.addObject(tmpl, Batch.mat(x, y, z, 0, r() * Math.PI * 2, 0, s), (m) => keyFor.get(m) || null);
        if (x > -18 && Math.abs(x) < 26) beams.push([x, y, z]);
      }
    } else {
      M['palm:0'] = swayPatch(new THREE.MeshStandardMaterial({ color: '#7a5f45', roughness: 0.9 }), this.time, { base: Y0, amp: 0.0022 });
      M['palm:1'] = swayPatch(new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.8, side: THREE.DoubleSide }), this.time, { base: Y0, amp: 0.0022 });
      for (const [x, z] of spots) {
        const y = x < -18 ? YL : Y0;
        const H = 5.5 + r() * 1.5;
        const trunk = new THREE.CylinderGeometry(0.14, 0.24, H, 7);
        B.put('palm:0', trunk, x, y + H / 2, z);
        for (let i = 0; i < 9; i++) {
          const f = new THREE.ConeGeometry(0.35, 2.6, 4); f.scale(1, 1, 0.12); f.translate(0, 1.3, 0);
          f.rotateX(1.25 + r() * 0.4); f.rotateY((i / 9) * Math.PI * 2);
          B.put('palm:1', f, x, y + H, z);
        }
        if (x > -18 && Math.abs(x) < 26) beams.push([x, y, z]);
      }
    }
    // uplight beams (soft additive cones hugging the trunks) + ground glow disks
    if (this.T.beams > 0) {
      for (const [x, y, z] of beams) {
        const c = new THREE.CylinderGeometry(0.2, 0.42, 3.6, 10, 1, true);
        B.put('beam', c, x, y + 1.8, z);
        B.put('globe', new THREE.CylinderGeometry(0.12, 0.14, 0.08, 8), x + 0.45, y + 0.04, z);
      }
    }
  }

  // ------------------------------------------------------------------ gate + gatehouse (east)
  _gate(B, globes) {
    const gx = 35.5;
    // perimeter hedge wall with a gap for the gate
    hedge(B, gx - 0.6, -44, gx + 0.6, 0.6, 2.4, Y0);
    hedge(B, gx - 0.6, 9.4, gx + 0.6, EDGE_Z, 2.4, Y0);
    for (const z of [0.6, 9.4]) {
      B.box('marble', 1.2, 3.2, 1.2, gx, Y0 + 1.6, z);
      B.box('marble', 1.45, 0.2, 1.45, gx, Y0 + 3.3, z);
      B.put('gold', new THREE.SphereGeometry(0.32, 12, 8), gx, Y0 + 3.7, z);
      globes.push(...lampPost(B, gx - 1.1, z + (z < 5 ? -0.9 : 0.9), Y0, { h: 2.6 }));
    }
    // wrought-iron gate (closed) with gold spear tips
    for (let i = 0; i < 26; i++) {
      const z = 1.3 + i * 0.3;
      const h = 2.3 + Math.sin((i / 25) * Math.PI) * 0.6;
      B.box('iron', 0.05, h, 0.05, gx, Y0 + h / 2, z);
      B.put('gold', new THREE.ConeGeometry(0.05, 0.16, 4), gx, Y0 + h + 0.08, z);
    }
    B.box('iron', 0.08, 0.08, 7.8, gx, Y0 + 0.4, 5);
    B.box('iron', 0.08, 0.08, 7.8, gx, Y0 + 1.9, 5);
    B.put('gold', new THREE.TorusGeometry(0.5, 0.06, 6, 20), gx, Y0 + 2.2, 5, Math.PI / 2);
    // guard house
    const hx = gx + 3.2, hz = -3.2;
    B.box('stucco', 2.8, 2.7, 2.6, hx, Y0 + 1.35, hz);
    B.box('white', 3.3, 0.18, 3.1, hx, Y0 + 2.79, hz);
    B.put('roof', new THREE.ConeGeometry(2.4, 1.1, 4).rotateY(Math.PI / 4), hx, Y0 + 3.4, hz);
    B.box('winPlain', 0.05, 0.9, 1.6, hx - 1.42, Y0 + 1.6, hz);
    B.box('winPlain', 1.4, 0.9, 0.05, hx, Y0 + 1.6, hz + 1.32);
    // HOA sign on the pier
    const sign = this._signTexture();
    const sg = new THREE.PlaneGeometry(1.6, 0.8);
    const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 }));
    sm.position.set(gx - 0.62, Y0 + 1.7, 0.6); sm.rotation.y = -Math.PI / 2;
    this.group.add(sm);
    // boom barrier-free: just a stripe of red-and-white bollards
    for (let i = 0; i < 3; i++) B.put('white', new THREE.CylinderGeometry(0.12, 0.14, 0.8, 8), gx + 1.4, Y0 + 0.4, 2.8 + i * 2.2);
  }

  _signTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#16322b'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#d8a94a'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#f4ede0'; g.textAlign = 'center';
    g.font = 'bold 30px Georgia, serif'; g.fillText('CROWN HILLS', 128, 52);
    g.font = 'italic 17px Georgia, serif'; g.fillStyle = '#e8c878'; g.fillText('Private · Residents & Guests', 128, 80);
    g.font = '13px Georgia, serif'; g.fillStyle = '#f4ede0'; g.fillText('By order of the H.O.A.', 128, 104);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ------------------------------------------------------------------ polo lawn (west)
  _polo(B) {
    for (const gx of [-40, -96]) {
      for (const z of [-3.8, 3.8]) {
        B.put('white2', new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8), gx, YL + 1.6, z);
        B.put('crimson', new THREE.CylinderGeometry(0.13, 0.13, 0.4, 8), gx, YL + 2.9, z);
      }
    }
    // white rail fence around the field
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
      for (const h of [0.45, 0.9]) B.put('white2', new THREE.BoxGeometry(len, 0.08, 0.08), (x0 + x1) / 2, YL + h, (z0 + z1) / 2, yaw);
      const n = Math.floor(len / 3);
      for (let i = 0; i <= n; i++) B.box('white2', 0.12, 1.0, 0.12, x0 + (x1 - x0) * i / n, YL + 0.5, z0 + (z1 - z0) * i / n);
    };
    rail(-30, -26, -106, -26);
    rail(-30, 26, -106, 26);
    rail(-106, -26, -106, 26);
    // striped pavilion tent
    for (const [x, z] of [[-60, -30], [-70, -30]]) {
      B.put('canvas', new THREE.ConeGeometry(3.2, 2.2, 8, 1, true), x, YL + 3.4, z);
      B.put('white2', new THREE.CylinderGeometry(3.0, 3.0, 2.3, 8, 1, true), x, YL + 1.15, z);
      B.put('crimson', new THREE.ConeGeometry(0.18, 0.8, 5), x, YL + 4.9, z);
    }
  }

  // ------------------------------------------------------------------ hills, trees, skyline, bay
  _distance(B, M, T) {
    const r = rng(9);
    // bay water
    const w = new THREE.PlaneGeometry(1600, 900);
    w.rotateX(-Math.PI / 2);
    B.put('water', w, 0, YW, EDGE_Z + 450);
    // distant hill ring (west / south / east), low poly
    const hill = new THREE.CylinderGeometry(300, 300, 40, 120, 1, true, Math.PI * 0.15, Math.PI * 1.25);
    const p = hill.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) <= 0) continue;
      const a = Math.atan2(p.getX(i), p.getZ(i));
      p.setY(i, p.getY(i) - 12 + Math.sin(a * 3) * 7 + Math.sin(a * 7 + 1) * 4 + Math.sin(a * 17 + 2) * 1.5);
    }
    hill.computeVertexNormals();
    hill.scale(-1, 1, 1); // face inward
    B.put('hill', hill, 0, YL + 4, -20);
    // tree clumps around the estate (cones) + ridge mansions
    const tree = (x, z, y, s) => {
      B.put('tree', new THREE.ConeGeometry(1.6 * s, 5 * s, 6), x, y + 2.8 * s, z);
      B.put('tree', new THREE.IcosahedronGeometry(1.5 * s, 0), x, y + 1.5 * s, z);
    };
    for (let i = 0; i < 60; i++) {
      const a = Math.PI * (0.5 + r() * 1.05);
      const d = 70 + r() * 90;
      const x = Math.cos(a) * d * 1.2, z = Math.sin(a) * d * -0.8 - 20;
      if (z > 25) continue;
      tree(x, z, x < -18 ? YL : Y0, 1 + r() * 1.4);
    }
    for (let i = 0; i < 26; i++) tree(-110 - r() * 25, -60 + i * 4.6 + r() * 2, YL, 1.1 + r());
    for (let i = 0; i < 16; i++) tree(40 + r() * 40, -60 - r() * 30, Y0, 1 + r());
    // other mansions on the ridge (tiny, lit windows)
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.62 + i * 0.09);
      const x = Math.cos(a) * 190, z = -Math.abs(Math.sin(a)) * 170 - 20;
      const y = YL + 2.5 + r() * 1.5;
      B.box('stucco', 12, 5, 7, x, y, z, a);
      B.put('roof', new THREE.ConeGeometry(7, 2.5, 4).rotateY(Math.PI / 4), x, y + 3.7, z, a, 1, 1, 0.7);
      B.box('winPlain', 9, 1.1, 7.2, x, y + 0.4, z, a);
    }
    // Vice City skyline across the bay
    for (let i = 0; i < 70; i++) {
      const x = -300 + r() * 600;
      const z = 190 + r() * 110;
      const center = 1 - Math.min(1, Math.abs(x + 40) / 260);
      const wdt = 8 + r() * 14, dep = 8 + r() * 12;
      const h = 12 + Math.pow(r(), 1.4) * 70 * (0.4 + center);
      const g = new THREE.BoxGeometry(wdt, h, dep);
      const uv = g.attributes.uv, n = g.attributes.normal;
      for (let k = 0; k < uv.count; k++) {
        if (Math.abs(n.getY(k)) > 0.5) { uv.setXY(k, 0, 0); continue; }
        const across = Math.abs(n.getX(k)) > 0.5 ? dep : wdt;
        uv.setXY(k, uv.getX(k) * across / 16, uv.getY(k) * h / 16);
      }
      B.put('sky' + (i % 3), g, x, YW + h / 2, z);
    }
    // tall landmark tower (Nocturno Tower) + a lighthouse on the breakwater
    B.box('sky1', 18, 150, 18, -40, YW + 75, 250);
    B.put('gold', new THREE.ConeGeometry(9, 22, 4).rotateY(Math.PI / 4), -40, YW + 161, 250);
    B.put('white2', new THREE.CylinderGeometry(1.2, 1.8, 14, 10), 95, YW + 7, 110);
    B.put('globe', new THREE.SphereGeometry(1.4, 10, 8), 95, YW + 15, 110);
  }

  // ------------------------------------------------------------------ boss gala
  _gala(B, M, globes) {
    // throne dais east of black's side (visible from white view, top right)
    throne(B, 11.8, -13.4, Y0, -0.72);
    // red carpet from the mansion steps around the fountain to the board apron
    B.box('crimson', 2.2, 0.02, 3.4, 0, Y0 + 0.012, -24.4);
    B.box('crimson', 2.0, 0.02, 7.0, 0, Y0 + 0.012, -12.3);
    // lantern garlands between the lamp posts and along the sides
    garland(B, [-7.3, Y0 + 3.0, -7.7], [-7.3, Y0 + 3.0, 7.7], 0.9, 16);
    garland(B, [7.3, Y0 + 3.0, -7.7], [7.3, Y0 + 3.0, 7.7], 0.9, 16);
    garland(B, [-7.3, Y0 + 3.0, -7.7], [-12.2, Y0 + 3.4, -26.2], 0.8, 14);
    garland(B, [7.3, Y0 + 3.0, -7.7], [12.2, Y0 + 3.4, -26.2], 0.8, 14);
    garland(B, [-9.2, Y0 + 3.0, 16.8], [9.2, Y0 + 3.0, 16.8], 0.9, 14);
    // crimson flower urns at the apron corners (low)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) urn(B, sx * 6.6, Y0, sz * 6.4, 0.8, 'marble', 'flowerRed');
    // banners (animated)
    const bmat = wavePatch(new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.8, side: THREE.DoubleSide }), this.time, { amp: 0.08, speed: 1.2 });
    const spots = [[-9.4, -3], [-9.4, 5], [9.4, 4], [9.4, -7], [-4.5, -26.9], [4.5, -26.9]];
    for (const [x, z] of spots) {
      const h = 4.2;
      B.put('gold', new THREE.CylinderGeometry(0.05, 0.06, h, 8), x, Y0 + h / 2, z);
      B.put('gold', new THREE.SphereGeometry(0.1, 8, 6), x, Y0 + h + 0.05, z);
      B.put('gold', new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6).rotateZ(Math.PI / 2), x + 0.45, Y0 + h - 0.15, z);
      const m = bannerMesh(bmat, 0.9, 2.3);
      m.position.set(x, Y0 + h - 1.35, z);
      m.rotation.y = x < 0 ? (Math.abs(z) > 20 ? 0 : Math.PI / 2) : (Math.abs(z) > 20 ? 0 : -Math.PI / 2);
      m.position.x += 0.02;
      this.group.add(m);
    }
    // floating candle lanterns on the pool
    const r = rng(3);
    for (let i = 0; i < 14; i++) {
      const x = -6.5 + r() * 13, z = 18.5 + r() * 11;
      B.put('lantern', new THREE.CylinderGeometry(0.12, 0.15, 0.18, 8), x, Y0 + 0.06, z);
    }
    void globes; void M;
  }

  // ------------------------------------------------------------------ moving props
  _movers(M) {
    // pool flamingo
    const pink = new THREE.MeshStandardMaterial({ color: '#ff7eb8', roughness: 0.35, envMapIntensity: 1 });
    const beak = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5 });
    this.flamingo = flamingo(pink, beak);
    this.flamingo.scale.setScalar(0.9);
    this.flamingo.position.set(3, Y0 - 0.05, 23);
    this.group.add(this.flamingo);
    // yacht
    this.yacht = yacht(M);
    this.yacht.position.set(-60, YW, 78);
    this.yacht.scale.setScalar(1.1);
    this.group.add(this.yacht);
    // polo rider
    const pm = {
      horse: new THREE.MeshStandardMaterial({ color: '#6b3f22', roughness: 0.7 }),
      horseDark: new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.8 }),
      shirt: new THREE.MeshStandardMaterial({ color: '#e5383b', roughness: 0.7 }),
      pants: new THREE.MeshStandardMaterial({ color: '#f4ede0', roughness: 0.7 }),
      skin: new THREE.MeshStandardMaterial({ color: '#e0ac69', roughness: 0.7 }),
      helmet: new THREE.MeshStandardMaterial({ color: '#1d2a4a', roughness: 0.5 }),
    };
    this.rider = poloRider(pm);
    this.rider.group.position.set(-50, YL, 0);
    this.group.add(this.rider.group);
    // confetti (finale) — preallocated instanced quads
    const N = 180;
    const cg = new THREE.PlaneGeometry(0.07, 0.11);
    const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 });
    const conf = new THREE.InstancedMesh(cg, cm, N);
    conf.frustumCulled = false; conf.visible = false; conf.castShadow = false;
    const cols = this.boss ? ['#e5383b', '#f4ede0', '#e0ae45'] : ['#e0ae45', '#f4ede0', '#ff9ec8', '#a8e3cf'];
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) conf.setColorAt(i, col.set(cols[i % cols.length]));
    this.group.add(conf);
    this.confetti = { mesh: conf, n: N, p: new Float32Array(N * 3), v: new Float32Array(N * 3), a: new Float32Array(N * 3), t: 0, on: false };
    this._dummy = new THREE.Object3D();
  }

  // ------------------------------------------------------------------ people
  _people(low, boss, loungers) {
    const c = this.crowd;
    if (!c) return;
    const linen = [
      { top: '#fbf6ec', bottom: '#e0c9a6' }, { top: '#f7c6d9', bottom: '#fbf6ec' }, { top: '#b8e0d2', bottom: '#f4f1de' },
      { top: '#c9b8e6', bottom: '#fbf6ec' }, { top: '#f2d49b', bottom: '#1d3557' }, { top: '#ffffff', bottom: '#1d3557' },
      { top: '#ff9e8a', bottom: '#fbf6ec' }, { top: '#1d3557', bottom: '#f4f1de' },
    ];
    let li = 0;
    const L = () => ({ ...linen[li++ % linen.length] });
    const staff = { top: '#fbf6ec', bottom: '#111111' };
    const walkers = [];
    const stand = [];
    const W = (s) => walkers.push({ y: Y0, look: 'rich', anim: 'walk', loop: true, ...s });
    const S = (s) => stand.push({ y: Y0, look: 'rich', ...s });
    // ---- walkers. The terrace loop circles the whole board: long sides at |x| = 6.5, crossing the ends beyond the
    // camera corridors (z = ±16.2, between the corridor and the pool coping / parterres).
    const loop = [[6.5, -4.5], [6.5, 4.5], [6.5, 9.5], [7.0, 16.2], [0, 16.2], [-7.0, 16.2], [-6.5, 9.5], [-6.5, 4.5],
      [-6.5, -4.5], [-6.5, -9.5], [-7.0, -16.1], [0, -16.1], [7.0, -16.1], [6.5, -9.5]];
    const from = (arr, k) => arr.slice(k).concat(arr.slice(0, k));
    const rev = loop.slice().reverse();
    W({ path: from(loop, 0), speed: 1.05, colors: L(), prop: 'drink' });
    W({ path: from(rev, 7), speed: 1.15, colors: L() });
    W({ path: from(loop, 7), speed: 1.0, colors: L(), prop: 'phone' });
    W({ path: [[-7.6, 5.5], [-7.6, -5.5], [-10.5, -10.5], [-14.2, -6.5], [-14.2, 6.5], [-11, 11.5]], speed: 0.95, look: 'suit', colors: staff, prop: 'drink' }); // waiter
    W({ path: [[7.8, 6], [7.8, -6], [9.2, -10.5], [15.6, -10.5], [15.6, 9], [12, 12]], speed: 0.9, look: 'suit', colors: staff, prop: 'drink' });   // waiter
    W({ path: [[0, -16.6], [2.4, -17.6], [3.4, -20], [2.4, -22.4], [0, -23.4], [-2.4, -22.4], [-3.4, -20], [-2.4, -17.6]].map(([x, z]) => [x * 1.02, z]), speed: 0.8, colors: L() });
    W({ path: [[9.3, 16.4], [9.3, 21.6], [15.4, 21.6], [15.4, 18.2], [12, 17.2]], speed: 0.9, colors: L(), prop: 'drink' });
    W({ path: [[-12, 17.2], [-15.4, 18.2], [-15.4, 21.6], [-9.3, 21.6], [-9.3, 16.4]], speed: 0.95, colors: L() });
    W({ path: [[-2.4, -22.4], [-3.4, -20], [-2.4, -17.6], [0, -16.6], [2.4, -17.6], [3.4, -20], [2.4, -22.4], [0, -23.4]], speed: 0.85, colors: L() });
    W({ path: [[21.2, -7.5], [21.2, -20], [29, -20], [29, -13.8], [22.6, -13.8]], speed: 1.2, look: 'suit', colors: { top: '#b3242a', bottom: '#111111' } }); // valet
    W({ path: [[33.4, -6], [33.4, 14]], loop: false, speed: 0.8, look: 'suit' }); // gate patrol
    // ---- standing / sitting guests
    S({ at: [-8.7, -3.2], anim: 'drink', prop: 'drink', colors: L(), face: [-9.7, -2.2] });
    S({ at: [-9.7, -2.2], anim: 'talk', colors: L(), face: [-8.7, -3.2] });
    S({ at: [8.7, 3.2], anim: 'drink', prop: 'drink', colors: L(), face: 'board' });
    S({ at: [9.7, 2.2], anim: 'talk', colors: L(), face: [8.7, 3.2] });
    S({ at: [14.2, -3], anim: 'dance', look: 'club', colors: { top: '#111111', bottom: '#111111' }, face: -Math.PI / 2, react: false });
    S({ at: [10.8, -2.2], anim: 'dance', colors: L(), face: [13, -3] });
    S({ at: [11.0, -4.2], anim: 'dance', colors: L(), face: [13, -3] });
    S({ at: [-13.1, 1.2], anim: 'talk', look: 'suit', colors: staff, face: Math.PI / 2, react: false });
    S({ at: [-11.2, 0.2], anim: 'drink', prop: 'drink', colors: L(), face: -Math.PI / 2 });
    S({ at: [-11.2, 2.8], anim: 'talk', colors: L(), face: -Math.PI / 2 });
    S({ at: [33.6, 10.6], anim: 'crossed', look: 'suit', face: -Math.PI / 2, react: false });
    for (const [i, [x, z]] of loungers.entries()) {
      if (i % 3 === 1) continue;
      S({ at: [x, z + 0.25], anim: 'sit', colors: L(), face: 0, react: i < 2 });
    }
    S({ at: [-11.4, -9.4], anim: 'talk', colors: L(), face: [-10.4, -9.9] });
    S({ at: [-10.2, -10.4], anim: 'drink', prop: 'drink', colors: L(), face: [-11.4, -9.4] });
    S({ at: [10.8, 9.4], anim: 'talk', colors: L(), face: [9.8, 8.2] });
    S({ at: [9.0, 9.4], anim: 'drink', prop: 'drink', colors: L(), face: [9.8, 8.2] });
    S({ at: [-5.2, -25.9], anim: 'talk', colors: L(), face: [-6.2, -25.2], y: Y0 + 0.3 });
    S({ at: [-6.3, -25.2], anim: 'drink', prop: 'drink', colors: L(), face: [-5.2, -25.9], y: Y0 + 0.3 });
    S({ at: [5.6, -25.6], anim: 'phone', colors: L(), face: 'board', y: Y0 + 0.3 });
    S({ at: [15.3, 12.8], anim: 'phone', colors: L(), face: [12, 8] });
    let bossSpecs = [];
    if (boss) {
      bossSpecs = [
        { at: [11.9, -13.5], y: Y0 + 0.33, anim: 'sit', look: 'rich', body: 'f', colors: { top: '#e5383b', bottom: '#f4ede0', hair: '#d6b370' }, face: -0.72, react: false },
        { at: [10.2, -12.3], y: Y0, anim: 'crossed', look: 'suit', face: -0.72, react: false },
        { at: [13.6, -14.6], y: Y0, anim: 'crossed', look: 'suit', face: -0.72, react: false },
      ];
      for (const s of [...walkers, ...stand]) if (s.look === 'rich' && s.colors && li++ % 3 === 0) s.colors.top = '#e5383b';
    }
    // priority: first walkers + key standers (low quality keeps 20)
    const ordered = [...bossSpecs, ...walkers.slice(0, 6), ...stand.slice(0, 10), ...walkers.slice(6), ...stand.slice(10)];
    const out = c.spawn(ordered.slice(0, low ? 20 : 40));
    this.npcs = out;
  }

  // ------------------------------------------------------------------ per frame
  update(dt, t) {
    const rm = this.reducedMotion ? 0.3 : 1;
    this.time.value = t * rm;
    const tt = t * rm;
    // flamingo drifts in a slow loop and bobs
    if (this.flamingo) {
      const f = this.flamingo;
      f.position.x = 2.5 + Math.sin(tt * 0.05) * 3.6;
      f.position.z = 23.5 + Math.sin(tt * 0.037 + 1) * 3.2;
      f.position.y = Y0 - 0.05 + Math.sin(tt * 1.3) * 0.025;
      f.rotation.y = tt * 0.04;
      f.rotation.z = Math.sin(tt * 1.1) * 0.04;
    }
    // yacht crossing the bay (≈ 6 min per pass)
    if (this.yacht) {
      const k = ((tt * 0.8) % 360) - 180;
      this.yacht.position.x = k;
      this.yacht.position.y = YW + Math.sin(tt * 0.6) * 0.08;
    }
    // polo rider cantering back and forth
    if (this.rider) {
      const g = this.rider.group;
      const s = Math.sin(tt * 0.09);
      g.position.x = -68 + s * 22;
      g.position.z = Math.sin(tt * 0.23) * 8;
      g.rotation.y = Math.cos(tt * 0.09) >= 0 ? -Math.PI / 2 : Math.PI / 2;
      const gal = tt * 7;
      this.rider.legs.forEach((l, i) => { l.rotation.x = Math.sin(gal + i * 1.4) * 0.5; });
      g.position.y = YL + Math.abs(Math.sin(gal)) * 0.08;
      this.rider.mallet.rotation.x = 0.4 + Math.sin(tt * 0.7) * 0.5;
    }
    // soft breathing on the pool glow (period 7 s, ±12 %)
    if (this.M?.pool) this.M.pool.uniforms.uGlow.value = this.T.pool * (0.9 + 0.2 * this.pulse(t, 7));
    // confetti
    const C = this.confetti;
    if (C && C.on) {
      C.t += dt;
      const d = this._dummy;
      for (let i = 0; i < C.n; i++) {
        const j = i * 3;
        C.v[j + 1] -= 3.2 * dt;
        const drag = Math.exp(-1.6 * dt);
        C.v[j] *= drag; C.v[j + 2] *= drag;
        if (C.v[j + 1] < -0.9) C.v[j + 1] = -0.9;
        C.p[j] += (C.v[j] + Math.sin(C.t * 3 + i) * 0.25) * dt;
        C.p[j + 1] += C.v[j + 1] * dt;
        C.p[j + 2] += C.v[j + 2] * dt;
        if (C.p[j + 1] < Y0 + 0.01) { C.p[j + 1] = Y0 + 0.01; C.v[j] = C.v[j + 2] = 0; }
        C.a[j] += dt * (2 + (i % 5)); C.a[j + 1] += dt * 1.7;
        d.position.set(C.p[j], C.p[j + 1], C.p[j + 2]);
        d.rotation.set(C.a[j], C.a[j + 1], C.a[j + 2]);
        d.updateMatrix();
        C.mesh.setMatrixAt(i, d.matrix);
      }
      C.mesh.instanceMatrix.needsUpdate = true;
      if (C.t > 9) { C.on = false; C.mesh.visible = false; }
    }
  }

  react(event) {
    if (event !== 'finale' || this.reducedMotion || !this.confetti) return;
    // champagne-cork confetti pops from the party on both long sides (soft, no light flash)
    const C = this.confetti;
    const r = Math.random;
    const origins = [[-7.6, -2.5], [-7.6, 3], [7.6, 2.5], [7.6, -3]];
    for (let i = 0; i < C.n; i++) {
      const o = origins[i % origins.length];
      const j = i * 3;
      C.p[j] = o[0]; C.p[j + 1] = Y0 + 1.5; C.p[j + 2] = o[1];
      C.v[j] = -Math.sign(o[0]) * (0.3 + r() * 1.0) + (r() - 0.5) * 0.8;
      C.v[j + 1] = 4.5 + r() * 2.5;
      C.v[j + 2] = (r() - 0.5) * 2.2;
      C.a[j] = r() * 6; C.a[j + 1] = r() * 6; C.a[j + 2] = r() * 6;
    }
    C.t = 0; C.on = true; C.mesh.visible = true;
  }

  dispose() {
    super.dispose();
    disposeShared();
  }
}
