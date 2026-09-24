// Neon Mile Street Meet (nh3, Velvet Syndicate) — a night street-race meet on a palm-lined club boulevard.
// The board is the start grid in the middle of the street: two tuner cars with soft underglow flank it at the
// start line, a flag-waver stands beside them, crowds line both kerbs, festoon lights hang across the street,
// art-deco clubs / casino glow along the strip. Reference: docs/ref_street_race.png. Spec: docs/arenas/ARENAS_SPEC.md.
// NO flashing anywhere: all light changes are slow sine fades (period ≥ 1.5 s, ≤ 35 %) or ≥ 1 s cross-fades.
import * as THREE from 'three';
import { Arena, STREET_Y } from './Arena.js';
import { rng } from '../util.js';
import { CarFleet } from './neon/car.js';
import { L, buildGround, buildMarkings, buildStrip, buildSkyline } from './neon/city.js';
import {
  buildFestoons, buildPalms, buildLamps, speakerObject, startTreeObject, trafficLightObject, foodCartObject,
  buildCones, buildRopes, Confetti,
} from './neon/props.js';
import { partsFromObject, normalizeParts, InstSet } from './neon/inst.js';
import { buildFillerCrowd } from './neon/filler.js';

const GANG = { purple: '#a259ff', yellow: '#f9f871' };

const TIMES = {
  // s1: early evening, the last purple glow of the sunset right down the boulevard
  day: {
    sky: { zenith: '#23205e', top: '#4d3a8e', mid: '#b0559a', horizon: '#ffa45c', bottom: '#2a1a38', sunDir: [0.05, 0.035, -1], sunColor: '#ffb070', sunGlow: 0.7, stars: 0 },
    hemi: [0xb8a4ff, 0x4a2a44, 1.55], key: { color: 0xffc49a, intensity: 2.3, dir: [0.2, 0.75, -1] },
    fog: { color: '#6e3c7c', near: 40, far: 190 }, background: '#4d3a8e', exposure: 1.02,
    bloom: { strength: 0.42, radius: 0.45, threshold: 0.92 }, env: 0.85, neon: 0.6, bulbs: 1.7, glow: 0.75,
  },
  // s2: blue hour
  dusk: {
    sky: { zenith: '#081038', top: '#1a2a6c', mid: '#46479a', horizon: '#e48ab4', bottom: '#161434', stars: 0.12 },
    hemi: [0x98a8ff, 0x2c2244, 1.3], key: { color: 0xffe2c8, intensity: 2.1, dir: [0.25, 1, 0.45] },
    fog: { color: '#34306c', near: 36, far: 170 }, background: '#1a2a6c', exposure: 1.05,
    bloom: { strength: 0.58, radius: 0.5, threshold: 0.88 }, env: 0.85, neon: 0.85, bulbs: 2.1, glow: 0.9,
  },
  // s3 / default: full neon night
  night: {
    sky: { zenith: '#07031a', top: '#1c0c3e', mid: '#4a1766', horizon: '#ff4f9a', bottom: '#140a1c', stars: 0.35 },
    hemi: [0x8f70ff, 0x341236, 1.15], key: { color: 0xffe4f2, intensity: 2.0, dir: [0.25, 1, 0.5] },
    fog: { color: '#2c1042', near: 32, far: 150 }, background: '#1c0c3e', exposure: 1.05,
    bloom: { strength: 0.68, radius: 0.5, threshold: 0.86 }, env: 0.9, neon: 1, bulbs: 2.4, glow: 1,
  },
};

const PAL = {
  pink: '#ff3ea5', gold: '#d9a520', orange: '#ff5a1a', purple: '#7a3cff', teal: '#19c6c0', white: '#f1ede6',
  lime: '#9dff3c', black: '#17151c', red: '#d8232f', yellow: '#f9d71c', blue: '#2b6cff',
};

