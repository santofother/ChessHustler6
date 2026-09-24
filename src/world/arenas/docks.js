// Rustwater Docks (Hustler district nh2): "Everything arrives here. Nothing gets inspected."
// Dusk container yard on a glowing canal: stacked container walls, gantry cranes with slow trolleys, a forklift
// doing laps, sodium light pools on wet concrete, a tug drifting by, the skyline across the water, a graffiti
// hangout corner (couch, oil-drum fire, fluoro tube) and dockworkers betting on the game.
// Layout (board at origin, white +Z, black −Z): quay edge + canal behind black (z < −21), hangout corner front-left
// of black (x≈−12, z≈−8), betting crew on the right long side, dockworkers on the left, container yard behind white.
// Variants: time day|dusk(default)|night, boss (Local 64: ship being unloaded, union banners, more crew).
import * as THREE from 'three';
import { Arena, STREET_Y } from './Arena.js';
import { rng, glowTexture, smokeTexture, canvasTexture } from '../util.js';
import { Batcher } from './docks/batch.js';
import { graffitiTexture, signTexture, decalMaterial } from './docks/graffiti.js';
import {
  containerTexture, containerGeometry, CONTAINER_COLORS, makeCrane, makeForklift, makeTugboat, makeDrumFire,
  makeLightMast, glowSprite, addBollard, addPallet,
} from './docks/props.js';
import {
  bake, normalise, glbParts, concreteTexture, wetRoughTexture, puddleTexture, hazardTexture, causticTexture, buildSkyline,
} from './docks/scenery.js';
import { makeCouch, makeArmchair, makeFluoro } from './trap/furniture.js';

const Y = STREET_Y;
const QUAY_Z = -21;          // quay edge (water beyond, behind black)
const WATER_Y = Y - 1.5;
const FAR_Z = -64;           // far bank edge
const CRANE_Z = -15;         // crane centre (legs at z −9.5 / −20.5)
const GANG = { blue: '#3d8bff', amber: '#ffb347' };

const TIMES = {
  day: {
    sky: { zenith: '#3f6f9a', top: '#6d98bb', mid: '#b9c4c0', horizon: '#f0c48e', bottom: '#2f3438', sunColor: '#ffd9a0', sunGlow: 0.5, stars: 0 },
    sun: { color: 0xffe0b0, intensity: 2.7, dir: [-0.55, 0.62, -0.7] }, hemi: [0xbcd3e6, 0x4a4238, 1.15],
    fog: { color: '#b8b2a4', near: 40, far: 190 }, background: '#9fb2c0', exposure: 1.0,
    lamp: 0.0, lampPools: 0.15, canal: 0.28, water: '#2c4a50', windows: 0.25, bloom: { strength: 0.4, radius: 0.4, threshold: 0.95 },
    env: 0.8, fire: 0.6, lampsOn: false,
  },
  dusk: {
    sky: { zenith: '#0a1430', top: '#15305a', mid: '#227086', horizon: '#ff8a45', bottom: '#12171e', sunColor: '#ff9a55', sunGlow: 0.55, stars: 0.2 },
    sun: { color: 0xffb27a, intensity: 1.9, dir: [-0.5, 0.45, -1] }, hemi: [0x6f96c0, 0x2a2420, 1.0],
    fog: { color: '#27405a', near: 38, far: 175 }, background: '#1a2a40', exposure: 1.08,
    lamp: 1.0, lampPools: 0.8, canal: 0.85, water: '#0a2a30', windows: 1.0, bloom: { strength: 0.7, radius: 0.5, threshold: 0.86 },
    env: 0.7, fire: 1.0, lampsOn: true,
  },
  night: {
    sky: { zenith: '#03060f', top: '#0a1228', mid: '#14254a', horizon: '#3a3150', bottom: '#07090d', sunColor: '#9fb4ff', sunGlow: 0.25, stars: 0.9 },
    sun: { color: 0x9fb4ff, intensity: 0.75, dir: [0.35, 0.7, -0.6] }, hemi: [0x4a6090, 0x1f1812, 1.0],
    fog: { color: '#0d1626', near: 34, far: 160 }, background: '#070c18', exposure: 1.12,
    lamp: 1.7, lampPools: 1.25, canal: 1.45, water: '#041a1e', windows: 1.35, bloom: { strength: 0.8, radius: 0.55, threshold: 0.82 },
    env: 0.55, fire: 1.3, lampsOn: true,
  },
};

const HIVIS = ['#d7ff2e', '#ff7a1a', '#ffd23f'];

export default class DocksArena extends Arena {
  async build() {
    const v = this.variant || {};
    this.T = TIMES[v.time] || TIMES.dusk;
    this.boss = !!v.boss;
    this.low = this.ctx.quality === 'low';
    this.r = rng(this.boss ? 640 : 64);
    this.anim = { cranes: [], smoke: [], birds: [], flames: [], boost: 0, boostT: 0 };
    const T = this.T;

    // ---------------------------------------------------------------- assets (parallel, all optional)
    const P = 'models/arenas/';
    const [gCrane, gContainer, gForklift, gMast, gBollard, gTug, gDrum, gCouch, gArm, gFluoro, gSpeaker, gCooler] = await Promise.all([
      this.glb(P + 'docks/gantry_crane.glb'), this.glb(P + 'docks/container.glb'), this.glb(P + 'docks/forklift.glb'),
      this.glb(P + 'docks/light_mast.glb'), this.glb(P + 'docks/bollard.glb'), this.glb(P + 'docks/tugboat.glb'),
      this.glb(P + 'docks/oil_drum_fire.glb'), this.glb(P + 'trap/couch.glb'), this.glb(P + 'trap/armchair.glb'),
      this.glb(P + 'trap/fluoro_light.glb'), this.glb('models/props/speaker_stack.glb'), this.glb('models/props/cooler.glb'),
    ]);
    this.g = { gCrane, gContainer, gForklift, gMast, gBollard, gTug, gDrum, gCouch, gArm, gFluoro, gSpeaker, gCooler };

    // ---------------------------------------------------------------- sky, lights, mood
    this.addSky(T.sky.sunColor ? { ...T.sky, sunDir: T.sun.dir.map((x, i) => (i === 1 ? x * 0.35 : x)) } : T.sky);
    this.addHemi(T.hemi[0], T.hemi[1], T.hemi[2]);
    this.addSun({ color: T.sun.color, intensity: T.sun.intensity, dir: T.sun.dir });

    this.static = new Batcher();   // near set dressing (casts shadows)
    this.far = new Batcher();      // distant stuff (no shadows)
    this.mats = this._materials();

    this._ground();
    this._quayAndWater();
    this._containers();
    this._cranes();
    this._yard();
    this._hangout();
    this._betting();
    this._vehicles();
    this._farBank();
    if (!this.low) this._birds();
    this._smoke();
    this._lights();

    this.static.flush(this.group, { name: 'docks_static' });
    this.far.flush(this.group, { name: 'docks_far', castShadow: false, receiveShadow: false });

    this.buildEnvMap([
      { color: '#ffa347', pos: [9, 10, -10], size: [6, 3], mult: 3 * Math.max(0.3, T.lamp) },
      { color: '#ffa347', pos: [-8, 10, 12], size: [6, 3], mult: 3 * Math.max(0.3, T.lamp) },
      { color: '#2dffc4', pos: [0, -4, -30], size: [60, 8], mult: 1.2 * T.canal },
      { color: '#ff8a45', pos: [0, 3, -60], size: [80, 6], mult: T === TIMES.dusk ? 1.6 : 0.4 },
    ]);
    this.mood = {
      background: T.background,
      fog: T.fog,
      exposure: T.exposure,
      bloom: T.bloom,
      envIntensity: T.env,
    };
    this.boardStyle = {
      frame: '#23272e', frameText: '#ffc94d',
      plinth: '#3a3f46', plinthMap: 'steel',
      kerb: 'hazard', kerbColors: ['#f2b90f', '#16161a'],
      neon: T.lampsOn ? [GANG.blue, GANG.amber] : null,
      neonIntensity: 2.2,
    };

    this._people();
  }

