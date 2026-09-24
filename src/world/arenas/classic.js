// Classic arena: the original Vice City Grand Prix street-race track (formerly src/world/Environment.js).
// Sunset sky + fog, sun with soft shadows, street with lane paint, race barriers, chain-link catch fences with
// sponsor banners, palms, street lights, procedural skyline, neon signs — plus race fans behind the barriers and
// people strolling the sidewalks around the track. No flashing: signs/beacons breathe slowly (≥ 3 s periods).
import * as THREE from 'three';
import { Arena, STREET_Y } from './Arena.js';
import {
  canvasTexture, speckle, rng, mergeGeometries, normalizeProp, propLength, bannerTexture, neonTextTexture, viTexture,
  neonSign, sunsetSky, addPalms, addStreetLights, buildSkyline,
} from './kit.js';

// Sun sits low behind black's side (−Z) so the default white camera looks into the sunset.
const SUN_DIR = [-0.35, 0.16, -1];
const WALK_Y = STREET_Y + 0.18;   // raised sidewalks
const FENCE_X = 8.8;              // catch fences (spectator strip 6.9..8.8 between barrier and fence)
const LAMP_Z = [-13, -3.8, 3.8, 13];

export default class ClassicArena extends Arena {
  async build() {
    const m = this.ctx.models || {};
    const rm = this.reducedMotion;
    this._updaters = [];

    const sky = sunsetSky({ sunDir: SUN_DIR, reducedMotion: rm });
    this.sky = sky.mesh;
    this.group.add(sky.mesh);
    this._updaters.push(sky.update);

    this._lights();
    this._ground();
    this._barriers(m.barrier);
    this._fences(m.fence);

    const r = rng(42);
    const palmSpots = [];
    for (const sx of [-1, 1]) for (let z = -30; z <= 18; z += 5.2) {
      const x = sx * (9.6 + r() * 1.6);
      palmSpots.push([x, z + r() * 1.5, Math.abs(x) > 7.6 && Math.abs(x) < 13.6 ? WALK_Y : STREET_Y]);
    }
    for (let i = 0; i < 8; i++) palmSpots.push([(r() - 0.5) * 50, -26 - r() * 20]);
    for (let i = 0; i < 4; i++) palmSpots.push([(r() < 0.5 ? -1 : 1) * (14 + r() * 8), 10 + r() * 10]);
    const palms = addPalms(palmSpots, { glb: m.palm, seed: 42, reducedMotion: rm });
    this.group.add(palms.group);
    this._updaters.push(palms.update);

    const lamps = addStreetLights(LAMP_Z.flatMap((z) => [[-7.3, z], [7.3, z]]).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1])),
      { glb: m.streetlight, maxLights: 4 });
    this.group.add(lamps.group);

    const city = buildSkyline({ seed: 2024, reducedMotion: rm });
    const rr = rng(77);
    this.group.add(city.group);
    this._updaters.push(city.update);
    this._streetBlocks(rr);
    this._neonSigns();

    this.buildEnvMap([
      { color: '#29e3d6', pos: [30, 6, 10], size: [14, 1.2] },
      { color: '#ff5fa2', pos: [-30, 8, 5], size: [16, 1.4] },
      { color: '#ffb24a', pos: [0, 10, 32], size: [10, 1] },
    ]);
    this.mood = {
      background: '#1b1036',
      fog: { color: '#a8466a', near: 26, far: 130 },
      exposure: 1.05,
      bloom: { strength: 0.65, radius: 0.45, threshold: 0.9 },
      envIntensity: 0.75,
    };
    this.boardStyle = null; // default race kerb + teal/pink neon

    this._people();
  }

  // ------------------------------------------------------------------ lights
  _lights() {
    this.addHemi(0x9a6cc8, 0x3a1a26, 0.9);
    const sun = this.addSun({ color: 0xffa25e, intensity: 3.2, dir: SUN_DIR });
    sun.position.y = 9.5; // raised so shadows stay readable on the board
    const c = sun.shadow.camera;
    c.left = -7.5; c.right = 7.5; c.top = 7.5; c.bottom = -7.5; c.far = 50;
    c.updateProjectionMatrix();
    const rim = new THREE.DirectionalLight(0x4fd8ff, 1.1); // cool neon rim from the night side
    rim.position.set(6, 6, 12);
    const kick = new THREE.DirectionalLight(0xff4fa0, 0.6); // magenta kicker from the left
    kick.position.set(-12, 4, 4);
    this.group.add(rim, kick);
  }

  // ------------------------------------------------------------------ street
  _ground() {
    const r = rng(77);
    const tex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#2a2530'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 16000, (rr) => `rgba(${70 + rr * 60},${60 + rr * 60},${80 + rr * 50},${0.2 + rr * 0.3})`, r, [1, 2]);
      speckle(g, w, h, 5000, (rr) => `rgba(5,4,10,${0.3 + rr * 0.3})`, r, [1, 3]);
    }, { repeat: [40, 40] });
    const rough = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = 'rgb(0,200,0)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        const x = r() * w, y = r() * h, rad = 10 + r() * 40;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(0,30,0,1)'); grd.addColorStop(1, 'rgba(0,200,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      }
    }, { srgb: false, repeat: [18, 18] });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ map: tex, roughnessMap: rough, roughness: 1, metalness: 0.05, envMapIntensity: 1.2 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = STREET_Y;
    ground.receiveShadow = true;
    this.group.add(ground);

    // lane paint: dashed white lines along Z and a double yellow on the far ends
    const paint = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffc34d, roughness: 0.6, emissive: 0x5a3a00, emissiveIntensity: 0.3 });
    const dashGeo = new THREE.PlaneGeometry(0.12, 1.4); dashGeo.rotateX(-Math.PI / 2);
    const dashes = [], doubles = [];
    for (const x of [-5.6, 5.6]) for (let z = -80; z < 80; z += 3.2) {
      if (Math.abs(z) < 5.4) continue;
      dashes.push(dashGeo.clone().translate(x, STREET_Y + 0.005, z));
    }
    for (const x of [-0.12, 0.12]) for (const [z0, z1] of [[-80, -5.5], [5.5, 80]]) {
      const gg = new THREE.PlaneGeometry(0.1, z1 - z0); gg.rotateX(-Math.PI / 2);
      doubles.push(gg.translate(x, STREET_Y + 0.005, (z0 + z1) / 2));
    }
    // zebra stop lines in front of each player's side; pedestrian crossings where the sidewalk walkers cross
    const zebra = [];
    for (const zc of [6.2, -6.2]) for (let x = -4.4; x <= 4.4; x += 0.8) {
      zebra.push(new THREE.PlaneGeometry(0.42, 1.1).rotateX(-Math.PI / 2).translate(x, STREET_Y + 0.006, zc));
    }
    for (const zc of [17.5, -17.5]) for (let x = -7.2; x <= 7.2; x += 0.8) {
      zebra.push(new THREE.PlaneGeometry(0.42, 2.0).rotateX(-Math.PI / 2).translate(x, STREET_Y + 0.006, zc));
    }
    const lanes = new THREE.Mesh(mergeGeometries([...dashes, ...zebra]), paint);
    const dy = new THREE.Mesh(mergeGeometries(doubles), yellow);
    [...dashes, ...zebra, ...doubles, dashGeo].forEach((g) => g.dispose());
    lanes.receiveShadow = dy.receiveShadow = true;
    this.group.add(lanes, dy);

    // raised sidewalks on both sides
    const walkTex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#8d7f86'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, (rr) => `rgba(${60 + rr * 90},${50 + rr * 80},${60 + rr * 80},0.25)`, r);
      g.strokeStyle = 'rgba(40,30,40,0.6)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); }
    }, { repeat: [3, 60] });
    const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.85 });
    const walkGeo = new THREE.BoxGeometry(6, 0.18, 160);
    for (const sx of [-1, 1]) {
      const walk = new THREE.Mesh(walkGeo, walkMat);
      walk.position.set(sx * 10.6, STREET_Y + 0.09, 0);
      walk.receiveShadow = true;
      this.group.add(walk);
    }
  }

  // ------------------------------------------------------------------ race barriers
  _barriers(glb) {
    const group = new THREE.Group(); group.name = 'barriers';
    const along = []; // [x, z, yaw]
    const L = 2.0;
    for (const sx of [-1, 1]) for (let z = -15; z <= 15; z += L) along.push([sx * 6.9, z, sx * Math.PI / 2]);
    for (const sz of [-1, 1]) for (const x of [-5.8, 5.8]) along.push([x, sz * 7.1, sz > 0 ? 0 : Math.PI]);
    if (glb) {
      const tmpl = normalizeProp(glb, { height: 0.6 });
      const len = propLength(tmpl);
      for (const [x, z, yaw] of along) {
        const n = Math.max(1, Math.round(L / len));
        const sideways = Math.abs(Math.sin(yaw)) > 0.5;
        for (let i = 0; i < n; i++) {
          const b = tmpl.clone();
          const off = (i - (n - 1) / 2) * len;
          b.position.set(x + (sideways ? 0 : off), STREET_Y, z + (sideways ? off : 0));
          b.rotation.y = yaw + (tmpl.userData.alongZ ? Math.PI / 2 : 0);
          group.add(b);
        }
      }
    } else {
      const s = new THREE.Shape();
      s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.24, 0.1); s.lineTo(0.12, 0.25); s.lineTo(0.1, 0.62);
      s.lineTo(-0.1, 0.62); s.lineTo(-0.12, 0.25); s.lineTo(-0.24, 0.1); s.lineTo(-0.3, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: L - 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
      geo.translate(0, 0, -(L - 0.04) / 2);
      geo.rotateY(Math.PI / 2);
      geo.computeVertexNormals();
      const white = new THREE.MeshStandardMaterial({ color: 0xece6de, roughness: 0.7, map: barrierTex('#ece6de') });
      const red = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, map: barrierTex('#d42330') });
      let i = 0;
      for (const [x, z, yaw] of along) {
        const b = new THREE.Mesh(geo, i++ % 2 ? red : white);
        b.position.set(x, STREET_Y, z);
        b.rotation.y = yaw;
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
      }
    }
    this.group.add(group);
  }

  // ------------------------------------------------------------------ chain-link fences + banners
  _fences(glb) {
    const group = new THREE.Group(); group.name = 'fences';
    const H = 2.6, X = FENCE_X, Z0 = -16, Z1 = 16;
    const y0 = WALK_Y;
    if (glb) {
      const tmpl = normalizeProp(glb, { height: H });
      tmpl.traverse((o) => {
        if (!o.isMesh) return;
        const fix = (mm) => {
          if (mm && /CHAIN|LINK|MESH_?FENCE/i.test(mm.name || '')) {
            mm = mm.clone();
            mm.transparent = false; mm.alphaTest = 0.5; mm.side = THREE.DoubleSide; mm.depthWrite = true;
            if (!mm.map && !mm.alphaMap) mm.opacity = 1;
          }
          return mm;
        };
        o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
      });
      const len = propLength(tmpl);
      for (const sx of [-1, 1]) for (let z = Z0 + len / 2; z <= Z1; z += len) {
        const f = tmpl.clone();
        f.position.set(sx * X, y0, z);
        f.rotation.y = sx * Math.PI / 2 + (tmpl.userData.alongZ ? Math.PI / 2 : 0);
        group.add(f);
      }
    } else {
      const linkTex = canvasTexture(128, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.strokeStyle = '#c9ccd4'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
      }, { repeat: [(Z1 - Z0) / 0.32, H / 0.32] });
      const linkMat = new THREE.MeshStandardMaterial({ map: linkTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.45, color: 0xd0d4dc });
      const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.8, roughness: 0.35 });
      const postGeo = new THREE.CylinderGeometry(0.045, 0.05, H + 0.6, 8); postGeo.translate(0, (H + 0.6) / 2, 0);
      const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6); armGeo.translate(0, 0.45, 0);
      const railGeo = new THREE.CylinderGeometry(0.03, 0.03, Z1 - Z0, 6); railGeo.rotateX(Math.PI / 2);
      const panelGeo = new THREE.PlaneGeometry(Z1 - Z0, H), overGeo = new THREE.PlaneGeometry(Z1 - Z0, 0.8);
      for (const sx of [-1, 1]) {
        const panel = new THREE.Mesh(panelGeo, linkMat);
        panel.position.set(sx * X, y0 + H / 2 + 0.05, (Z0 + Z1) / 2);
        panel.rotation.y = Math.PI / 2;
        panel.castShadow = true;
        const over = new THREE.Mesh(overGeo, linkMat);
        over.position.set(sx * (X - 0.28), y0 + H + 0.38, (Z0 + Z1) / 2);
        over.rotation.set(0, Math.PI / 2, 0);
        over.rotateX(sx * -0.75);
        group.add(panel, over);
        const parts = [];
        for (let z = Z0; z <= Z1 + 0.01; z += 2.5) {
          parts.push(postGeo.clone().translate(sx * X, y0, z));
          parts.push(armGeo.clone().rotateZ(sx * 0.7).translate(sx * X, y0 + H + 0.1, z));
        }
        const pm = new THREE.Mesh(mergeGeometries(parts), postMat);
        parts.forEach((g) => g.dispose());
        pm.castShadow = true;
        group.add(pm);
        for (const y of [0.1, H]) {
          const rail = new THREE.Mesh(railGeo, postMat);
          rail.position.set(sx * X, y0 + y, (Z0 + Z1) / 2);
          group.add(rail);
        }
      }
      postGeo.dispose(); armGeo.dispose();
    }
    const sponsors = [
      ['VICE CITY GP', '#ff5fa2', '#1b1036'], ['LEONIDA', '#29e3d6', '#101018'], ['eCola', '#ffffff', '#d4202c'],
      ['SPRUNK', '#9dff3c', '#0d2a12'], ['MAIBATSU', '#ffffff', '#2a2a2a'], ['PISSWASSER', '#ffc34d', '#3a1a0a'],
      ['VINEWOOD', '#1b1036', '#ffd36b'], ['CARTEL NOCTURNO', '#ffc34d', '#0b0b0e'],
    ];
    const r = rng(5);
    const bannerMats = sponsors.map(([t, fg, bg]) => new THREE.MeshStandardMaterial({ map: bannerTexture(t, fg, bg), roughness: 0.6, side: THREE.DoubleSide }));
    const used = new Set();
    const bGeo = new THREE.PlaneGeometry(3.6, 0.7);
    for (const sx of [-1, 1]) for (let z = -14; z <= 14; z += 4.1) {
      const i = Math.floor(r() * bannerMats.length);
      used.add(i);
      const b = new THREE.Mesh(bGeo, bannerMats[i]);
      b.position.set(sx * (X - 0.03), y0 + 0.75, z);
      b.rotation.y = -sx * Math.PI / 2;
      b.receiveShadow = true;
      group.add(b);
    }
    bannerMats.forEach((mm, i) => { if (!used.has(i)) { mm.map.dispose(); mm.dispose(); } });
    this.group.add(group);
  }

  // ------------------------------------------------------------------ low-rise blocks along the street
  _streetBlocks(r) {
    const spots = [];
    for (const sx of [-1, 1]) for (let z = -40; z <= 30; z += 7 + r() * 3) spots.push([sx * (17 + r() * 4), z, 5 + r() * 3, 5 + r() * 2, 3 + r() * 6]);
    const blocks = buildSkyline({
      seed: 4077, beacons: false, reducedMotion: this.reducedMotion,
      clusters: spots.map(([x, z, w, , h]) => ({ count: 1, angle: Math.atan2(z, x), spread: 0, dist: [Math.hypot(x, z), Math.hypot(x, z)], height: [h, h], size: [w, w] })),
    });
    this.group.add(blocks.group);
  }

  // ------------------------------------------------------------------ neon signs (slow breathing, never flicker)
  _neonSigns() {
    this._signs = [];
    const add = (tex, w, h, pos, yaw, mult = 2.4, pulse = null) => {
      const s = neonSign(tex, { width: w, height: h, mult, pulse });
      s.position.set(...pos); s.rotation.y = yaw;
      this.group.add(s);
      if (s.userData.update) this._signs.push(s);
    };
    const slow = { period: 4, amp: 0.18 };
    add(viTexture(), 16, 16, [-24, 18, -58], 0.25, 2.2);
    add(neonTextTexture('VICE CITY', '#29e3d6'), 18, 4.5, [26, 14, -52], -0.35, 2.4, slow);
    add(neonTextTexture('GRAND THEFT CHESS', '#ff5fa2'), 9, 1.6, [-13.3, STREET_Y + 5.5, -8], Math.PI / 2, 2.4, { period: 5, amp: 0.15 });
    add(neonTextTexture('OPEN 24/7', '#9dff3c'), 5, 1.3, [13.3, STREET_Y + 4.2, -3], -Math.PI / 2, 2.2, { period: 3.5, amp: 0.2 });
    add(neonTextTexture('MOTEL', '#ffc34d'), 5, 1.4, [13.3, STREET_Y + 5.5, 9], -Math.PI / 2, 2.4);
    add(neonTextTexture('LEONIDA', '#29e3d6'), 6, 1.4, [-13.3, STREET_Y + 4.6, 10], Math.PI / 2, 2.4);
    add(viTexture(), 10, 10, [18, 12, 48], Math.PI + 0.3, 2.0);
    add(neonTextTexture('MALIBU CLUB', '#ff5fa2'), 14, 3, [-20, 10, 45], Math.PI - 0.3, 2.4, slow);
  }

  // ------------------------------------------------------------------ people
  _people() {
    const crowd = this.crowd;
    if (!crowd) return;
    const low = this.ctx.quality === 'low';
    // walkers first (they must survive the low-quality cap): sidewalk loop around the whole track, crossing the
    // street on the zebra crossings far behind each camera
    const loopX = 8.05;
    crowd.walkers({
      loop: [[loopX, 15], [loopX, -15], [loopX - 0.6, -17.5], [-loopX + 0.6, -17.5], [-loopX, -15], [-loopX, 15], [-loopX + 0.6, 17.5], [loopX - 0.6, 17.5]],
      count: low ? 4 : 8, looks: ['street', 'racer', 'beach', 'club'], spread: 0.22, stops: 0.3,
      pauses: ['point', 'phone', 'talk', 'wave_flag', 'idle', 'point'],
    });
    crowd.groundAt = (x) => (Math.abs(x) > 7.6 && Math.abs(x) < 13.6 ? WALK_Y : STREET_Y);
    for (const z of LAMP_Z) { crowd.addObstacle(-7.3, z, 0.35); crowd.addObstacle(7.3, z, 0.35); }
    for (const [x, z] of palmObstacles()) crowd.addObstacle(x, z, 0.4);

    // race fans behind the barriers (street level between barrier and fence), leaving gaps at the lamps
    const zs = [-5.1, -2.7, -1.7, -0.6, 0.5, 1.6, 2.7, 5.0, -9.4, -10.6, 9.4, 10.6];
    const fans = [];
    for (const sx of [-1, 1]) {
      const n = low ? 5 : zs.length;
      zs.slice(0, n).forEach((z, i) => {
        const anims = sx < 0 ? ['cheer', 'idle', 'talk', 'phone', 'clap', 'drink', 'point'] : ['idle', 'clap', 'talk', 'cheer', 'drink', 'phone'];
        fans.push({
          at: [sx * (7.4 + ((i * 37) % 5) * 0.06), z + (((i * 53) % 7) - 3) * 0.04], y: STREET_Y, face: 'board',
          anim: anims[(i * 3 + (sx > 0 ? 1 : 0)) % anims.length], look: sx < 0 ? 'racer' : 'street',
        });
      });
    }
    // the flag waver at the start line
    fans.push({ at: [-7.45, 0.0], y: STREET_Y, face: 'board', anim: 'wave_flag', look: 'racer', prop: 'flag' });
    crowd.spawn(fans);
    // a few groups hanging out on the sidewalks near the lamps and shops
    if (!low) {
      crowd.cluster({ center: [11.8, -3.2], count: 3, radius: 0.75, anims: ['talk', 'drink', 'idle'], look: 'club', y: WALK_Y });
      crowd.cluster({ center: [-11.9, 6.5], count: 3, radius: 0.7, anims: ['talk', 'phone', 'idle'], look: 'beach', y: WALK_Y });
      crowd.spawn([{ at: [12.6, 8.4], y: WALK_Y, face: [11, 6], anim: 'lean', look: 'street' }]);
    }
  }

  update(dt, t) {
    for (const u of this._updaters) u(t);
    for (const s of this._signs) s.userData.update(t, this.reducedMotion);
  }
}

function palmObstacles() {
  // mirrors the sidewalk palm placement in build() (same seed) so walkers step around trunks
  const r = rng(42);
  const out = [];
  for (const sx of [-1, 1]) for (let z = -30; z <= 18; z += 5.2) { const x = sx * (9.6 + r() * 1.6); out.push([x, z + r() * 1.5]); }
  return out;
}

function barrierTex(base) {
  const r = rng(3);
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1200, (rr) => `rgba(${40 + rr * 60},${40 + rr * 40},${40 + rr * 40},${0.08 + rr * 0.15})`, r);
    g.fillStyle = 'rgba(30,20,20,0.35)'; g.fillRect(0, h - 8, w, 8);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 8; i++) g.fillRect(r() * w, h - 14 - r() * 10, 20 + r() * 40, 2);
  });
}
