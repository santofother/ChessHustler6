// Arena base class: everything around the board (props, sky, lights, mood, NPCs) for one location.
// Subclasses (src/world/arenas/<id>.js) override build() / update() / react(). Contract: docs/arenas/ARENAS_SPEC.md §3.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STREET_Y } from '../Board.js';

export { STREET_Y };

// ------------------------------------------------------------------ GLB cache (session-wide, never throws)
const glbCache = new Map(); // url -> Promise<THREE.Object3D|null>
let loader = null;

export function baseUrl() {
  const b = (import.meta.env && import.meta.env.BASE_URL) || '/';
  return b.endsWith('/') ? b : b + '/';
}
export function assetUrl(path) {
  return baseUrl() + String(path).replace(/^\.?\//, '');
}

/** Loads a GLB once; resolves the gltf ({scene, animations}) or null when missing / broken. */
export function loadGLTF(path) {
  const url = assetUrl(path);
  if (!glbCache.has(url)) {
    glbCache.set(url, (async () => {
      try {
        const res = await fetch(url);
        const type = res.headers.get('content-type') || '';
        if (!res.ok || type.includes('text/html')) return null;
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 12 || new Uint32Array(buf, 0, 1)[0] !== 0x46546c67) return null;
        loader ??= new GLTFLoader();
        const dir = url.slice(0, url.lastIndexOf('/') + 1);
        return await loader.parseAsync(buf, dir);
      } catch (e) {
        console.warn('[arena] glb failed', path, e);
        return null;
      }
    })());
  }
  return glbCache.get(url);
}

function disposeMaterial(m, seen) {
  if (!m || seen.has(m)) return;
  seen.add(m);
  for (const k in m) {
    const v = m[k];
    if (v && v.isTexture && !v.userData?.shared) v.dispose();
  }
  if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture && !u.value.userData?.shared) u.value.dispose();
  m.dispose();
}

