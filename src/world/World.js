// World: renderer, scene, camera + OrbitControls, post-processing (bloom → ACES OutputPass), render loop,
// input (click vs drag, hover) and the public World API consumed by GameController (PLAN §1.3).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Board } from './Board.js';
import { ArenaManager, guessQuality } from './arenas/ArenaManager.js';
import { DEFAULT_ARENA } from './arenas/registry.js';
import { Pieces, loadModels, setTeamColors } from './Pieces.js';
import { Effects } from './Effects.js';
import { Tweener, Ease, clamp } from './util.js';

const MODEL_NAMES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'palm', 'fence', 'barrier', 'streetlight'];
const CLICK_PX = 6;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // board surface, y = 0

/** Board square under a world-space x/z point (a1 at x=-3.5, z=+3.5), or null off the board. */
function sqFromXZ(x, z) {
  const f = Math.floor(x + 4), r = Math.floor(4 - z);
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? String.fromCharCode(97 + f) + (r + 1) : null;
}

// camera presets: spherical around a target (radius, polar φ from +Y, azimuth θ around Y; θ=0 → +Z side)
const PRESETS = {
  white: { target: [0, 0, -0.7], radius: 12, phi: 1.04, theta: 0 },
  black: { target: [0, 0, 0.7], radius: 12, phi: 1.04, theta: Math.PI },
  top: { target: [0, 0, 0], radius: 15.5, phi: 0.0008, theta: 0 },
  cinematic: { target: [0, 0.6, 0], radius: 10.2, phi: 1.3, theta: Math.PI * 0.2 },
};

export class World {
  constructor(containerEl) {
    this.el = containerEl;
    this.onSquareClick = null;
    this.onFx = null;
    this.onFrame = null;
    this.onArenaLoading = null; // (loading:boolean, {id, name}) => void
    this.inputEnabled = true;
    this.ready = false;
    this._side = 'w';
    this._preset = 'white';
    this._camTween = null;
    this._hoverSq = null;
    this._pointer = { down: null, ndc: new THREE.Vector2(), dirty: false, inside: false };
    this._selectedSq = null; // from highlight(): used by picking and drag-and-drop
    this._selectedColor = null;
    this._targets = new Set();
    this._raycaster = new THREE.Raycaster();
    this.tweener = new Tweener();
    this._t = 0;
    this._last = performance.now();
  }

  // ======================================================================= init
  async init({ onProgress, arena = DEFAULT_ARENA, variant = {} } = {}) {
    const progress = (p) => { try { onProgress && onProgress(clamp(p, 0, 1)); } catch (_) { /* ignore */ } };
    try {
      progress(0.02);
      this._setupRenderer();
      this._setupScene();
      let models = {};
      try { models = await loadModels(MODEL_NAMES, (p) => progress(0.05 + p * 0.75)); } catch (e) { console.warn('[world] model load', e); }
      this.models = models;
      const step = (name, fn) => { try { fn(); } catch (e) { console.error(`[world] ${name} failed`, e); } };
      try { await this.arenas.set(arena, { variant, fade: false }); } catch (e) { console.error('[world] arena failed', e); }
      progress(0.85);
      step('board', () => this.scene.add(this.board.build()));
      step('pieces', () => this.pieces.init(models));
      progress(0.92);
      this._applyPreset(this._preset, false);
      this._setupInput();
      this._setupFps();
      // warm up shaders so the first frame / first explosion don't hitch
      try {
        if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
      } catch (_) { /* ignore */ }
      this._warmupFx();
      this.renderer.setAnimationLoop(() => this._frame());
      this.ready = true;
      progress(1);
    } catch (e) {
      console.error('[world] init failed', e);
      progress(1);
    }
  }

  _setupRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
    r.setPixelRatio(this._pixelRatio());
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const c = r.domElement;
    c.style.display = 'block';
    c.style.width = '100%';
    c.style.height = '100%';
    c.style.touchAction = 'none';
    c.style.outline = 'none';
    this.el.appendChild(c);
    this.renderer = r;
    this.canvas = c;

