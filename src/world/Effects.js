// Effects: explosions (additive fire sprites, sparks, smoke, debris, shockwave, light flash),
// "+$" cash popups, police siren lights driven by setWanted, camera shake, dust, tyre smoke, skid marks,
// promotion flash.
import * as THREE from 'three';
import { sqToXZ, glowTexture, smokeTexture, canvasTexture, formatCash, rng } from './util.js';

const CASH = { p: 1000, n: 3000, b: 3000, r: 5000, q: 9000, k: 0 };
const GRAV = -9.8;
const SIREN_BURST = 2.2; // seconds the siren plays after the wanted level rises
const REDUCED_MOTION = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'effects';
    scene.add(this.group);
    this.parts = [];
    this._spritePool = [];
    this._debrisPool = [];
    this._shake = { amp: 0, time: 0, dur: 0 };
    this.shakeOffset = new THREE.Vector3();
    this.wanted = 0;
    this._wantedVis = 0;
    this._r = rng(31337);

    // explosion flash light (always present; intensity 0 when idle → no shader recompiles)
    this.flash = new THREE.PointLight(0xff8a3a, 0, 9, 1.6);
    this.flash.position.set(0, 1, 0);
    this.group.add(this.flash);
    this._flashE = 0;

    this._buildSiren();
    this._buildSkids();
    this._ringGeo = new THREE.RingGeometry(0.7, 1, 48);
    this._ringGeo.rotateX(-Math.PI / 2);
  }

  // ---------------------------------------------------------------- siren
  _buildSiren() {
    this.sirenRed = new THREE.PointLight(0xff1a2e, 0, 14, 1.2);
    this.sirenBlue = new THREE.PointLight(0x2a5bff, 0, 14, 1.2);
    this.group.add(this.sirenRed, this.sirenBlue);
    // light-bar beacons on the four board corners (emissive, bloom)
    this.beacons = [];
    const geo = new THREE.BoxGeometry(0.28, 0.1, 0.12);
    const redM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1a2e) });
    const blueM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a5bff) });
    const housing = new THREE.MeshStandardMaterial({ color: 0x15151a, metalness: 0.6, roughness: 0.4 });
    for (const [x, z] of [[-4.8, -4.8], [4.8, -4.8], [-4.8, 4.8], [4.8, 4.8]]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.18), housing);
      base.position.y = 0.03;
      const r = new THREE.Mesh(geo, redM.clone()); r.position.set(-0.16, 0.11, 0);
      const b = new THREE.Mesh(geo, blueM.clone()); b.position.set(0.16, 0.11, 0);
      g.add(base, r, b);
      g.position.set(x, -0.02, z);
      g.rotation.y = Math.atan2(x, z) + Math.PI / 2;
      this.group.add(g);
      this.beacons.push({ r, b });
    }
    // sweeping light beams (additive ground-plane fans that rotate with the siren)
    const beamTex = canvasTexture(256, 64, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, h / 2 - 3); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(0, h / 2 + 3); g.fill();
    });
    const mk = (c) => new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshBasicMaterial({
      map: beamTex, color: new THREE.Color(c), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.beamR = mk(0xff1a2e); this.beamB = mk(0x2a5bff);
    for (const bm of [this.beamR, this.beamB]) {
      bm.geometry.translate(4.5, 0, 0); bm.rotation.x = -Math.PI / 2;
      const piv = new THREE.Group(); piv.position.y = 0.02; piv.add(bm);
      bm.userData.pivot = piv;
      this.group.add(piv);
    }
  }

  setWanted(level) {
    const next = Math.max(0, Math.min(5, Number(level) || 0));
    // the siren only plays as a short burst when heat rises; the rest of the time the
    // beacons just glow steadily (the HUD stars carry the persistent wanted level)
    if (next > this.wanted) this._sirenBurst = SIREN_BURST;
    this.wanted = next;
  }

  _updateSiren(dt, t) {
    // ease the visible level
    this._wantedVis += (this.wanted - this._wantedVis) * Math.min(1, dt * 3);
    const L = this._wantedVis / 5;
    this._sirenBurst = Math.max(0, (this._sirenBurst || 0) - dt);
    // envelope: quick fade in, hold, gentle fade out over the last second
    const env = Math.min(1, (SIREN_BURST - this._sirenBurst) / 0.3, this._sirenBurst / 1.0);
    const reduced = REDUCED_MOTION?.matches;
    const a = t * 1.3;
    const rad = 4.2;
    this.sirenRed.position.set(Math.cos(a) * rad, 2.4, Math.sin(a) * rad);
    this.sirenBlue.position.set(Math.cos(a + Math.PI) * rad, 2.4, Math.sin(a + Math.PI) * rad);
    // smooth red/blue crossfade (~1.2 Hz sine, no hard on/off strobing)
    const mix = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 7.5);
    const I = 9 * L * env;
    this.sirenRed.intensity = I * (0.3 + 0.7 * mix);
    this.sirenBlue.intensity = I * (0.3 + 0.7 * (1 - mix));
    // beacons: steady low glow for the current heat, brightening softly during a burst
    const base = L > 0.02 ? 0.3 + 0.5 * L : 0.15;
    for (const { r, b } of this.beacons) {
      r.material.color.setRGB(1, 0.1, 0.18).multiplyScalar(base + 1.6 * env * mix);
      b.material.color.setRGB(0.16, 0.36, 1).multiplyScalar(base + 1.6 * env * (1 - mix));
    }
    this.beamR.userData.pivot.rotation.y = -a;
    this.beamB.userData.pivot.rotation.y = -a + Math.PI;
    this.beamR.material.opacity = 0.12 * L * env * (0.4 + 0.6 * mix);
    this.beamB.material.opacity = 0.12 * L * env * (0.4 + 0.6 * (1 - mix));
  }

  // ---------------------------------------------------------------- shake
  shake(amp = 0.1, dur = 0.3) {
    // stack: take the stronger of current/remaining
    const remaining = this._shake.dur > 0 ? this._shake.amp * (1 - this._shake.time / this._shake.dur) : 0;
    if (amp >= remaining) this._shake = { amp, time: 0, dur };
  }
  _updateShake(dt, t) {
    const s = this._shake;
    if (s.dur <= 0) { this.shakeOffset.set(0, 0, 0); return; }
    s.time += dt;
    const k = Math.min(1, s.time / s.dur);
    const a = s.amp * (1 - k) * (1 - k);
    this.shakeOffset.set(
      (Math.sin(t * 71.3) + Math.sin(t * 43.1) * 0.5) * a,
      (Math.sin(t * 57.7 + 1.3) + Math.sin(t * 31.9) * 0.5) * a,
      (Math.sin(t * 63.1 + 2.1)) * a * 0.6,
    );
    if (k >= 1) s.dur = 0;
  }

  // ---------------------------------------------------------------- particles
  _sprite({ map, color, additive = true, opacity = 1 }) {
    let s = this._spritePool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
      s.userData.pooled = true;
    }
    const m = s.material;
    m.map = map; m.color.copy(color); m.opacity = opacity;
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.rotation = Math.random() * Math.PI * 2;
    m.needsUpdate = true;
    s.visible = true;
    this.group.add(s);
    return s;
  }

  _emit(obj, o) {
    this.parts.push({
      obj, age: 0, life: o.life, vel: o.vel || new THREE.Vector3(), grav: o.grav ?? 0, drag: o.drag ?? 0,
      s0: o.s0 ?? 0.3, s1: o.s1 ?? o.s0 ?? 0.3, op0: o.op0 ?? 1, fadeIn: o.fadeIn ?? 0, spin: o.spin ?? 0,
      bounce: o.bounce ?? false, kind: o.kind || 'sprite', angVel: o.angVel || null, color0: o.color0 || null, color1: o.color1 || null,
      delay: o.delay || 0,
    });
    if (o.delay) obj.visible = false;
  }

  _updateParts(dt) {
    const tmp = new THREE.Color();
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.delay > 0) { p.delay -= dt; if (p.delay <= 0) p.obj.visible = true; else continue; }
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this._release(p);
        this.parts.splice(i--, 1);
        continue;
      }
      const o = p.obj;
      p.vel.y += p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      o.position.addScaledVector(p.vel, dt);
      if (p.bounce && o.position.y < 0.03) {
        o.position.y = 0.03;
        if (p.vel.y < 0) p.vel.y *= -0.35;
        p.vel.x *= 0.7; p.vel.z *= 0.7;
        if (p.angVel) p.angVel.multiplyScalar(0.7);
      }
      if (p.kind === 'sprite') {
        const s = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - k, 2));
        o.scale.setScalar(s);
        const fin = p.fadeIn ? Math.min(1, k / p.fadeIn) : 1;
        o.material.opacity = p.op0 * fin * (1 - k) * (1 - k * 0.3);
        if (p.spin) o.material.rotation += p.spin * dt;
        if (p.color0 && p.color1) o.material.color.copy(tmp.copy(p.color0).lerp(p.color1, k));
      } else if (p.kind === 'debris') {
        if (p.angVel) { o.rotation.x += p.angVel.x * dt; o.rotation.y += p.angVel.y * dt; o.rotation.z += p.angVel.z * dt; }
        o.scale.setScalar(p.s0 * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1));
      } else if (p.kind === 'ring') {
        const s = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - k, 3));
        o.scale.set(s, 1, s);
        o.material.opacity = p.op0 * (1 - k);
      } else if (p.kind === 'popup') {
        o.material.opacity = k < 0.1 ? k / 0.1 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        const pop = k < 0.12 ? 0.6 + 0.6 * (k / 0.12) : 1.2 - Math.min(0.2, (k - 0.12) * 0.8);
        o.scale.set(p.s0 * pop, p.s0 * pop * 0.3, 1);
      } else if (p.kind === 'column') {
        o.material.opacity = p.op0 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
        o.scale.set(1 - k * 0.6, 1 + k * 0.5, 1 - k * 0.6);
      }
    }
  }

  _release(p) {
    const o = p.obj;
    this.group.remove(o);
    if (o.isSprite && o.userData.pooled && p.kind === 'sprite') this._spritePool.push(o);
    else if (p.kind === 'debris') this._debrisPool.push(o);
    else if (p.kind === 'popup' || p.kind === 'ring' || p.kind === 'column') {
      if (o.material.map && p.kind === 'popup') o.material.map.dispose();
      o.material.dispose();
      if (p.kind === 'column') o.geometry.dispose();
    }
  }

  // ---------------------------------------------------------------- public fx
  playCaptureFx(square, victim = null) {
    if (!square) return;
    const { x, z } = sqToXZ(square);
    const r = this._r;
    const glow = glowTexture(), smoke = smokeTexture();
    const big = victim && (victim.type === 'q' || victim.type === 'r' || victim.type === 'k');
    const scale = big ? 1.3 : 1;
    // light flash
    this.flash.color.setHex(0xff8a3a);
    this.flash.position.set(x, 1.0, z);
    this._flashE = 1;
    // fireball core
    for (let i = 0; i < 12; i++) {
      const s = this._sprite({ map: glow, color: new THREE.Color(1, 0.55 + r() * 0.3, 0.15).multiplyScalar(1.6) });
      s.position.set(x + (r() - 0.5) * 0.3, 0.25 + r() * 0.3, z + (r() - 0.5) * 0.3);
      const v = new THREE.Vector3(r() - 0.5, r() * 0.9 + 0.3, r() - 0.5).normalize().multiplyScalar(1.2 + r() * 2.2);
      this._emit(s, { life: 0.45 + r() * 0.4, vel: v, drag: 3.5, s0: 0.35 * scale, s1: (1.1 + r() * 0.7) * scale, grav: 1.5,
        color0: new THREE.Color(1.0, 0.8, 0.4).multiplyScalar(1.9), color1: new THREE.Color(0.9, 0.2, 0.04).multiplyScalar(0.9) });
    }
    // sparks
    for (let i = 0; i < 26; i++) {
      const s = this._sprite({ map: glow, color: new THREE.Color(1, 0.75, 0.35).multiplyScalar(3.5) });
      s.position.set(x, 0.35, z);
      const v = new THREE.Vector3(r() - 0.5, r() * 1.2 + 0.2, r() - 0.5).normalize().multiplyScalar(3 + r() * 4);
      this._emit(s, { life: 0.5 + r() * 0.6, vel: v, grav: GRAV * 0.8, drag: 0.8, s0: 0.09, s1: 0.03, bounce: true });
    }
    // smoke
    for (let i = 0; i < 12; i++) {
      const g = 0.08 + r() * 0.08;
      const s = this._sprite({ map: smoke, color: new THREE.Color(g, g * 0.9, g * 1.1), additive: false, opacity: 0 });
      s.position.set(x + (r() - 0.5) * 0.5, 0.4 + r() * 0.3, z + (r() - 0.5) * 0.5);
      const v = new THREE.Vector3((r() - 0.5) * 0.6, 0.6 + r() * 0.8, (r() - 0.5) * 0.6);
      this._emit(s, { life: 1.6 + r() * 1.0, vel: v, drag: 0.6, s0: 0.5, s1: (1.8 + r()) * scale, op0: 0.85, fadeIn: 0.15, spin: (r() - 0.5) * 1.2, delay: 0.08 + r() * 0.12 });
    }
    // debris chunks in victim team colours
    const cols = victim && victim.color === 'b' ? [0x151519, 0xffc34d, 0x9dff3c, 0x2a2a30] : [0xf3f1ec, 0x29e3d6, 0xff5fa2, 0x2a2a30];
    for (let i = 0; i < 12; i++) {
      let d = this._debrisPool.pop();
      if (!d) { d = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3 })); d.castShadow = true; }
      d.material.color.setHex(cols[i % cols.length]);
      d.position.set(x, 0.35, z);
      d.rotation.set(r() * 6, r() * 6, r() * 6);
      this.group.add(d);
      const v = new THREE.Vector3(r() - 0.5, 0.8 + r(), r() - 0.5).normalize().multiplyScalar(3 + r() * 3);
      this._emit(d, { kind: 'debris', life: 1.4 + r() * 0.6, vel: v, grav: GRAV, s0: 0.05 + r() * 0.07, bounce: true,
        angVel: new THREE.Vector3((r() - 0.5) * 20, (r() - 0.5) * 20, (r() - 0.5) * 20) });
    }
    // ground shockwave
    const ring = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.6, 0.25).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.position.set(x, 0.03, z);
    this.group.add(ring);
    this._emit(ring, { kind: 'ring', life: 0.5, s0: 0.1, s1: 1.9 * scale, op0: 1 });
    // scorch decal via skid pool (a dark blot)
    this._scorch(x, z);
    // cash popup
    const amt = victim ? CASH[victim.type] || 0 : 0;
    if (amt > 0) this.cashPopup(x, z, amt);
    this.shake(big ? 0.26 : 0.18, 0.45);
  }

  cashPopup(x, z, amount) {
    const tex = canvasTexture(512, 150, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = 'bold 110px "Bebas Neue", Anton, Impact, "Arial Black", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const txt = formatCash(amount);
      g.lineJoin = 'round';
      g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeText(txt, w / 2, h / 2 + 6);
      g.shadowColor = '#3dff6e'; g.shadowBlur = 18;
      g.fillStyle = '#6dff8a'; g.fillText(txt, w / 2, h / 2 + 6);
      g.shadowBlur = 0; g.fillStyle = '#b8ffc6'; g.fillText(txt, w / 2, h / 2 + 2);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
    s.renderOrder = 20;
    s.position.set(x, 1.3, z);
    this.group.add(s);
    this._emit(s, { kind: 'popup', life: 1.9, vel: new THREE.Vector3(0, 0.75, 0), drag: 0.9, s0: 1.5 });
  }

  dust(x, z, n = 6, size = 0.5) {
    const r = this._r, map = smokeTexture();
    for (let i = 0; i < n; i++) {
      const g = 0.55 + r() * 0.2;
      const s = this._sprite({ map, color: new THREE.Color(g, g * 0.85, g * 0.8), additive: false, opacity: 0 });
      const a = r() * Math.PI * 2;
      s.position.set(x + Math.cos(a) * 0.2, 0.08, z + Math.sin(a) * 0.2);
      const v = new THREE.Vector3(Math.cos(a) * (0.8 + r()), 0.25 + r() * 0.4, Math.sin(a) * (0.8 + r()));
      this._emit(s, { life: 0.6 + r() * 0.5, vel: v, drag: 3, s0: 0.15 * size / 0.5, s1: size * (0.9 + r() * 0.6), op0: 0.45, fadeIn: 0.1 });
    }
  }

  tireSmoke(x, z) {
    const r = this._r, map = smokeTexture();
    for (let i = 0; i < 2; i++) {
      const g = 0.8 + r() * 0.15;
      const s = this._sprite({ map, color: new THREE.Color(g, g, g * 1.05), additive: false, opacity: 0 });
      s.position.set(x + (r() - 0.5) * 0.3, 0.1, z + (r() - 0.5) * 0.3);
      this._emit(s, { life: 0.9 + r() * 0.5, vel: new THREE.Vector3((r() - 0.5) * 0.4, 0.35 + r() * 0.3, (r() - 0.5) * 0.4), drag: 1.2, s0: 0.2, s1: 0.8, op0: 0.4, fadeIn: 0.1 });
    }
  }

  // ---------------------------------------------------------------- skid marks
  _buildSkids() {
    const N = 90;
    this._skids = [];
    const tex = canvasTexture(32, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(4, 0, 8, h); g.fillRect(20, 0, 8, h);
    });
    const geo = new THREE.PlaneGeometry(0.4, 0.3); geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0x0a0808 }));
      m.visible = false; m.renderOrder = 1;
      this.group.add(m);
      this._skids.push({ m, age: 0, life: 1 });
    }
    this._skidIdx = 0;
    this._scorchTex = canvasTexture(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(0,0,0,0.9)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
  }
  skid(x, z, yaw) {
    const s = this._skids[this._skidIdx++ % this._skids.length];
    s.m.material.map = s.m.material.map; // keep
    s.m.position.set(x, 0.006, z);
    s.m.rotation.set(0, yaw, 0);
    s.m.scale.set(1, 1, 1);
    s.m.visible = true; s.age = 0; s.life = 4; s.op = 0.55;
  }
  _scorch(x, z) {
    const s = this._skids[this._skidIdx++ % this._skids.length];
    if (!s.scorchMat) s.scorchMat = new THREE.MeshBasicMaterial({ map: this._scorchTex, transparent: true, depthWrite: false, color: 0x000000 });
    s.normalMat ||= s.m.material;
    s.m.material = s.scorchMat;
    s.m.position.set(x, 0.007, z);
    s.m.rotation.set(0, Math.random() * 6, 0);
    s.m.scale.set(2.2, 1, 2.9);
    s.m.visible = true; s.age = 0; s.life = 6; s.op = 0.6;
  }
  _updateSkids(dt) {
    for (const s of this._skids) {
      if (!s.m.visible) continue;
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1) {
        s.m.visible = false;
        if (s.normalMat) { s.m.material = s.normalMat; }
        continue;
      }
      s.m.material.opacity = s.op * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
  }

  // ---------------------------------------------------------------- promotion
  promotionFlash(square, color = 'w') {
    const { x, z } = sqToXZ(square);
    const c1 = new THREE.Color(color === 'b' ? 0xffc34d : 0x29e3d6);
    const c2 = new THREE.Color(color === 'b' ? 0x9dff3c : 0xff5fa2);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 4, 24, 1, true), new THREE.MeshBasicMaterial({
      color: c1.clone().multiplyScalar(2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    col.position.set(x, 2, z);
    this.group.add(col);
    this._emit(col, { kind: 'column', life: 0.9, op0: 0.55 });
    const ring = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({ color: c2.clone().multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.set(x, 0.03, z);
    this.group.add(ring);
    this._emit(ring, { kind: 'ring', life: 0.7, s0: 0.2, s1: 1.4, op0: 1 });
    const r = this._r, glow = glowTexture();
    for (let i = 0; i < 26; i++) {
      const s = this._sprite({ map: glow, color: (i % 2 ? c1 : c2).clone().multiplyScalar(4) });
      const a = r() * Math.PI * 2;
      s.position.set(x + Math.cos(a) * 0.35, 0.1 + r() * 0.3, z + Math.sin(a) * 0.35);
      this._emit(s, { life: 0.8 + r() * 0.6, vel: new THREE.Vector3(Math.cos(a) * 0.4, 1.6 + r() * 2.2, Math.sin(a) * 0.4), drag: 1.2, s0: 0.12, s1: 0.03 });
    }
    this.flash.color.copy(c1);
    this.flash.position.set(x, 1.2, z);
    this._flashE = 0.8;
    this._flashColorReset = true;
  }

  update(dt, t) {
    this._updateParts(dt);
    this._updateSkids(dt);
    this._updateSiren(dt, t);
    this._updateShake(dt, t);
    if (this._flashE > 0) {
      this._flashE = Math.max(0, this._flashE - dt * 2.4);
      this.flash.intensity = 45 * this._flashE * this._flashE;
      if (this._flashE === 0 && this._flashColorReset) { this.flash.color.setHex(0xff8a3a); this._flashColorReset = false; }
    } else this.flash.intensity = 0;
  }
}
