// NpcCrowd: the people living around the board. API contract: docs/arenas/ARENAS_SPEC.md §3 "NPCs".
//
//   crowd.spawn([{ at:[x,z], y, face:'board'|[x,z]|yaw, anim, look, colors, body, prop, path, speed, loop, react, scale }])
//   crowd.cluster({ center, count, radius, anims, look, … })   crowd.line({ from, to, count, face, anims, look, jitter, … })
//   crowd.walkers({ loop:[[x,z],...], count, look, speed, stops, pauses, ... })  // wandering people on a loop
//   crowd.orbit({ halfW, halfL, count, ... })                                 // loop all the way around the board
//   crowd.addObstacle(x, z, r) / crowd.addObstacles([[x,z,r],...])            // walkers steer around these
//   crowd.setAnim(npc, name, { fade, duration })   crowd.remove(npc)   crowd.react(event, data)   crowd.update(dt, t, camera)
//
// Walkers wander: walk a stretch -> sometimes pause 2-6 s (point at the game / phone / talk / wave / watch) -> carry
// on, with eased starts/stops, smooth turning, walk-clip speed matched to ground speed (no ice-skating) and simple
// separation from other NPCs, obstacles and the board. If an arena declares no walkers, finalize() adds a default
// orbit loop around the board (set `arena.autoWalkers = false` to opt out).
//
// Characters come from NpcAssets (rigged Blender GLBs, or the procedural fallback people — same skeleton bone
// names, same code path). Each NPC = one skinned mesh (single shared vertex-colour material, per-NPC colour
// attribute) + one AnimationMixer. Mixers of far / off-screen NPCs update at a reduced rate; one instanced blob
// shadow per NPC; real shadow casting only for the ~8 NPCs nearest the board whose shadow can't reach the board.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { STREET_Y } from '../../Board.js';
import { rng } from '../../util.js';
import { proceduralAssets, ROLE, ROLE_COUNT } from './procRig.js';
import { LOOKS, SKINS, HAIRS, pick } from './looks.js';

export const NPC_ANIMS = ['idle', 'talk', 'phone', 'cheer', 'clap', 'dance', 'lean', 'sit', 'walk', 'wave_flag', 'drink', 'point',
  'dance2', 'sit_ground', 'crossed'];
const AUTO_PROP = { phone: 'phone', drink: 'drink', wave_flag: 'flag' };
const EYES = new THREE.Color('#1a1216');
const MAX_SHADOW_CASTERS = 8;
const BOARD_HALF = 4.9; // plinth edge
const KEEP_OUT = 5.7;   // walkers never enter |x|,|z| < KEEP_OUT (board + kerb)
const PAUSES = ['point', 'phone', 'talk', 'wave_flag', 'idle', 'point', 'idle'];

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