/** Disposes geometries/materials/textures under root, skipping anything flagged userData.shared. */
export function disposeTree(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.userData?.shared) return;
    if (o.geometry && !o.geometry.userData?.shared && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.userData?.shared) disposeMaterial(m, seen);
    if (o.isInstancedMesh) o.dispose?.();
  });
}

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Arena {
  /** @param ctx { scene, renderer, world, variant, models, reducedMotion, quality, url, crowd } */
  constructor(ctx) {
    this.ctx = ctx;
    this.variant = ctx.variant || {};
    this.group = new THREE.Group();
    this.group.name = 'arena';
    this.crowd = ctx.crowd || null;
    this.reducedMotion = ctx.reducedMotion ?? REDUCED;
    this.mood = {
      background: '#1b1036',
      fog: { color: '#a8466a', near: 26, far: 130 },
      exposure: 1.05,
      bloom: { strength: 0.65, radius: 0.45, threshold: 0.9 },
      envIntensity: 0.75,
    };
    this.boardStyle = null; // null → Board default (race kerb, teal/pink neon)
    this.envMap = null;     // THREE.Texture (PMREM) or null; manager assigns to scene.environment
    this._tracked = new Set();
  }

  // -------------------------------------------------------------- lifecycle (override)
  async build() {}
  update(dt, t) {} // eslint-disable-line no-unused-vars
  react(event, data) {} // eslint-disable-line no-unused-vars

  dispose() {
    this.group.removeFromParent();
    disposeTree(this.group);
    for (const r of this._tracked) { try { r.dispose(); } catch (_) { /* ignore */ } }
    this._tracked.clear();
    if (this.envMap) { this.envMap.dispose(); this.envMap = null; }
  }

  // -------------------------------------------------------------- helpers
  track(res) { if (res) this._tracked.add(res); return res; }
  url(path) { return assetUrl(path); }

  /** Fresh clone of a GLB scene (or null). Materials are shared with the cache: use tint() before editing. */
  async glb(path) {
    const g = await loadGLTF(path);
    if (!g) return null;
    const c = g.scene.clone(true);
    c.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        // shared cache materials/geometries must survive this arena's dispose
        o.geometry.userData.shared = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m) m.userData.shared = true; });
      }
    });
    return c;
  }

  /** Wraps a model so its feet sit on y=0 and it is centred on x/z; optional uniform scale to `height` m. */
  prop(root, { height = null } = {}) {
    const holder = new THREE.Group();
    root.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (height && size.y > 1e-4) root.scale.multiplyScalar(height / size.y);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
    holder.add(root);
    holder.userData.size = box.getSize(new THREE.Vector3());
    return holder;
  }

  /**
   * Recolours materials whose name starts with a key ({ TINT_Body: '#ff3ea5', EMISSIVE_Underglow: '#29e3d6' }).
   * Keys starting with EMISSIVE_ set the emissive colour; `intensity` scales emissiveIntensity.
   * Materials are cloned (and owned by this arena) so other instances keep their colours.
   */
  tint(root, map, { intensity = null } = {}) {
    const cache = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const one = (m) => {
        if (!m || !m.name) return m;
        const key = Object.keys(map).find((k) => m.name.startsWith(k));
        if (!key) return m;
        if (!cache.has(m)) {
          const c = m.clone();
          c.userData = { ...m.userData, shared: false };
          const col = new THREE.Color(map[key]);
          if (key.startsWith('EMISSIVE_')) { c.emissive = col; if (intensity != null) c.emissiveIntensity = intensity; }
          else c.color = col;
          cache.set(m, c);
        }
        return cache.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
    return root;
  }

  /** Soft 0..1 sine pulse (period ≥ 1.5 s enforced); constant 0.5 with reduced motion. */
  pulse(t, period = 3, phase = 0) {
    if (this.reducedMotion) return 0.5;
    const p = Math.max(1.5, period);
    return 0.5 + 0.5 * Math.sin((t / p) * Math.PI * 2 + phase);
  }

  // -------------------------------------------------------------- sky + lights
  /**
   * Gradient sky dome. Colours: zenith → top → mid → horizon, bottom below the horizon. Optional sun glow
   * (sunDir, sunColor, sunSize) and static stars (0..1). Returns the mesh (added to this.group).
   */
  addSky({ zenith = '#140c2c', top = '#3a1c5c', mid = '#b03a86', horizon = '#ffb24a', bottom = '#2a1530',
    sunDir = null, sunColor = '#ffd08a', sunGlow = 0.6, stars = 0 } = {}) {
    const uniforms = {
      cZenith: { value: new THREE.Color(zenith) }, cTop: { value: new THREE.Color(top) },
      cMid: { value: new THREE.Color(mid) }, cHorizon: { value: new THREE.Color(horizon) },
      cBottom: { value: new THREE.Color(bottom) }, cSun: { value: new THREE.Color(sunColor) },
      sunDir: { value: (sunDir ? new THREE.Vector3(...(sunDir.isVector3 ? sunDir.toArray() : sunDir)) : new THREE.Vector3(0, -1, 0)).normalize() },
      sunGlow: { value: sunDir ? sunGlow : 0 }, stars: { value: stars },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 cZenith, cTop, cMid, cHorizon, cBottom, cSun, sunDir; uniform float sunGlow, stars;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.14, h));
          col = mix(col, cTop, smoothstep(0.12, 0.42, h));
          col = mix(col, cZenith, smoothstep(0.4, 0.95, h));
          float s = max(dot(d, sunDir), 0.0);
          col += cSun * (pow(s, 8.0) * 0.5 + pow(s, 80.0) * 1.2 + smoothstep(0.9993, 0.9997, s) * 6.0) * sunGlow;
          if (stars > 0.0 && h > 0.12) {
            vec2 sp = floor(d.xz / (h + 0.3) * 260.0);
            col += vec3(step(0.997, hash(sp)) * smoothstep(0.12, 0.5, h) * stars * (0.5 + 0.5 * hash(sp + 3.1)));
          }
          col = mix(col, cBottom, smoothstep(0.0, -0.08, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
    sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -10;
    this.group.add(sky);
    this.sky = sky;
    return sky;
  }

  addHemi(sky = 0x9a6cc8, ground = 0x3a1a26, intensity = 0.9) {
    const h = new THREE.HemisphereLight(sky, ground, intensity);
    this.group.add(h);
    return h;
  }

  /** Key light with a board-sized shadow frustum. dir points FROM the scene TOWARD the light. */
  addSun({ color = 0xffa25e, intensity = 3.0, dir = [-0.35, 0.5, -1], shadow = true, mapSize = 2048 } = {}) {
    const sun = new THREE.DirectionalLight(color, intensity);
    const d = new THREE.Vector3(...dir).normalize();
    sun.position.copy(d).multiplyScalar(20);
    sun.position.y = Math.max(sun.position.y, 9.5);
    sun.target.position.set(0, 0, 0);
    if (shadow) {
      sun.castShadow = true;
      const q = this.ctx.quality === 'low' ? 1024 : mapSize;
      sun.shadow.mapSize.set(q, q);
      const c = sun.shadow.camera;
      c.left = -9; c.right = 9; c.top = 9; c.bottom = -9; c.near = 1; c.far = 60;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    }
    this.group.add(sun, sun.target);
    this.sun = sun;
    return sun;
  }

  addLight(light) { this.group.add(light); return light; }

  /**
   * Builds a PMREM environment map from the sky (and optional coloured cards { color, pos:[x,y,z], size:[w,h] })
   * for reflections on cars / wet ground. Call after addSky(). Manager applies it to scene.environment.
   */
  buildEnvMap(cards = []) {
    const renderer = this.ctx.renderer;
    if (!renderer || !this.sky) return null;
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    sky.scale.setScalar(0.1);
    envScene.add(sky);
    const tmp = [];
    for (const c of cards) {
      const g = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color).multiplyScalar(c.mult ?? 4), side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(...c.pos); mesh.scale.set(c.size[0], c.size[1], 1); mesh.lookAt(0, 0, 0);
      envScene.add(mesh); tmp.push(g, m);
    }
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(envScene, 0.02, 1, 100);
    pm.dispose();
    tmp.forEach((x) => x.dispose());
    this.envMap = rt.texture;
    this._envRT = rt;
    this.track(rt);
    return rt.texture;
  }
}