export default class NeonArena extends Arena {
  async build() {
    const v = this.variant || {};
    const boss = !!v.boss;
    let time = TIMES[v.time] ? v.time : ({ 1: 'day', 2: 'dusk', 3: 'night' })[v.street] || 'night';
    if (boss) time = 'night';
    const T = TIMES[time];
    this.T = T; this.time = time; this.boss = boss;
    const r = rng(boss ? 777 : 313);
    this.uni = { uTime: { value: 0 }, uAmp: { value: this.reducedMotion ? 0.35 : 1 } };

    // ---- assets (all optional, loaded in parallel)
    const [tunerGlb, muscleGlb, speakerGlb, cartGlb, treeGlb, clubGlb, trafficGlb] = await Promise.all([
      'models/props/car_tuner.glb', 'models/props/car_muscle.glb', 'models/props/speaker_stack.glb', 'models/props/food_cart.glb',
      'models/arenas/neon/start_tree.glb', 'models/arenas/neon/club_front.glb', 'models/arenas/neon/traffic_light.glb',
    ].map((p) => this.glb(p)));
    this.glbUsed = { tunerGlb, muscleGlb, speakerGlb, cartGlb, treeGlb, clubGlb, trafficGlb };

    // ---- sky, light, mood
    this.addSky(T.sky);
    this.addHemi(T.hemi[0], T.hemi[1], T.hemi[2]);
    this.addSun({ color: T.key.color, intensity: T.key.intensity, dir: T.key.dir, shadow: true });
    this.buildEnvMap([
      { color: '#ff3ea5', pos: [-30, 6, -10], size: [30, 8], mult: 2.5 * T.neon },
      { color: '#2de2e6', pos: [30, 6, 10], size: [30, 8], mult: 2 * T.neon },
      { color: '#ffc46b', pos: [0, 14, -30], size: [40, 4], mult: 2.5 },
      { color: '#a259ff', pos: [0, 5, 40], size: [30, 8], mult: 2 * T.neon },
    ]);
    this.mood = {
      background: T.background, fog: T.fog, exposure: T.exposure, bloom: T.bloom, envIntensity: T.env,
    };
    this.boardStyle = {
      frame: '#1c1722', frameText: '#f1ede6', plinth: '#2a2331', plinthMap: 'concrete',
      kerb: boss ? 'gold' : 'race', kerbColors: boss ? [GANG.purple, GANG.yellow] : ['#ff3ea5', '#f1ede6'],
      neon: boss ? [GANG.purple, GANG.yellow] : [GANG.purple, '#ff3ea5'], neonIntensity: 2.4,
    };

    // ---- street + strip
    buildGround(this);
    buildMarkings(this, { accent: boss ? GANG.purple : '#ff3ea5' });
    this.strip = buildStrip(this, { neonMul: T.neon, boss });
    buildSkyline(this, { neonMul: T.neon });

    // ---- cars
    this._buildCars(tunerGlb, muscleGlb, boss);

    // ---- palms / lamps / festoons
    const palms = [];
    for (const sx of [-1, 1]) {
      for (let z = 20; z > -120; z -= 10) {
        if (z < L.cross2Z[1] + 2 && z > L.cross2Z[0] - 2) continue;
        palms.push([sx * (13.4 + r() * 0.6), z + (r() - 0.5) * 2 + (sx > 0 ? 5 : 0), 0.9 + r() * 0.35, r() * 6.28]);
      }
    }
    for (let x = -60; x <= 60; x += 11) if (Math.abs(x) > 6) palms.push([x, L.crossZ[1] + 1.2, 0.9 + r() * 0.3, r() * 6]);
    buildPalms(this, palms, this.uni, this.ctx.models?.palm || null);

    const lampZ = [];
    for (let z = 18; z > -110; z -= 12) if (!(z < L.cross2Z[1] + 1 && z > L.cross2Z[0] - 1)) lampZ.push(z);
    const lampSpots = [];
    for (const sx of [-1, 1]) for (const z of lampZ) lampSpots.push([sx * 12.6, z]);
    buildLamps(this, lampSpots, this.ctx.models?.streetlight || null);

    const spans = [];
    const Y = STREET_Y;
    const fx = L.walkTo - 0.2;
    [-17, -24, -31, -38, -57, -65, -73, -81].forEach((z, i) => spans.push({ a: [-fx, Y + 7.2, z], b: [fx, Y + 7.2, z + (i % 2 ? 3.5 : -3.5)], sag: 1.8 }));
    [17.5, 22].forEach((z, i) => spans.push({ a: [-fx, Y + 7, z], b: [fx, Y + 7, z + (i ? -2.5 : 2.5)], sag: 1.6 }));
    // strands along each kerb, lamp to lamp (visible from the player cameras)
    for (const sx of [-1, 1]) for (let i = 0; i < lampZ.length - 1; i++) {
      if (lampZ[i] - lampZ[i + 1] > 13) continue;
      spans.push({ a: [sx * 12.5, Y + 4.7, lampZ[i]], b: [sx * 12.5, Y + 4.7, lampZ[i + 1]], sag: 0.8 });
    }
    const bulbPal = boss ? ['#ffc46b', GANG.purple, '#ffc46b', GANG.yellow] : ['#ffc46b', '#ffc46b', '#ffd9a0', '#ff7ac8', '#ffc46b'];
    buildFestoons(this, spans, { uni: this.uni, palette: bulbPal, intensity: T.bulbs, halo: time === 'day' ? 0.35 : 0.55 });

    // ---- start line furniture
    buildCones(this, [
      ...[-8.5, -10.5, -12.5, -14.5, 8.5, 10.5, 12.5, 14.5].flatMap((z) => [[-5.75, z], [5.75, z]]),
    ]);
    this._buildStartTrees(treeGlb);
    this._buildSpeakers(speakerGlb, boss);
    await this._buildCart(cartGlb);
    this._buildTraffic(trafficGlb);
    this._buildClub(clubGlb, boss);
    if (boss) this._buildVip();

    // ---- lights near the start line: two soft underglow pools that breathe (only point lights in the arena)
    this.pl = [
      new THREE.PointLight(this.cars.slots[0].glow, 7 * T.glow, 7, 1.6),
      new THREE.PointLight(this.cars.slots[1].glow, 7 * T.glow, 7, 1.6),
    ];
    this.pl[0].position.set(-8.3, STREET_Y + 0.35, -2.0);
    this.pl[1].position.set(8.3, STREET_Y + 0.35, -2.0);
    this.pl.forEach((p) => this.group.add(p));

    // ---- people
    this._buildFiller(r, boss);
    this._spawnNpcs(boss);
    this.confetti = new Confetti(this);

    this._tree = 0; this._rev = 0; this._revCar = 0;
  }

