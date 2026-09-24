// Nocturno Tower Rooftop — the City Boss's final fight (worker F).
// Night, high above Vice City: the board sits on the gold "H" helipad of Nocturno Tower; glass railings, a parked
// black-and-gold helicopter (slow idle rotor), the boss's lounge (gold throne-sofa, loungers, fire bowls, bar, DJ),
// an antenna spire with a slow soft red beacon, giant steady-neon NOCTURNO signs, and the whole glittering skyline
// ~170 m below (one-draw-call window shader, neon crowns, bay bridge, highway light streams, drifting cloud wisps).
// No strobes: every pulse is slow, soft and goes flat with reduced motion.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Arena, STREET_Y } from './Arena.js';
import { Batch, G, M, canvasTex, glowTex, neonTextTex } from './tower/kit.js';
import { buildCity } from './tower/city.js';
import * as P from './tower/props.js';

const RX = 22, RZ = 17;               // roof half extents (the tower top)
const HELI = { x: -13, z: -11.2, yaw: Math.PI / 2 }; // nose toward +x
const ANTENNA = [-19.2, -14.6];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export default class TowerArena extends Arena {
  async build() {
    const boss = !!this.variant?.boss;
    this.boss = boss;
    const r = mulberry(4411);
    const Y = STREET_Y;
    this.anim = { rotors: [], fans: [], platters: [], flames: [], flags: [] };

    // GLBs in parallel (all optional — procedural fallbacks below)
    const [gHeli, gHvac, gAnt, gThrone, gLounge, gPot, gSpeaker, gPalm] = await Promise.all([
      this.glb('models/arenas/tower/helicopter.glb'),
      this.glb('models/arenas/tower/hvac_unit.glb'),
      this.glb('models/arenas/tower/antenna_mast.glb'),
      this.glb('models/arenas/tower/throne_sofa.glb'),
      this.glb('models/props/lounge_chair.glb'),
      this.glb('models/props/plant_pot.glb'),
      this.glb('models/props/speaker_stack.glb'),
      this.glb('models/palm.glb'),
    ]);
    this.usedGlbs = Object.entries({ helicopter: gHeli, hvac_unit: gHvac, antenna_mast: gAnt, throne_sofa: gThrone, lounge_chair: gLounge, plant_pot: gPot, speaker_stack: gSpeaker, palm: gPalm })
      .filter(([, v]) => !!v).map(([k]) => k);

    // ---------------------------------------------------------------- sky, mood, lights
    this.addSky({
      zenith: '#02041a', top: '#060d33', mid: '#121a52', horizon: '#2e2a68', bottom: '#15153e',
      sunDir: [-0.5, 0.3, -1], sunColor: '#c9d4ff', sunGlow: 0.32, stars: 0.75,
    });
    this.mood = {
      background: '#050920',
      fog: { color: '#1c1b4c', near: 80, far: 700 },
      exposure: 1.02,
      bloom: { strength: 0.72, radius: 0.5, threshold: 0.86 },
      envIntensity: 0.7,
    };
    this.boardStyle = {
      frame: '#11131c', frameText: '#f0c75a',
      plinth: '#161a26', plinthMap: 'marble',
      kerb: 'gold', kerbColors: ['#e8b923', '#11131c'],
      neon: ['#ffc24a', '#b8ff3c'], neonIntensity: 2.6,
    };
    this.addHemi(0x5f72c8, 0x2a1d2c, 1.05);
    // key light: the helipad floods (cool-white, from above/front) — the one shadow caster
    this.addSun({ color: 0xe6ecff, intensity: 2.6, dir: [0.3, 1, 0.5], shadow: true });
    // soft warm fills: fire lounge (-x) and the boss's gold lounge (+x, -z)
    this.fireLight = this.addLight(new THREE.PointLight(0xff9a4a, 14, 14, 2));
    this.fireLight.position.set(-10.5, 1.4, -0.5);
    const goldLight = this.addLight(new THREE.PointLight(0xffc870, 12, 13, 2));
    goldLight.position.set(10, 2.4, -8.5);
    // front rim so pieces read against the dark deck
    const rim = new THREE.DirectionalLight(0x8fa6ff, 0.7);
    rim.position.set(-6, 5, -12);
    this.addLight(rim);
    this.buildEnvMap([
      { color: '#ffc24a', pos: [0, 6, -40], size: [40, 6], mult: 3 },
      { color: '#3ff0ff', pos: [40, 3, 10], size: [30, 10], mult: 2 },
      { color: '#ff5fb0', pos: [-40, 3, 20], size: [30, 10], mult: 2 },
      { color: '#ffd9a0', pos: [0, 30, 0], size: [20, 20], mult: 1.5 },
    ]);

    // ---------------------------------------------------------------- city below
    this.city = buildCity(this, this.group, { quality: this.ctx.quality });

    // ---------------------------------------------------------------- roof deck + helipad paint
    const deckTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#1c2132'; g.fillRect(0, 0, w, h);
      const rr = mulberry(9);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const v = 26 + Math.floor(rr() * 8);
        g.fillStyle = `rgb(${v},${v + 4},${v + 18})`;
        g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      }
      for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(rr() * w, rr() * h, 2, 2); }
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
    }, { repeat: [(RX * 2) / 6, (RZ * 2) / 6] });
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.42, metalness: 0.25, envMapIntensity: 0.9 }));
    deck.rotation.x = -Math.PI / 2; deck.position.y = Y; deck.receiveShadow = true;
    deck.name = 'roof_deck';
    this.group.add(deck);

    const padTex = canvasTex(512, 512, (g, w, h) => {
      const S = w / 18; // px per metre (pad decal covers 18 × 18 m)
      const cx = w / 2, cy = h / 2;
      g.clearRect(0, 0, w, h);
      // dark pad square with a subtle sheen
      g.fillStyle = 'rgba(8,10,22,0.55)'; g.fillRect(0.4 * S, 0.4 * S, w - 0.8 * S, h - 0.8 * S);
      // dashed white edge
      g.strokeStyle = 'rgba(235,230,215,0.85)'; g.lineWidth = 0.18 * S; g.setLineDash([0.9 * S, 0.6 * S]);
      g.strokeRect(0.6 * S, 0.6 * S, w - 1.2 * S, h - 1.2 * S);
      g.setLineDash([]);
      // gold touchdown circle
      g.strokeStyle = '#e8b923'; g.lineWidth = 0.42 * S;
      g.beginPath(); g.arc(cx, cy, 7.3 * S, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 0.1 * S; g.beginPath(); g.arc(cx, cy, 7.85 * S, 0, Math.PI * 2); g.stroke();
      // the "H": uprights flank the board (board = the crossbar)
      g.fillStyle = 'rgba(238,233,220,0.92)';
      for (const sx of [-1, 1]) g.fillRect(cx + sx * 6.0 * S - 0.32 * S, cy - 5.2 * S, 0.64 * S, 10.4 * S);
      // painted text
      g.fillStyle = '#e8b923';
      g.font = `bold ${Math.round(0.72 * S)}px Anton, Impact, "Arial Black", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('NOCTURNO TOWER', cx, cy + 8.35 * S);
      g.save(); g.translate(cx, cy - 8.35 * S); g.rotate(Math.PI); g.fillText('HELIPAD · VICE CITY', 0, 0); g.restore();
      // corner weight marks
      g.font = `bold ${Math.round(0.6 * S)}px Anton, Impact, sans-serif`;
      g.fillStyle = 'rgba(238,233,220,0.8)';
      g.fillText('25t', cx + 7.9 * S, cy + 7.9 * S);
      g.save(); g.translate(cx - 7.9 * S, cy - 7.9 * S); g.rotate(Math.PI); g.fillText('25t', 0, 0); g.restore();
    });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({
      map: padTex, transparent: true, roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = Y + 0.01; pad.receiveShadow = true; pad.renderOrder = 1;
    this.group.add(pad);

    // second small pad under the helicopter
    const hpadTex = canvasTex(256, 256, (g, w, h) => {
      const S = w / 11, cx = w / 2, cy = h / 2;
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(8,10,22,0.5)'; g.beginPath(); g.arc(cx, cy, 5.4 * S, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e8b923'; g.lineWidth = 0.3 * S; g.beginPath(); g.arc(cx, cy, 5.1 * S, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(238,233,220,0.9)';
      g.fillRect(cx - 1.6 * S, cy - 2.2 * S, 0.55 * S, 4.4 * S); g.fillRect(cx + 1.05 * S, cy - 2.2 * S, 0.55 * S, 4.4 * S); g.fillRect(cx - 1.6 * S, cy - 0.27 * S, 3.2 * S, 0.55 * S);
    });
    const hpad = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshStandardMaterial({ map: hpadTex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    hpad.rotation.x = -Math.PI / 2; hpad.rotation.z = HELI.yaw; hpad.position.set(HELI.x, Y + 0.012, HELI.z); hpad.receiveShadow = true; hpad.renderOrder = 1;
    this.group.add(hpad);

    const mats = P.makeMaterials();
    this.mats = mats;
    const batch = new Batch('roof_static');

    // inset perimeter lights around the touchdown circle (steady gold/green)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + Math.PI / 24;
      batch.add(G.cyl, i % 2 ? mats.ledGold : mats.ledGreen, M(Math.cos(a) * 8.25, Y + 0.03, Math.sin(a) * 8.25, { sx: 0.16, sy: 0.06, sz: 0.16 }));
    }
    // helipad floods at the four pad corners (low, aimed at the board)
    for (const [x, z] of [[-8.3, -8.3], [8.3, -8.3], [-8.3, 8.3], [8.3, 8.3]]) {
      P.padFlood(batch, mats, M(x, Y, z, { ry: Math.atan2(-x, -z) }));
    }

    // ---------------------------------------------------------------- parapet + glass railing
    this._railing(batch, mats, Y);

    // ---------------------------------------------------------------- helicopter
    this._helicopter(gHeli, mats, Y);

    // ---------------------------------------------------------------- antenna spire with a slow soft beacon
    let beaconPos;
    if (gAnt) {
      const a = this.prop(gAnt, { height: 16 });
      a.position.set(ANTENNA[0], Y, ANTENNA[1]);
      this.group.add(a);
      a.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(a);
      beaconPos = new THREE.Vector3(ANTENNA[0], box.max.y - 0.3, ANTENNA[1]);
      this.beaconMats = [];
      a.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.name?.startsWith('EMISSIVE_Beacon')) this.beaconMats.push(m); }); });
      this.tint(a, { EMISSIVE_Beacon: '#ff2a2a' }, { intensity: 3 });
      this.beaconMats = [];
      a.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.name?.startsWith('EMISSIVE_Beacon') && !this.beaconMats.includes(m)) this.beaconMats.push(m); }); });
    } else {
      beaconPos = P.antennaMast(batch, mats, M(ANTENNA[0], Y, ANTENNA[1]));
    }
    this.beaconCore = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a2a').multiplyScalar(2.4) }));
    this.beaconCore.position.copy(beaconPos);
    this.beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(64, 0.18), color: '#ff3a3a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    this.beaconGlow.scale.setScalar(4.2);
    this.beaconGlow.position.copy(beaconPos);
    this.group.add(this.beaconCore, this.beaconGlow);

    // ---------------------------------------------------------------- HVAC cluster + penthouse (+x/+z corner, -x/+z corner)
    const hvacSpots = [[17.5, -9.5, 0], [17.5, -6.6, 0], [19.8, -12.6, Math.PI / 2], [-19.2, 7.5, Math.PI / 2]];
    for (const [x, z, yaw] of hvacSpots) {
      if (gHvac) {
        const h = this.prop(gHvac.clone(), {});
        h.position.set(x, Y, z); h.rotation.y = yaw;
        this.group.add(h);
        const fan = h.getObjectByName('Fan');
        if (fan) this.anim.fans.push(fan);
      } else {
        const fan = P.hvacUnit(batch, mats, M(x, Y, z, { ry: yaw }));
        this.group.add(fan);
        this.anim.fans.push(fan);
      }
    }
    P.penthouse(batch, mats, M(16.5, Y, 13.2, { ry: Math.PI }), { w: 7.5, d: 4.6, h: 3.4 });

    // ---------------------------------------------------------------- the boss's lounge (+x, -z): throne + entourage
    const throne = { x: 10.6, z: -8.6 };
    const throneYaw = Math.atan2(-throne.x, -throne.z);
    if (gThrone) {
      const t = this.prop(gThrone, { height: 2.2 });
      this.tint(t, { TINT_Velvet: '#231a52', TINT_Gold: '#d9a93a' });
      t.position.set(throne.x, Y, throne.z); t.rotation.y = throneYaw;
      this.group.add(t);
    } else {
      P.throneSofa(batch, mats, M(throne.x, Y, throne.z, { ry: throneYaw }));
    }
    // velvet carpet runner in front of the throne + gold stanchions
    batch.add(G.box, mats.velvetDark, M(throne.x - 0.9, Y + 0.012, throne.z + 1.2, { ry: throneYaw, sx: 2.6, sy: 0.02, sz: 3.4 }));
    const lat = [Math.cos(throneYaw), -Math.sin(throneYaw)]; // throne's local +X in world
    this.throneLat = lat;
    P.sideTable(batch, mats, M(throne.x + lat[0] * 1.65, Y, throne.z + lat[1] * 1.65));
    P.sideTable(batch, mats, M(throne.x - lat[0] * 1.65, Y, throne.z - lat[1] * 1.65));

    // ---------------------------------------------------------------- fire lounge (-x side): loungers + fire bowls
    const loungeSpots = [[-10.8, -3.6, Math.PI / 2], [-10.8, 3.4, Math.PI / 2], [-13.6, 0.1, Math.PI / 2], [11.8, 3.2, -Math.PI / 2], [11.8, -0.8, -Math.PI / 2]];
    for (const [x, z, yaw] of loungeSpots) {
      if (gLounge) {
        const l = this.prop(gLounge.clone(), {});
        l.position.set(x, Y, z); l.rotation.y = yaw + Math.PI;
        this.group.add(l);
      } else {
        P.lounger(batch, mats, M(x, Y, z, { ry: yaw }));
      }
    }
    P.sideTable(batch, mats, M(-10.9, Y, -1.8));
    P.sideTable(batch, mats, M(11.9, Y, 1.2));
    const fireSpots = [[-9.7, -0.3], [-12.6, -5.8], [-12.6, 5.6], [13.2, 6.9], [9.6, -13.0]];
    for (const [x, z] of fireSpots) {
      const anchor = P.fireBowl(batch, mats, M(x, Y, z));
      this._flame(anchor);
    }

    // ---------------------------------------------------------------- bar (+x/+z) and DJ (-x/+z)
    P.barCounter(batch, mats, M(10.8, Y, 10.2, { ry: -0.35 + Math.PI }), r, 5.2);
    const platters = P.djBooth(batch, mats, M(-10.8, Y, 10.6, { ry: Math.atan2(10.8, -10.6) }));
    platters.forEach((p) => this.group.add(p));
    this.anim.platters.push(...platters);
    for (const [x, z] of [[-13.4, 9.6], [-8.2, 12.6]]) {
      const yaw = Math.atan2(-x, -z);
      if (gSpeaker) {
        const s = this.prop(gSpeaker.clone(), { height: 2.2 });
        s.position.set(x, Y, z); s.rotation.y = yaw;
        this.group.add(s);
      } else {
        P.speakerStack(batch, mats, M(x, Y, z, { ry: yaw }));
      }
    }

    // ---------------------------------------------------------------- potted palms around the terrace
    const palmSpots = [[-9.4, -7.0], [9.4, 7.0], [-16.8, -3.5], [-16.8, 3.8], [15.6, -2.6], [15.8, 4.2], [9.6, -15.4], [-9.2, 15.2], [20.5, 0.5], [-20.6, -0.6]];
    let palmTmpl = null;
    const palmMerge = new Map(); // material -> geometries (palms merged: 1 draw call per palm material)
    if (gPalm) palmTmpl = this.prop(gPalm, { height: 3.0 });
    palmSpots.forEach(([x, z], i) => {
      if (gPot) {
        const p = this.prop(gPot.clone(), { height: 1.0 });
        p.position.set(x, Y, z);
        this.group.add(p);
      } else {
        P.planter(batch, mats, M(x, Y, z), { r: 0.48, h: 0.72 });
        if (palmTmpl) {
          const p = palmTmpl.clone();
          const s = 0.85 + r() * 0.35;
          p.scale.setScalar(s);
          p.position.set(x, Y + 0.62, z);
          p.rotation.y = r() * Math.PI * 2;
          p.updateMatrixWorld(true);
          p.traverse((o) => {
            if (!o.isMesh || Array.isArray(o.material)) return;
            const g = o.geometry.clone();
            g.applyMatrix4(o.matrixWorld);
            if (!palmMerge.has(o.material)) palmMerge.set(o.material, []);
            palmMerge.get(o.material).push(g);
          });
        } else {
          P.palmFronds(batch, mats, M(x, Y, z, { ry: i }), r);
        }
      }
    });
    for (const [mat, list] of palmMerge) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.name = 'palms'; m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }

    // ---------------------------------------------------------------- flags (Cartel Nocturno)
    const flagTex = canvasTex(128, 80, (g, w, h) => {
      g.fillStyle = '#0c0d12'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8b923'; g.fillRect(0, h - 10, w, 5); g.fillRect(0, 5, w, 5);
      g.font = 'bold 52px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#e8b923'; g.fillText('N', w / 2, h / 2 + 2);
      g.fillStyle = '#b8ff3c'; g.fillRect(w / 2 - 14, h / 2 + 18, 28, 3);
    });
    for (const [x, z] of [[-11.2, -16.2], [11.2, -16.2], [-11.2, 16.2], [11.2, 16.2]]) {
      const cloth = P.flag(batch, mats, M(x, Y, z), flagTex);
      this.group.add(cloth);
      this.anim.flags.push(cloth);
    }

    // ---------------------------------------------------------------- NOCTURNO signs (steady neon letters, city shows through)
    this._sign('NOCTURNO', -15.5, 0, Y);
    this._sign('NOCTURNO', 15.5, Math.PI, Y);

    // build all static props (one draw call per material)
    batch.build(this.group);

    // ---------------------------------------------------------------- gold confetti for the finale (hidden until then)
    this._confetti();

    // ---------------------------------------------------------------- people
    this._people(boss, throne, throneYaw);
  }

  // ==================================================================== pieces of the build
  _railing(batch, mats, Y) {
    const glassMat = new THREE.MeshStandardMaterial({ color: '#7fa6ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false, envMapIntensity: 1.2, side: THREE.DoubleSide });
    const edges = [
      { a: [-RX, -RZ], b: [RX, -RZ] }, { a: [RX, -RZ], b: [RX, RZ] }, { a: [RX, RZ], b: [-RX, RZ] }, { a: [-RX, RZ], b: [-RX, -RZ] },
    ];
    const glassGeos = [];
    for (const { a, b } of edges) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz) - Math.PI / 2;
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
      const nx = -dz / len, nz = dx / len; // inward normal (edges wind counter-clockwise from above)
      // parapet
      batch.add(G.box, mats.concrete, M(cx - nx * 0.05, Y + 0.22, cz - nz * 0.05, { ry: yaw, sx: len + 0.5, sy: 0.44, sz: 0.5 }));
      batch.add(G.box, mats.gold, M(cx - nx * 0.05, Y + 0.455, cz - nz * 0.05, { ry: yaw, sx: len + 0.5, sy: 0.03, sz: 0.52 }));
      // warm LED strip on the inner face of the parapet
      batch.add(G.box, mats.ledWarm, M(cx + nx * 0.21, Y + 0.36, cz + nz * 0.21, { ry: yaw, sx: len - 0.4, sy: 0.035, sz: 0.02 }));
      // handrail
      batch.add(G.box, mats.gold, M(cx, Y + 1.58, cz, { ry: yaw, sx: len + 0.1, sy: 0.07, sz: 0.1 }));
      // posts
      const n = Math.round(len / 2.4);
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        batch.add(G.box, mats.steel, M(a[0] + dx * k, Y + 1.02, a[1] + dz * k, { ry: yaw, sx: 0.06, sy: 1.1, sz: 0.08 }));
      }
      const gg = new THREE.PlaneGeometry(len, 1.1);
      gg.applyMatrix4(M(cx, Y + 1.02, cz, { ry: yaw + Math.PI / 2 }));
      glassGeos.push(gg);
    }
    const glass = new THREE.Mesh(mergeGeometries(glassGeos, false), glassMat);
    glassGeos.forEach((g) => g.dispose());
    glass.renderOrder = 3;
    glass.name = 'glass_railing';
    this.group.add(glass);
  }

  _helicopter(gHeli, mats, Y) {
    let root, rotor, tail;
    if (gHeli) {
      root = this.prop(gHeli, {});
      this.tint(root, { TINT_Body: '#0c0d12', EMISSIVE_Nav: '#ff3030' }, { intensity: 1.5 });
      root.traverse((o) => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m?.name?.startsWith('GLASS')) { m.transparent = true; m.opacity = 0.55; }
        });
      });
      rotor = root.getObjectByName('Rotor');
      tail = root.getObjectByName('TailRotor');
    } else {
      ({ root, rotor, tail } = P.buildHelicopter(mats));
    }
    root.position.set(HELI.x, Y, HELI.z);
    root.rotation.y = HELI.yaw;
    this.group.add(root);
    this.heli = root;
    this.rotorSpeed = 1.6; this.rotorTarget = 1.6;
    if (rotor) this.anim.rotors.push({ o: rotor, axis: 'y', k: 1 });
    if (tail) this.anim.rotors.push({ o: tail, axis: 'x', k: 4 });
    // wheel chocks + a red carpet strip for the boss's exit
    const f = new Batch('heli_extra');
    f.add(G.box, mats.velvet, M(HELI.x + 2.2, Y + 0.012, HELI.z + 2.6, { ry: 0.35, sx: 1.2, sy: 0.02, sz: 3.6 }));
    for (const dz of [-1.05, 1.05]) f.add(G.box, mats.ledGold, M(HELI.x + 3.2, Y + 0.06, HELI.z + dz, { sx: 0.25, sy: 0.12, sz: 0.25 }));
    f.build(this.group);
  }

  _sign(text, z, yaw, Y) {
    const W = 17, H = 3.0;
    const g = new THREE.Group();
    // steel frame behind the letters (thin, lets the city show through)
    const frame = new Batch('sign_frame');
    const steel = this.mats.darkSteel;
    frame.add(G.box, steel, M(0, 0.55, -0.12, { sx: W + 0.6, sy: 0.12, sz: 0.12 }));
    frame.add(G.box, steel, M(0, 0.55 + H + 0.1, -0.12, { sx: W + 0.6, sy: 0.08, sz: 0.08 }));
    for (let i = 0; i <= 6; i++) {
      const x = -W / 2 + (i / 6) * W;
      frame.add(G.box, steel, M(x, (0.55 + H) / 2, -0.12, { sx: 0.1, sy: 0.55 + H, sz: 0.1 }));
    }
    frame.add(G.box, this.mats.ledGreen, M(0, 0.5, 0.0, { sx: W - 1, sy: 0.05, sz: 0.03 }));
    frame.build(g, { cast: false });
    const tex = neonTextTex(text, '#ffb82e', { w: 512, h: 96, blur: 10, line: 5, core: '#ffe7a8', fill: 'rgba(255,190,70,0.22)' });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.05), side: THREE.DoubleSide, fog: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, W * 96 / 512), mat);
    plane.position.set(0, 0.62 + (W * 96 / 512) / 2, 0);
    plane.renderOrder = 4;
    g.add(plane);
    g.position.set(0, Y, z);
    g.rotation.y = yaw;
    this.group.add(g);
  }

  _flame(anchor) {
    if (!this._flameMat) {
      const tex = canvasTex(64, 128, (g, w, h) => {
        const grd = g.createRadialGradient(w / 2, h * 0.78, 2, w / 2, h * 0.62, h * 0.55);
        grd.addColorStop(0, 'rgba(255,245,200,1)');
        grd.addColorStop(0.25, 'rgba(255,190,80,0.85)');
        grd.addColorStop(0.6, 'rgba(255,90,30,0.35)');
        grd.addColorStop(1, 'rgba(255,40,0,0)');
        g.fillStyle = grd;
        g.beginPath(); g.moveTo(w / 2, 0); g.quadraticCurveTo(w * 1.02, h * 0.7, w / 2, h); g.quadraticCurveTo(-w * 0.02, h * 0.7, w / 2, 0); g.fill();
      });
      this._flameMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: new THREE.Color(1.2, 1.0, 0.8) });
      const a = new THREE.PlaneGeometry(0.8, 1.0); a.translate(0, 0.5, 0);
      const b = a.clone().rotateY(Math.PI / 2);
      const c = a.clone().rotateY(Math.PI / 4).scale(0.8, 0.8, 0.8);
      this._flameGeo = (() => { const m = [a, b, c]; const out = new THREE.BufferGeometry(); const arr = []; const uvs = []; for (const x of m) { const n = x.toNonIndexed(); arr.push(...n.attributes.position.array); uvs.push(...n.attributes.uv.array); n.dispose(); } out.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); [a, b, c].forEach((x) => x.dispose()); return out; })();
    }
    const f = new THREE.Mesh(this._flameGeo, this._flameMat);
    f.position.copy(anchor);
    f.renderOrder = 5;
    this.group.add(f);
    this.anim.flames.push({ o: f, ph: this.anim.flames.length * 1.7 });
  }

  _confetti() {
    const N = 260;
    const seeds = new Float32Array(N * 3);
    const rr = mulberry(77);
    for (let i = 0; i < N; i++) seeds.set([(rr() - 0.5) * 22, (rr() - 0.5) * 18, rr()], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 30);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: /* glsl */`
        uniform float uT; varying float vK; varying float vFlip;
        void main(){
          float ph = position.z;
          float y = 9.0 - mod(uT * (0.7 + ph * 0.5) + ph * 10.0, 10.0);
          vec3 p = vec3(position.x + sin(uT * 1.3 + ph * 20.0) * 0.5, y, position.y + cos(uT * 1.1 + ph * 13.0) * 0.5);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.6 + ph * 0.5) * 34.0 / -mv.z;
          vK = ph;
          vFlip = abs(sin(uT * (1.5 + ph * 2.0) + ph * 30.0));   // slow flutter (flake turning), not a blink
        }`,
      fragmentShader: /* glsl */`
        uniform float uA; varying float vK; varying float vFlip;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          if (abs(c.x) > 0.5 || abs(c.y) > 0.12 + 0.3 * vFlip) discard;
          vec3 col = vK < 0.75 ? vec3(1.0, 0.68, 0.16) : vec3(0.45, 1.0, 0.2);
          gl_FragColor = vec4(col * (0.8 + 0.4 * vFlip), uA);
        }`,
    });
    this.confetti = new THREE.Points(geo, mat);
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    this.group.add(this.confetti);
    this.confettiUntil = 0;
  }

  _people(boss, throne, throneYaw) {
    const c = this.crowd;
    if (!c) return;
    const S = STREET_Y;
    const suit = { top: '#111116', bottom: '#111116' };
    const white = { top: '#f2f2f2', bottom: '#111116' };
    const low = this.ctx.quality === 'low';

    // ---- walkers first (so they survive the low-quality NPC cap). Lanes: long sides x = ±8, cross lanes behind the
    // board at |z| = 13.6 (radius > 13: clear of the camera corridors / cinematic orbit), in front of the signs.
    const ring = [[8, -5], [8, 5], [7, 10.8], [4.5, 13.6], [-4.5, 13.6], [-7, 10.8], [-8, 5], [-8, -5], [-7, -10.8], [-4.5, -13.6], [4.5, -13.6], [7, -10.8]];
    const rot = (arr, k) => arr.slice(k).concat(arr.slice(0, k));
    const walkers = [
      // security patrolling the whole pad (two clockwise, one counter-clockwise), in black suits
      { path: ring, look: 'suit', colors: { ...suit }, body: 'm', speed: 1.15 },
      { path: rot(ring, 6), look: 'suit', colors: { ...suit }, body: 'm', speed: 1.05 },
      { path: rot(ring.slice().reverse(), 3), look: 'suit', colors: { ...suit }, body: 'm', speed: 1.1 },
      { path: rot(ring, 9), look: 'rich', body: 'f', speed: 0.95 },
      // pilot doing the pre-flight walk-around of the helicopter
      { path: [[-8.4, -9.0], [-8.2, -13.4], [-13.0, -14.2], [-17.6, -13.2], [-17.2, -8.6], [-12.4, -8.2]], look: 'suit', colors: { top: '#f2f2f2', bottom: '#1b2340' }, body: 'm', speed: 0.9 },
      // guests drifting between the bar, the boss lounge and the helipad
      { path: [[13.6, 8.0], [14.2, 1.4], [14.0, -4.8], [12.8, -5.2], [8.0, -3.0], [8.0, 3.0], [9.6, 5.6]], look: 'rich', body: 'f', speed: 1.0 },
      { path: [[-14.6, 9.2], [-15.2, 1.2], [-15.0, -6.0], [-10.6, -7.6], [-8.0, -3.0], [-8.0, 4.0]], look: 'club', speed: 1.1 },
      // guests crossing behind each end of the board (radius > 13), then back
      { path: [[-11.6, -7.4], [-7.2, -12.2], [0, -13.4], [6.9, -12.0], [12.0, -5.0]], look: 'rich', speed: 1.05, loop: false },
      { path: [[12.0, 5.2], [7.2, 12.0], [0, 13.4], [-7.0, 12.2], [-13.6, 4.6]], look: 'club', body: 'f', speed: 1.0, loop: false },
      // waiter with a tray (white jacket) — bar ↔ throne
      { path: [[9.2, 8.4], [8.0, 4.0], [8.0, -4.0], [8.6, -7.2]], look: 'suit', colors: { ...white }, speed: 1.25, loop: false },
      // a guest walking the white-side back lane to the DJ
      { path: [[11.8, 16.3], [-11.8, 16.3], [-13.6, 13.4]], look: 'club', body: 'f', speed: 1.0, loop: false },
    ];
    const nW = low ? 5 : walkers.length;
    c.spawn(walkers.slice(0, nW).map((w) => ({ y: S, anim: 'walk', loop: true, wander: true, ...w })));

    const list = [];
    // bodyguards, arms crossed, watching the board (apron long sides + the boss lounge + the heli)
    const guards = boss ? [[6.6, -4.6], [-6.6, 4.6], [13.4, -11.6], [8.8, -12.6], [-9.4, -15.2]] : [[6.6, -4.6], [-9.4, -15.2]];
    for (const [x, z] of guards) list.push({ at: [x, z], y: S, face: 'board', anim: 'crossed', look: 'suit', colors: { ...suit }, body: 'm', react: false });
    // the boss on his throne + entourage either side
    const lat = this.throneLat || [1, 0];
    const fwd = [Math.sin(throneYaw), Math.cos(throneYaw)];
    if (boss) {
      list.push({ at: [throne.x + fwd[0] * 0.12, throne.z + fwd[1] * 0.12], y: S, face: throneYaw, anim: 'sit', look: 'suit', colors: { top: '#0c0c10', bottom: '#0c0c10', accent: '#e8b923' }, body: 'm', react: false });
      list.push({ at: [throne.x + lat[0] * 2.5 + fwd[0] * 0.6, throne.z + lat[1] * 2.5 + fwd[1] * 0.6], y: S, face: [throne.x, throne.z], anim: 'drink', look: 'rich', body: 'f' });
      list.push({ at: [throne.x - lat[0] * 2.5 + fwd[0] * 0.6, throne.z - lat[1] * 2.5 + fwd[1] * 0.6], y: S, face: [throne.x, throne.z], anim: 'talk', look: 'rich', body: 'f' });
    }
    // fire lounge guests
    list.push({ at: [-10.8, -3.3], y: S, face: Math.PI / 2, anim: 'sit', look: 'rich', body: 'f' });
    list.push({ at: [-10.8, 3.7], y: S, face: Math.PI / 2, anim: 'sit', look: 'club', body: 'm' });
    list.push({ at: [-10.0, 1.4], y: S, face: [-9.7, -0.3], anim: 'talk', look: 'rich', body: 'm' });
    list.push({ at: [-10.2, -2.0], y: S, face: [-9.7, -0.3], anim: 'drink', look: 'club', body: 'f' });
    list.push({ at: [11.8, 3.5], y: S, face: -Math.PI / 2, anim: 'sit', look: 'rich', body: 'f' });
    // bar: bartender + drinkers
    list.push({ at: [11.4, 11.9], y: S, face: [10.8, 10.2], anim: 'idle', look: 'suit', colors: { ...white }, react: false });
    list.push({ at: [10.2, 8.2], y: S, face: [10.8, 10.2], anim: 'drink', look: 'rich' });
    list.push({ at: [12.3, 8.6], y: S, face: [10.8, 10.2], anim: 'talk', look: 'club', body: 'f' });
    // DJ + dancers
    list.push({ at: [-11.5, 11.4], y: S, face: [0, 0], anim: 'dance2', look: 'club', body: 'm' });
    const dancers = boss ? [[-9.4, 8.6], [-10.8, 7.6], [-8.6, 10.2], [-12.4, 8.4]] : [[-9.4, 8.6], [-10.8, 7.6]];
    dancers.forEach(([x, z], i) => list.push({ at: [x, z], y: S, face: [-10.8, 10.6], anim: i % 2 ? 'dance' : 'dance2', look: 'club' }));
    // guests on phones taking selfies with the view (backs to the skyline)
    for (const [x, z] of [[-20.6, 4.2], [20.6, -3.6], [14.8, -16.2], [-16.6, 16.2]]) list.push({ at: [x, z], y: S, face: 'board', anim: 'phone', look: x > 0 ? 'rich' : 'club' });
    c.spawn(list);
  }

  // ==================================================================== runtime
  update(dt, t) {
    const rm = this.reducedMotion;
    this.city?.update(dt, t, rm);
    // rotor: slow idle; spins up for the finale then settles
    const target = rm ? 0.5 : this.rotorTarget;
    this.rotorSpeed += (target - this.rotorSpeed) * Math.min(1, dt * 0.6);
    for (const r of this.anim.rotors) r.o.rotation[r.axis] += dt * this.rotorSpeed * r.k;
    const fanSpd = rm ? 0.4 : 2.2;
    for (const f of this.anim.fans) f.rotation.y += dt * fanSpd;
    for (const p of this.anim.platters) p.rotation.y += dt * (rm ? 0.6 : 3.5);
    // aviation beacon: slow soft breathing (3.2 s, 70–100 %), constant with reduced motion
    const b = this.pulse(t, 3.2);
    const k = 0.7 + 0.3 * b;
    if (this.beaconCore) this.beaconCore.material.color.setRGB(2.4 * k, 0.26 * k, 0.26 * k);
    if (this.beaconGlow) this.beaconGlow.material.opacity = 0.45 + 0.25 * b;
    if (this.beaconMats) for (const m of this.beaconMats) m.emissiveIntensity = 3 * k;
    if (this.city?.mats?.beacons) {
      const cb = 0.75 + 0.25 * this.pulse(t, 4.5, 1.3);
      this.city.mats.beacons.color.setRGB(2.2 * cb, 0.2 * cb, 0.2 * cb);
    }
    // fire bowls breathe softly
    for (const f of this.anim.flames) {
      const s = rm ? 1 : 1 + 0.08 * Math.sin(t * 2.1 + f.ph) + 0.04 * Math.sin(t * 3.3 + f.ph * 2);
      f.o.scale.set(1, s, 1);
      if (!rm) f.o.rotation.y = Math.sin(t * 0.4 + f.ph) * 0.3;
    }
    if (this.fireLight) this.fireLight.intensity = 14 * (0.9 + 0.1 * this.pulse(t, 2.4));
    // flags: gentle wave (CPU, 55 verts each, no allocations)
    if (!rm) {
      for (let fi = 0; fi < this.anim.flags.length; fi++) {
        const cl = this.anim.flags[fi];
        const pos = cl.geometry.attributes.position;
        const base = cl.userData.base;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          pos.array[i * 3 + 2] = Math.sin(x * 2.6 - t * 3.0 + fi) * 0.12 * x;
        }
        pos.needsUpdate = true;
      }
    }
    // finale confetti
    if (this.confetti && this.confetti.visible) {
      const u = this.confetti.material.uniforms;
      u.uT.value += dt;
      const left = this.confettiUntil - t;
      u.uA.value = Math.max(0, Math.min(1, u.uT.value / 1.2, left / 2));
      if (left <= 0) { this.confetti.visible = false; this.rotorTarget = 1.6; }
    }
    this._t = t;
  }

  react(event) {
    if (event === 'finale') {
      this.rotorTarget = 7;
      if (this.confetti && !this.reducedMotion) {
        this.confetti.visible = true;
        this.confetti.material.uniforms.uT.value = 0;
        this.confettiUntil = (this._t || 0) + 9;
      } else {
        this.confettiUntil = (this._t || 0) + 9;
        if (this.confetti) { this.confetti.visible = true; this.confetti.material.uniforms.uA.value = 0; }
      }
    }
  }

  dispose() {
    this._flameGeo?.dispose();
    super.dispose();
  }
}
