// WebAudio-synthesized sound effects — no audio files.
//   const sfx = new Sfx();  sfx.resume()  (from a user gesture)
//   sfx.play('click'|'select'|'illegal'|'engine'|'bike'|'truck'|'rotor'|'footsteps'|'boss'|'land'|
//            'explosion'|'siren'|'cash'|'upgrade'|'castle'|'wasted'|'passed'|'busted'|'sms')
//   sfx.fx(name, data)  -- World.onFx bridge ('move' {type}, 'land', 'explosion', 'upgrade', 'castle')
//   sfx.setMuted(bool) / sfx.toggleMute() / sfx.muted     (persisted in localStorage)
//   sfx.setVolume('master'|'music'|'sfx', 0..1) / sfx.audioState()   (persisted; music = soundtrack + radio)
//   sfx.startRadio() / sfx.stopRadio()                    (quiet ambient synthwave loop)

const MUTE_KEY = 'gtc.muted';
const VOLUME_KEY = 'gtc.volume';
const MASTER = 0.55;
const DEFAULT_VOLUME = { master: 1, music: 0.8, sfx: 1 };

function loadVolume() {
  try {
    const v = JSON.parse(localStorage.getItem(VOLUME_KEY) || 'null') || {};
    const out = { ...DEFAULT_VOLUME };
    for (const k of Object.keys(out)) if (Number.isFinite(v[k])) out[k] = Math.max(0, Math.min(1, v[k]));
    return out;
  } catch {
    return { ...DEFAULT_VOLUME };
  }
}
function saveVolume(v) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(v));
  } catch {
    /* storage blocked — ignore */
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
function saveMuted(v) {
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* storage blocked — ignore */
  }
}

