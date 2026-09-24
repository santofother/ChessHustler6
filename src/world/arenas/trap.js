// The Trap (bonus / puzzles): an indoor hangout in the spirit of docs/ref_hangout.png. Concrete + brick walls
// covered in graffiti, steady fluorescent tubes (no flicker), couches with people sitting / leaning / talking, a
// notice board, arcade cabinets, a pool table, a fridge, speakers, rugs, warm lamps and a window onto the night city.
// Room 28 × 28 m, ceiling 7.5 m. Walls are single-sided planes facing inward, so if the camera ever orbits past a
// wall it simply disappears instead of blocking the board. Nothing is hung above the board (top view stays clear).
// Variant: time → the city seen through the windows (day / dusk / night), boss → a few extra guys. Default calm.
import * as THREE from 'three';
import { Arena, STREET_Y } from './Arena.js';
import { rng, canvasTexture, glowTexture } from '../util.js';
import { Batcher } from './docks/batch.js';
import { graffitiTexture, wallTexture, posterTexture, signTexture, decalMaterial } from './docks/graffiti.js';
import { bake, normalise, windowTextures } from './docks/scenery.js';
import { glowSprite } from './docks/props.js';
import { makeCouch, makeArmchair, makeFluoro, makeArcade, makePoolTable } from './trap/furniture.js';

const Y = STREET_Y;
const H = 14;          // half room size
const CEIL = 7.5;      // ceiling height above the floor

const WINDOW_SKY = {
  day: ['#8fc3e8', '#d9ecf5', 0.2],
  dusk: ['#1b2f5a', '#ff8a45', 0.8],
  night: ['#050914', '#1a2440', 1.2],
};

export default class TrapArena extends Arena {
  async build() {
    const v = this.variant || {};
    this.boss = !!v.boss;
    this.low = this.ctx.quality === 'low';
    this.win = WINDOW_SKY[v.time] || WINDOW_SKY.night;
    this.r = rng(1337);
    this.anim = { lamps: [], screens: [] };

    const P = 'models/arenas/trap/';
    const [gCouch, gArm, gFluoro, gArcade, gPool, gSpeaker, gCooler] = await Promise.all([
      this.glb(P + 'couch.glb'), this.glb(P + 'armchair.glb'), this.glb(P + 'fluoro_light.glb'),
      this.glb(P + 'arcade_cabinet.glb'), this.glb(P + 'pool_table.glb'),
      this.glb('models/props/speaker_stack.glb'), this.glb('models/props/cooler.glb'),
    ]);
    this.g = { gCouch, gArm, gFluoro, gArcade, gPool, gSpeaker, gCooler };

    // sky only feeds the env map (reflections); it is hidden behind the walls
    this.addSky({ zenith: '#0e0d12', top: '#16141a', mid: '#2a2622', horizon: '#3a3029', bottom: '#1a1512', stars: 0 });
    this.addHemi(0xa9c4d6, 0x4a3024, 0.75);
    // "fluorescent" key light from above (single shadow caster)
    this.addSun({ color: 0xe8f6ff, intensity: 1.55, dir: [0.25, 1, 0.4] });

    this.b = new Batcher();
    this._room();
    this._decor();
    this._furniture();
    this._lights();
    this.b.flush(this.group, { name: 'trap_static' });

    this.buildEnvMap([
      { color: '#e8fbff', pos: [0, 8, 0], size: [20, 2], mult: 2.5 },
      { color: '#ffb066', pos: [-12, 2, 0], size: [3, 3], mult: 2 },
      { color: '#ff3ea5', pos: [0, 4, 13], size: [6, 1.5], mult: 2 },
    ]);
    this.mood = {
      background: '#0d0b0e',
      fog: { color: '#141016', near: 26, far: 70 },
      exposure: 1.02,
      bloom: { strength: 0.5, radius: 0.45, threshold: 0.9 },
      envIntensity: 0.45,
    };
    this.boardStyle = {
      frame: '#3b2a20', frameText: '#f1e3c8',
      plinth: '#4a3528', plinthMap: 'wood',
      kerb: 'none', kerbColors: ['#f1e3c8', '#3b2a20'],
      neon: ['#9ee6ff', '#ff7a3d'], neonIntensity: 1.3,
    };
    this._people();
  }