  // ================================================================== materials
  _materials() {
    const tr = (x) => this.track(x);
    const hz = tr(hazardTexture());
    hz.wrapS = hz.wrapT = THREE.RepeatWrapping;
    const m = {
      concreteDark: new THREE.MeshStandardMaterial({ color: '#3b3e42', roughness: 0.85 }),
      steel: new THREE.MeshStandardMaterial({ color: '#6c737c', roughness: 0.45, metalness: 0.7 }),
      rail: new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.3, metalness: 0.9 }),
      bollard: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.6, metalness: 0.4 }),
      hazard: new THREE.MeshStandardMaterial({ color: '#f2b90f', roughness: 0.6 }),
      hazardStripe: new THREE.MeshStandardMaterial({ map: hz, roughness: 0.55 }),
      yellowPaint: new THREE.MeshStandardMaterial({ color: '#e8b21a', roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      whitePaint: new THREE.MeshStandardMaterial({ color: '#d9d6cc', roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      wood: new THREE.MeshStandardMaterial({ color: '#8d6a45', roughness: 0.9 }),
      woodDark: new THREE.MeshStandardMaterial({ color: '#5d4430', roughness: 0.9 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.95 }),
      drumBlue: new THREE.MeshStandardMaterial({ color: '#2a5fa8', roughness: 0.6, metalness: 0.3 }),
      drumRust: new THREE.MeshStandardMaterial({ color: '#7a3f1d', roughness: 0.9, metalness: 0.25 }),
      cone: new THREE.MeshStandardMaterial({ color: '#ff6a1a', roughness: 0.5 }),
      white: new THREE.MeshStandardMaterial({ color: '#e7e4dc', roughness: 0.6 }),
      cash: new THREE.MeshStandardMaterial({ color: '#6fbf73', roughness: 0.7 }),
      blueBody: new THREE.MeshStandardMaterial({ color: GANG.blue, roughness: 0.4, metalness: 0.4 }),
      amberBody: new THREE.MeshStandardMaterial({ color: GANG.amber, roughness: 0.45, metalness: 0.3 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.5, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0c1420', roughness: 0.1, metalness: 0.8 }),
      warmWin: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc977').multiplyScalar(this.T.lampsOn ? 2.2 : 0.7) }),
      headlight: new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d0').multiplyScalar(this.T.lampsOn ? 1.8 : 1.0) }),
      tail: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(2.5) }),
    };
    for (const k of ['warmWin', 'headlight', 'tail']) m[k].userData.noShadow = true;
    return m;
  }

  // ================================================================== ground
  _ground() {
    const tr = (x) => this.track(x);
    const map = tr(concreteTexture(9));
    const rough = tr(wetRoughTexture(13));
    const L = 240, zMin = QUAY_Z, zMax = 120;
    const geo = new THREE.PlaneGeometry(L, zMax - zMin);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, Y, (zMin + zMax) / 2);
    // world-space UVs: 8 m concrete tiles
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8);
    map.wrapS = map.wrapT = rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    rough.repeat.set(0.37, 0.37);
    const wet = this.T === TIMES.day ? 0.75 : 1.0;
    const mat = new THREE.MeshStandardMaterial({
      map, roughnessMap: rough, roughness: 0.75 * wet + 0.15, metalness: 0.05, color: '#b9bcc2', envMapIntensity: 1.2,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true; ground.name = 'docks_ground';
    this.group.add(ground);

    // puddles (glossy, reflect the sky + sodium lamps)
    const pTex = tr(puddleTexture(21));
    const pMat = new THREE.MeshStandardMaterial({
      color: '#15181c', roughness: 0.16, metalness: 0.2, alphaMap: pTex, transparent: true, depthWrite: false,
      envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const pb = new Batcher();
    const r = rng(77);
    const spots = [[-8.5, -3], [7.2, 6.2], [-6.8, 7.5], [3.5, -8.4], [-3, -12], [8.8, -5.5], [-10, 3.8], [1, 11.5], [12, -14],
      [-4, -17], [6, -18.5], [-16, 2], [15, 1], [-2.5, 14.5], [10.5, 16], [-20, -14], [22, -6], [-9, -16.5]];
    for (const [x, z] of spots) {
      const s = 2.2 + r() * 3;
      const g = new THREE.PlaneGeometry(s, s * (0.6 + r() * 0.5)); g.rotateX(-Math.PI / 2);
      pb.add(pMat, g, [x, Y + 0.012, z], r() * Math.PI);
      g.dispose();
    }
    pb.flush(this.group, { castShadow: false, name: 'puddles' });

    // painted markings
    const b = this.static;
    const line = (mat, x0, z0, x1, z1, w = 0.14) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.PlaneGeometry(w, len); g.rotateX(-Math.PI / 2);
      b.add(mat, g, [(x0 + x1) / 2, Y + 0.008, (z0 + z1) / 2], Math.atan2(x1 - x0, z1 - z0));
      g.dispose();
    };
    const yP = this.mats.yellowPaint, wP = this.mats.whitePaint;
    // forklift lane edges (right) and truck lane (left)
    line(yP, 10.0, -12, 10.0, 12.5); line(yP, 10.25, -12, 10.25, 12.5);
    line(yP, 14.4, -12, 14.4, 12.5);
    line(yP, -8.7, 3.5, -8.7, 18); line(yP, -12.4, 3.5, -12.4, 18);
    // pedestrian walkway across the yard (white dashes)
    for (let x = -30; x < 30; x += 2.4) { if (Math.abs(x) < 6.2) continue; line(wP, x, 6.9, x + 1.4, 6.9, 0.18); line(wP, x, -6.9, x + 1.4, -6.9, 0.18); }
    // crane rail channels
    for (const z of [CRANE_Z + 5.5, CRANE_Z - 5.5]) {
      const g = new THREE.PlaneGeometry(240, 0.9); g.rotateX(-Math.PI / 2);
      b.add(this.mats.concreteDark, g, [0, Y + 0.006, z]); g.dispose();
      for (const dz of [-0.22, 0.22]) b.box(this.mats.rail, [240, 0.06, 0.09], [0, Y, z + dz]);
    }
    // hatched no-parking boxes near crane legs
    const hz = this.mats.hazardStripe;
    for (const [x, z, w, d] of [[-17.5, -9.5, 3, 3], [15.5, -9.5, 3, 3]]) {
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
      const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 2, uvs.getY(i) * 0.5);
      b.add(hz, g, [x, Y + 0.009, z]); g.dispose();
    }
  }

  // ================================================================== quay + canal
  _quayAndWater() {
    const T = this.T, b = this.static, m = this.mats;
    const tr = (x) => this.track(x);
    // quay wall face
    const wallMat = new THREE.MeshStandardMaterial({ color: '#2e3134', roughness: 0.9 });
    const wall = new THREE.PlaneGeometry(240, Y - WATER_Y + 3);
    this.far.add(wallMat, wall, [0, (Y + WATER_Y - 3) / 2, QUAY_Z], Math.PI);
    this.far.add(wallMat, wall, [0, (Y + WATER_Y - 3) / 2, FAR_Z], 0);
    wall.dispose();
    // edge: hazard strip + kerb
    b.box(m.concreteDark, [240, 0.18, 0.5], [0, Y, QUAY_Z + 0.25]);
    const strip = new THREE.PlaneGeometry(240, 0.45); strip.rotateX(-Math.PI / 2);
    const uv = strip.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 120, uv.getY(i));
    b.add(m.hazardStripe, strip, [0, Y + 0.185, QUAY_Z + 0.25]); strip.dispose();
    // bollards + tyre fenders
    const tyre = new THREE.TorusGeometry(0.45, 0.17, 6, 14);
    for (let x = -60; x <= 60; x += 7.5) {
      if (this.g.gBollard) bake(b, normalise(this.g.gBollard.clone(), { height: 0.6 }), [x, Y + 0.18, QUAY_Z + 0.8]);
      else addBollard(b, m, x, QUAY_Z + 0.8, Y + 0.18);
      this.far.add(m.rubber, tyre, [x + 3.7, Y - 0.9, QUAY_Z - 0.2]);
    }
    tyre.dispose();

    // canal water: dark glossy surface + glowing ripple emissive (scrolled slowly)
    const glowCol = new THREE.Color('#2dffc4');
    const c1 = tr(causticTexture(5)); c1.repeat.set(18, 5);
    const c2 = tr(causticTexture(11, { lines: 40, width: 3 })); c2.repeat.set(9, 2.5);
    const W = 420, D = QUAY_Z - FAR_Z;
    const wg = new THREE.PlaneGeometry(W, D); wg.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({
      color: T.water, roughness: 0.08, metalness: 0.3, emissive: glowCol, emissiveMap: c1,
      emissiveIntensity: 0.55 * T.canal, envMapIntensity: 1.3,
    }));
    water.position.set(0, WATER_Y, (QUAY_Z + FAR_Z) / 2);
    water.receiveShadow = true; water.name = 'canal';
    this.group.add(water);
    // second shimmer layer (additive)
    const sg = new THREE.PlaneGeometry(W, D); sg.rotateX(-Math.PI / 2);
    const shimmer = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      map: c2, color: glowCol.clone().multiplyScalar(0.55 * T.canal), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    shimmer.position.set(0, WATER_Y + 0.03, (QUAY_Z + FAR_Z) / 2);
    this.group.add(shimmer);
    // soft glow haze just above the canal near the quay (fake volumetric), strongest at night
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(W, 6), new THREE.MeshBasicMaterial({
      map: tr(canvasTexture(8, 64, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,1)');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      })), color: glowCol.clone().multiplyScalar(0.12 * T.canal), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    }));
    haze.position.set(0, WATER_Y + 3, FAR_Z + 1);
    this.group.add(haze);
    this.water = { c1, c2, mat: water.material, shimmer: shimmer.material, base: 0.55 * T.canal, shimBase: 0.55 * T.canal, col: glowCol };

    // far bank ground
    const fg = new THREE.PlaneGeometry(420, 200); fg.rotateX(-Math.PI / 2);
    this.far.add(new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.95 }), fg, [0, Y, FAR_Z - 100]);
    fg.dispose();
  }

  // ================================================================== containers (one or two InstancedMeshes)
  _containers() {
    const r = this.r;
    const list = [];
    const add = (x, z, rot, tiers, colors = null, y0 = Y) => {
      for (let t = 0; t < tiers; t++) list.push({ x: x + (r() - 0.5) * 0.08, y: y0 + t * 2.6, z: z + (r() - 0.5) * 0.08, rot: rot + (r() - 0.5) * 0.012, color: colors?.[t] ?? CONTAINER_COLORS[Math.floor(r() * CONTAINER_COLORS.length)] });
    };
    const R = Math.PI / 2;
    // hangout walls
    add(-14.2, -7, R, 2, ['#546e7a', '#c0392b']);
    add(-13.2, -12.5, 0, 1, ['#2c3e8f']);
    add(-16.7, -7, R, 3);
    // left column + truck side
    add(-14.5, 5.4, R, 2); add(-14.5, 17.8, R, 1); add(-17.0, 5.4, R, 3); add(-17.0, 17.8, R, 2);
    add(-24, -4, R, 2); add(-26.5, 9, R, 3);
    // right walls
    add(16.5, -1.2, R, 2); add(16.5, 11.1, R, 3); add(19.0, -1.2, R, 3); add(19.0, 11.1, R, 1);
    add(24, 3, R, 2);
    // behind white (+Z): rows
    add(0, 18.5, 0, 1, ['#ffb347']); add(-13.2, 18.6, 0, 2); add(13.2, 18.5, 0, 2); add(-26.4, 18.5, 0, 3); add(26.4, 18.6, 0, 1);
    add(-6.6, 21.2, 0, 2); add(6.6, 21.2, 0, 3); add(-19.8, 21.2, 0, 2); add(19.8, 21.3, 0, 3);
    if (!this.low) {
      add(0, 24, 0, 4); add(-13.2, 24, 0, 3); add(13.2, 24, 0, 4); add(-26.4, 24, 0, 2); add(26.4, 24, 0, 3);
      add(-6.6, 27, 0, 5); add(6.6, 27, 0, 3); add(-19.8, 27, 0, 4); add(19.8, 27, 0, 5);
    }
    // far bank stacks
    for (let x = -66; x <= 66; x += 12.6) {
      if (Math.abs(x) < 4) continue;
      add(x, FAR_Z - 5, 0, 1 + Math.floor(r() * 3));
      if (!this.low) add(x + 3, FAR_Z - 8, 0, 1 + Math.floor(r() * 4));
    }
    // cargo on the ship (boss) or the barge
    if (this.boss) {
      for (let bx = -32; bx <= 12; bx += 12.4) for (const rz of [-37.2, -34.7, -32.2, -29.7]) add(bx, rz, 0, 1 + Math.floor(r() * 3), null, WATER_Y + 7.0);
    } else {
      for (const bx of [-2, 10.4]) for (const rz of [-30.3, -27.8]) add(bx, rz, 0, 1 + Math.floor(r() * 2), null, WATER_Y + 1.95);
    }
    this._containerList = list;

    const count = list.length;
    let parts;
    if (this.g.gContainer) {
      parts = glbParts(this.g.gContainer, { length: 12.2 }).map(({ geometry, material }) => {
        const tint = /^TINT_/.test(material.name || '');
        const mat = material.clone(); mat.userData = {};
        if (tint) mat.color.set('#ffffff');
        return { geometry, material: mat, tint };
      });
      if (!parts.some((p) => p.tint) && parts.length) { parts[0].tint = true; parts[0].material.color.set('#ffffff'); }
    } else {
      const tex = this.track(containerTexture(3));
      const tex2 = this.track(containerTexture(8));
      const geo = containerGeometry();
      const mk = (t) => new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.6, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.7 });
      parts = [{ geometry: geo, material: mk(tex), tint: true, half: 0 }, { geometry: geo, material: mk(tex2), tint: true, half: 1 }];
    }
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const split = parts.length === 2 && parts[0].half === 0 && parts[1].half === 1;
    const groups = split ? [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)] : null;
    parts.forEach((p, pi) => {
      const items = split ? groups[pi] : list;
      const im = new THREE.InstancedMesh(p.geometry, p.material, items.length);
      items.forEach((c, i) => {
        dummy.position.set(c.x, c.y, c.z); dummy.rotation.set(0, c.rot, 0); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (p.tint) im.setColorAt(i, col.set(c.color));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = 'containers';
      this.group.add(im);
    });
    this.containerCount = count;
  }

  // ================================================================== cranes
  _cranes() {
    const defs = [
      { x: -24, color: GANG.blue, phase: 0, carry: this.boss, cc: '#ffb347' },
      { x: 22, color: GANG.amber, phase: 21, carry: this.boss, cc: '#3d8bff' },
    ];
    for (const d of defs) {
      let crane, trolley, spreader, cables = null, axis = 'z', sign = 1, glbMode = false;
      if (this.g.gCrane) {
        const src = this.g.gCrane.clone();
        this.tint(src, { TINT_Steel: d.color, EMISSIVE_Warning: '#ff2a1a' }, { intensity: 3 });
        const holder = normalise(src, { height: 36 });
        const box = new THREE.Box3().setFromObject(holder);
        const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
        axis = size.x > size.z ? 'x' : 'z';
        sign = (axis === 'x' ? c.x : c.z) >= 0 ? 1 : -1; // outreach side
        crane = new THREE.Group(); crane.add(holder);
        // rotate outreach toward world −Z
        crane.rotation.y = axis === 'z' ? (sign > 0 ? Math.PI : 0) : (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
        trolley = src.getObjectByName('Trolley'); spreader = src.getObjectByName('Spreader');
        glbMode = true;
        if (trolley) trolley.userData.base = trolley.position.clone();
        if (spreader) spreader.userData.base = spreader.position.clone();
        d.extent = (axis === 'x' ? size.x : size.z) / src.scale.x;
      } else {
        crane = makeCrane({ color: d.color, withContainer: d.carry, containerColor: d.cc });
        trolley = crane.userData.trolley; spreader = crane.userData.spreader; cables = crane.userData.cables;
      }
      crane.position.set(d.x, Y, CRANE_Z);
      this.group.add(crane);
      this.anim.cranes.push({ crane, trolley, spreader, cables, phase: d.phase, glbMode, axis, sign, extent: d.extent || 40 });
      // union banners on the landside legs (boss)
      if (this.boss) this._banner(d.x + (d.x < 0 ? 6.5 : -6.5), CRANE_Z + 5.5 + 0.55, 0, d.color === GANG.blue ? 0 : 1);
    }
  }

  _banner(x, z, yaw, style = 0) {
    const tex = this.track(signTexture([
      { t: 'LOCAL', c: '#ffffff', s: 70 }, { t: '64', c: style ? '#1b2a4a' : '#ffb347', s: 150 }, { t: 'WE MOVE IT', c: '#ffffff', s: 44 },
    ], { w: 256, h: 512, bg: style ? GANG.amber : GANG.blue }));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
    mesh.position.set(x, Y + 5.2, z); mesh.rotation.y = yaw;
    this.group.add(mesh);
  }

  // ================================================================== yard props
  _yard() {
    const b = this.static, m = this.mats, r = this.r;
    // light masts (baked; sprites + pools added separately)
    const mastPos = [[-7.4, -13.8], [8.3, -10.4], [7.4, 9.6], [-7.2, 13.2]];
    this.mastPos = mastPos;
    let proto;
    if (this.g.gMast) {
      const g = this.g.gMast.clone();
      this.tint(g, { EMISSIVE_Lamp: '#ffae4a' }, { intensity: this.T.lampsOn ? 4 : 0.6 });
      proto = normalise(g, { height: 13 });
    } else proto = makeLightMast({ height: 13 });
    const head = proto.userData.size ? proto.userData.size.y - 0.7 : proto.userData.head;
    for (const [x, z] of mastPos) {
      const yaw = Math.atan2(-x, -z);
      bake(b, proto, [x, Y, z], yaw);
      if (this.T.lampsOn) {
        const s = glowSprite(0xffa040, 7, 0.5 * Math.min(1, this.T.lamp));
        s.position.set(x + Math.sin(yaw) * 0.3, Y + head, z + Math.cos(yaw) * 0.3);
        this.group.add(s);
      }
    }
    // cones on the apron corners
    for (const [x, z] of [[6.4, 6.4], [-6.4, 6.4], [6.4, -6.4], [-6.4, -6.4], [6.7, -5.6], [-6.8, 5.7]]) {
      b.cyl(m.cone, 0.03, 0.2, 0.7, [x, Y, z], 0, 10);
      b.box(m.cone, [0.42, 0.04, 0.42], [x, Y, z]);
      b.cyl(m.white, 0.105, 0.14, 0.12, [x, Y + 0.32, z], 0, 10);
    }
    // pallets, drums, crates scattered (low stuff inside camera corridors)
    const low = [[-3.8, 11.5], [4.2, 12.8], [-4.5, -12.6], [2.8, -14.8], [4.6, 9]];
    low.forEach(([x, z], i) => addPallet(b, m, x, z, Y, r() * 0.5, 1 + (i % 3)));
    for (const [x, z, mat] of [[-2.6, 12.2, m.drumBlue], [-2.0, 12.8, m.drumRust], [5.4, 13.6, m.drumBlue], [3.6, -13.3, m.drumRust], [11, -14.5, m.drumBlue], [11.6, -13.9, m.drumBlue], [-20, -12, m.drumRust]]) {
      b.cyl(mat, 0.3, 0.3, 0.88, [x, Y, z], 0, 12);
      b.cyl(m.darkMetal, 0.31, 0.31, 0.04, [x, Y + 0.3, z], 0, 12);
      b.cyl(m.darkMetal, 0.31, 0.31, 0.04, [x, Y + 0.6, z], 0, 12);
    }
    // stacked pallets with shrink-wrapped cargo near the right lane
    for (const [x, z] of [[14.6, -13.6], [-5.0, 13.2]]) {
      b.box(m.wood, [1.2, 0.14, 1.0], [x, Y, z]);
      b.box(m.white, [1.1, 1.0 + r() * 0.3, 0.95], [x, Y + 0.14, z]);
    }
    // guard shack by the gate (+Z right)
    const sx = 12.4, sz = 14.6;
    b.box(m.white, [2.4, 2.5, 2.2], [sx, Y, sz]);
    b.box(m.blueBody, [2.7, 0.2, 2.5], [sx, Y + 2.5, sz]);
    b.box(m.warmWin, [1.6, 0.8, 0.05], [sx, Y + 1.2, sz - 1.12]);
    b.box(m.warmWin, [0.05, 0.8, 1.2], [sx - 1.22, Y + 1.2, sz]);
    b.box(m.darkMetal, [0.8, 1.9, 0.05], [sx + 0.6, Y, sz - 1.12]);
    // gate boom barrier (hazard striped, raised: the gate is always open)
    b.box(m.darkMetal, [0.3, 1.0, 0.3], [sx - 1.6, Y, sz - 1.4]);
    const arm = new THREE.BoxGeometry(0.12, 4.2, 0.12);
    const auv = arm.attributes.uv; for (let i = 0; i < auv.count; i++) auv.setX(i, auv.getY(i) * 10);
    b.add(m.hazardStripe, arm, [sx - 1.6, Y + 3.1, sz - 1.4], [0, 0, 0.12]); arm.dispose();
    const sign = this.track(signTexture(['LOCAL 64 GATE', 'NO INSPECTIONS', 'BEYOND THIS POINT'], { w: 512, h: 256, bg: '#1b2a4a', accent: GANG.amber }));
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: this.T.lampsOn ? 0.35 : 0 }));
    sm.position.set(sx, Y + 3.3, sz - 1.26); sm.rotation.y = Math.PI;
    this.group.add(sm);

    // union mural on the container facing the board from the +Z yard (seen from the black camera)
    const mural = this.track(signTexture([
      { t: 'RUSTWATER DOCKS', c: '#ffffff', s: 58 }, { t: 'LOCAL 64', c: GANG.blue, s: 96 }, { t: 'EVERYTHING ARRIVES HERE', c: '#1b2a4a', s: 30 },
    ], { w: 512, h: 256, bg: GANG.amber }));
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 2.1), decalMaterial(mural, { opacity: 0.92 }));
    mm.position.set(0, Y + 1.3, 18.5 - 1.235); mm.rotation.y = Math.PI;
    this.group.add(mm);
    // graffiti on the yard rows (facing the board)
    const gTex = this.track(graffitiTexture(41, { words: ['DOCKBOYZ', 'L64', 'RWD'] }));
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.4), decalMaterial(gTex));
    gm.position.set(-11.5, Y + 1.3, 18.6 - 1.235); gm.rotation.y = Math.PI;
    this.group.add(gm);
    const gTex2 = this.track(graffitiTexture(57, { words: ['NO REFUNDS', 'VI'] }));
    const gm2 = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.4), decalMaterial(gTex2));
    gm2.position.set(13.2, Y + 1.3, 18.5 - 1.235); gm2.rotation.y = Math.PI;
    this.group.add(gm2);
    // right wall graffiti (facing −x, toward the board) visible from the white camera
    const gTex3 = this.track(graffitiTexture(73, { words: ['HUSTLE', 'KING ME'] }));
    const gm3 = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), decalMaterial(gTex3));
    gm3.position.set(16.5 - 1.235, Y + 1.3, -1.2); gm3.rotation.y = -Math.PI / 2;
    this.group.add(gm3);
  }

  // ================================================================== graffiti hangout corner
  _hangout() {
    const b = this.static, m = this.mats;
    const hx = -12.2, hz = -7.2; // corner centre
    this.hang = { x: hx, z: hz };
    // graffiti on the two container walls
    const wallX = -14.2 + 1.235;
    const g1 = this.track(graffitiTexture(3, { words: ['GAMBIT', 'ZERO QS', 'RWD'] }));
    const d1 = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 2.4), decalMaterial(g1));
    d1.position.set(wallX, Y + 1.32, -6.3); d1.rotation.y = Math.PI / 2;
    this.group.add(d1);
    const g2 = this.track(graffitiTexture(19, { words: ['CHECK', 'PAWN STARS'], tags: 2 }));
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.4), decalMaterial(g2));
    d2.position.set(-13.0, Y + 1.32, -12.5 + 1.235); d2.rotation.y = 0;
    this.group.add(d2);
    const g3 = this.track(graffitiTexture(88, { words: ['VICE', 'MATE'], tags: 1 }));
    const d3 = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.3), decalMaterial(g3, { opacity: 0.85 }));
    d3.position.set(wallX, Y + 3.9, -7.6); d3.rotation.y = Math.PI / 2;
    this.group.add(d3);

    // rug
    const rug = this.track(canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = '#6b1f2b'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9a441'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
      g.strokeStyle = '#1f3a5b'; g.lineWidth = 4; g.strokeRect(22, 22, w - 44, h - 44);
      g.fillStyle = '#d9a441';
      for (let i = 0; i < 5; i++) { g.save(); g.translate(w * (0.18 + i * 0.16), h / 2); g.rotate(Math.PI / 4); g.fillRect(-9, -9, 18, 18); g.restore(); }
      for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }));
    const rg = new THREE.PlaneGeometry(3.4, 2.4); rg.rotateX(-Math.PI / 2);
    b.add(new THREE.MeshStandardMaterial({ map: rug, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }), rg, [-11.3, Y + 0.01, -6.9], Math.PI / 2);
    rg.dispose();

    // couch against the side wall, armchair, crate table
    const couch = this.g.gCouch ? normalise(this.tint(this.g.gCouch.clone(), { TINT_Fabric: '#5e2a6e' })) : makeCouch({ color: '#5e2a6e' });
    bake(b, couch, [wallX + 0.5, Y, -6.8], Math.PI / 2);
    const arm = this.g.gArm ? normalise(this.tint(this.g.gArm.clone(), { TINT_Fabric: '#2f6b5a' })) : makeArmchair({ color: '#2f6b5a' });
    bake(b, arm, [-10.1, Y, -10.4], 0.35);
    b.box(m.wood, [0.8, 0.45, 0.6], [-11.1, Y, -6.8]);
    b.box(m.woodDark, [0.82, 0.04, 0.62], [-11.1, Y + 0.45, -6.8]);
    // bottles + pizza box on the crate
    for (let i = 0; i < 4; i++) b.cyl(i % 2 ? m.drumBlue : m.cash, 0.035, 0.035, 0.26, [-11.3 + i * 0.12, Y + 0.49, -6.95 + (i % 2) * 0.1], 0, 6);
    b.box(m.white, [0.42, 0.05, 0.42], [-10.95, Y + 0.49, -6.6], 0.3);
    // oil drum fire
    const drum = this.g.gDrum ? normalise(this.tint(this.g.gDrum.clone(), { TINT_Drum: '#6b3a1f' }), { height: 0.9 }) : null;
    const fire = makeDrumFire({ drum });
    fire.position.set(-9.7, Y, -8.0);
    this.group.add(fire);
    this.anim.flames = fire.userData.flames;
    this.firePos = new THREE.Vector3(-9.7, Y + 1.3, -8.0);
    // fluorescent tube on the container wall (steady)
    const fl = this.g.gFluoro ? normalise(this.g.gFluoro.clone()) : makeFluoro({ hang: 0 });
    const inner = new THREE.Group(); inner.add(fl); inner.rotation.y = Math.PI / 2;
    const outer = new THREE.Group(); outer.add(inner); outer.rotation.z = Math.PI / 2;
    outer.position.set(wallX + 0.02, Y + 2.35, -6.8);
    this.group.add(outer);
    const fGlow = glowSprite(0xbff6ff, 2.2, 0.18); fGlow.position.set(wallX + 0.3, Y + 2.35, -6.8); this.group.add(fGlow);
    // speaker + cooler
    if (this.g.gSpeaker) bake(b, normalise(this.g.gSpeaker.clone(), { height: 1.5 }), [-12.9, Y, -10.7], 0.6);
    else {
      b.box(m.rubber, [0.7, 1.1, 0.55], [-12.9, Y, -10.7], 0.6);
      const cone = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16); cone.rotateX(Math.PI / 2);
      b.add(m.darkMetal, cone, [-12.9 + Math.sin(0.6) * 0.28, Y + 0.72, -10.7 + Math.cos(0.6) * 0.28], 0.6); cone.dispose();
    }
    if (this.g.gCooler) bake(b, normalise(this.g.gCooler.clone(), { height: 0.45 }), [-9.2, Y, -11.2], 0.2);
    else { b.box(m.blueBody, [0.6, 0.38, 0.4], [-9.2, Y, -11.2], 0.2); b.box(m.white, [0.62, 0.08, 0.42], [-9.2, Y + 0.38, -11.2], 0.2); }
    // string lights from the container top to the mast (steady warm bulbs)
    const bulbs = new Batcher();
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf7a').multiplyScalar(this.T.lampsOn ? 3 : 1.2) });
    const bulb = new THREE.SphereGeometry(0.06, 6, 5);
    const A = new THREE.Vector3(wallX, Y + 5.1, -3.2), B = new THREE.Vector3(-7.6, Y + 4.2, -13.6);
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const p = A.clone().lerp(B, k); p.y -= Math.sin(k * Math.PI) * 1.1;
      bulbs.add(bm, bulb, [p.x, p.y, p.z]);
      if (i < n) {
        const q = A.clone().lerp(B, (i + 1) / n); q.y -= Math.sin(((i + 1) / n) * Math.PI) * 1.1;
        bulbs.beam(m.rubber, p.toArray(), q.toArray(), 0.015);
      }
    }
    bulb.dispose();
    bulbs.flush(this.group, { castShadow: false, name: 'string_lights' });
  }

  // ================================================================== betting table (right long side)
  _betting() {
    const b = this.static, m = this.mats;
    const tx = 7.6, tz = 0.4;
    this.bet = { x: tx, z: tz };
    // cable spool table
    b.cyl(m.wood, 0.72, 0.72, 0.08, [tx, Y, tz], 0, 18);
    b.cyl(m.woodDark, 0.4, 0.4, 0.66, [tx, Y + 0.08, tz], 0, 14);
    b.cyl(m.wood, 0.72, 0.72, 0.08, [tx, Y + 0.74, tz], 0, 18);
    // cash stacks + dice
    for (let i = 0; i < 6; i++) b.box(m.cash, [0.16, 0.05 + (i % 3) * 0.04, 0.08], [tx - 0.3 + (i % 3) * 0.2, Y + 0.82, tz - 0.15 + Math.floor(i / 3) * 0.3], i * 0.4);
    b.box(m.white, [0.07, 0.07, 0.07], [tx + 0.35, Y + 0.82, tz + 0.2], 0.5);
    b.box(m.white, [0.07, 0.07, 0.07], [tx + 0.28, Y + 0.82, tz + 0.32], 1.1);
    // lantern
    b.cyl(m.darkMetal, 0.08, 0.1, 0.25, [tx + 0.1, Y + 0.82, tz - 0.35], 0, 8);
    const lg = glowSprite(0xffc070, 1.4, 0.55); lg.position.set(tx + 0.1, Y + 1.0, tz - 0.35); this.group.add(lg);
    // chalkboard A-frame with odds
    const front = this.track(signTexture([
      { t: 'ODDS', c: '#ffd23f', s: 64 }, { t: 'WHITE  3 - 1', c: '#ffffff', s: 44 }, { t: 'BLACK  5 - 2', c: '#9ee6ff', s: 44 }, { t: 'NO CREDIT', c: '#ff7a7a', s: 34 },
    ], { w: 256, h: 320, bg: '#1d2621', chalk: true }));
    const back = this.track(signTexture([
      { t: 'PLACE', c: '#ffd23f', s: 56 }, { t: 'YOUR', c: '#ffffff', s: 56 }, { t: 'BETS', c: '#ffb347', s: 72 },
    ], { w: 256, h: 320, bg: '#1d2621', chalk: true }));
    const sx = 8.75, sz = 3.3, yaw = -1.1;
    const pg = new THREE.PlaneGeometry(0.8, 1.0);
    const fm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: front, roughness: 0.9 }));
    const bm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: back, roughness: 0.9 }));
    const holder = new THREE.Group(); holder.position.set(sx, Y, sz); holder.rotation.y = yaw;
    fm.position.set(0, 0.55, 0.18); fm.rotation.x = -0.32;
    bm.position.set(0, 0.55, -0.18); bm.rotation.set(0.32, Math.PI, 0);
    holder.add(fm, bm);
    this.group.add(holder);
    b.box(m.woodDark, [0.86, 0.06, 0.06], [sx, Y + 1.02, sz], yaw);
  }

  // ================================================================== forklift, truck, tug, ship/barge
  _vehicles() {
    const m = this.mats, b = this.static;
    // forklift (driving a loop in the right lane)
    let fork, forks;
    if (this.g.gForklift) {
      const src = this.tint(this.g.gForklift.clone(), { TINT_Body: '#ffc21a' });
      fork = normalise(src, { height: 2.2 });
      forks = src.getObjectByName('Forks');
      if (forks) forks.userData.base = forks.position.clone();
    } else { fork = makeForklift(); forks = fork.userData.forks; }
    this.group.add(fork);
    fork.add(this._driver(this.g.gForklift ? new THREE.Vector3(0, 0.62, -0.3) : fork.userData.seat));
    const pts = [[10.8, -9], [10.8, 0], [10.8, 9], [12.2, 11.3], [13.6, 9], [13.6, 0], [13.6, -9], [12.2, -11.3]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, Y, z)), true, 'centripetal');
    curve.getLength();
    this.forklift = { obj: fork, forks, curve, len: curve.getLength(), p: new THREE.Vector3(), tan: new THREE.Vector3(), glb: !!this.g.gForklift };

    // semi truck with a container trailer parked on the left (+Z yard), cab facing the board
    const tx = -10.5;
    b.box(m.blueBody, [2.5, 2.4, 2.6], [tx, Y + 0.7, 5.6]);         // cab
    b.box(m.blueBody, [2.5, 1.0, 1.4], [tx, Y + 0.7, 4.3]);         // hood
    b.box(m.glass, [2.3, 0.9, 0.05], [tx, Y + 2.05, 4.28]);         // windscreen
    b.box(m.darkMetal, [2.6, 0.5, 0.2], [tx, Y + 0.45, 3.6]);       // bumper
    b.box(m.headlight, [0.4, 0.2, 0.05], [tx - 0.9, Y + 1.05, 3.58]); b.box(m.headlight, [0.4, 0.2, 0.05], [tx + 0.9, Y + 1.05, 3.58]);
    b.box(m.darkMetal, [0.3, 1.8, 0.3], [tx + 1.0, Y + 2.3, 6.6]);  // exhaust stack
    b.box(m.darkMetal, [2.4, 0.3, 12.8], [tx, Y + 1.0, 11.0]);      // trailer chassis
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14); wheel.rotateZ(Math.PI / 2);
    for (const z of [4.6, 6.9, 14.8, 16.1]) for (const s of [-1, 1]) b.add(m.rubber, wheel, [tx + s * 1.1, Y + 0.5, z]);
    wheel.dispose();
    b.box(m.tail, [0.3, 0.15, 0.05], [tx - 1.0, Y + 1.0, 17.42]); b.box(m.tail, [0.3, 0.15, 0.05], [tx + 1.0, Y + 1.0, 17.42]);
    // container on the trailer (separate mesh: it sits on the chassis)
    const tc = new THREE.Mesh(containerGeometry(), new THREE.MeshStandardMaterial({ color: '#c0392b', map: this.track(containerTexture(12)), roughness: 0.6, metalness: 0.35 }));
    tc.position.set(tx, Y + 1.3, 11.0); tc.rotation.y = Math.PI / 2; tc.castShadow = tc.receiveShadow = true;
    this.group.add(tc);

    // tugboat drifting along the canal
    let tug;
    if (this.g.gTug) tug = normalise(this.tint(this.g.gTug.clone(), { TINT_Hull: '#b3261e', EMISSIVE_Windows: '#ffd48a' }, { intensity: 2 }), { length: 14 });
    else tug = makeTugboat();
    tug.position.set(0, WATER_Y, this.boss ? -48 : -44);
    this.group.add(tug);
    this.tug = { obj: tug, yaw: Math.PI / 2, z: tug.position.z };

    // ship (boss) or barge
    const hull = new THREE.MeshStandardMaterial({ color: this.boss ? '#1b2a4a' : '#4a3a30', roughness: 0.6, metalness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: '#8e2a22', roughness: 0.7 });
    if (this.boss) {
      const f = this.far;
      f.box(red, [72, 2.2, 12], [-6, WATER_Y - 1.4, -33.45]);
      f.box(hull, [72, 6.2, 12.2], [-6, WATER_Y + 0.8, -33.45]);
      f.box(m.white, [72.2, 0.4, 12.3], [-6, WATER_Y + 6.8, -33.45]);
      // bridge tower at the stern (+x)
      f.box(m.white, [8, 11, 11], [25, WATER_Y + 7, -33.45]);
      f.box(this.mats.warmWin, [8.1, 0.8, 11.1], [25, WATER_Y + 16.2, -33.45]);
      for (let i = 0; i < 3; i++) f.box(this.mats.warmWin, [8.1, 0.35, 11.1], [25, WATER_Y + 9 + i * 2.2, -33.45]);
      f.box(m.amberBody, [2, 4, 2], [27, WATER_Y + 18, -33.45]);
      // bow taper
      f.box(hull, [6, 6.2, 8.5], [-44.5, WATER_Y + 0.8, -33.45]);
      const nm = this.track(signTexture([{ t: 'LEONIDA PRIDE', c: '#ffffff', s: 90 }], { w: 512, h: 128, bg: '#1b2a4a' }));
      const name = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({ map: nm, roughness: 0.7 }));
      name.position.set(-24, WATER_Y + 4, -33.45 + 6.12); this.group.add(name);
    } else {
      this.far.box(hull, [28, 2.8, 9], [5, WATER_Y - 1.0, -29]);
      this.far.box(m.darkMetal, [28.2, 0.3, 9.2], [5, WATER_Y + 1.8, -29]);
    }
  }

  /** Seated forklift driver (simple static figure parented to the forklift; not a crowd NPC). */
  _driver(seat) {
    const g = new THREE.Group();
    const b = new Batcher();
    const vest = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 });
    const jeans = new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: '#b07850', roughness: 0.7 });
    const hat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.4 });
    b.box(jeans, [0.34, 0.16, 0.5], [0, 0.4, 0.1]);                 // thighs
    b.box(jeans, [0.3, 0.45, 0.14], [0, 0.0, 0.35]);                // shins
    b.add(vest, new THREE.CylinderGeometry(0.17, 0.19, 0.58, 8), [0, 0.8, -0.05]);
    b.add(vest, new THREE.CylinderGeometry(0.05, 0.045, 0.5, 6), [-0.22, 0.85, 0.12], [-1.0, 0, 0.1]);
    b.add(vest, new THREE.CylinderGeometry(0.05, 0.045, 0.5, 6), [0.22, 0.85, 0.12], [-1.0, 0, -0.1]);
    b.add(skin, new THREE.SphereGeometry(0.12, 10, 8), [0, 1.22, -0.03]);
    b.add(hat, new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.26, -0.03]);
    b.add(hat, new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12), [0, 1.27, 0.0]);
    b.flush(g, { name: 'driver' });
    g.position.copy(seat);
    return g;
  }

  // ================================================================== far bank + skyline
  _farBank() {
    const f = this.far, T = this.T;
    const wh = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.85, metalness: 0.2 });
    const roof = new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.9 });
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc977').multiplyScalar(1.6 * T.windows), fog: true });
    for (const [x, w] of [[-80, 34], [-38, 26], [30, 30], [72, 36]]) {
      f.box(wh, [w, 10, 14], [x, Y, FAR_Z - 20]);
      f.box(roof, [w + 0.6, 0.6, 14.6], [x, Y + 10, FAR_Z - 20]);
      for (let i = 0; i < Math.floor(w / 5); i++) f.box(winMat, [2.2, 0.8, 0.1], [x - w / 2 + 2.5 + i * 5, Y + 7.5, FAR_Z - 12.95]);
      f.box(roof, [5, 5, 0.1], [x - w / 4, Y, FAR_Z - 12.9]);
    }
    // neon sign on the far warehouse (steady)
    const sign = this.track(signTexture([{ t: 'RUSTWATER FREIGHT CO.', c: '#ffb347', s: 60 }], { w: 512, h: 96, bg: '#0a0a0e' }));
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(18, 3.4), new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(1, 1, 1).multiplyScalar(T.lampsOn ? 1.8 : 0.9), fog: true }));
    sm.position.set(-38, Y + 12.4, FAR_Z - 12.9); this.group.add(sm);
    const vsign = this.track(signTexture([{ t: 'VICE CITY', c: '#29e3d6', s: 72 }], { w: 512, h: 96, bg: '#0a0a0e' }));
    const vm = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: vsign, color: new THREE.Color(1, 1, 1).multiplyScalar(T.lampsOn ? 1.8 : 0.9), fog: true }));
    vm.position.set(30, Y + 12.4, FAR_Z - 12.9); this.group.add(vm);
    // far cranes (baked silhouettes)
    const fc = makeCrane({ color: '#8a2c22' });
    bake(f, fc, [-58, Y, FAR_Z - 10], Math.PI, 0.9);
    bake(f, fc, [52, Y, FAR_Z - 10], Math.PI, 0.9);
    // skyline across the water and around
    buildSkyline(this.group, {
      seed: 64, y0: Y, lit: T.windows, track: (x) => this.track(x),
      areas: [
        { count: this.low ? 30 : 55, x: [-180, 180], z: [-170, -100], h: [14, 85] },
        { count: this.low ? 10 : 22, x: [-160, -70], z: [-90, 80], h: [8, 40] },
        { count: this.low ? 10 : 22, x: [70, 160], z: [-90, 80], h: [8, 40] },
        { count: this.low ? 8 : 18, x: [-120, 120], z: [70, 140], h: [8, 45] },
      ],
    });
  }

  // ================================================================== birds (seagulls circling over the water)
  _birds() {
    if (this.T === TIMES.night) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, -0.6, 0.12, -0.1, 0, 0, -0.15, 0, 0, 0.15, 0.6, 0.12, -0.1, 0, 0, -0.15], 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: this.T === TIMES.day ? '#f2f2f2' : '#1c1f28', side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < 5; i++) {
      const bird = new THREE.Mesh(geo, mat);
      bird.scale.setScalar(1.3);
      this.group.add(bird);
      this.anim.birds.push({ m: bird, r: 14 + i * 5, h: 16 + i * 2.5, sp: 0.12 + i * 0.015, ph: i * 1.7, cx: -6 + i * 3, cz: -40 });
    }
  }

  // ================================================================== smoke/steam (sprite pool, stateless)
  _smoke() {
    const tex = smokeTexture();
    tex.userData.shared = true;
    const add = (n, base, drift, rise, size, color, op, rate) => {
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, fog: true }));
        this.group.add(s);
        this.anim.smoke.push({ s, base, drift, rise, size, op, rate, off: i / n, follow: null });
      }
    };
    add(this.low ? 3 : 6, this.firePos.clone().setY(this.firePos.y + 0.3), [0.4, 0.2], 3.2, 1.4, '#5a5048', 0.35, 0.09);
    const tugBase = new THREE.Vector3();
    const n0 = this.anim.smoke.length;
    add(this.low ? 3 : 5, tugBase, [-1.2, 0.3], 5, 2.4, '#8b8f96', 0.3, 0.07);
    for (let i = n0; i < this.anim.smoke.length; i++) this.anim.smoke[i].follow = 'tug';
  }

  // ================================================================== lights
  _lights() {
    const T = this.T;
    // sodium lamps near the board (warm pools on wet ground)
    const sod = new THREE.Color('#ffa24a');
    this.lamps = [];
    if (T.lamp > 0) {
      for (const [x, y, z] of [[8.8, 10, -9.5], [-9.5, 10, 10.5]]) {
        const l = new THREE.PointLight(sod, 55 * T.lamp, 34, 1.6);
        l.position.set(x, Y + y, z);
        this.group.add(l); this.lamps.push(l);
      }
    }
    // hangout: fire (orange, gentle) + fluoro (cool)
    this.fireLight = new THREE.PointLight('#ff8a3a', 14 * T.fire, 11, 1.8);
    this.fireLight.position.copy(this.firePos);
    this.group.add(this.fireLight);
    this.fireBase = 14 * T.fire;
    const fl = new THREE.PointLight('#c8f4ff', 9, 9, 1.8);
    fl.position.set(-12.3, Y + 2.3, -6.8);
    this.group.add(fl);

    // additive light pools on the ground under masts / lamps / fire
    const pools = new Batcher();
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: sod.clone().multiplyScalar(0.55 * T.lampPools), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    poolMat.map.userData.shared = true;
    const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
    for (const [x, z] of this.mastPos) pools.add(poolMat, poolGeo, [x * 0.85, Y + 0.02, z * 0.85], 0, [14, 1, 14]);
    const fireMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#ff7a2a').multiplyScalar(0.5 * T.fire), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    pools.add(fireMat, poolGeo, [-9.9, Y + 0.02, -8.0], 0, [5.5, 1, 5.5]);
    const cyanMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#9eeaff').multiplyScalar(0.28), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    pools.add(cyanMat, poolGeo, [-12.0, Y + 0.02, -6.8], 0, [4, 1, 5]);
    // teal canal glow spilling onto the quay edge
    const tealMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#2dffc4').multiplyScalar(0.12 * T.canal), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    for (let x = -40; x <= 40; x += 10) pools.add(tealMat, poolGeo, [x, Y + 0.02, QUAY_Z + 0.5], 0, [14, 1, 4]);
    poolGeo.dispose();
    pools.flush(this.group, { castShadow: false, receiveShadow: false, name: 'light_pools' });
    this.firePool = fireMat;
  }

  // ================================================================== people
  _people() {
    const c = this.crowd;
    if (!c) return;
    const hat = (list, color = '#ffd23f') => { for (const n of list || []) this._hardHat(n, color); return list; };
    const vest = () => ({ top: HIVIS[Math.floor(this.r() * HIVIS.length)] });
    const bx = this.bet.x, bz = this.bet.z;
    this._walkers(c, vest);
    // betting crew round the spool (right long side)
    c.spawn([
      { at: [bx - 0.95, bz - 0.9], face: [bx, bz], anim: 'point', look: 'dock', colors: { top: '#3d8bff' } },
      { at: [bx + 0.9, bz - 0.8], face: [bx, bz], anim: 'talk', look: 'street', prop: 'phone' },
      { at: [bx + 1.05, bz + 0.6], face: [bx, bz], anim: 'cheer', look: 'dock', colors: { top: '#ffb347' } },
      { at: [bx - 1.25, bz + 0.7], face: 'board', anim: 'clap', look: 'street' },
      { at: [bx - 0.2, bz + 1.35], face: [bx, bz], anim: 'drink', look: 'dock', prop: 'drink' },
      { at: [bx + 0.3, bz - 1.5], face: 'board', anim: 'phone', look: 'street', prop: 'phone' },
    ]);
    // dockworkers watching from the left long side (hi-vis + hard hats)
    hat(c.spawn([
      { at: [-6.6, -2.4], face: 'board', anim: 'idle', look: 'dock', colors: vest() },
      { at: [-7.1, -1.2], face: 'board', anim: 'drink', look: 'dock', colors: vest(), prop: 'drink' },
      { at: [-6.8, 1.4], face: 'board', anim: 'point', look: 'dock', colors: vest() },
      { at: [-7.6, 2.4], face: [-6.8, 1.4], anim: 'talk', look: 'dock', colors: vest() },
      { at: [-7.8, -3.6], face: 'board', anim: 'phone', look: 'dock', colors: vest(), prop: 'phone' },
    ]));
    // hangout crew
    const wx = -14.2 + 1.235 + 0.5;
    c.spawn([
      { at: [wx + 0.05, -7.4], face: Math.PI / 2, anim: 'sit', look: 'street', react: true },
      { at: [wx + 0.05, -6.2], face: Math.PI / 2, anim: 'sit', look: 'club', prop: 'drink' },
      { at: [-10.1, -10.4], face: 0.35, anim: 'sit', look: 'street' },
      { at: [-9.1, -7.3], face: [-9.7, -8.0], anim: 'talk', look: 'street' },
      { at: [-10.4, -8.7], face: [-9.7, -8.0], anim: 'idle', look: 'dock', colors: { top: '#ff7a1a' } },
      { at: [-12.3, -10.9], face: Math.PI * 0.1, anim: 'lean', look: 'club' },
      { at: [-11.6, -9.8], face: [-12.9, -10.7], anim: 'dance', look: 'club' },
    ]);
    // crew by the crane leg + guard at the gate
    hat(c.spawn([
      { at: [-18.6, -11.2], face: [-17.4, -12.3], anim: 'talk', look: 'dock', colors: vest() },
      { at: [-17.2, -12.6], face: [-18.6, -11.2], anim: 'phone', look: 'dock', colors: vest(), prop: 'phone' },
      { at: [14.6, -12.2], face: 'board', anim: 'idle', look: 'dock', colors: vest() },
    ]));
    c.spawn([{ at: [11.0, 12.9], face: [0, 0], anim: 'phone', look: 'suit', colors: { top: '#1b2a4a' }, prop: 'phone' }]);
    if (this.boss) {
      // Local 64 boss + bodyguards + extra crew
      c.spawn([
        { at: [7.2, -3.9], face: 'board', anim: 'point', look: 'suit', colors: { top: GANG.amber, bottom: '#1b1b1f' }, scale: 1.08 },
        { at: [7.9, -4.8], face: 'board', anim: 'idle', look: 'suit' },
        { at: [6.7, -4.9], face: 'board', anim: 'idle', look: 'suit' },
      ]);
      hat(c.spawn([
        { at: [9.4, 5.2], face: 'board', anim: 'cheer', look: 'dock', colors: { top: GANG.blue } },
        { at: [10.1, 4.4], face: 'board', anim: 'clap', look: 'dock', colors: { top: GANG.blue } },
        { at: [-8.6, 4.4], face: 'board', anim: 'cheer', look: 'dock', colors: { top: GANG.amber } },
        { at: [-9.2, 3.2], face: 'board', anim: 'drink', look: 'dock', colors: { top: GANG.amber }, prop: 'drink' },
      ]), '#ffffff');
    }
  }

  /**
   * Walkers circulating around the board (spec Changes: "people WALKING AROUND THE BOARD"). The ring stays outside
   * Z0/Z1 and the camera corridors: down the left side between the dockworkers and the truck (x≈−8.6), across the
   * +Z yard in front of the container rows (z≈16.3), down the right side between the betting crew and the forklift
   * lane (x≈9.4), and back along the quay side (z≈−16.4).
   */
  _walkers(c, vest) {
    const ring = [[-6.6, -15.6], [-6.7, -9.2], [-8.5, -5.2], [-8.6, 4.6], [-8.2, 16.2], [0, 16.35], [6.9, 16.3], [9.4, 13.0],
      [9.4, 5.0], [9.5, -4.0], [9.4, -13.0], [7.2, -16.4], [0, -16.45]];
    const from = (k, rev = false) => { const p = rev ? [...ring].reverse() : ring; return [...p.slice(k), ...p.slice(0, k)]; };
    const hatted = [];
    // 4 on the ring (3 clockwise-ish, 1 the other way) — spawned first so 'low' quality keeps them
    hatted.push(...c.spawn([
      { path: from(0), anim: 'walk', look: 'dock', speed: 1.15, colors: vest() },
      { path: from(5), anim: 'walk', look: 'street', speed: 1.3, prop: 'phone' },
      { path: from(9), anim: 'walk', look: 'dock', speed: 1.05, colors: vest() },
      { path: from(3, true), anim: 'walk', look: 'club', speed: 1.25 },
    ]));
    if (this.low) return;
    c.spawn([
      // quay stroll (behind the crane landside legs, in front of the bollards)
      { path: [[-34, -18.4], [30, -18.4], [30, -18.7], [-34, -18.7]], anim: 'walk', look: 'dock', speed: 1.1, colors: vest() },
      { path: [[26, -18.1], [-30, -18.1], [-30, -18.9], [26, -18.9]], anim: 'walk', look: 'street', speed: 1.3 },
      // drifting in and out of the hangout corner
      { path: [[-8.2, -9.9], [-6.8, -12.2], [-7.0, -16.1], [-15.0, -16.3], [-7.0, -16.1], [-6.8, -12.2]], anim: 'walk', look: 'club', speed: 1.0 },
      // between the container stacks (left and right)
      { path: [[-20.4, -9], [-20.4, 8], [-20.6, 20], [-20.4, 8]], anim: 'walk', look: 'dock', speed: 1.2, colors: vest() },
      { path: [[21.4, -8], [21.4, 6], [21.3, 18], [21.4, 6]], anim: 'walk', look: 'dock', speed: 1.1, colors: vest() },
      // across the far side of the +Z yard
      { path: [[28, 16.1], [-28, 16.1], [-28, 16.0], [28, 16.0]], anim: 'walk', look: 'street', speed: 1.2, prop: 'phone' },
    ]);
  }

  /** Hard hat on procedural stand-ins (rigged dock_worker GLBs bring their own). */
  _hardHat(npc, color = '#ffd23f') {
    if (!npc || !npc.head || !npc.head.isMesh) return;
    if (!this._hatGeo) {
      const dome = new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const brim = new THREE.CylinderGeometry(0.19, 0.19, 0.02, 12);
      this._hatGeo = { dome: this.track(dome), brim: this.track(brim), mats: new Map() };
    }
    let mat = this._hatGeo.mats.get(color);
    if (!mat) { mat = this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.4 })); this._hatGeo.mats.set(color, mat); }
    const d = new THREE.Mesh(this._hatGeo.dome, mat); d.position.set(0, 1.68, 0);
    const b = new THREE.Mesh(this._hatGeo.brim, mat); b.position.set(0, 1.69, 0.03);
    npc.head.add(d, b);
  }

  // ================================================================== per-frame
  update(dt, t) {
    const rm = this.reducedMotion ? 0.35 : 1;
    const tt = t * rm;
    this._lastT = t;
    const a = this.anim;
    // soft event boost (eases, never flashes)
    a.boost += ((a.boostT > t ? 1 : 0) - a.boost) * Math.min(1, dt * 0.9);

    // canal ripples
    if (this.water) {
      const w = this.water;
      w.c1.offset.set(tt * 0.004, tt * 0.011);
      w.c2.offset.set(-tt * 0.006, tt * 0.004);
      const breathe = this.reducedMotion ? 0 : (this.pulse(t, 7) - 0.5) * 0.18;
      w.mat.emissiveIntensity = w.base * (1 + breathe + a.boost * 0.3);
    }
    // cranes
    for (const c of a.cranes) this._crane(c, tt);
    // forklift
    const f = this.forklift;
    if (f) {
      const u = ((tt * 1.5) / f.len) % 1;
      f.curve.getPointAt(u, f.p); f.curve.getTangentAt(u, f.tan);
      f.obj.position.copy(f.p);
      f.obj.rotation.y = Math.atan2(f.tan.x, f.tan.z);
      if (f.forks) {
        const lift = 0.5 - 0.5 * Math.cos((tt / 14) * Math.PI * 2);
        if (f.glb && f.forks.userData.base) f.forks.position.y = f.forks.userData.base.y + lift * 0.8;
        else f.forks.position.y = 0.12 + lift * 0.8;
      }
    }
    // tug: slow back-and-forth along the canal, turning smoothly at the ends
    if (this.tug) {
      const g = this.tug;
      const ph = (tt / 260) * Math.PI * 2;
      g.obj.position.x = Math.sin(ph) * 70;
      g.obj.position.y = WATER_Y + Math.sin(tt * 0.7) * 0.06;
      const target = Math.cos(ph) >= 0 ? Math.PI / 2 : -Math.PI / 2;
      let d = target - g.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.yaw += d * Math.min(1, dt * 0.25);
      g.obj.rotation.y = g.yaw;
      g.obj.rotation.z = Math.sin(tt * 0.5) * 0.02;
    }
    // fire (gentle glow variation, no flicker)
    if (this.fireLight) {
      const k = this.reducedMotion ? 0 : Math.sin(t * 1.9) * 0.07 + Math.sin(t * 3.1 + 1.3) * 0.04;
      this.fireLight.intensity = this.fireBase * (1 + k + a.boost * 0.3);
      for (let i = 0; i < a.flames.length; i++) {
        const fl = a.flames[i];
        if (fl.isSprite) continue;
        const s = 1 + (this.reducedMotion ? 0 : Math.sin(t * 2.3 + i * 2.1) * 0.07) + a.boost * 0.15;
        fl.scale.set(1, s, 1);
        fl.rotation.y = (i / 3) * Math.PI + tt * 0.25;
      }
    }
    // smoke / steam
    for (const p of a.smoke) {
      const age = (tt * p.rate + p.off) % 1;
      let bx = p.base.x, by = p.base.y, bz = p.base.z;
      if (p.follow === 'tug' && this.tug) {
        const o = this.tug.obj;
        const sy = Math.sin(o.rotation.y), cy = Math.cos(o.rotation.y);
        bx = o.position.x - 2.2 * sy; by = o.position.y + 4.6; bz = o.position.z - 2.2 * cy;
      }
      p.s.position.set(bx + p.drift[0] * age * 3, by + age * p.rise, bz + p.drift[1] * age * 3);
      const sc = p.size * (0.5 + age);
      p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = Math.sin(age * Math.PI) * p.op;
    }
    // seagulls
    for (const b of a.birds) {
      const ang = tt * b.sp + b.ph;
      b.m.position.set(b.cx + Math.cos(ang) * b.r, b.h + Math.sin(tt * 0.3 + b.ph) * 1.2, b.cz + Math.sin(ang) * b.r);
      b.m.rotation.y = -ang;
      b.m.scale.y = 1.3 * (0.6 + 0.4 * Math.sin(tt * 4 + b.ph));
    }
  }

  _crane(c, t) {
    // 44 s cycle: travel to land, lower, raise, travel to sea, lower, raise
    const P = 44, k = ((t + c.phase) % P + P) % P;
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
    let zk, dk; // zk 0=sea 1=land ; dk 0=raised 1=lowered
    if (k < 12) { zk = ease(k / 12); dk = 0; }
    else if (k < 17) { zk = 1; dk = ease((k - 12) / 5); }
    else if (k < 19) { zk = 1; dk = 1; }
    else if (k < 24) { zk = 1; dk = 1 - ease((k - 19) / 5); }
    else if (k < 36) { zk = 1 - ease((k - 24) / 12); dk = 0; }
    else if (k < 40) { zk = 0; dk = ease((k - 36) / 4) * 0.55; }
    else { zk = 0; dk = 0.55 * (1 - ease((k - 40) / 4)); }
    if (c.glbMode) {
      if (c.trolley?.userData.base) {
        const base = c.trolley.userData.base;
        const off = (zk - 0.5) * c.extent * 0.45 * -c.sign;
        c.trolley.position.copy(base);
        c.trolley.position[c.axis] += off;
      }
      if (c.spreader?.userData.base) c.spreader.position.y = c.spreader.userData.base.y - dk * 8;
      return;
    }
    c.trolley.position.z = -18 + zk * 20;
    const drop = 4 + dk * (zk > 0.5 ? 15.5 : 12);
    c.spreader.position.y = -drop;
    if (c.cables) for (const cb of c.cables.children) cb.scale.y = Math.max(0.1, drop - 0.3);
  }

  react(event, data = {}) {
    const t = this._lastT ?? 0;
    if (event === 'capture') this.anim.boostT = Math.max(this.anim.boostT, t + 2.5);
    if (event === 'finale') this.anim.boostT = Infinity;
    if (event === 'start') this.anim.boostT = 0;
    void data;
  }
}