    const { w, h } = this._size();
    r.setSize(w, h, false);
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1500);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1036);

    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.65, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.controls = new OrbitControls(this.camera, c);
    Object.assign(this.controls, {
      enablePan: false, enableDamping: true, dampingFactor: 0.08, minDistance: 6, maxDistance: 22,
      maxPolarAngle: THREE.MathUtils.degToRad(80), rotateSpeed: 0.7, zoomSpeed: 0.8, autoRotateSpeed: 0.55,
    });

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.el);
  }

  _setupScene() {
    this.arenas = new ArenaManager(this);
    this.board = new Board();
    this.effects = new Effects(this.scene);
    this.pieces = new Pieces({ tweener: this.tweener, effects: this.effects });
    this.scene.add(this.pieces.group);
    this.pieces.onFx = (name, data) => this._emitFx(name, data);
  }

  _warmupFx() {
    // pre-create pooled sprites/debris by running a hidden explosion far below the ground
    try {
      const e = this.effects;
      const saved = e._shake;
      e.playCaptureFx('a1', { type: 'p', color: 'w' });
      for (const p of e.parts) { p.obj.position.y -= 100; p.age = p.life; }
      e._flashE = 0; e._shake = saved; e.shakeOffset.set(0, 0, 0);
      e.update(0, 0);
      for (const sk of e._skids) sk.m.visible = false;
      this.renderer.compile(this.scene, this.camera);
    } catch (_) { /* ignore */ }
  }

  /** Device pixel ratio capped at 2 (1.5 on quality "low"). */
  _pixelRatio() {
    this._quality ??= guessQuality();
    return Math.min(window.devicePixelRatio || 1, this._quality === 'low' ? 1.5 : 2);
  }

  _setupFps() {
    try { if (new URLSearchParams(location.search).get('fps') !== '1') return; } catch (_) { return; }
    const d = document.createElement('div');
    Object.assign(d.style, {
      position: 'absolute', left: '6px', top: '6px', zIndex: 50, padding: '2px 6px', borderRadius: '4px',
      font: '12px/1.3 monospace', color: '#9dff3c', background: 'rgba(0,0,0,.55)', pointerEvents: 'none', whiteSpace: 'pre',
    });
    if (getComputedStyle(this.el).position === 'static') this.el.style.position = 'relative';
    this.el.appendChild(d);
    this._fps = { el: d, frames: 0, t0: performance.now() };
    this.renderer.info.autoReset = false; // count all composer passes of a frame
  }

  _tickFps(now) {
    const f = this._fps;
    f.frames++;
    if (now - f.t0 < 500) return;
    const fps = (f.frames * 1000) / (now - f.t0);
    const i = this.renderer.info;
    const crowd = this.arenas?.current?.crowd;
    f.el.textContent = `${fps.toFixed(0)} fps  ${i.render.calls} calls  ${(i.render.triangles / 1000).toFixed(0)}k tris
geo ${i.memory.geometries} tex ${i.memory.textures} prg ${i.programs?.length ?? '?'}  npc ${crowd ? crowd.count : 0}`;
    f.frames = 0; f.t0 = now;
  }

  _size() {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  _resize() {
    if (!this.renderer) return;
    const { w, h } = this._size();
    const pr = this._pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // keep the whole board framed on narrow screens
    if (!this._camTween && this._preset && !this._userMoved) this._applyPreset(this._preset, false);
  }

  // ======================================================================= camera
  _presetState(name) {
    const p = PRESETS[name] || PRESETS.white;
    const aspect = this.camera.aspect || 1.6;
    let fit = aspect < 1.25 ? Math.pow(1.25 / aspect, 0.85) : 1;
    if (name === 'cinematic') fit = Math.min(fit, 1.15); // stay inside the palm/fence ring
    let theta = p.theta;
    let phi = p.phi;
    if (name === 'top') theta = this._side === 'b' ? Math.PI : 0;
    if (name === 'cinematic') theta = (this._side === 'b' ? Math.PI : 0) + p.theta;
    return { target: new THREE.Vector3(...p.target), radius: p.radius * fit, phi, theta };
  }

  _currentState() {
    const off = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    return { target: this.controls.target.clone(), radius: s.radius, phi: s.phi, theta: s.theta };
  }

  _setCam(st) {
    const off = new THREE.Vector3().setFromSphericalCoords(st.radius, st.phi, st.theta);
    this.controls.target.copy(st.target);
    this.camera.position.copy(st.target).add(off);
    this.camera.lookAt(st.target);
  }

  _applyPreset(name, animate) {
    this._preset = name;
    const to = this._presetState(name);
    const cinematic = name === 'cinematic';
    this.controls.autoRotate = false;
    if (!animate) {
      this._camTween = null;
      this._setCam(to);
      this.controls.enabled = true;
      this.controls.autoRotate = cinematic;
      this.controls.update();
      return;
    }
    const from = this._currentState();
    // shortest azimuth path
    let dTheta = to.theta - from.theta;
    dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    // when flipping sides, swing around at a nicer height instead of going through the top
    const lift = Math.abs(dTheta) > 2.5 ? 0.25 : 0;
    this.controls.enabled = false;
    this._camTween = {
      t: 0, dur: Math.abs(dTheta) > 2.5 ? 1.6 : 1.2, from, to, dTheta, lift,
      done: () => { this.controls.enabled = true; this.controls.autoRotate = cinematic; },
    };
  }

  _updateCamTween(dt) {
    const tw = this._camTween;
    if (!tw) return;
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    const e = Ease.inOutCubic(k);
    const st = {
      target: tw.from.target.clone().lerp(tw.to.target, e),
      radius: tw.from.radius + (tw.to.radius - tw.from.radius) * e + Math.sin(Math.PI * e) * tw.lift * 4,
      phi: tw.from.phi + (tw.to.phi - tw.from.phi) * e - Math.sin(Math.PI * e) * tw.lift,
      theta: tw.from.theta + tw.dTheta * e,
    };
    st.phi = clamp(st.phi, 0.0005, THREE.MathUtils.degToRad(80));
    this._setCam(st);
    if (k >= 1) { this._camTween = null; tw.done(); }
  }

  // ======================================================================= input
  // Point-and-click and drag-and-drop both end in onSquareClick(square):
  //  - click: pointer moved < CLICK_PX between down and up
  //  - drag: press on a piece, move past CLICK_PX, release over a legal target (the piece follows the pointer)
  // Pressing on a piece while input is enabled grabs it instead of orbiting; dragging empty space still orbits.
  _setupInput() {
    const c = this.canvas;
    const toNdc = (e) => {
      const r = c.getBoundingClientRect();
      this._pointer.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const releaseControls = () => { if (!this._camTween) this.controls.enabled = true; };
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      toNdc(e);
      const d = { x: e.clientX, y: e.clientY, id: e.pointerId, sq: null, dragging: false, over: null };
      if (this.inputEnabled && this.onSquareClick) {
        const sq = this._pickPiece(this._pointer.ndc);
        if (sq) {
          d.sq = sq;
          this.controls.enabled = false; // this gesture moves the piece, not the camera
          try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
      }
      this._pointer.down = d;
    });
    c.addEventListener('pointermove', (e) => {
      toNdc(e);
      const d = this._pointer.down;
      if (d && d.sq && d.id === e.pointerId) {
        if (!d.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_PX) this._startDrag(d);
        if (d.dragging) this._updateDrag(d);
        if (d.sq) return;
      }
      if (e.pointerType === 'touch') return; // no hover on touch
      this._pointer.dirty = true; this._pointer.inside = true;
    });
    c.addEventListener('pointerup', (e) => {
      const d = this._pointer.down;
      this._pointer.down = null;
      if (!d || d.id !== e.pointerId) return;
      if (d.sq) releaseControls();
      if (d.dragging) { this._endDrag(d); this._pointer.dirty = true; return; }
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_PX) { this._userMoved = true; return; }
      toNdc(e);
      this._emitClick(this._pick(this._pointer.ndc));
    });
    c.addEventListener('pointerleave', () => { this._pointer.inside = false; this._pointer.dirty = true; });
    c.addEventListener('pointercancel', () => {
      const d = this._pointer.down;
      this._pointer.down = null;
      if (d?.sq) releaseControls();
      if (d?.dragging) { this.board.setHover(null); this.pieces.endDrag(d.sq); }
    });
    this.controls.addEventListener('start', () => { if (this._preset === 'cinematic') this.controls.autoRotate = false; });
  }

  _emitClick(sq) {
    if (this.onSquareClick) { try { this.onSquareClick(sq); } catch (err) { console.error(err); } }
  }

  _startDrag(d) {
    // the piece must be selected so its legal targets are known; pieces that can't be selected aren't dragged
    if (this._selectedSq !== d.sq) this._emitClick(d.sq);
    if (this._selectedSq !== d.sq || !this._targets.size || !this.inputEnabled) {
      d.sq = null;
      if (!this._camTween) this.controls.enabled = true;
      return;
    }
    d.dragging = true;
    this._hoverSq = null;
    this.pieces.setHover(null);
    this.canvas.style.cursor = 'grabbing';
  }

  _updateDrag(d) {
    const g = this._groundPoint(this._pointer.ndc);
    if (!g) return;
    this.pieces.dragTo(d.sq, clamp(g.x, -4.4, 4.4), clamp(g.z, -4.4, 4.4));
    d.over = sqFromXZ(g.x, g.z);
    this.board.setHover(d.over && this._targets.has(d.over) ? d.over : null);
  }

  _endDrag(d) {
    this.board.setHover(null);
    const to = d.over && d.over !== d.sq && this._targets.has(d.over) ? d.over : null;
    if (!to) { this.pieces.endDrag(d.sq); return; }
    this.pieces.endDrag(d.sq, { drop: to });
    this._emitClick(to);
    // if the move didn't happen (input is back on and the drop is still waiting), slide the piece home;
    // while a promotion choice is open input stays off, so the piece waits where it was dropped
    setTimeout(() => this._cancelStaleDrop(), 250);
  }

  _cancelStaleDrop() {
    const drop = this.pieces._drop;
    if (!drop || !this.inputEnabled || this.pieces._active) return;
    this.pieces._drop = null;
    this.pieces.endDrag(drop.from);
  }

  /** Where the pointer ray meets the board surface (y = 0). */
  _groundPoint(ndc) {
    this._raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(GROUND, hit) ? hit : null;
  }

  /** First live piece under the pointer, or null. */
  _pickPiece(ndc) {
    this._raycaster.setFromCamera(ndc, this.camera);
    for (const h of this._raycaster.intersectObject(this.pieces.group, true)) {
      let o = h.object;
      while (o && !o.userData.piece) o = o.parent;
      const p = o && o.userData.piece;
      if (p && !p.dead && this.pieces.bySquare.get(p.square) === p) return p.square;
    }
    return null;
  }

  _pick(ndc) {
    this._raycaster.setFromCamera(ndc, this.camera);
    let first = null;
    for (const h of this._raycaster.intersectObject(this.pieces.group, true)) {
      let o = h.object;
      while (o && !o.userData.piece) o = o.parent;
      const p = o && o.userData.piece;
      if (p && !p.dead && this.pieces.bySquare.get(p.square) === p) { first = { p, y: h.point.y }; break; }
    }
    // With a piece selected, a legal target hidden behind a taller piece (e.g. the square right in front of
    // your king, seen from behind it) still counts: prefer the target under the pointer on the board surface
    // unless the click was clearly low on a piece's own body.
    if (this._targets.size && !(first && this._targets.has(first.p.square))) {
      const g = this._groundPoint(ndc);
      const under = g && sqFromXZ(g.x, g.z);
      const ownBody = first && first.p.color === this._selectedColor && first.y < 0.3;
      if (under && this._targets.has(under) && !ownBody) return under;
    }
    if (first) return first.p.square;
    const th = this._raycaster.intersectObjects(this.board.tiles, false);
    if (th.length) return th[0].object.userData.square;
    return null;
  }

  _updateHover() {
    if (!this._pointer.dirty) return;
    this._pointer.dirty = false;
    let sq = null;
    if (this.inputEnabled && this._pointer.inside && !this._pointer.down) sq = this._pick(this._pointer.ndc);
    if (sq !== this._hoverSq) {
      this._hoverSq = sq;
      this.board.setHover(sq);
      this.pieces.setHover(sq);
    }
    const onPiece = sq && this.pieces.bySquare.has(sq);
    this.canvas.style.cursor = this.inputEnabled && sq ? (onPiece ? 'pointer' : 'crosshair') : 'default';
  }

  // ======================================================================= loop
  _frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this._t += dt;
    const t = this._t;
    try {
      this.tweener.update(dt);
      this.pieces.update(dt * this.tweener.speed, t);
      this.board.update(dt, t);
      this.arenas.update(dt, t);
      this.effects.update(dt, t);
      this._updateCamTween(dt);
      if (!this._camTween) this.controls.update(dt);
      this._updateHover();
    } catch (e) {
      if (!this._errOnce) { this._errOnce = true; console.error('[world] frame update error', e); }
    }
    const so = this.effects.shakeOffset;
    this.camera.position.add(so);
    if (this._fps) this.renderer.info.reset();
    this.composer.render(dt);
    this.camera.position.sub(so);
    if (this.onFrame) { try { this.onFrame(dt, t); } catch (e) { console.error(e); } }
    if (this._fps) this._tickFps(now);
  }

  _emitFx(name, data) {
    // every capture explosion (Pieces capture animations and playCaptureFx) makes the crowd react — once
    if (name === 'explosion') this.react('capture', { square: data?.square, victim: data ? { type: data.type, color: data.color } : null });
    if (this.onFx) { try { this.onFx(name, data || {}); } catch (e) { console.error(e); } }
  }

  // ======================================================================= public API
  setPosition(boardArray) {
    try { this.pieces.setPosition(boardArray); } catch (e) { console.error('[world] setPosition', e); }
  }

  highlight({ selected = null, moves = [], captures = [], lastMove = null, check = null } = {}) {
    this._selectedSq = selected;
    this._selectedColor = (selected && this.pieces.bySquare.get(selected)?.color) || null;
    this._targets = new Set([...(moves || []), ...(captures || [])]);
    try {
      this.board.highlight({ selected, moves, captures, lastMove, check });
      this.pieces.setSelected(selected);
    } catch (e) { console.error('[world] highlight', e); }
  }

  async animateMove(args) {
    try {
      this.board.setHover(null); this.pieces.setHover(null); this._hoverSq = null;
      await this.pieces.animateMove(args || {});
    } catch (e) { console.error('[world] animateMove', e); }
  }

  /**
   * Screen position (CSS px, viewport coords) just above a live piece — used to anchor speech bubbles.
   * Returns null if no such piece; onScreen=false when it's behind the camera or outside the view.
   */
  pieceScreenPos(color, type = 'k', lift = 1.35) {
    let p = null;
    for (const q of this.pieces.all) if (q.color === color && q.type === type && !q.dead) { p = q; break; }
    if (!p || !this.camera) return null;
    const v = new THREE.Vector3();
    p.body.getWorldPosition(v);
    v.y += lift;
    v.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      onScreen: v.z < 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05,
    };
  }

  setWanted(level) { this.effects.setWanted(level); this.react('wanted', { level }); }

  // ----------------------------------------------------------------- arenas (docs/arenas/ARENAS_SPEC.md)
  /** Swap the whole setting around the board. Latest call wins; resolves true when the arena is shown. */
  async setArena(id, { variant = {} } = {}) {
    if (!this.arenas) return false;
    if (id === this.arenas.id && JSON.stringify(variant || {}) === JSON.stringify(this.arenas.variant || {})) return true;
    return this.arenas.set(id, { variant });
  }

  get arenaId() { return this.arenas?.id || null; }

  /** Crowd/arena reactions: 'capture' | 'check' | 'wanted' | 'finale' | 'start'. */
  react(event, data = {}) { try { this.arenas?.react(event, data); } catch (e) { console.warn('[world] react', e); } }
  /** Capture popup amounts per piece type ({p,n,b,r,q}); null restores the default table. */
  setCashTable(table) { this.effects.cashTable = table || null; }

  playCaptureFx(square, victim = null) {
    try {
      this.effects.playCaptureFx(square, victim);
      this._emitFx('explosion', { square, ...(victim || {}) }); // → react('capture')
    } catch (e) { console.error(e); }
  }

  setCameraPreset(name, { animate = true } = {}) {
    if (!PRESETS[name]) name = 'white';
    if (name === 'white') this._side = 'w';
    if (name === 'black') this._side = 'b';
    this._userMoved = false;
    if (!this.camera) { this._preset = name; return; }
    this._applyPreset(name, animate);
  }

  flipTo(color) { this.setCameraPreset(color === 'b' ? 'black' : 'white'); }

  setInputEnabled(on) {
    this.inputEnabled = !!on;
    this._pointer.dirty = true;
    if (on) this._cancelStaleDrop();
    if (!on) { this.board.setHover(null); this.pieces.setHover(null); this._hoverSq = null; }
  }

  /** Hustler: tint a side in a gang's colors ({primary, accent} hex) or null to restore the defaults. */
  setTeamColors(color, colors = null) {
    try { setTeamColors(color === 'b' ? 'b' : 'w', colors); } catch (e) { console.error('[world] setTeamColors', e); }
  }

  setAnimSpeed(mult = 1) { this.tweener.speed = clamp(Number(mult) || 1, 0.1, 5); }

  dispose() {
    try {
      this.renderer.setAnimationLoop(null);
      this.arenas?.dispose();
      this._ro && this._ro.disconnect();
      this.controls.dispose();
      this.renderer.dispose();
      this.canvas.remove();
    } catch (_) { /* ignore */ }
  }
}