  // ================================================================== shell
  _room() {
    const tr = (x) => this.track(x);
    // terracotta tile floor (like the reference) with grime
    const r = rng(5);
    const floorTex = tr(canvasTexture(512, 512, (g, w, h) => {
      const n = 8, s = w / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const k = 0.85 + r() * 0.25;
        g.fillStyle = `rgb(${Math.round(128 * k)},${Math.round(62 * k)},${Math.round(46 * k)})`;
        g.fillRect(x * s, y * s, s, s);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,20,15' : '200,140,110'},0.15)`; g.fillRect(x * s + r() * s, y * s + r() * s, 2, 2); }
      }
      g.fillStyle = 'rgba(40,28,24,0.9)';
      for (let i = 0; i <= n; i++) { g.fillRect(i * s - 1.5, 0, 3, h); g.fillRect(0, i * s - 1.5, w, 3); }
      for (let i = 0; i < 18; i++) {
        const x = r() * w, y = r() * h, rad = 20 + r() * 60;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(20,12,8,0.35)'); grd.addColorStop(1, 'rgba(20,12,8,0)');
        g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }, { repeat: [1, 1] }));
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    const fg = new THREE.PlaneGeometry(H * 2, H * 2); fg.rotateX(-Math.PI / 2);
    const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 7);
    const floor = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.9 }));
    floor.position.y = Y; floor.receiveShadow = true; floor.name = 'trap_floor';
    this.group.add(floor);

    // walls: concrete (back/front) + brick (sides), single-sided, facing inward
    const concrete = tr(wallTexture(3, { base: '#7d766c' }));
    const brick = tr(wallTexture(8, { base: '#6e5446', brick: true }));
    concrete.wrapS = concrete.wrapT = brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
    const mkWall = (tex, rep) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.FrontSide, color: '#d8d2c8' });
    const wc = mkWall(concrete), wb = mkWall(brick);
    wc.color.set('#f2ece2');
    const wall = (mat, x, z, yaw) => {
      const g = new THREE.PlaneGeometry(H * 2, CEIL);
      const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 4.5, u.getY(i) * 1.25);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, Y + CEIL / 2, z); m.rotation.y = yaw; m.receiveShadow = true; m.name = 'trap_wall';
      this.group.add(m);
    };
    wall(wc, 0, -H, 0); wall(wc, 0, H, Math.PI); wall(wb, -H, 0, Math.PI / 2); wall(wb, H, 0, -Math.PI / 2);
    // ceiling (faces down; invisible from the top camera above it)
    const cg = new THREE.PlaneGeometry(H * 2, H * 2); cg.rotateX(Math.PI / 2);
    const ceil = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 1 }));
    ceil.position.y = Y + CEIL; this.group.add(ceil);

    const b = this.b;
    const base = new THREE.MeshStandardMaterial({ color: '#2b2522', roughness: 0.8 });
    const pipe = new THREE.MeshStandardMaterial({ color: '#8a8f94', roughness: 0.4, metalness: 0.7 });
    const redPipe = new THREE.MeshStandardMaterial({ color: '#9b2a22', roughness: 0.5, metalness: 0.4 });
    for (const [x, z, w, d] of [[0, -H + 0.05, H * 2, 0.1], [0, H - 0.05, H * 2, 0.1], [-H + 0.05, 0, 0.1, H * 2], [H - 0.05, 0, 0.1, H * 2]]) {
      b.box(base, [w, 0.14, d], [x, Y, z]);
    }
    // pipes along the upper walls
    const pg = new THREE.CylinderGeometry(0.08, 0.08, H * 2, 8);
    const pgx = pg.clone().rotateZ(Math.PI / 2), pgz = pg.clone().rotateX(Math.PI / 2);
    b.add(pipe, pgx, [0, Y + 6.2, -H + 0.25]); b.add(redPipe, pgx, [0, Y + 6.5, -H + 0.25]);
    b.add(pipe, pgx, [0, Y + 6.2, H - 0.25]);
    b.add(pipe, pgz, [-H + 0.25, Y + 6.3, 0]); b.add(redPipe, pgz, [H - 0.25, Y + 6.5, 0]);
    pg.dispose(); pgx.dispose(); pgz.dispose();
    // recessed ceiling downlights (like the reference), not above the board
    const dl = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4e0').multiplyScalar(3) });
    const disc = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12);
    for (const x of [-10.5, -6.5, 6.5, 10.5]) for (const z of [-10.5, -3.5, 3.5, 10.5]) b.add(dl, disc, [x, Y + CEIL - 0.02, z]);
    disc.dispose();

    // big rug under the board area (visible in the apron)
    const rugTex = tr(canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#5a1822'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9a441'; g.lineWidth = 18; g.strokeRect(14, 14, w - 28, h - 28);
      g.strokeStyle = '#1f3a5b'; g.lineWidth = 12; g.strokeRect(44, 44, w - 88, h - 88);
      g.strokeStyle = '#d9a441'; g.lineWidth = 4; g.strokeRect(64, 64, w - 128, h - 128);
      g.fillStyle = '#d9a441';
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.save(); g.translate(w / 2 + Math.cos(a) * 200, h / 2 + Math.sin(a) * 200); g.rotate(a); g.fillRect(-10, -10, 20, 20); g.restore(); }
      const rr = rng(9);
      for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(rr() * w, rr() * h, 2, 2); }
    }));
    const rg = new THREE.PlaneGeometry(14.4, 14.4); rg.rotateX(-Math.PI / 2);
    const rug = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    rug.position.y = Y + 0.005; rug.receiveShadow = true; this.group.add(rug);
  }

  // ================================================================== graffiti, posters, window, signs
  _decor() {
    const tr = (x) => this.track(x);
    const decal = (tex, w, h, x, y, z, yaw, opts) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMaterial(tex, opts));
      m.position.set(x, Y + y, z); m.rotation.y = yaw; this.group.add(m); return m;
    };
    const B = -H + 0.03, F = H - 0.03, L = -H + 0.03, R = H - 0.03;
    // back wall (seen behind the board from the white camera)
    decal(tr(graffitiTexture(101, { words: ['THE TRAP', 'ZERO QS', 'VI'] })), 7.5, 3.4, -8.5, 4.9, B, 0);
    decal(tr(graffitiTexture(102, { words: ['CHECK', 'KING ME'], tags: 2 })), 4.6, 2.2, 0.8, 2.3, B, 0);
    decal(tr(graffitiTexture(111, { words: ['VICE', 'L64'], tags: 2 })), 3.4, 1.7, -6.2, 1.9, B, 0);
    decal(tr(graffitiTexture(112, { words: ['GAMBIT'], tags: 1 })), 3.6, 1.7, -12.0, 1.4, B, 0, { opacity: 0.85 });
    decal(tr(graffitiTexture(103, { words: ['HUSTLE', 'L64'] })), 5.5, 2.6, 8.5, 4.5, B, 0);
    decal(tr(graffitiTexture(104, { words: ['ROOK IT'], tags: 1, extras: false })), 3.4, 1.6, 8.0, 3.0, B, 0, { opacity: 0.9 });
    // left wall (brick)
    decal(tr(graffitiTexture(105, { words: ['GAMBIT', 'MATE', 'RWD'] })), 8, 3.6, L, 3.4, -5, Math.PI / 2);
    decal(tr(graffitiTexture(106, { words: ['PAWN STARS', 'VICE'] })), 6, 2.8, L, 3.0, 7.5, Math.PI / 2);
    // right wall
    decal(tr(graffitiTexture(107, { words: ['NO REFUNDS', 'CASH ONLY'] })), 7, 3.2, R, 3.5, 6.5, -Math.PI / 2);
    decal(tr(graffitiTexture(108, { words: ['BISHOP', 'MATE'], tags: 2 })), 5.5, 2.5, R, 4.6, -7.5, -Math.PI / 2);
    // front wall (seen from the black camera)
    decal(tr(graffitiTexture(109, { words: ['LEONIDA', 'DOCKBOYZ', 'VI'] })), 8, 3.6, -7.5, 3.3, F, Math.PI);
    decal(tr(graffitiTexture(110, { words: ['CHECKMATE'], tags: 3 })), 6.5, 3, 8, 3.8, F, Math.PI);

    const b = this.b;
    const frame = new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: '#3c4148', roughness: 0.5, metalness: 0.6 });
    // notice board with posters (back wall)
    const nb = decal(tr(posterTexture(5)), 3.0, 1.9, 5.0, 1.75, B + 0.04, 0, { opacity: 1 });
    nb.material.transparent = false; nb.material.depthWrite = true;
    b.box(frame, [3.2, 0.1, 0.12], [5.0, Y + 0.72, -H + 0.06]);
    // metal door + steady green EXIT sign
    b.box(metal, [1.3, 2.3, 0.08], [-3.2, Y, -H + 0.04]);
    b.box(frame, [1.5, 0.12, 0.12], [-3.2, Y + 2.3, -H + 0.06]);
    b.box(new THREE.MeshStandardMaterial({ color: '#aeb3b8', metalness: 0.8, roughness: 0.3 }), [0.25, 0.05, 0.08], [-2.75, Y + 1.05, -H + 0.1]);
    const exitTex = tr(signTexture([{ t: 'EXIT', c: '#b8ffcc', s: 90 }], { w: 256, h: 128, bg: '#0c6b2e' }));
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: exitTex, color: new THREE.Color(1.8, 1.8, 1.8) }));
    exit.position.set(-3.2, Y + 2.7, -H + 0.08); this.group.add(exit);
    // windows onto the city (back wall left + front wall right)
    this._window(-9.2, -H + 0.02, 0);
    this._window(9.5, H - 0.02, Math.PI);
    // "THE TRAP" neon (steady) on the front wall
    const neon = tr(canvasTexture(512, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = 'italic 900 84px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff3ea5'; g.shadowBlur = 24; g.strokeStyle = '#ffb0d8'; g.lineWidth = 6;
      g.strokeText('THE TRAP', w / 2, h / 2); g.shadowBlur = 8; g.strokeText('THE TRAP', w / 2, h / 2);
    }));
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: neon, transparent: true, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) }));
    ns.position.set(0, Y + 3.6, H - 0.06); ns.rotation.y = Math.PI; this.group.add(ns);
    // TV on a crate (screen slowly shifts colour; no flicker)
    b.box(new THREE.MeshStandardMaterial({ color: '#8d6a45', roughness: 0.9 }), [0.9, 0.55, 0.6], [-9.8, Y, -1.2], Math.PI / 2 + 0.3);
    b.box(new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.5 }), [0.8, 0.6, 0.55], [-9.8, Y + 0.55, -1.2], Math.PI / 2 + 0.3);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fb8ff').multiplyScalar(1.4) }));
    const yaw = -Math.PI / 2 + 0.3; // facing −x (toward the couch)
    scr.position.set(-9.8 + Math.sin(yaw) * 0.28, Y + 0.85, -1.2 + Math.cos(yaw) * 0.28); scr.rotation.y = yaw;
    this.group.add(scr); this.anim.screens.push(scr.material);
    // debris: cans + papers
    const r = this.r;
    const can = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8); can.rotateZ(Math.PI / 2);
    const canMats = ['#d62828', '#3d8bff', '#9dff3c', '#c0c0c0'].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.35 }));
    const paper = new THREE.PlaneGeometry(0.22, 0.3); paper.rotateX(-Math.PI / 2);
    const pm = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 40; i++) {
      let x = (r() - 0.5) * 2 * (H - 1), z = (r() - 0.5) * 2 * (H - 1);
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
      if (i % 2) b.add(canMats[i % 4], can, [x, Y + 0.035, z], r() * 6);
      else b.add(pm, paper, [x, Y + 0.012, z], r() * 6);
    }
    can.dispose(); paper.dispose();
  }

  _window(x, z, yaw) {
    const [skyA, skyB, lit] = this.win;
    const r = rng(Math.round(x * 10) + 99);
    const wt = windowTextures(r, ['#ffcf7a', '#ffe2a8', '#7ff5ff', '#ff8ac0'], 0.45);
    this.track(wt.map); this.track(wt.emissive);
    const view = this.track(canvasTexture(256, 160, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, skyA); grd.addColorStop(1, skyB);
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        const bw = 12 + r() * 26, bh = 30 + r() * 110, bx = r() * w;
        g.fillStyle = '#0d1018'; g.fillRect(bx, h - bh, bw, bh);
        for (let yy = h - bh + 4; yy < h - 4; yy += 7) for (let xx = bx + 3; xx < bx + bw - 3; xx += 6) {
          if (r() < 0.35) { g.fillStyle = ['#ffcf7a', '#ffe2a8', '#7ff5ff', '#ff8ac0'][Math.floor(r() * 4)]; g.globalAlpha = lit * 0.8; g.fillRect(xx, yy, 3, 3); g.globalAlpha = 1; }
        }
      }
    }));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.7), new THREE.MeshBasicMaterial({ map: view, color: new THREE.Color(1.15, 1.15, 1.15) }));
    m.position.set(x, Y + 2.1, z + Math.cos(yaw) * 0.02); m.rotation.y = yaw;
    this.group.add(m);
    // frame + bars
    const fm = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.5, metalness: 0.6 });
    const b = this.b, d = Math.cos(yaw) * 0.06;
    b.box(fm, [3.0, 0.12, 0.12], [x, Y + 1.19, z + d]); b.box(fm, [3.0, 0.12, 0.12], [x, Y + 2.95, z + d]);
    for (let i = 0; i <= 6; i++) b.box(fm, [0.05, 1.7, 0.05], [x - 1.4 + i * (2.8 / 6), Y + 1.25, z + d * 1.5]);
    wt.map.dispose(); wt.emissive.dispose();
  }

  // ================================================================== furniture
  _furniture() {
    const b = this.b, g = this.g;
    const couch = (color, x, z, yaw, width = 2.1, seats = 3) => {
      const c = g.gCouch && seats === 3 ? normalise(this.tint(g.gCouch.clone(), { TINT_Fabric: color })) : makeCouch({ color, width, seats });
      bake(b, c, [x, Y, z], yaw);
      return c.userData.seats || [-0.63, 0, 0.63];
    };
    const arm = (color, x, z, yaw) => bake(b, g.gArm ? normalise(this.tint(g.gArm.clone(), { TINT_Fabric: color })) : makeArmchair({ color }), [x, Y, z], yaw);
    // seats (people sit on these in _people)
    this.seatsList = [];
    const addSeats = (xs, x, z, yaw) => xs.forEach((o) => this.seatsList.push([x + Math.cos(yaw) * o, z - Math.sin(yaw) * o, yaw]));
    addSeats(couch('#6b2f5a', -H + 0.55, -3.4, Math.PI / 2), -H + 0.55 + 0.1, -3.4, Math.PI / 2);
    addSeats(couch('#3b5f7a', -H + 0.55, 4.0, Math.PI / 2, 1.6, 2), -H + 0.55 + 0.1, 4.0, Math.PI / 2);
    arm('#2f6b5a', -12.2, -6.9, Math.PI / 2 - 0.5);
    addSeats(couch('#4a4f2a', 1.0, -H + 0.55, 0, 1.6, 2), 1.0, -H + 0.65, 0);
    addSeats(couch('#7a4a2a', 0, H - 0.55, Math.PI), 0, H - 0.65, Math.PI);
    arm('#5e2a6e', -3.4, H - 0.75, Math.PI + 0.3);
    arm('#2f4f6b', 3.4, H - 0.75, Math.PI - 0.3);
    this.armSeats = [[-12.2, -6.9, Math.PI / 2 - 0.5], [-3.4, H - 0.75, Math.PI + 0.3], [3.4, H - 0.75, Math.PI - 0.3]];
    // coffee tables (crates) + bottles
    const wood = new THREE.MeshStandardMaterial({ color: '#8d6a45', roughness: 0.9 });
    const glass = new THREE.MeshStandardMaterial({ color: '#2f7a3a', roughness: 0.15, metalness: 0.2 });
    for (const [x, z] of [[-11.9, -3.3], [0, 12.6]]) {
      b.box(wood, [1.0, 0.42, 0.6], [x, Y, z], z > 0 ? 0 : Math.PI / 2);
      for (let i = 0; i < 3; i++) b.cyl(glass, 0.035, 0.035, 0.26, [x - 0.2 + i * 0.18, Y + 0.42, z + (i % 2) * 0.1], 0, 6);
    }
    // arcade cabinets (back wall, right)
    const cols = [['#6a2cff', '#29e3d6'], ['#ff3ea5', '#ffd23f']];
    cols.forEach(([c, t], i) => {
      const x = 10.2 + i * 0.95;
      if (g.gArcade) bake(b, normalise(this.tint(g.gArcade.clone(), { TINT_Cabinet: c, EMISSIVE_Screen: '#29e3d6' }, { intensity: 2 })), [x, Y, -H + 0.5], 0);
      else { const a = makeArcade({ color: c, trim: t }); a.position.set(x, Y, -H + 0.5); this.group.add(a); }
    });
    const ag = glowSprite(0x8a5cff, 3, 0.25); ag.position.set(10.7, Y + 1.5, -H + 1.2); this.group.add(ag);
    // pool table (right side)
    const pool = g.gPool ? normalise(this.tint(g.gPool.clone(), { TINT_Felt: '#1f6f8b' })) : makePoolTable({ felt: '#1f6f8b' });
    if (g.gPool) bake(b, pool, [11.2, Y, 8.2], Math.PI / 2); else { pool.position.set(11.2, Y, 8.2); pool.rotation.y = Math.PI / 2; this.group.add(pool); }
    const cue = new THREE.MeshStandardMaterial({ color: '#d9b77a', roughness: 0.6 });
    b.beam(cue, [H - 0.3, Y + 0.05, 10.8], [H - 0.2, Y + 1.5, 11.0], 0.03);
    // pool light (hanging, steady warm)
    b.box(new THREE.MeshStandardMaterial({ color: '#1f5a3a', roughness: 0.5, metalness: 0.4 }), [0.6, 0.25, 1.6], [11.2, Y + 2.6, 8.2]);
    b.box(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a8').multiplyScalar(2.5) }), [0.5, 0.02, 1.5], [11.2, Y + 2.58, 8.2]);
    b.box(new THREE.MeshStandardMaterial({ color: '#333' }), [0.02, CEIL - 2.85, 0.02], [11.2, Y + 2.85, 8.2]);
    // kitchen corner: counter, fridge, microwave
    const counter = new THREE.MeshStandardMaterial({ color: '#c9c2b4', roughness: 0.6 });
    const cab = new THREE.MeshStandardMaterial({ color: '#4d6b73', roughness: 0.7 });
    b.box(cab, [0.7, 0.9, 5], [H - 0.4, Y, -3.4]);
    b.box(counter, [0.75, 0.05, 5.05], [H - 0.4, Y + 0.9, -3.4]);
    b.box(new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.4 }), [0.75, 1.85, 0.75], [H - 0.45, Y, -6.5]);
    b.box(new THREE.MeshStandardMaterial({ color: '#9a9ea4', metalness: 0.8, roughness: 0.3 }), [0.04, 0.5, 0.04], [H - 0.86, Y + 1.0, -6.2]);
    b.box(new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.4 }), [0.45, 0.3, 0.6], [H - 0.45, Y + 0.95, -2.2]);
    for (let i = 0; i < 5; i++) b.cyl(glass, 0.035, 0.035, 0.28, [H - 0.35, Y + 0.95, -4.8 + i * 0.2], 0, 6);
    // stickers on the fridge
    for (const [dy, dz, c] of [[1.2, -6.35, '#ff3ea5'], [1.45, -6.65, '#ffd23f'], [0.8, -6.5, '#29e3d6']]) {
      b.box(new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }), [0.01, 0.16, 0.16], [H - 0.83, Y + dy, dz]);
    }
    // bar table + stools
    const steel = new THREE.MeshStandardMaterial({ color: '#2c2f34', roughness: 0.4, metalness: 0.7 });
    b.cyl(steel, 0.05, 0.05, 1.05, [11.3, Y, 2.2], 0, 8); b.cyl(wood, 0.45, 0.45, 0.05, [11.3, Y + 1.05, 2.2], 0, 16);
    for (const dz of [-0.8, 0.8]) { b.cyl(steel, 0.03, 0.03, 0.7, [11.3, Y, 2.2 + dz], 0, 6); b.cyl(new THREE.MeshStandardMaterial({ color: '#b03a2e', roughness: 0.6 }), 0.2, 0.2, 0.06, [11.3, Y + 0.7, 2.2 + dz], 0, 12); }
    // speakers by the front couch
    for (const x of [-5.6, 5.6]) {
      if (g.gSpeaker) bake(b, normalise(this.tint(g.gSpeaker.clone(), { TINT_Cabinet: '#1a1a1e' }), { height: 1.6 }), [x, Y, H - 0.6], Math.PI);
      else {
        b.box(new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.8 }), [0.8, 1.5, 0.6], [x, Y, H - 0.6]);
        const cone = new THREE.CylinderGeometry(0.26, 0.26, 0.04, 16); cone.rotateX(Math.PI / 2);
        b.add(steel, cone, [x, Y + 0.45, H - 0.92]); b.add(steel, cone, [x, Y + 1.1, H - 0.92], 0, 0.6); cone.dispose();
      }
    }
    // cooler + mattress-y beanbags
    if (g.gCooler) bake(b, normalise(g.gCooler.clone(), { height: 0.45 }), [-10.6, Y, 5.5], 0.4);
    else { b.box(new THREE.MeshStandardMaterial({ color: '#3d8bff' }), [0.6, 0.38, 0.4], [-10.6, Y, 5.5], 0.4); b.box(new THREE.MeshStandardMaterial({ color: '#eee' }), [0.62, 0.08, 0.42], [-10.6, Y + 0.38, 5.5], 0.4); }
    const bean = new THREE.SphereGeometry(0.45, 12, 8); bean.scale(1, 0.55, 1); bean.translate(0, 0.25, 0);
    b.add(new THREE.MeshStandardMaterial({ color: '#ffb347', roughness: 0.9 }), bean, [-11.3, Y, 9.3]);
    b.add(new THREE.MeshStandardMaterial({ color: '#29a3a3', roughness: 0.9 }), bean, [-12.4, Y, 10.4]);
    bean.dispose();
    // side rugs
    const rugA = new THREE.MeshStandardMaterial({ color: '#1f3a5b', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
    const rugB = new THREE.MeshStandardMaterial({ color: '#6b4a1f', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
    const rp = new THREE.PlaneGeometry(1, 1); rp.rotateX(-Math.PI / 2);
    b.add(rugA, rp, [-11.8, Y + 0.004, -2.4], 0, [3.2, 1, 5.5]);
    b.add(rugB, rp, [0, Y + 0.004, 11.8], 0, [6.5, 1, 2.8]);
    rp.dispose();
    // fluorescent fixtures (steady), never above the board
    const fixPos = [];
    for (const x of [-9.5, 9.5]) for (const z of [-10, -3.5, 3, 9.5]) fixPos.push([x, z]);
    for (const x of [-3, 3]) for (const z of [-10.5, 10.5]) fixPos.push([x, z]);
    const proto = g.gFluoro ? normalise(g.gFluoro.clone()) : makeFluoro({ hang: 0.9 });
    if (g.gFluoro) {
      // GLB tubes: keep their emissive, add chains
      for (const [x, z] of fixPos) bake(b, proto, [x, Y + CEIL - 1.0, z], 0);
    } else for (const [x, z] of fixPos) bake(b, proto, [x, Y + CEIL - 1.0, z], 0);
    this.fixPos = fixPos;
    // floor lamps (warm accents)
    const pole = new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: 0.6, roughness: 0.4 });
    const shade = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc07a').multiplyScalar(1.6) });
    this.lampPos = [[-H + 0.6, -0.9], [-H + 0.6, 6.1], [7.4, H - 0.6]];
    for (const [x, z] of this.lampPos) {
      b.cyl(pole, 0.02, 0.02, 1.6, [x, Y, z], 0, 6);
      b.cyl(pole, 0.18, 0.2, 0.04, [x, Y, z], 0, 12);
      b.cyl(shade, 0.18, 0.28, 0.35, [x, Y + 1.55, z], 0, 12);
      const s = glowSprite(0xffb066, 1.8, 0.35); s.position.set(x, Y + 1.72, z); this.group.add(s);
    }
    // plant in the corner
    const leaf = new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 0.8 });
    b.cyl(new THREE.MeshStandardMaterial({ color: '#b35a3a', roughness: 0.8 }), 0.28, 0.22, 0.5, [-H + 0.7, Y, -H + 0.7], 0, 10);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.beam(leaf, [-H + 0.7, Y + 0.5, -H + 0.7], [-H + 0.7 + Math.cos(a) * 0.6, Y + 1.4 + (i % 3) * 0.2, -H + 0.7 + Math.sin(a) * 0.6], 0.14, 0.03);
    }
  }

  // ================================================================== lights
  _lights() {
    const cool = '#dff4ff';
    for (const [x, z] of [[-9.5, -1], [9.5, -1], [0, 10.5], [0, -10.5]]) {
      const l = new THREE.PointLight(cool, 16, 16, 1.4);
      l.position.set(x, Y + CEIL - 1.3, z); this.group.add(l);
    }
    for (const [x, z] of this.lampPos.slice(0, 2)) {
      const l = new THREE.PointLight('#ffae5c', 6, 7, 1.6);
      l.position.set(x + 0.4, Y + 1.7, z); this.group.add(l);
      this.anim.lamps.push(l);
    }
    // floor glow pools under the fixtures + lamps (cheap fake bounce)
    const pools = new Batcher();
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const cm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#bfe8ff').multiplyScalar(0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const wm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#ff9a4a').multiplyScalar(0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    cm.map.userData.shared = true;
    for (const [x, z] of this.lampPos) pools.add(wm, pg, [x + (x < 0 ? 0.8 : 0), Y + 0.01, z - (z > 0 && x > 0 ? 0.8 : 0)], 0, [3.2, 1, 3.2]);
    pg.dispose();
    pools.flush(this.group, { castShadow: false, receiveShadow: false, name: 'trap_pools' });
  }

  // ================================================================== people
  _people() {
    const c = this.crowd;
    if (!c) return;
    const S = this.seatsList;
    // walkers first (so 'low' quality keeps at least 4): ring around the board behind the cameras' backs
    const ring = [[-8.8, -11.6], [-8.8, 0], [-8.8, 11.6], [0, 11.6], [8.8, 11.6], [8.8, 0], [8.8, -11.6], [0, -11.6]];
    const from = (k, rev = false) => { const p = rev ? [...ring].reverse() : ring; return [...p.slice(k), ...p.slice(0, k)]; };
    c.spawn([
      { path: from(0), anim: 'walk', look: 'street', speed: 1.1 },
      { path: from(4), anim: 'walk', look: 'club', speed: 1.2, prop: 'phone' },
      { path: from(2, true), anim: 'walk', look: 'street', speed: 1.05 },
      { path: from(6, true), anim: 'walk', look: 'racer', speed: 1.25 },
    ]);
    if (!this.low) {
      c.spawn([
        // fridge run and the door arrival (ping-pong)
        { path: [[12.4, -8.2], [8.8, -7], [8.8, 3.5], [10.2, 4.2]], loop: false, anim: 'walk', look: 'street', speed: 1.0 },
        { path: [[-3.2, -13.3], [-3.2, -12.1], [-8.8, -11.5], [-8.8, -5], [-11.2, -5.3]], loop: false, anim: 'walk', look: 'club', speed: 1.1 },
      ]);
    }
    // couch sitters
    const sit = (i, look, extra = {}) => S[i] && ({ at: [S[i][0], S[i][1]], face: S[i][2], anim: 'sit', look, ...extra });
    c.spawn([
      sit(0, 'street'), sit(2, 'club', { prop: 'drink' }),
      sit(3, 'street', { prop: 'phone' }), sit(5, 'club'), sit(6, 'street'), sit(7, 'racer'),
      { at: [this.armSeats[0][0], this.armSeats[0][1]], face: this.armSeats[0][2], anim: 'sit', look: 'street' },
      sit(8, 'racer', { prop: 'phone' }), sit(9, 'street'),
    ].filter(Boolean));
    // watchers on the long sides of the board
    c.spawn([
      { at: [-6.6, -1.6], face: 'board', anim: 'point', look: 'street' },
      { at: [-7.0, 1.2], face: 'board', anim: 'talk', look: 'club' },
      { at: [6.7, -0.8], face: 'board', anim: 'idle', look: 'racer', prop: 'drink' },
      { at: [6.9, 2.1], face: [6.7, -0.8], anim: 'talk', look: 'street' },
    ]);
    // activities round the room
    c.spawn([
      { at: [10.6, -12.2], face: Math.PI, anim: 'idle', look: 'street' },                // arcade
      { at: [9.9, 6.7], face: [11.2, 8.2], anim: 'point', look: 'club' },                  // pool
      { at: [12.6, 10.2], face: [11.2, 8.2], anim: 'idle', look: 'street', prop: 'drink' },
      { at: [12.9, -4.6], face: -Math.PI / 2, anim: 'drink', look: 'street' },             // kitchen
      { at: [11.3, 1.2], face: [11.3, 2.2], anim: 'talk', look: 'club' },                  // bar table
      { at: [11.3, 3.2], face: [11.3, 2.2], anim: 'phone', look: 'street' },
      { at: [-6.6, 13.0], face: Math.PI, anim: 'dance', look: 'club' },                    // by the speaker
      { at: [-13.3, 8.3], face: Math.PI / 2, anim: 'lean', look: 'street' },               // leaning on the wall
      { at: [-8.6, -13.3], face: 0, anim: 'lean', look: 'racer' },                         // under the window
    ]);
    if (this.boss) c.cluster({ center: [-10.5, 9.8], count: 3, radius: 0.9, anims: ['talk', 'drink', 'idle'], look: 'suit' });
  }

  update(dt, t) {
    // TV screen: slow colour drift (≥ 6 s period, no flicker)
    for (const m of this.anim.screens) {
      const k = this.pulse(t, 9);
      m.color.setRGB(0.6 + 0.8 * k, 0.9, 1.6 - 0.6 * k);
    }
  }
}