  // ------------------------------------------------------------------------------------------ cars
  _buildCars(tunerGlb, muscleGlb, boss) {
    const P = PAL;
    const tuner = [
      // 0,1: the racers at the start line (flanking the board, noses on the checker strip)
      { x: -8.3, z: -2.0, yaw: 0, body: boss ? '#d4af37' : P.pink, rims: boss ? '#f9f871' : '#e8e8f0', stripe: boss ? GANG.purple : '#ffffff', glow: boss ? GANG.purple : '#ff3ea5' },
      { x: 8.3, z: -2.0, yaw: 0, body: P.gold, rims: '#2a2a30', stripe: '#1a1a1a', glow: '#3dff9a' },
      // 2,3: next pair lined up behind them
      { x: -8.3, z: -8.4, yaw: 0, body: P.purple, rims: '#e8e8f0', stripe: GANG.yellow, glow: '#2de2e6' },
      { x: 8.3, z: -8.6, yaw: 0, body: P.orange, rims: '#f9d71c', stripe: '#ffffff', glow: '#ff7a1a' },
      // queue down the boulevard (facing the board, headlights on)
      { x: -2.7, z: -19.5, yaw: 0.02, body: P.teal, rims: '#e8e8f0', stripe: '#ffffff', glow: '#2de2e6', glowI: 0.8 },
      { x: 2.7, z: -21.5, yaw: -0.03, body: P.white, rims: '#ff3ea5', stripe: '#ff3ea5', glow: '#ff3ea5', glowI: 0.8 },
      { x: -2.8, z: -26.5, yaw: 0, body: P.lime, rims: '#1a1a1a', stripe: '#1a1a1a', glow: '#9dff3c', glowI: 0.7 },
      { x: 2.6, z: -28.8, yaw: 0.04, body: P.red, rims: '#e8e8f0', stripe: '#ffffff', glow: '#ff3050', glowI: 0.7 },
      // parked along the kerbs, crowd around
      { x: -8.6, z: -16, yaw: 0.18, body: P.yellow, rims: '#1a1a1a', stripe: '#1a1a1a', glow: '#f9f871', glowI: 0.7 },
      { x: 8.6, z: -23, yaw: -0.2, body: P.blue, rims: '#e8e8f0', stripe: '#ffffff', glow: '#2b6cff', glowI: 0.7 },
      { x: -8.6, z: -31, yaw: 0.2, body: P.pink, rims: '#f9f871', stripe: '#ffffff', glow: '#ff3ea5', glowI: 0.6 },
      { x: 8.4, z: 12.5, yaw: Math.PI, body: P.purple, rims: '#e8e8f0', stripe: '#ff3ea5', glow: GANG.purple, glowI: 0.8 },
    ];
    this.cars = new CarFleet(tuner, { glb: tunerGlb, kind: 'tuner', track: (t) => this.track(t), name: 'tuners' });
    this.group.add(this.cars.group);
    const muscle = [
      { x: -8.4, z: 12.8, yaw: Math.PI, body: '#1d1a24', rims: '#e8e8f0', stripe: '#ff3ea5', glow: '#ff3ea5', glowI: 0.8 },
      { x: 8.6, z: -37, yaw: -0.15, body: '#f4a6c8', rims: '#e8e8f0', stripe: '#ffffff', glow: null },
      // cruisers (driven by update) — parked off-screen until their turn
      { x: -200, z: 29, yaw: Math.PI / 2, body: '#2de2e6', rims: '#e8e8f0', stripe: '#ffffff', glow: '#2de2e6' },
      { x: 200, z: -47.5, yaw: -Math.PI / 2, body: '#ff5a1a', rims: '#1a1a1a', stripe: '#1a1a1a', glow: '#ff7a1a' },
    ];
    this.muscle = new CarFleet(muscle, { glb: muscleGlb, kind: 'muscle', track: (t) => this.track(t), name: 'muscles' });
    this.group.add(this.muscle.group);
    this.cruisers = [
      { fleet: this.muscle, i: 2, z: 29, dir: 1, t0: 3, dur: 13, every: 22 },
      { fleet: this.muscle, i: 3, z: -47.5, dir: -1, t0: 12, dur: 15, every: 26 },
    ];
  }