const MOVE_SOUND = { p: 'footsteps', n: 'bike', b: 'engine', r: 'truck', q: 'rotor', k: 'boss' };
const SOUNDS = new Set([
  'click', 'select', 'illegal', 'sms', 'engine', 'bike', 'truck', 'rotor', 'footsteps', 'boss', 'land',
  'castle', 'explosion', 'siren', 'cash', 'upgrade', 'wasted', 'passed', 'busted',
]);
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.fxBus = null;
    this.radioBus = null;
    this.musicBus = null; // soundtrack + synth radio, under the Music volume
    this._noise = null;
    this._muted = loadMuted();
    this._volume = loadVolume();
    this.onChange = null; // (state) => {} when volume/mute changes (settings panel, phone button)
    this._radio = null;
    this._radioWanted = false;
    this._last = {}; // name -> time, to throttle spammy sounds
  }

  get muted() {
    return this._muted;
  }

  /** Create/resume the AudioContext. Call from a user gesture (title Start click). */
  resume() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this._masterGain();
        // gentle limiter so stacked explosions don't clip
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 12;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        this.master.connect(comp).connect(this.ctx.destination);
        this.fxBus = this.ctx.createGain();
        this.fxBus.gain.value = this._volume.sfx;
        this.fxBus.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this._volume.music;
        this.musicBus.connect(this.master);
        this.radioBus = this.ctx.createGain();
        this.radioBus.gain.value = 0.12;
        this.radioBus.connect(this.musicBus);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this._radioWanted && !this._radio) this.startRadio();
      this.music?.resume();
    } catch (err) {
      console.warn('[Sfx] audio unavailable', err);
      this.ctx = null;
    }
  }

  setMuted(v) {
    this._muted = !!v;
    saveMuted(this._muted);
    this._ramp(this.master, this._masterGain());
    this.onChange?.(this.audioState());
    return this._muted;
  }

  /** Volume 0..1 for 'master' | 'music' | 'sfx' (persisted). */
  setVolume(kind, value) {
    if (!(kind in this._volume)) return;
    this._volume[kind] = Math.max(0, Math.min(1, Number(value) || 0));
    saveVolume(this._volume);
    if (kind === 'master') this._ramp(this.master, this._masterGain());
    if (kind === 'music') this._ramp(this.musicBus, this._volume.music);
    if (kind === 'sfx') this._ramp(this.fxBus, this._volume.sfx);
    this.onChange?.(this.audioState());
  }

  audioState() {
    return { muted: this._muted, ...this._volume };
  }

  _masterGain() {
    return this._muted ? 0 : MASTER * this._volume.master;
  }

  _ramp(node, value) {
    if (!this.ctx || !node) return;
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setTargetAtTime(value, t, 0.03);
  }
  toggleMute() {
    return this.setMuted(!this._muted);
  }

  /** World -> audio bridge (PLAN §1.6). */
  fx(name, data = {}) {
    switch (name) {
      case 'move':
        this.play(MOVE_SOUND[data.type] || 'footsteps');
        break;
      case 'land':
      case 'explosion':
      case 'upgrade':
      case 'castle':
        this.play(name);
        break;
      default:
        if (SOUNDS.has(name)) this.play(name);
    }
  }

  play(name, opts = {}) {
    if (!this.ctx || this._muted) return;
    if (!SOUNDS.has(name)) return;
    const fn = this[`_${name}`];
    const now = this.ctx.currentTime;
    // throttle identical sounds fired within 40ms
    if (this._last[name] && now - this._last[name] < 0.04) return;
    this._last[name] = now;
    try {
      fn.call(this, now + 0.005, opts);
    } catch (err) {
      console.warn('[Sfx]', name, err);
    }
  }

  // ------------------------------------------------------------------ building blocks

  _noiseBuf() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (this._noise = buf);
  }

  _env(t, attack, hold, release, peak = 1, bus = this.fxBus) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.002, attack));
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(bus);
    return g;
  }

  _osc(type, freq, t, dur, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  _noiseSrc(t, dur, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf();
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  _filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  _tone(t, freq, dur, { type = 'sine', peak = 0.3, attack = 0.005, glideTo = null } = {}) {
    const env = this._env(t, attack, 0, dur, peak);
    const o = this._osc(type, freq, t, dur + attack, env);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + dur);
    return o;
  }

  // ------------------------------------------------------------------ UI sounds

  _click(t) {
    this._tone(t, 1400, 0.04, { type: 'square', peak: 0.08 });
    this._tone(t, 2800, 0.02, { type: 'sine', peak: 0.05 });
  }

  _select(t) {
    this._tone(t, 880, 0.05, { type: 'triangle', peak: 0.15 });
    this._tone(t + 0.045, 1320, 0.06, { type: 'triangle', peak: 0.12 });
  }

  _illegal(t) {
    for (const dt of [0, 0.12]) {
      const env = this._env(t + dt, 0.005, 0.07, 0.03, 0.18);
      const f = this._filter('lowpass', 900);
      f.connect(env);
      this._osc('square', 110, t + dt, 0.1, f);
      this._osc('square', 116, t + dt, 0.1, f);
    }
  }

  _sms(t) {
    // phone "text received" double blip
    this._tone(t, 1760, 0.05, { type: 'sine', peak: 0.12 });
    this._tone(t + 0.09, 2349, 0.08, { type: 'sine', peak: 0.12 });
  }

  // ------------------------------------------------------------------ vehicles / characters

  _rev(t, { base, peak, dur, type = 'sawtooth', cutoff = 1200, gain = 0.2, wobble = 0 }) {
    const env = this._env(t, 0.04, dur * 0.6, dur * 0.4, gain);
    const f = this._filter('lowpass', cutoff, 2);
    f.connect(env);
    const o1 = this._osc(type, base, t, dur, f);
    const o2 = this._osc(type, base * 1.01, t, dur, f);
    for (const o of [o1, o2]) {
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(peak, t + dur * 0.35);
      o.frequency.exponentialRampToValueAtTime(peak * 0.7, t + dur * 0.55);
      o.frequency.exponentialRampToValueAtTime(peak * 0.95, t + dur * 0.8);
      o.frequency.exponentialRampToValueAtTime(base * 1.2, t + dur);
    }
    if (wobble) {
      const lfo = this._osc('sine', wobble, t, dur, this.ctx.createGain());
      const depth = this.ctx.createGain();
      depth.gain.value = base * 0.15;
      lfo.disconnect();
      lfo.connect(depth);
      depth.connect(o1.frequency);
      depth.connect(o2.frequency);
    }
    // exhaust hiss
    const nf = this._filter('bandpass', cutoff * 0.8, 0.8);
    const ne = this._env(t, 0.05, dur * 0.5, dur * 0.4, gain * 0.25);
    nf.connect(ne);
    this._noiseSrc(t, dur, nf);
  }

  _engine(t) {
    // touring race car (bishop): throaty rev + drift squeal
    this._rev(t, { base: 70, peak: 230, dur: 0.85, cutoff: 1400, gain: 0.2, wobble: 28 });
    const sq = this._filter('bandpass', 2600, 12);
    const se = this._env(t + 0.3, 0.08, 0.2, 0.25, 0.05);
    sq.connect(se);
    this._noiseSrc(t + 0.3, 0.55, sq);
  }

  _bike(t) {
    // sport bike (knight): high whiny two-stroke rev
    this._rev(t, { base: 140, peak: 520, dur: 0.9, type: 'square', cutoff: 2200, gain: 0.12, wobble: 45 });
  }

  _truck(t) {
    // armored truck (rook): low diesel rumble
    this._rev(t, { base: 42, peak: 95, dur: 1.05, cutoff: 500, gain: 0.3, wobble: 14 });
  }

  _rotor(t) {
    // helicopter (queen): chopped band-passed noise + low thump
    const dur = 1.25;
    const f = this._filter('bandpass', 380, 0.9);
    const chop = this.ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = this._osc('square', 11, t, dur, this.ctx.createGain());
    lfo.frequency.linearRampToValueAtTime(16, t + dur * 0.5);
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.disconnect();
    lfo.connect(lfoDepth).connect(chop.gain);
    const env = this._env(t, 0.2, dur * 0.55, dur * 0.3, 0.45);
    f.connect(chop).connect(env);
    this._noiseSrc(t, dur, f);
    const th = this._env(t, 0.2, dur * 0.55, dur * 0.3, 0.12);
    this._osc('sine', 55, t, dur, th);
    // turbine whine
    const w = this._tone(t, 900, dur, { type: 'sine', peak: 0.02, attack: 0.3 });
    w.frequency.linearRampToValueAtTime(1400, t + dur);
  }

  _step(t, gain, cutoff) {
    const f = this._filter('lowpass', cutoff, 1);
    const env = this._env(t, 0.003, 0.01, 0.07, gain);
    f.connect(env);
    this._noiseSrc(t, 0.1, f);
    this._tone(t, 90, 0.06, { type: 'sine', peak: gain * 0.6 });
  }

  _footsteps(t) {
    // street thug (pawn): quick sneaker steps
    for (let i = 0; i < 4; i++) this._step(t + i * 0.14, 0.22, 1600 + (i % 2) * 300);
  }

  _boss(t) {
    // the boss (king): heavy slow swagger steps + chain jingle
    for (let i = 0; i < 3; i++) {
      this._step(t + i * 0.24, 0.32, 900);
      this._tone(t + i * 0.24 + 0.02, 4200 + i * 300, 0.05, { type: 'triangle', peak: 0.025 });
    }
  }

  _land(t) {
    this._tone(t, 140, 0.25, { type: 'sine', peak: 0.35, glideTo: 40 });
    const f = this._filter('lowpass', 600);
    const e = this._env(t, 0.002, 0.02, 0.15, 0.15);
    f.connect(e);
    this._noiseSrc(t, 0.2, f);
  }

  _castle(t) {
    // valet parking: truck rev + boss steps + key-fob chirp
    this._truck(t);
    this._boss(t + 0.15);
    this._tone(t + 0.9, 2000, 0.05, { type: 'square', peak: 0.05 });
    this._tone(t + 1.0, 2000, 0.05, { type: 'square', peak: 0.05 });
  }

  // ------------------------------------------------------------------ events

  _explosion(t) {
    const dur = 1.4;
    const f = this._filter('lowpass', 4000, 0.7);
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const env = this._env(t, 0.005, 0.08, dur, 0.9);
    f.connect(env);
    this._noiseSrc(t, dur + 0.1, f);
    // sub boom
    this._tone(t, 90, 0.9, { type: 'sine', peak: 0.7, glideTo: 30 });
    // crackle debris
    for (let i = 0; i < 6; i++) {
      const dt = 0.15 + Math.random() * 0.7;
      const cf = this._filter('bandpass', 1500 + Math.random() * 2500, 4);
      const ce = this._env(t + dt, 0.002, 0.005, 0.05, 0.12);
      cf.connect(ce);
      this._noiseSrc(t + dt, 0.07, cf);
    }
  }

  _siren(t) {
    // police wail: alternating hi-lo, two cycles
    const dur = 1.6;
    const env = this._env(t, 0.05, dur - 0.3, 0.25, 0.12);
    const f = this._filter('lowpass', 2500);
    f.connect(env);
    const o = this._osc('sawtooth', 700, t, dur, f);
    const o2 = this._osc('triangle', 700, t, dur, f);
    for (let i = 0; i < 4; i++) {
      const tt = t + i * (dur / 4);
      for (const x of [o, o2]) {
        x.frequency.setValueAtTime(i % 2 ? 580 : 960, tt);
      }
    }
  }

  _cash(t) {
    // cha-ching: register "cha" (noise) + bell "ching"
    const f = this._filter('highpass', 3000);
    const e = this._env(t, 0.002, 0.03, 0.06, 0.25);
    f.connect(e);
    this._noiseSrc(t, 0.1, f);
    for (const [fr, pk] of [
      [2637, 0.14],
      [3951, 0.08],
      [5274, 0.05],
    ]) {
      this._tone(t + 0.1, fr, 0.5, { type: 'sine', peak: pk });
      this._tone(t + 0.1, fr * 1.003, 0.5, { type: 'triangle', peak: pk * 0.3 });
    }
  }

  _upgrade(t) {
    [60, 64, 67, 72, 76].forEach((n, i) =>
      this._tone(t + i * 0.07, mtof(n + 12), 0.18, { type: 'square', peak: 0.07 }),
    );
    this._tone(t + 0.35, mtof(84), 0.5, { type: 'triangle', peak: 0.12 });
  }

  _wasted(t) {
    // slow-mo whoosh + detuned descending low chord + heartbeat
    const dur = 2.8;
    const f = this._filter('lowpass', 1200, 1);
    f.frequency.setValueAtTime(1600, t);
    f.frequency.exponentialRampToValueAtTime(200, t + dur);
    const env = this._env(t, 0.08, 0.8, dur - 0.9, 0.35);
    f.connect(env);
    for (const n of [45, 48, 52, 45.1]) {
      const o = this._osc('sawtooth', mtof(n), t, dur, f);
      o.frequency.exponentialRampToValueAtTime(mtof(n - 7), t + dur);
    }
    const nf = this._filter('bandpass', 800, 0.5);
    nf.frequency.setValueAtTime(3000, t);
    nf.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const ne = this._env(t, 0.3, 0.1, 0.9, 0.2);
    nf.connect(ne);
    this._noiseSrc(t, 1.4, nf);
    for (const dt of [0.2, 0.42, 1.2, 1.42]) this._tone(t + dt, 60, 0.18, { type: 'sine', peak: 0.5, glideTo: 35 });
  }

  _passed(t) {
    // mission passed jingle: bright arpeggio + held major chord
    const seq = [67, 72, 76, 79, 84];
    seq.forEach((n, i) => {
      this._tone(t + i * 0.11, mtof(n), 0.22, { type: 'square', peak: 0.06 });
      this._tone(t + i * 0.11, mtof(n), 0.3, { type: 'triangle', peak: 0.12 });
    });
    const tc = t + seq.length * 0.11;
    for (const n of [60, 64, 67, 72]) {
      const env = this._env(tc, 0.02, 0.6, 0.9, 0.06);
      const f = this._filter('lowpass', 3000);
      f.connect(env);
      this._osc('sawtooth', mtof(n), tc, 1.5, f);
      this._osc('sawtooth', mtof(n) * 1.004, tc, 1.5, f);
    }
    this._tone(tc, mtof(36), 1.4, { type: 'sine', peak: 0.25 });
  }

  _busted(t) {
    // flat two-note "mission failed"
    for (const [dt, n] of [
      [0, 58],
      [0.32, 53],
    ]) {
      const env = this._env(t + dt, 0.01, 0.2, 0.5, 0.12);
      const f = this._filter('lowpass', 1400);
      f.connect(env);
      this._osc('sawtooth', mtof(n), t + dt, 0.75, f);
      this._osc('square', mtof(n - 12), t + dt, 0.75, f);
    }
  }

  // ------------------------------------------------------------------ ambient radio

  /**
   * Background music. Uses the generated soundtrack (this.music, see Music.js) when it's available;
   * otherwise a quiet synthwave loop (bass + pads + hats) scheduled with a lookahead timer.
   * tag picks the soundtrack mood; matches use music.matchTag (set by Hustler per neighborhood) or 'match'.
   */
  startRadio(tag) {
    if (this.music?.available) {
      this.music.play(tag || this.music.matchTag || 'match');
      return;
    }
    this._radioWanted = true;
    if (!this.ctx || this._radio) return;
    const bpm = 96;
    const step = 60 / bpm / 4; // 16ths
    // Am - F - C - G (vice city dusk)
    const chords = [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ];
    const bass = [45, 41, 36, 43];
    const state = { next: this.ctx.currentTime + 0.1, i: 0 };
    const schedule = () => {
      if (!this.ctx) return;
      while (state.next < this.ctx.currentTime + 0.25) {
        const t = state.next;
        const i = state.i;
        const bar = Math.floor(i / 16) % 4;
        const s = i % 16;
        if (!this._muted) {
          if (s % 4 === 0 || s === 6 || s === 14) this._radioBass(t, mtof(bass[bar]), step * 1.8);
          if (s === 0) this._radioPad(t, chords[bar], step * 16);
          if (s % 2 === 1) this._radioHat(t);
          if (s === 4 || s === 12) this._radioSnare(t);
        }
        state.next += step;
        state.i++;
      }
    };
    schedule();
    this._radio = setInterval(schedule, 80);
  }

  stopRadio() {
    this._radioWanted = false;
    if (this._radio) clearInterval(this._radio);
    this._radio = null;
  }

  _radioBass(t, f, dur) {
    const env = this._env(t, 0.01, dur * 0.5, dur * 0.5, 0.5, this.radioBus);
    const lp = this._filter('lowpass', 500, 4);
    lp.connect(env);
    this._osc('sawtooth', f, t, dur, lp);
  }
  _radioPad(t, notes, dur) {
    const env = this._env(t, 0.4, dur - 0.9, 0.5, 0.14, this.radioBus);
    const lp = this._filter('lowpass', 1400, 0.5);
    lp.connect(env);
    for (const n of notes) {
      this._osc('sawtooth', mtof(n), t, dur, lp);
      this._osc('sawtooth', mtof(n) * 1.006, t, dur, lp);
    }
  }
  _radioHat(t) {
    const hp = this._filter('highpass', 7000);
    const env = this._env(t, 0.001, 0.005, 0.03, 0.12, this.radioBus);
    hp.connect(env);
    this._noiseSrc(t, 0.05, hp);
  }
  _radioSnare(t) {
    const bp = this._filter('bandpass', 1800, 0.7);
    const env = this._env(t, 0.001, 0.01, 0.15, 0.25, this.radioBus);
    bp.connect(env);
    this._noiseSrc(t, 0.2, bp);
  }
}