const angleDelta = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export class NpcCrowd {
  /** @param opts { scene, reducedMotion, quality:'high'|'low', assets (from loadNpcAssets; procedural if omitted), seed } */
  constructor({ scene = null, reducedMotion = false, quality = 'high', assets = null, seed = 4242 } = {}) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    this.assets = assets || proceduralAssets();
    this.group = new THREE.Group();
    this.group.name = 'crowd';
    this.npcs = [];
    this.max = quality === 'low' ? 20 : 40;
    this._r = rng(seed);
    this._t = 0;
    this._frame = 0;
    this._attrs = new Map();    // base → crowd-local shared attributes (disposed with the crowd only)
    this._retired = [];         // per-NPC GPU resources of removed NPCs, disposed with the crowd
    this._shadowDirty = true;
    this._sunDir = null;
    this._wantedLevel = 0;
    this._blobs = null;
    this._warned = false;
    this.obstacles = [];        // [x, z, r]
    this.groundAt = null;       // optional (x, z) => ground y for walkers (steps, sidewalks)
  }

  /** 'glb' (rigged Blender characters) or 'procedural' (fallback people). */
  get backend() { return this.assets.kind; }
  get count() { return this.npcs.length; }

  /** Parent the crowd under an arena group (so it is removed with it). */
  attach(parent) { parent.add(this.group); }

  /** Called by ArenaManager after arena.build(): picks up the arena's shadow-casting sun. */
  finalize(arena) {
    let sun = arena?.sun?.isDirectionalLight && arena.sun.castShadow ? arena.sun : null;
    if (!sun && arena?.group) arena.group.traverse((o) => { if (!sun && o.isDirectionalLight && o.castShadow) sun = o; });
    if (sun) {
      sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true);
      this._sunDir = new THREE.Vector3().setFromMatrixPosition(sun.matrixWorld)
        .sub(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld)).normalize();
    }
    // default "orbit the board" walkers when the arena declared none
    if (arena && arena.autoWalkers !== false && this.walkerCount === 0) {
      const want = this.quality === 'low' ? 4 : 8;
      const room = Math.max(0, this.max - this.npcs.length);
      const count = Math.min(want, room);
      if (count > 0) this.orbit({ count, look: arena.walkerLook || 'street', y: arena.walkerY ?? STREET_Y, ...(arena.walkerOrbit || {}) });
    }
    this._shadowDirty = true;
  }

  // =================================================================== spawning
  /** Spawn NPCs from placement specs (see spec). Returns the created handles. */
  spawn(list = []) {
    const out = [];
    for (const spec of list || []) {
      if (this.npcs.length >= this.max && (spec?.priority || spec?.path)) {
        // walkers / priority extras (e.g. boss-variant NPCs) replace the most recent generic standing NPC
        let k = this.npcs.length - 1;
        while (k >= 0 && (this.npcs[k].walker || this.npcs[k].spec.priority)) k--;
        if (k >= 0) this.remove(this.npcs[k]);
      }
      if (this.npcs.length >= this.max) {
        if (!this._warned) { this._warned = true; console.info(`[npc] crowd capped at ${this.max} (quality ${this.quality})`); }
        break;
      }
      try { out.push(this._spawnOne(spec || {})); } catch (e) { console.warn('[npc] spawn failed', e); }
    }
    this._shadowDirty = true;
    this._blobsDirty = true;
    return out;
  }

  cluster({ center = [0, 0], count = 4, radius = 1, anims = ['talk', 'idle'], look = 'street', y, ...rest } = {}) {
    const r = this._r;
    const list = [];
    const a0 = r() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = a0 + (i / count) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const rr = radius * (0.85 + r() * 0.3);
      const at = [center[0] + Math.cos(a) * rr, center[1] + Math.sin(a) * rr];
      list.push({ at, y, face: center, anim: anims[i % anims.length], look, ...rest });
    }
    return this.spawn(list);
  }

  line({ from = [0, 0], to = [1, 0], count = 5, face = 'board', anims = ['idle', 'cheer', 'talk'], look = 'street', jitter = 0.25, y, ...rest } = {}) {
    const r = this._r;
    const list = [];
    for (let i = 0; i < count; i++) {
      const k = count === 1 ? 0.5 : i / (count - 1);
      const at = [from[0] + (to[0] - from[0]) * k + (r() - 0.5) * jitter, from[1] + (to[1] - from[1]) * k + (r() - 0.5) * jitter];
      list.push({ at, y, face, anim: anims[Math.floor(r() * anims.length)], look, ...rest });
    }
    return this.spawn(list);
  }

  /**
   * Wandering walkers on a waypoint loop (closed polygon unless closed:false -> ping-pong). Walkers are spread along
   * the loop, some walk it in reverse, each keeps a small lateral offset so they don't share one line.
   * opts: { loop|path: [[x,z],...], count=6, look|looks, speed=[1.0,1.4], reverse=0.5, spread=0.35, stops=0.3,
   *         pauses=[...anims], pauseTime=[2,6], spacing=2.2 (waypoint resample, m), y, closed=true, ...spawn spec }
   */
  walkers({ loop, path, count = 6, look = 'street', looks = null, speed = [1.0, 1.4], reverse = 0.5, spread = 0.35,
    stops = 0.3, pauses = PAUSES, pauseTime = [2, 6], spacing = 2.2, closed = true, y, ...rest } = {}) {
    const pts0 = loop || path;
    if (!Array.isArray(pts0) || pts0.length < 2) return [];
    const r = this._r;
    const base = resample(pts0, spacing, closed);
    const lens = [0];
    for (let i = 1; i < base.length; i++) lens.push(lens[i - 1] + Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]));
    const total = lens[lens.length - 1] + (closed ? Math.hypot(base[0][0] - base.at(-1)[0], base[0][1] - base.at(-1)[1]) : 0);
    const list = [];
    for (let k = 0; k < count; k++) {
      const off = (r() - 0.5) * 2 * spread;
      let pts = offsetPath(base, off, closed);
      const along = ((k + r() * 0.6) / count) * total;
      let idx = 0;
      while (idx < pts.length - 1 && lens[idx + 1] <= along) idx++;
      let start = (idx + 1) % pts.length;
      if (r() < reverse) {
        pts = pts.slice().reverse();
        idx = pts.length - 1 - idx;
        start = (idx + 1) % pts.length;
      }
      const sp = Array.isArray(speed) ? speed[0] + r() * (speed[1] - speed[0]) : speed;
      list.push({
        at: pts[idx], path: pts, startIndex: start, loop: closed, speed: sp, y,
        look: looks ? looks[k % looks.length] : look, wander: { stops, pauses, pauseTime }, ...rest,
      });
    }
    return this.spawn(list);
  }

  /** Default loop all the way around the play area: long sides at x=+-halfW, crossings at z=+-halfL (behind the cameras). */
  orbit({ halfW = 6.8, halfL = 13, corner = 1.6, ...opts } = {}) {
    const c = corner;
    const loop = [[halfW, halfL - c], [halfW, -halfL + c], [halfW - c, -halfL], [-halfW + c, -halfL], [-halfW, -halfL + c],
      [-halfW, halfL - c], [-halfW + c, halfL], [halfW - c, halfL]];
    return this.walkers({ loop, ...opts });
  }

  addObstacle(x, z, r = 0.5) { this.obstacles.push([x, z, r]); }
  addObstacles(list = []) { for (const o of list) if (Array.isArray(o)) this.addObstacle(o[0], o[1], o[2] ?? 0.5); }

  get walkerCount() { return this.npcs.reduce((n, q) => n + (q.walker ? 1 : 0), 0); }

  _pickBase(spec) {
    const bases = this.assets.bases;
    const r = this._r;
    let pool = bases;
    if (spec.look && bases.some((b) => b.looks)) {
      const byLook = bases.filter((b) => b.looks && b.looks.includes(spec.look));
      if (byLook.length) {
        // prefer outfits whose primary family is this look
        const primary = byLook.filter((b) => b.looks[0] === spec.look);
        pool = primary.length && r() < 0.6 ? primary : byLook;
      }
    }
    if (spec.body) {
      const byBody = pool.filter((b) => b.body === spec.body);
      if (byBody.length) pool = byBody;
    }
    return pick(pool, r);
  }

  _crowdAttrs(base) {
    let a = this._attrs.get(base);
    if (!a) {
      const g = base.geometry;
      const copy = (attr) => new THREE.BufferAttribute(attr.array, attr.itemSize, attr.normalized);
      a = {
        position: copy(g.attributes.position), normal: copy(g.attributes.normal),
        skinIndex: copy(g.attributes.skinIndex), skinWeight: copy(g.attributes.skinWeight),
        index: g.index ? copy(g.index) : null,
      };
      this._attrs.set(base, a);
    }
    return a;
  }

  _colors(spec, base) {
    const r = this._r;
    const look = LOOKS[spec.look] || LOOKS.street;
    const c = spec.colors || {};
    const col = (hex) => new THREE.Color(hex);
    const top = col(c.top || pick(look.top, r));
    const bottom = col(c.bottom || pick(look.bottom, r));
    const skin = col(c.skin || pick(SKINS, r));
    const hair = col(c.hair || pick(base.hair || HAIRS, r));
    const shoes = col(c.shoes || pick(look.shoes || ['#222222'], r));
    const accent = col(c.accent || pick(look.accent || ['#ffffff'], r));
    const longSleeves = r() < (look.longSleeves ?? 0.4);
    const longPants = r() < (look.longPants ?? 0.7);
    const roles = new Array(ROLE_COUNT);
    roles[ROLE.TOP] = top; roles[ROLE.BOTTOM] = bottom; roles[ROLE.SKIN] = skin; roles[ROLE.HAIR] = hair;
    roles[ROLE.SHOES] = shoes; roles[ROLE.ACCENT] = accent; roles[ROLE.EYES] = EYES;
    roles[ROLE.FOREARM] = longSleeves ? top : skin;
    roles[ROLE.SHIN] = longPants ? bottom : skin;
    return roles;
  }

  _spawnOne(spec) {
    const r = this._r;
    const base = this._pickBase(spec);
    const model = SkeletonUtils.clone(base.template);
    let mesh = null;
    model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'npc_body') mesh = o; });
    if (!mesh) throw new Error('npc template without npc_body');

    // per-NPC geometry: crowd-shared attributes + own colour attribute
    const a = this._crowdAttrs(base);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', a.position); geo.setAttribute('normal', a.normal);
    geo.setAttribute('skinIndex', a.skinIndex); geo.setAttribute('skinWeight', a.skinWeight);
    if (a.index) geo.setIndex(a.index);
    const n = a.position.count;
    const colors = new Float32Array(n * 3);
    const roleCols = this._colors(spec, base);
    const roles = base.roles, fixed = base.fixed;
    for (let i = 0; i < n; i++) {
      const role = roles[i];
      if (role === 255) { colors[i * 3] = fixed[i * 3]; colors[i * 3 + 1] = fixed[i * 3 + 1]; colors[i * 3 + 2] = fixed[i * 3 + 2]; }
      else { const c = roleCols[role] || roleCols[ROLE.TOP]; colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.boundingSphere = base.geometry.boundingSphere ? base.geometry.boundingSphere.clone() : null;
    mesh.geometry = geo;
    mesh.material = this.assets.material;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // generous local bounds so animated limbs are never culled early
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.35);

    const root = new THREE.Group();
    root.name = 'npc';
    model.rotation.y = this.assets.facing < 0 ? Math.PI : 0; // models face −Z; root yaw uses +Z-forward convention
    root.add(model);
    const s = (spec.scale || 1) * (0.93 + r() * 0.14);
    root.scale.setScalar(s);

    const walker = Array.isArray(spec.path) && spec.path.length >= 2;
    const [x, z] = spec.at || (walker ? spec.path[0] : [0, 0]);
    const y = spec.y ?? (walker && spec.path[0].length > 2 ? spec.path[0][2] : STREET_Y);
    root.position.set(x, y, z);
    let yaw = 0;
    const f = spec.face ?? 'board';
    const startIndex = walker ? Math.min(spec.path.length - 1, Math.max(0, spec.startIndex ?? 1)) : 0;
    if (walker) { const p1 = spec.path[startIndex]; yaw = Math.atan2(p1[0] - x, p1[1] - z); }
    else if (f === 'board') yaw = Math.atan2(-x, -z);
    else if (Array.isArray(f)) yaw = Math.atan2(f[0] - x, f[1] - z);
    else if (typeof f === 'number') yaw = f;
    root.rotation.y = yaw;

    const anim = walker ? 'walk' : (NPC_ANIMS.includes(spec.anim) ? spec.anim : 'idle');
    const npc = {
      root, model, mesh, spec, base: anim, anim: null, yaw, baseYaw: yaw, yawTarget: null,
      mixer: new THREE.AnimationMixer(model), action: null, acc: 0, idx: this.npcs.length,
      timeScale: (0.9 + r() * 0.2) * (this.reducedMotion ? 0.55 : 1),
      react: spec.react !== false, walker, until: 0, pending: null,
      path: walker ? spec.path : null, target: startIndex, dirStep: 1,
      speed: Math.min(1.5, (spec.speed || 1.2) * (0.94 + r() * 0.12)) * (this.reducedMotion ? 0.6 : 1),
      loop: spec.loop !== false, y, scale: s, prop: null,
      // wander state
      v: 0, state: 'walk', stateUntil: 0, faceYaw: null, activity: null,
      wander: walker && spec.wander !== false ? { stops: 0.25, pauses: PAUSES, pauseTime: [2, 6], ...(spec.wander || {}) } : null,
      nextStopOk: 3 + r() * 6,
    };
    if (walker) npc.v = npc.speed * (0.6 + r() * 0.4);
    // held prop
    let propName = spec.prop === undefined ? (walker ? null : AUTO_PROP[anim]) : spec.prop;
    if (propName === 'cup') propName = 'drink';
    if (propName) this._attachProp(npc, propName);
    // a drink in hand reads better with the drink idle
    if (propName === 'drink' && anim === 'idle') npc.base = 'drink';

    this._play(npc, npc.base, 0, true);
    npc.mixer.update(r() * 0.05);
    this.group.add(root);
    this.npcs.push(npc);
    return npc;
  }

  _attachProp(npc, name) {
    const hand = npc.model.getObjectByName('hand_R');
    if (!hand) return;
    if (name === 'phone') {
      let built = null;
      npc.model.traverse((o) => { if (!built && /PROP_PHONE/i.test(o.name)) built = o; });
      if (built) { built.visible = true; npc.prop = built; return; }
    }
    const tmpl = this.assets.props?.[name];
    if (!tmpl) return;
    const p = tmpl.clone(true);
    p.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.visible = true; } });
    // procedural props are authored for a hand bone pointing down its −Y; Blender bones point along +Y
    if (this.assets.kind === 'glb' && !tmpl.userData.glbProp) p.rotation.x = Math.PI;
    hand.add(p);
    npc.prop = p;
  }

  // =================================================================== animation
  _clip(name) {
    const c = this.assets.clips;
    return c.get(name) || c.get('idle') || c.values().next().value;
  }

  _play(npc, name, fade = 0.35, randomStart = false) {
    const clip = this._clip(name);
    if (!clip) return;
    const act = npc.mixer.clipAction(clip);
    npc.anim = name;
    if (npc.action === act && act.isRunning()) return;
    act.reset();
    act.enabled = true;
    act.setEffectiveWeight(1);
    act.setEffectiveTimeScale(npc.timeScale);
    act.setLoop(THREE.LoopRepeat, Infinity);
    if (randomStart) act.time = this._r() * clip.duration;
    act.play();
    const prev = npc.action;
    if (prev && prev !== act) {
      if (fade > 0) act.crossFadeFrom(prev, fade, false);
      else prev.stop();
    }
    npc.action = act;
  }

  /** Switch an NPC's animation (returns to its base anim after `duration` s when > 0). */
  setAnim(npc, name, { fade = 0.35, duration = 0 } = {}) {
    if (!npc || !npc.mixer) return;
    const a = NPC_ANIMS.includes(name) ? name : 'idle';
    if (duration > 0) { this._play(npc, a, fade); npc.until = this._t + duration; }
    else { npc.base = a; npc.until = 0; this._play(npc, a, fade); }
  }

  /** Remove one NPC (GPU resources are released with the crowd). */
  remove(npc) {
    const i = this.npcs.indexOf(npc);
    if (i < 0) return;
    this.npcs.splice(i, 1);
    this.npcs.forEach((q, k) => { q.idx = k; });
    npc.root.removeFromParent();
    npc.mixer.stopAllAction();
    this._retired.push(npc);
    this._blobsDirty = true;
    this._shadowDirty = true;
  }

  // =================================================================== reactions
  react(event, data = {}) {
    const t = this._t;
    const r = this._r;
    const pool = this.npcs.filter((n) => n.react);
    if (!pool.length) return;
    const standing = pool.filter((n) => !n.walker);
    const walkers = pool.filter((n) => n.walker);
    const schedule = (n, anim, delay, dur, face = null) => {
      n.pending = { anim, at: t + delay, until: t + delay + dur, face };
    };
    const sitting = (n) => n.base === 'sit' || n.base === 'sit_ground';
    if (event === 'capture') {
      const at = squareXZ(data.square) || [0, 0];
      for (const n of standing) {
        if (r() > 0.5) continue;
        schedule(n, sitting(n) ? 'clap' : (r() < 0.6 ? 'cheer' : 'clap'), r() * 0.6, 1.5 + r() * 1.0);
      }
      // nearby walkers stop, turn toward the explosion and point / cheer before moving on
      for (const n of walkers) {
        const d = Math.hypot(n.root.position.x - at[0], n.root.position.z - at[1]);
        if (d > 11 || r() > 0.8) continue;
        schedule(n, r() < 0.55 ? 'point' : 'cheer', 0.1 + r() * 0.5, 1.8 + r() * 1.2, at);
      }
    } else if (event === 'finale') {
      for (const n of standing) {
        if (r() > 0.85) continue;
        schedule(n, sitting(n) ? 'clap' : (r() < 0.75 ? 'cheer' : 'clap'), r() * 0.8, 5.5 + r() * 1.0);
      }
      for (const n of walkers) schedule(n, r() < 0.7 ? 'cheer' : 'clap', r() * 0.6, 5.5 + r() * 1.0, [0, 0]);
    } else if (event === 'wanted') {
      const level = Number(data.level) || 0;
      if (level >= 3 && level > this._wantedLevel) {
        const up = pool.filter((n) => !sitting(n));
        up.sort((a, b) => a.root.position.lengthSq() - b.root.position.lengthSq());
        const few = up.slice(0, 8).sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 3));
        for (const n of few) schedule(n, 'point', r() * 0.5, 2.2 + r() * 1.2, [0, 0]);
      }
      this._wantedLevel = level;
    } else if (event === 'check') {
      for (const n of pool) if (r() < 0.15) schedule(n, 'point', r() * 0.4, 1.4 + r() * 0.6, [0, 0]);
    } else if (event === 'start') {
      for (const n of standing) if (r() < 0.35) schedule(n, 'clap', r() * 0.6, 1.2 + r() * 0.8);
    }
  }

  // =================================================================== per frame
  update(dt, t, camera) {
    this._t = t;
    this._frame++;
    if (!this.npcs.length) return;
    if (this._shadowDirty) this._updateShadowCasters();
    let haveFrustum = false;
    if (camera) {
      camera.updateMatrixWorld();
      _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pv);
      haveFrustum = true;
    }
    const cam = camera ? camera.position : null;
    let moved = false;
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      // scheduled reactions
      if (n.pending && t >= n.pending.at) {
        const p = n.pending;
        n.pending = null;
        const faceYaw = p.face ? Math.atan2(p.face[0] - n.root.position.x, p.face[1] - n.root.position.z) : null;
        if (n.walker) {
          n.state = 'react'; n.stateUntil = p.until; n.activity = p.anim; n.faceYaw = faceYaw ?? n.yaw;
        } else {
          this._play(n, p.anim, 0.25);
          n.until = p.until;
          if (faceYaw !== null) n.yawTarget = faceYaw;
        }
      }
      if (n.until && t >= n.until) {
        n.until = 0;
        this._play(n, n.base, 0.45);
        n.yawTarget = n.baseYaw;
      }
      if (n.walker) { this._walk(n, dt, t); moved = true; }
      else if (n.yawTarget !== null) {
        const d = angleDelta(n.yaw, n.yawTarget);
        if (Math.abs(d) < 0.01) { n.yaw = n.yawTarget; n.yawTarget = null; } else n.yaw += d * Math.min(1, dt * 4);
        n.root.rotation.y = n.yaw;
      }
      // throttled mixer update
      let interval = 1;
      if (haveFrustum) {
        _sphere.center.set(n.root.position.x, n.root.position.y + 0.95 * n.scale, n.root.position.z);
        _sphere.radius = 1.2 * n.scale;
        const visible = _frustum.intersectsSphere(_sphere);
        const d2 = cam.distanceToSquared(_sphere.center);
        interval = !visible ? 4 : d2 > 26 * 26 ? 3 : d2 > 14 * 14 ? 2 : 1;
      }
      n.acc += dt;
      if ((this._frame + i) % interval === 0) { n.mixer.update(n.acc); n.acc = 0; }
    }
    if (moved || this._blobsDirty) this._updateBlobs();
  }

  _walk(n, dt, t) {
    const pos = n.root.position;
    const r = this._r;
    const pts = n.path;
    // ---- state machine: walk <-> pause (wander) / react
    if (n.state !== 'walk' && t >= n.stateUntil) {
      n.state = 'walk'; n.activity = null; n.faceYaw = null;
      n.nextStopOk = t + 5 + r() * 8;
    }
    let tgt = pts[n.target];
    let dx = tgt[0] - pos.x, dz = tgt[1] - pos.z;
    if (n.state === 'walk' && dx * dx + dz * dz < 0.5 * 0.5) {
      if (n.loop) n.target = (n.target + 1) % pts.length;
      else {
        if (n.target + n.dirStep >= pts.length || n.target + n.dirStep < 0) n.dirStep = -n.dirStep;
        n.target += n.dirStep;
      }
      tgt = pts[n.target];
      dx = tgt[0] - pos.x; dz = tgt[1] - pos.z;
      const w = n.wander;
      if (w && t >= n.nextStopOk && r() < w.stops) this._pause(n, t);
    }
    // ---- steering: toward the next waypoint + separation (NPCs, obstacles, board keep-out)
    const dl = Math.hypot(dx, dz) || 1;
    const hx = dx / dl, hz = dz / dl;
    let sx = 0, sz = 0, blocked = 1;
    const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
    for (const o of this.npcs) {
      if (o === n) continue;
      const ox = pos.x - o.root.position.x, oz = pos.z - o.root.position.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > 1.44 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const w = (1.2 - d) / 1.2;
      sx += (ox / d) * w; sz += (oz / d) * w;
      // someone right ahead -> slow down (queue behind / step around)
      const ahead = -(ox * fx + oz * fz) / d;
      if (ahead > 0.6 && d < 1.0) blocked = Math.min(blocked, Math.max(0.15, (d - 0.45) / 0.55));
    }
    for (const [ox0, oz0, rr] of this.obstacles) {
      const ox = pos.x - ox0, oz = pos.z - oz0;
      const d = Math.hypot(ox, oz);
      const lim = rr + 0.7;
      if (d > lim || d < 1e-6) continue;
      const w = (lim - d) / lim;
      sx += (ox / d) * w * 1.6; sz += (oz / d) * w * 1.6;
    }
    const ax = Math.abs(pos.x), az = Math.abs(pos.z);
    if (ax < KEEP_OUT + 0.8 && az < KEEP_OUT + 0.8) {
      if (ax > az) sx += Math.sign(pos.x) * (KEEP_OUT + 0.8 - ax) * 2;
      else sz += Math.sign(pos.z) * (KEEP_OUT + 0.8 - az) * 2;
    }
    const want = n.state === 'walk' ? Math.atan2(hx + sx * 1.3, hz + sz * 1.3) : (n.faceYaw ?? n.yaw);
    const d = angleDelta(n.yaw, want);
    const turn = (n.state === 'walk' ? 2.4 : 3.2) * dt;
    n.yaw += Math.abs(d) <= turn ? d : Math.sign(d) * turn;
    // ---- speed with easing (accelerate ~1.2 m/s^2, brake ~2 m/s^2)
    const align = Math.cos(angleDelta(n.yaw, Math.atan2(hx, hz)));
    const vWant = n.state === 'walk' ? n.speed * Math.max(0.35, Math.min(1, 0.35 + 0.65 * align)) * blocked : 0;
    const dv = vWant - n.v;
    n.v += Math.max(-2.0 * dt, Math.min(1.2 * dt, dv));
    if (n.v < 0) n.v = 0;
    pos.x += Math.sin(n.yaw) * n.v * dt;
    pos.z += Math.cos(n.yaw) * n.v * dt;
    // separation also nudges standing walkers apart so bodies never interpenetrate
    if (n.state !== 'walk' && (sx || sz)) { pos.x += sx * 0.25 * dt; pos.z += sz * 0.25 * dt; }
    n.root.rotation.y = n.yaw;
    // ground height: per-NPC spec.ground(x,z) → crowd.groundAt(x,z) → waypoint y ([x, z, y] paths)
    const gfn = n.spec.ground || this.groundAt;
    let gy0 = gfn ? gfn(pos.x, pos.z) : undefined;
    if (!Number.isFinite(gy0) && pts[n.target].length > 2) {
      const prev = pts[(n.target - (n.loop ? 1 : n.dirStep) + pts.length) % pts.length];
      const cur = pts[n.target];
      const seg = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) || 1;
      const k = Math.max(0, Math.min(1, 1 - Math.hypot(cur[0] - pos.x, cur[1] - pos.z) / seg));
      gy0 = (prev[2] ?? n.y) + ((cur[2] ?? n.y) - (prev[2] ?? n.y)) * k;
    }
    if (Number.isFinite(gy0)) {
      const gy = gy0;
      if (Number.isFinite(gy)) { n.y = gy; pos.y += (gy - pos.y) * Math.min(1, dt * 10); }
    }
    // ---- animation: walk clip speed follows ground speed; activity once (nearly) stopped
    if (n.state === 'walk' || n.v > 0.25) {
      if (n.anim !== 'walk') this._play(n, 'walk', 0.3);
      const clipSpeed = n.action?.getClip().userData?.speed || 1.2;
      n.action?.setEffectiveTimeScale(Math.max(0.05, n.v / (clipSpeed * n.scale)));
    } else if (n.activity && n.anim !== n.activity) {
      this._play(n, n.activity, 0.4);
    }
  }

  _pause(n, t) {
    const r = this._r;
    const w = n.wander;
    const act = pick(w.pauses || PAUSES, r);
    let face = [0, 0]; // look at the game by default
    if (act === 'talk') {
      // talk to the nearest standing NPC if one is close, else to the board
      let best = null, bd = 16;
      for (const o of this.npcs) {
        if (o === n || o.walker) continue;
        const d2 = o.root.position.distanceToSquared(n.root.position);
        if (d2 < bd) { bd = d2; best = o; }
      }
      if (best) face = [best.root.position.x, best.root.position.z];
    } else if (act === 'phone') face = null;
    n.state = 'pause';
    n.activity = act;
    n.faceYaw = face ? Math.atan2(face[0] - n.root.position.x, face[1] - n.root.position.z) : n.yaw;
    const [a, b] = w.pauseTime || [2, 6];
    n.stateUntil = t + a + r() * (b - a);
  }

  _updateShadowCasters() {
    this._shadowDirty = false;
    const sd = this._sunDir;
    const cand = [];
    for (const n of this.npcs) {
      n.mesh.castShadow = false;
      if (n.walker || !sd || sd.y < 0.05) continue;
      const p = n.root.position;
      if (Math.abs(p.x) > 12 || Math.abs(p.z) > 12) continue; // outside the board-sized shadow frustum anyway
      // tip of the shadow of a 1.9 m person on the ground plane
      const h = 1.9 * n.scale;
      const tx = p.x - (sd.x / sd.y) * h, tz = p.z - (sd.z / sd.y) * h;
      const hits = (x, z) => Math.abs(x) < BOARD_HALF && Math.abs(z) < BOARD_HALF;
      if (hits(tx, tz) || hits((p.x + tx) / 2, (p.z + tz) / 2)) continue;
      cand.push(n);
    }
    cand.sort((a, b) => a.root.position.lengthSq() - b.root.position.lengthSq());
    for (const n of cand.slice(0, MAX_SHADOW_CASTERS)) n.mesh.castShadow = true;
  }

  _ensureBlobs() {
    if (this._blobs) return this._blobs;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.4)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.55,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, this.max);
    mesh.name = 'npc_blobs';
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this._blobs = { mesh, geo, mat, tex };
    return this._blobs;
  }

  _updateBlobs() {
    this._blobsDirty = false;
    const b = this._ensureBlobs();
    const list = this.npcs;
    b.mesh.count = list.length;
    _q.identity();
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const sit = n.base === 'sit';
      const w = (sit ? 0.95 : 0.75) * n.scale;
      _p.set(n.root.position.x, n.y + 0.012, n.root.position.z);
      _s.set(w, 1, w);
      b.mesh.setMatrixAt(i, _m4.compose(_p, _q, _s));
    }
    b.mesh.instanceMatrix.needsUpdate = true;
  }

  // =================================================================== cleanup
  _disposeNpc(n) {
    try { n.mixer.stopAllAction(); n.mixer.uncacheRoot(n.model); } catch (_) { /* ignore */ }
    n.mesh.geometry.dispose();
    n.mesh.skeleton?.dispose();
  }

  clear() {
    for (const n of this.npcs) { n.root.removeFromParent(); this._retired.push(n); }
    this.npcs = [];
    this._blobsDirty = true;
    // keep GPU resources until dispose(): other NPCs of this crowd may still share attributes
  }

  dispose() {
    this.clear();
    for (const n of this._retired) this._disposeNpc(n);
    this._retired = [];
    this._attrs.clear();
    if (this._blobs) {
      this._blobs.mesh.removeFromParent();
      this._blobs.mesh.dispose();
      this._blobs.geo.dispose(); this._blobs.mat.dispose(); this._blobs.tex.dispose();
      this._blobs = null;
    }
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------------ path helpers
function squareXZ(sq) {
  if (typeof sq !== 'string' || sq.length < 2) return null;
  const f = sq.charCodeAt(0) - 97, rk = Number(sq[1]) - 1;
  if (!(f >= 0 && f < 8 && rk >= 0 && rk < 8)) return null;
  return [f - 3.5, 3.5 - rk];
}

/** Insert points so consecutive waypoints are <= spacing apart (more chances to pause, smoother steering). */
function resample(pts, spacing, closed) {
  const out = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / spacing));
    for (let j = 0; j < k; j++) {
      const q = [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k];
      if (a[2] != null || b[2] != null) q.push((a[2] ?? b[2]) + (((b[2] ?? a[2]) - (a[2] ?? b[2])) * j) / k);
      out.push(q);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}

/** Offset a polyline sideways by `off` metres (per-vertex averaged normals). */
function offsetPath(pts, off, closed) {
  if (!off) return pts.map((p) => p.slice());
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return p.length > 2 ? [p[0] + tz * off, p[1] - tx * off, p[2]] : [p[0] + tz * off, p[1] - tx * off];
  });
}
