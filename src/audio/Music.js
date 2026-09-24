// Soundtrack radio: plays the Gemini/Lyria-generated songs listed in public/music/manifest.json.
//   const music = new Music(sfx);  await music.load();
//   music.play(tag)      tag: 'title' | 'match' | 'hub' | 'puzzle' | 'boss' | 'city_boss' | 'nh1'..'nh4'
//   music.next() / music.stop()
//   music.onNowPlaying = (track) => {}
// Songs are shuffled per tag (no repeats until the bag is empty, never the same song twice in a row) and
// crossfaded. Audio goes through the Sfx music bus → master, so the Music volume and mute cover it.
// If there is no manifest (songs not generated yet) `available` stays false and Sfx keeps its synth loop.

const FADE = 2.5; // seconds
const VOLUME = 0.8; // relative to the Sfx master
const FALLBACK = { nh1: 'match', nh2: 'match', nh3: 'match', nh4: 'match', boss: 'match', city_boss: 'boss', puzzle: 'hub', hub: 'match', title: 'match' };

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.tracks = [];
    this.available = false;
    this.tag = null;
    this.current = null; // { track, el, gain }
    this.onNowPlaying = null;
    this._bags = {};
    this._lastId = null;
    this._wantPlay = false;
  }

  async load(url = 'music/manifest.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return false;
      const json = await res.json();
      this.tracks = (json.tracks || []).filter((t) => t && t.file && Array.isArray(t.tags));
      this.available = this.tracks.length > 0;
    } catch {
      this.available = false; // dev server answers a missing file with index.html → JSON error
    }
    return this.available;
  }

  /** Tracks for a tag, walking the fallback chain (e.g. nh2 → match) if none are tagged. */
  _pool(tag) {
    let t = tag;
    for (let i = 0; i < 4 && t; i++) {
      const pool = this.tracks.filter((x) => x.tags.includes(t));
      if (pool.length) return { key: t, pool };
      t = FALLBACK[t];
    }
    return { key: 'all', pool: this.tracks };
  }

  _pick(tag) {
    const { key, pool } = this._pool(tag);
    if (!pool.length) return null;
    let bag = this._bags[key];
    if (!bag || !bag.length) {
      bag = this._bags[key] = pool.map((t) => t.id).sort(() => Math.random() - 0.5);
      if (bag.length > 1 && bag[bag.length - 1] === this._lastId) bag.unshift(bag.pop());
    }
    const id = bag.pop();
    return pool.find((t) => t.id === id) || pool[0];
  }

  /** Switch the soundtrack to a tag; keeps the current song if it already fits. */
  play(tag = 'match') {
    if (!this.available) return false;
    this._wantPlay = true;
    const same = this.tag === tag && this.current;
    this.tag = tag;
    if (same) return true;
    if (this.current && this._pool(tag).pool.some((t) => t.id === this.current.track.id)) return true;
    this._start(this._pick(tag));
    return true;
  }

  next() {
    if (!this.available || !this.tag) return;
    this._start(this._pick(this.tag));
  }

  stop() {
    this._wantPlay = false;
    this.tag = null;
    this._fadeOut(this.current);
    this.current = null;
  }

  /** Call after the AudioContext exists (first user gesture) to start anything requested earlier. */
  resume() {
    if (this._wantPlay && this.tag && !this.current) this._start(this._pick(this.tag));
    this.current?.el.play().catch(() => {});
  }

  _start(track) {
    const ctx = this.sfx?.ctx;
    if (!track || !ctx || !this.sfx.master) return; // no audio yet: resume() starts it later
    const el = new Audio(track.file);
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.sfx.musicBus || this.sfx.master);
    const cur = { track, el, gain, src };
    el.addEventListener('ended', () => {
      if (this.current === cur) this.next();
    });
    el.addEventListener('error', () => {
      console.warn('[Music] could not play', track.file);
      if (this.current === cur) {
        this.tracks = this.tracks.filter((t) => t.id !== track.id);
        this.available = this.tracks.length > 0;
        this._bags = {};
        if (this.available) this.next();
      }
    });
    this._fadeOut(this.current);
    this.current = cur;
    this._lastId = track.id;
    el.play()
      .then(() => {
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(VOLUME, t + FADE);
        this.onNowPlaying?.(track);
      })
      .catch(() => {}); // autoplay blocked until a gesture; resume() retries
  }

  _fadeOut(cur) {
    if (!cur) return;
    const ctx = this.sfx.ctx;
    const t = ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + FADE);
    setTimeout(() => {
      cur.el.pause();
      cur.src.disconnect();
      cur.gain.disconnect();
      cur.el.removeAttribute('src');
    }, FADE * 1000 + 100);
  }
}