  // ------------------------------------------------------------------------------------------ props
  _buildStartTrees(glb) {
    this.treeLamps = null;
    this.treeMats = null;
    const spots = [[-10.95, 0.9], [10.95, 0.9]];
    if (glb) {
      const root = this.tint(glb, { EMISSIVE_Amber: '#ffa21a', EMISSIVE_Green: '#3dff6a', EMISSIVE_Red: '#ff2a2a' });
      const mats = { amber: [], green: [], red: [] };
      root.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        if (m.name?.startsWith('EMISSIVE_Amber')) mats.amber.push(m);
        else if (m.name?.startsWith('EMISSIVE_Green')) mats.green.push(m);
        else if (m.name?.startsWith('EMISSIVE_Red')) mats.red.push(m);
      });
      this.treeMats = mats;
      spots.forEach(([x, z], i) => {
        const h = this.prop(i ? root.clone(true) : root, { height: 3 });
        h.position.set(x, STREET_Y, z);
        this.group.add(h);
      });
    } else {
      const { root, lamps } = startTreeObject();
      this.treeLamps = lamps;
      this._treeCols = {
        stage: new THREE.Color('#ffffff'), amber: new THREE.Color('#ffa21a'), green: new THREE.Color('#3dff6a'), red: new THREE.Color('#ff2a2a'),
      };
      this._inst(root, spots.map(([x, z]) => [x, STREET_Y, z, 0]), { castShadow: true, name: 'start-trees' });
    }
  }

  /** Draws copies of a procedural object with one InstancedMesh per material (materials are kept, so animating a
   *  material animates every copy). placements: [[x, y, z, yaw]]. */
  _inst(root, placements, { castShadow = false, name = 'inst' } = {}) {
    const parts = partsFromObject(root, { keepMaterials: true });
    root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    const set = new InstSet(parts, placements.length, { castShadow, name });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    placements.forEach(([x, y, z, yaw], i) => set.setMatrix(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(up, yaw), s)));
    set.commit();
    this.group.add(set.group);
    return set;
  }

  _buildSpeakers(glb, boss) {
    const spots = [[11.0, -13.5, -Math.PI / 2], [11.0, -11.9, -Math.PI / 2], [-11.0, 9.2, Math.PI / 2], [-11.0, -21.5, Math.PI / 2]];
    if (boss) spots.push([-11.2, -7.2, Math.PI / 2]);
    let parts;
    if (glb) {
      parts = partsFromObject(this.tint(glb, { TINT_Cabinet: '#17141c', EMISSIVE_Ring: GANG.purple }), { emissiveBoost: 2 });
      normalizeParts(parts, { height: 1.7 });
    } else {
      parts = partsFromObject(speakerObject(), { keepMaterials: true });
    }
    const set = new InstSet(parts, spots.length, { castShadow: true, name: 'speakers' });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1);
    const ringCols = [GANG.purple, '#ff3ea5', '#2de2e6', GANG.yellow, GANG.purple];
    spots.forEach(([x, z, yaw], i) => {
      set.setMatrix(i, m.compose(new THREE.Vector3(x, STREET_Y + (Math.abs(x) > 12 ? L.kerbH : 0), z), q.setFromAxisAngle(up, yaw), s));
      set.setColor(i, 'EMISSIVE_Ring', new THREE.Color(ringCols[i]).multiplyScalar(2 * this.T.neon + 0.4));
    });
    set.commit();
    this.group.add(set.group);
  }

  async _buildCart(glb) {
    let cart;
    if (glb) cart = this.prop(this.tint(glb, { TINT_Canopy: '#ff3ea5', EMISSIVE_Sign: '#ffc46b' }), { height: 2.3 });
    else { this._inst(foodCartObject(), [[13.6, STREET_Y + L.kerbH, -27, -Math.PI / 2]], { name: 'cart' }); return; }
    cart.position.set(13.6, STREET_Y + L.kerbH, -27);
    cart.rotation.y = -Math.PI / 2;
    cart.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    this.group.add(cart);
  }

  _buildTraffic(glb) {
    this.traffic = null;
    const z = L.cross2Z[1] + 0.8;
    if (glb) {
      const root = this.tint(glb, { EMISSIVE_Red: '#ff2a2a', EMISSIVE_Amber: '#ffae1a', EMISSIVE_Green: '#3dff9a' });
      const h = this.prop(root, { height: 6 });
      h.position.set(-12.8, STREET_Y + L.kerbH, z);
      this.group.add(h);
      const h2 = this.prop(root.clone(true), { height: 6 });
      h2.position.set(12.8, STREET_Y + L.kerbH, z - 9.5); h2.rotation.y = Math.PI;
      this.group.add(h2);
      const mats = { red: [], amber: [], green: [] };
      root.traverse((o) => {
        if (!o.isMesh) return;
        const n = o.material.name || '';
        if (n.startsWith('EMISSIVE_Red')) mats.red.push(o.material);
        if (n.startsWith('EMISSIVE_Amber')) mats.amber.push(o.material);
        if (n.startsWith('EMISSIVE_Green')) mats.green.push(o.material);
      });
      this.trafficMats = mats;
    } else {
      const { root, lights } = trafficLightObject();
      this._inst(root, [[-12.8, STREET_Y + L.kerbH, z, 0], [12.8, STREET_Y + L.kerbH, z - 9.5, Math.PI]], { name: 'traffic' });
      this.traffic = lights;
      this._tlCols = { red: new THREE.Color('#ff2a2a'), amber: new THREE.Color('#ffae1a'), green: new THREE.Color('#3dff9a') };
    }
  }

  _buildClub(glb, boss) {
    const z = L.clubZ;
    if (glb) {
      const h = this.prop(this.tint(glb, { TINT_Wall: '#2a1838', EMISSIVE_Trim: GANG.purple }), { height: 7 });
      h.position.set(0, STREET_Y + L.kerbH, z - 0.4);
      h.rotation.y = Math.PI;
      this.group.add(h);
    } else {
      // entrance: glowing doors under a purple canopy with gold trim
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7ac8').multiplyScalar(1.1) }));
      door.position.set(0, STREET_Y + L.kerbH + 1.3, z - 0.12); door.rotation.y = Math.PI;
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 3), new THREE.MeshStandardMaterial({ color: '#3a1460', roughness: 0.5 }));
      canopy.position.set(0, STREET_Y + 3.4, z - 1.6);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(GANG.yellow).multiplyScalar(2) }));
      trim.position.set(0, STREET_Y + 3.3, z - 3.1);
      this.group.add(door, canopy, trim);
      for (const sx of [-2.8, 2.8]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 8), new THREE.MeshStandardMaterial({ color: '#f9d25a', metalness: 0.9, roughness: 0.3 }));
        post.position.set(sx, STREET_Y + 1.65 + L.kerbH, z - 2.95);
        this.group.add(post);
      }
    }
    // red carpet + velvet rope queue line in front of the club
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4), new THREE.MeshStandardMaterial({ color: boss ? '#4a1a7a' : '#8a1030', roughness: 0.9 }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, STREET_Y + L.kerbH + 0.01, z - 2.2);
    this.group.add(carpet);
    buildRopes(this, [[-1.4, z - 0.6], [-1.4, z - 2.2], [-1.4, z - 3.8], [-5, z - 3.8]], { rope: GANG.purple });
    buildRopes(this, [[1.4, z - 0.6], [1.4, z - 2.2], [1.4, z - 3.8]], { rope: GANG.purple });
  }

  _buildVip() {
    // Velvet Syndicate VIP pen on the left kerb beside the start line
    const x0 = -13.6, x1 = -10.6, z0 = -7.5, z1 = 1.5;
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: '#3a1460', roughness: 0.85, emissive: '#12051f' }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set((x0 + x1) / 2, STREET_Y + L.kerbH + 0.012, (z0 + z1) / 2);
    this.group.add(carpet);
    buildRopes(this, [[x0, z1], [x1, z1], [x1, -1], [x1, -4], [x1, z0], [x0, z0]], { rope: GANG.purple, post: '#f9d25a' });
    // gang banner on the facade behind
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#2a0e46'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = GANG.yellow; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
    g.font = 'italic bold 64px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = GANG.yellow; g.fillText('VIP · VELVET', 256, 68);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.3, 1.3) }));
    banner.position.set(-L.walkTo + 0.1, STREET_Y + 3.0, -3); banner.rotation.y = Math.PI / 2;
    this.group.add(banner);
  }

  // ------------------------------------------------------------------------------------------ people
  _buildFiller(r, boss) {
    const spots = [];
    const blocked = [
      [11.0, -12.7, 1.6], [-11.0, 9.2, 1.2], [-11.0, -21.5, 1.2], [13.6, -27, 1.8], [-10.95, 0.9, 0.7], [10.95, 0.9, 0.7],
      [11.8, -15.2, 1.6], [-11.8, 11.0, 1.6],
    ];
    if (boss) blocked.push([-12.1, -3, 5.2], [-11.2, -7.2, 1]);
    const free = (x, z) => blocked.every(([bx, bz, rad]) => Math.hypot(x - bx, z - bz) > rad);
    const density = boss ? 0.72 : 0.58;
    for (const sx of [-1, 1]) {
      for (let z = 15; z > -68; z -= 0.72) {
        if (z < L.cross2Z[1] + 1 && z > L.cross2Z[0] - 1) continue;
        for (let row = 0; row < 5; row++) {
          const x = sx * (11.0 + row * 0.72 + (r() - 0.5) * 0.3);
          const zz = z + (r() - 0.5) * 0.45;
          const nearBoard = Math.abs(zz) < 7;
          if (r() > density * (row === 0 ? 1.1 : 1) * (nearBoard ? 0.8 : 1)) continue;
          if (!free(x, zz)) continue;
          // no one inside a lamp or palm trunk
          if (Math.abs(Math.abs(x) - 12.6) < 0.35 && Math.abs(((zz - 18) % 12 + 12) % 12) < 0.5) continue;
          const onWalk = Math.abs(x) > L.roadHalf;
          const tz = zz * 0.85 + (zz < 0 ? 2 : -2);
          spots.push({ x, z: zz, y: STREET_Y + (onWalk ? L.kerbH : 0), yaw: Math.atan2(-x, tz - zz), up: r() < 0.24 });
        }
      }
    }
    // crowd across the street behind the black camera's view (beyond the corridor) and at the T
    for (let z = 17.6; z < 23; z += 0.75) for (let x = -11.5; x < 11.5; x += 0.72) {
      if (r() > (boss ? 0.62 : 0.5)) continue;
      spots.push({ x: x + (r() - 0.5) * 0.3, z: z + (r() - 0.5) * 0.3, yaw: Math.PI + (r() - 0.5) * 0.6, up: r() < 0.3 });
    }
    // spectators far down the boulevard behind the queue
    for (let z = -35.2; z > -41; z -= 0.8) for (let x = -10; x < 10; x += 0.75) {
      if (r() > 0.45) continue;
      spots.push({ x: x + (r() - 0.5) * 0.3, z, yaw: (r() - 0.5) * 0.6, up: r() < 0.25 });
    }
    const q = this.ctx.quality === 'low' ? 0.55 : 1;
    const use = q < 1 ? spots.filter(() => r() < q) : spots;
    this.filler = buildFillerCrowd(this, use, this.uni, r);
  }

  _spawnNpcs(boss) {
    const c = this.crowd;
    if (!c) return;
    const Y = STREET_Y, YW = STREET_Y + L.kerbH;
    // race fans circulating AROUND the board: an aisle between the cars and the crowd (|x| = 9.85) on both kerbs,
    // crossing the street just beyond the camera corridors (|z| = 16.6), plus an inner loop between board and cars.
    const A = 9.85, C = 16.6;
    const ring = [[A, -C], [-A, -C], [-A, C], [A, C]];
    const from = (k, rev) => { const p = rev ? [...ring].reverse() : ring; return [...p.slice(k), ...p.slice(0, k)]; };
    const walk = (path, look, speed = 1.2, extra = {}) => ({ at: path[0], path, anim: 'walk', speed, look, y: Y, ...extra });
    const list = [
      // flag-waver beside the right racer, off the camera corridor
      { at: [6.55, 2.7], face: [8.3, -1], anim: 'wave_flag', prop: 'flag', look: 'racer', colors: { top: '#ffffff', bottom: '#111111' }, react: false },
      // the racers
      { at: [-6.95, -2.4], face: [0, -2.4], anim: 'lean', look: 'racer', colors: boss ? { top: '#111111', bottom: '#111111' } : undefined },
      { at: [6.7, -4.8], face: [0, -1], anim: 'talk', look: 'racer' },
      // walkers (kept early in the list so quality 'low' still gets them)
      walk([[A, -4], ...from(0).slice(0)], 'club', 1.25),
      walk(from(2), 'street', 1.1),
      walk(from(1, true), 'racer', 1.3),
      walk(from(3, true), 'club', 1.15),
      walk([[-6.35, 4.6], [-6.35, -4.6], [-A, -5.3], [-A, 4.9]], 'street', 1.0),
      walk([[-A, -33.4], [A, -33.4]], 'club', 1.1, { loop: false }),
      walk([[A, -C], [0.2, -16.9], [0.2, -32.4], [-A, -32.6], [-A, -C]], 'street', 1.2),
      // hanging out on the second pair
      { at: [-8.3, -6.8], y: Y + 0.37, face: [-8.3, 0], anim: 'sit', look: 'club' },
      { at: [6.95, -8.6], face: [0, -8], anim: 'lean', look: 'street', prop: 'drink' },
      { at: [-6.9, -9.6], face: [0, -9], anim: 'phone', look: 'club', prop: 'phone' },
      // front row filming / cheering on both kerbs (behind the walking aisle)
      { at: [-10.7, -1.2], anim: 'phone', prop: 'phone', look: 'club' },
      { at: [-10.8, -4.4], anim: 'cheer', look: 'street' },
      { at: [-10.7, -6.8], anim: 'clap', look: 'club' },
      { at: [10.7, -0.9], anim: 'cheer', look: 'club' },
      { at: [10.8, -4.2], anim: 'phone', prop: 'phone', look: 'street' },
      { at: [10.7, -6.9], anim: 'drink', prop: 'drink', look: 'club' },
      // walkers on the sidewalks
      { at: [14.8, -8], anim: 'walk', path: [[14.8, -8], [14.8, -40], [15.6, -40], [15.6, -8]], y: YW, speed: 1.1, look: 'club', react: false },
      { at: [-15.2, -38], anim: 'walk', path: [[-15.2, -38], [-15.2, -6], [-16, -6], [-16, -38]], y: YW, speed: 1.0, look: 'street', react: false },
      // food cart
      { at: [12.4, -26.2], y: YW, face: [13.6, -27], anim: 'talk', look: 'street' },
      { at: [12.6, -28.2], y: YW, face: [13.6, -27], anim: 'drink', prop: 'drink', look: 'club' },
      // club queue at the T + bouncer
      { at: [-0.6, 34.8], y: YW, face: [0, 40], anim: 'phone', prop: 'phone', look: 'club' },
      { at: [0.6, 34.2], y: YW, face: [0, 40], anim: 'idle', look: 'club' },
      { at: [2.3, 36.6], y: YW, face: [0, 30], anim: 'idle', look: 'suit' },
    ];
    // dancers at the speaker stacks
    const dance = (cx, cz, n, look) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        list.push({ at: [cx + Math.cos(a) * 1.1, cz + Math.sin(a) * 1.1], y: Math.abs(cx) > 12 ? YW : Y, face: [cx, cz], anim: 'dance', look });
      }
    };
    dance(11.8, -15.2, 4, 'club');
    dance(-11.8, 11.0, 3, 'club');
    if (boss) {
      list.push(
        { at: [-12.3, -3.0], y: YW, face: [0, -2], anim: 'drink', prop: 'drink', look: 'suit', colors: { top: GANG.purple, bottom: '#111111' }, scale: 1.05 },
        { at: [-11.2, -5.4], y: YW, face: [0, -5], anim: 'idle', look: 'suit', react: false },
        { at: [-11.2, -0.6], y: YW, face: [0, 0], anim: 'idle', look: 'suit', react: false },
        { at: [-12.8, -1.6], y: YW, face: [-12.3, -3], anim: 'talk', look: 'club', colors: { top: GANG.yellow } },
      );
    }
    c.spawn(list);
  }

  // ------------------------------------------------------------------------------------------ runtime
  update(dt, t) {
    const rm = this.reducedMotion;
    this.uni.uTime.value = rm ? t * 0.35 : t;
    const T = this.T;
    // underglow breathing (soft, ≥3 s, ±12 %)
    for (let i = 0; i < 4; i++) this.cars.glow(i, 0.88 + 0.24 * this.pulse(t, 3.4 + i * 0.4, i * 1.3));
    if (this.pl) {
      this.pl[0].intensity = 7 * T.glow * (0.88 + 0.24 * this.pulse(t, 3.4, 0));
      this.pl[1].intensity = 7 * T.glow * (0.88 + 0.24 * this.pulse(t, 3.8, 1.3));
    }
    // two signs breathe very slowly
    for (const s of this.strip.signs) {
      if (!s.breathe) continue;
      s.mesh.material.color.setScalar(s.base * (0.88 + 0.12 * this.pulse(t, 4.5, s.ph)));
    }
    this._updateTree(t);
    this._updateTraffic(t);
    // cruisers on the cross streets
    if (!rm) {
      for (const c of this.cruisers) {
        const k = ((t - c.t0) % c.every + c.every) % c.every / c.dur;
        const s = this.muscle.slots[c.i];
        if (k >= 1 || t < c.t0) { if (s.x !== 200 * c.dir) c.fleet.move(c.i, 200 * c.dir, c.z, s.yaw); continue; }
        const x = -95 * c.dir + 190 * c.dir * k;
        c.fleet.move(c.i, x, c.z, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
    // engine "rev" shake on capture (motion only, no light change)
    if (this._rev > 0) {
      this._rev = Math.max(0, this._rev - dt);
      const s = this.cars.slots[this._revCar];
      const a = Math.min(1, this._rev * 2) * 0.012;
      this.cars.move(this._revCar, s.x, s.z, s.yaw, a * Math.sin(t * 55) * 0.6 + a * 0.5, -a * 1.5, a * Math.sin(t * 47));
      if (this._rev === 0) this.cars.move(this._revCar, s.x, s.z, s.yaw, 0, 0, 0);
    }
    this.cars.flush();
    this.muscle.flush();
    this.confetti.update(dt);
  }

  /** Drag tree: stage → 3 ambers → green → rest, every change a ≥ 1 s cross-fade. Never blinks. */
  _updateTree(t) {
    const OFF = 0.12, ON = 2.2;
    const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    let stage, a0, a1, a2, green;
    if (this.reducedMotion) { stage = 1; a0 = a1 = a2 = 1; green = 0; }
    else {
      const c = ((t - this._tree) % 16 + 16) % 16;
      const fadeOut = 1 - ss(12.5, 14.5, c);
      stage = ss(0, 1.5, c) * fadeOut;
      a0 = ss(2, 3.2, c) * (1 - ss(8, 9.2, c));
      a1 = ss(3.4, 4.6, c) * (1 - ss(8, 9.2, c));
      a2 = ss(4.8, 6, c) * (1 - ss(8, 9.2, c));
      green = ss(7.8, 9.2, c) * fadeOut;
    }
    const L0 = this.treeLamps;
    if (L0) {
      const C = this._treeCols;
      const set = (m, col, k) => m.color.copy(col).multiplyScalar(OFF + (ON - OFF) * k);
      set(L0.stage, C.stage, stage * 0.7);
      set(L0.amber[0], C.amber, a0); set(L0.amber[1], C.amber, a1); set(L0.amber[2], C.amber, a2);
      set(L0.green, C.green, green);
      set(L0.red, C.red, 0);
    } else if (this.treeMats) {
      const amb = (a0 + a1 + a2) / 3;
      this.treeMats.amber.forEach((m) => { m.emissiveIntensity = 0.1 + 2 * amb; });
      this.treeMats.green.forEach((m) => { m.emissiveIntensity = 0.1 + 2 * green; });
      this.treeMats.red.forEach((m) => { m.emissiveIntensity = 0.1; });
    }
  }

  /** Traffic lights: slow 30 s cycle with 1.5 s cross-fades (static green with reduced motion). */
  _updateTraffic(t) {
    const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    let g = 1, a = 0, r = 0;
    if (!this.reducedMotion) {
      const c = t % 30;
      g = 1 - ss(14, 15.5, c) + ss(28.5, 30, c);
      a = ss(14, 15.5, c) * (1 - ss(18, 19.5, c));
      r = ss(18, 19.5, c) * (1 - ss(28.5, 30, c));
    }
    const lo = 0.08, hi = 2.2;
    if (this.traffic) {
      const C = this._tlCols;
      this.traffic.green.color.copy(C.green).multiplyScalar(lo + hi * g);
      this.traffic.amber.color.copy(C.amber).multiplyScalar(lo + hi * a);
      this.traffic.red.color.copy(C.red).multiplyScalar(lo + hi * r);
    } else if (this.trafficMats) {
      this.trafficMats.green.forEach((m) => { m.emissiveIntensity = lo + hi * g; });
      this.trafficMats.amber.forEach((m) => { m.emissiveIntensity = lo + hi * a; });
      this.trafficMats.red.forEach((m) => { m.emissiveIntensity = lo + hi * r; });
    }
  }

  react(event) {
    if (event === 'capture') { this._rev = 1.3; this._revCar = this._revCar ? 0 : 1; }
    else if (event === 'finale') this.confetti.fire();
    else if (event === 'start') this._tree = this.uni.uTime.value;
  }
}
