// ArenaManager: lazy-loads arena modules, builds the next arena off-screen, fades, swaps, applies mood and
// disposes the previous arena. The latest setArena() call wins; a failing arena falls back to classic.
// Contract: docs/arenas/ARENAS_SPEC.md §3.
import * as THREE from 'three';
import { getArena, DEFAULT_ARENA } from './registry.js';
import { NpcCrowd } from './npc/NpcCrowd.js';
import { loadNpcAssets } from './npc/NpcAssets.js';
import { assetUrl } from './Arena.js';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FADE_MS = 420;

export function guessQuality() {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'low' || q === 'high') return q;
    const small = Math.min(screen.width, screen.height) < 700;
    const weak = (navigator.hardwareConcurrency || 8) <= 4;
    return small || weak ? 'low' : 'high';
  } catch (_) { return 'high'; }
}

const DEFAULT_MOOD = {
  background: '#1b1036', fog: null, exposure: 1.05, bloom: { strength: 0.65, radius: 0.45, threshold: 0.9 }, envIntensity: 0.75,
};

export class ArenaManager {
  constructor(world) {
    this.world = world;
    this.current = null;     // Arena instance
    this.id = null;
    this.variant = {};
    this.loading = false;
    this._token = 0;
    this.quality = guessQuality();
    this.reducedMotion = REDUCED;
    this._fadeEl = null;
    this._err = false;
    this._err2 = false;
  }

  _fade(on) {
    const el = this.world.el;
    if (!el || typeof document === 'undefined') return Promise.resolve();
    if (!this._fadeEl) {
      const d = document.createElement('div');
      d.className = 'gtc-arena-fade';
      Object.assign(d.style, {
        position: 'absolute', inset: '0', background: '#0b0716', opacity: '0', pointerEvents: 'none',
        transition: `opacity ${FADE_MS}ms ease-in-out`, zIndex: '1',
      });
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(d);
      this._fadeEl = d;
    }
    this._fadeEl.style.opacity = on ? '1' : '0';
    return new Promise((res) => setTimeout(res, this.reducedMotion ? 80 : FADE_MS + 20));
  }

  /** Loads + shows an arena. Resolves true when shown, false if superseded (or nothing could be shown). */
  async set(id, { variant = {}, fade = true } = {}) {
    const entry = getArena(id);
    const token = ++this._token;
    const w = this.world;
    const info = { id: entry.id, name: entry.name };
    const stale = () => token !== this._token;
    this.loading = true;
    try { w.onArenaLoading?.(true, info); } catch (_) { /* ignore */ }
    let arena = null;
    let shownId = entry.id;
    let shownVariant = variant || {};
    try {
      arena = await this._build(entry, shownVariant);
    } catch (e) {
      console.error(`[arena] ${entry.id} failed to build`, e);
      arena = null;
      if (entry.id !== DEFAULT_ARENA && !stale()) {
        try {
          arena = await this._build(getArena(DEFAULT_ARENA), {});
          shownId = DEFAULT_ARENA; shownVariant = {};
        } catch (e2) { console.error('[arena] fallback failed', e2); }
      }
    }
    const finish = (ok) => {
      if (!stale()) {
        this.loading = false;
        try { w.onArenaLoading?.(false, info); } catch (_) { /* ignore */ }
      }
      return ok;
    };
    if (stale() || !arena) {
      if (arena) this._disposeArena(arena);
      return finish(false);
    }
    const hadOld = !!this.current;
    if (hadOld && fade) await this._fade(true);
    if (stale()) { this._disposeArena(arena); return finish(false); }
    this._swap(arena, shownId, shownVariant);
    try {
      if (w.renderer.compileAsync) await w.renderer.compileAsync(w.scene, w.camera);
    } catch (_) { /* ignore */ }
    if (hadOld && fade && !stale()) await this._fade(false);
    return finish(true);
  }

  async _build(entry, variant) {
    const w = this.world;
    const [mod, assets] = await Promise.all([entry.load(), loadNpcAssets()]);
    const Cls = mod.default;
    const crowd = new NpcCrowd({ scene: w.scene, reducedMotion: this.reducedMotion, quality: this.quality, assets });
    const arena = new Cls({
      scene: w.scene, renderer: w.renderer, world: w, variant: variant || {}, models: w.models || {},
      reducedMotion: this.reducedMotion, quality: this.quality, crowd,
      url: assetUrl,
    });
    arena.crowd = arena.crowd || crowd;
    crowd.attach(arena.group);
    arena.id = entry.id;
    try {
      await arena.build();
      crowd.finalize(arena);
      this._sanitize(arena);
    } catch (e) {
      this._disposeArena(arena);
      throw e;
    }
    return arena;
  }

  /** Keep the renderer sane: at most one shadow-casting light per arena. */
  _sanitize(arena) {
    let casters = 0;
    arena.group.traverse((o) => {
      if (o.isLight && o.castShadow) {
        casters++;
        if (casters > 1) { o.castShadow = false; if (casters === 2) console.warn(`[arena] ${arena.id}: extra shadow-casting lights disabled`); }
      }
    });
  }

  _disposeArena(arena) {
    try { arena.crowd?.dispose(); } catch (e) { console.warn('[arena] crowd dispose', e); }
    try { arena.dispose(); } catch (e) { console.warn('[arena] dispose', e); }
  }

  _swap(arena, id, variant) {
    const w = this.world;
    const old = this.current;
    if (old) this._disposeArena(old);
    this.current = arena;
    this.id = id;
    this.variant = variant || {};
    this._err = this._err2 = false;
    w.scene.add(arena.group);
    this._applyMood(arena);
    try { w.board?.setSurround?.(arena.boardStyle || null); } catch (e) { console.warn('[arena] surround', e); }
  }

  _applyMood(arena) {
    const w = this.world;
    const m = { ...DEFAULT_MOOD, ...(arena.mood || {}) };
    const s = w.scene;
    s.background = new THREE.Color(m.background || DEFAULT_MOOD.background);
    s.fog = m.fog ? new THREE.Fog(new THREE.Color(m.fog.color), m.fog.near ?? 26, m.fog.far ?? 130) : null;
    s.environment = arena.envMap || null;
    s.environmentIntensity = m.envIntensity ?? 0.75;
    w.renderer.toneMappingExposure = m.exposure ?? 1.05;
    if (w.bloom) {
      const b = { ...DEFAULT_MOOD.bloom, ...(m.bloom || {}) };
      w.bloom.strength = b.strength;
      w.bloom.radius = b.radius;
      w.bloom.threshold = b.threshold;
    }
  }

  update(dt, t) {
    const a = this.current;
    if (!a) return;
    try { a.update(dt, t); } catch (e) { if (!this._err) { this._err = true; console.error('[arena] update', e); } }
    try { a.crowd?.update(dt, t, this.world.camera); } catch (e) { if (!this._err2) { this._err2 = true; console.error('[arena] crowd', e); } }
  }

  react(event, data = {}) {
    const a = this.current;
    if (!a) return;
    try { a.crowd?.react(event, data); } catch (e) { console.warn(e); }
    try { a.react(event, data); } catch (e) { console.warn(e); }
  }

  dispose() {
    this._token++;
    if (this.current) this._disposeArena(this.current);
    this.current = null;
    this._fadeEl?.remove();
    this._fadeEl = null;
  }
}
