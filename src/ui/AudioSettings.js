// Audio settings panel: Master / Music / Sound effects volume, mute, and the current song with a skip button.
//   const panel = new AudioSettings(hudRootEl, { sfx, music });
//   panel.open() / panel.close() / panel.toggle()
// Volumes live in Sfx (persisted to localStorage); the panel is just a view over sfx.audioState().
import './audioSettings.css';

const SLIDERS = [
  { kind: 'master', label: 'MASTER' },
  { kind: 'music', label: 'MUSIC', note: 'Radio stations and soundtrack' },
  { kind: 'sfx', label: 'SOUND EFFECTS', note: 'Engines, explosions, sirens, texts' },
];

export class AudioSettings {
  constructor(rootEl, { sfx, music = null }) {
    this.sfx = sfx;
    this.music = music;
    this.isOpen = false;

    const el = (this.el = document.createElement('div'));
    el.className = 'gtc-audio';
    el.hidden = true;
    el.innerHTML = `
      <div class="gtc-audio__scrim" data-close></div>
      <section class="gtc-audio__card" role="dialog" aria-modal="true" aria-label="Audio settings">
        <header class="gtc-audio__head">
          <span class="gtc-audio__kicker">SETTINGS</span>
          <h2>AUDIO</h2>
          <button type="button" class="gtc-audio__x" data-close aria-label="Close">✕</button>
        </header>
        ${SLIDERS.map(
          (s) => `
          <label class="gtc-audio__row">
            <span class="gtc-audio__lbl">${s.label}<b data-val="${s.kind}"></b></span>
            <input type="range" min="0" max="100" step="1" data-kind="${s.kind}" aria-label="${s.label} volume" />
            ${s.note ? `<span class="gtc-audio__note">${s.note}</span>` : ''}
          </label>`,
        ).join('')}
        <button type="button" class="gtc-audio__mute" data-mute></button>
        <div class="gtc-audio__now" hidden>
          <span class="gtc-audio__kicker">NOW PLAYING</span>
          <div class="gtc-audio__song"><b data-song></b><span data-station></span></div>
          <button type="button" class="gtc-audio__skip" data-skip>SKIP SONG ›</button>
        </div>
        <p class="gtc-audio__hint"><kbd>V</kbd> audio settings · <kbd>M</kbd> mute · <kbd>N</kbd> next song</p>
      </section>`;
    rootEl.appendChild(el);

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.close();
      else if (e.target.closest('[data-mute]')) this.sfx.toggleMute();
      else if (e.target.closest('[data-skip]')) {
        this.music?.next();
        setTimeout(() => this._render(), 300);
      }
    });
    el.addEventListener('input', (e) => {
      const kind = e.target.dataset?.kind;
      if (kind) this.sfx.setVolume(kind, e.target.value / 100);
    });
    // preview the effects level when the slider is released
    el.addEventListener('change', (e) => {
      if (e.target.dataset?.kind === 'sfx' || e.target.dataset?.kind === 'master') this.sfx.play('click');
    });
    this._onKey = (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    window.addEventListener('keydown', this._onKey, true);

    const prev = sfx.onChange;
    sfx.onChange = (state) => {
      prev?.(state);
      if (this.isOpen) this._render();
    };
  }

  open() {
    this.sfx.resume?.(); // opening the panel is a user gesture: make sure audio can play
    this.isOpen = true;
    this.el.hidden = false;
    this._render();
    this.el.querySelector('input[type=range]')?.focus({ preventScroll: true });
  }

  close() {
    this.isOpen = false;
    this.el.hidden = true;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  _render() {
    const st = this.sfx.audioState();
    for (const s of SLIDERS) {
      const input = this.el.querySelector(`[data-kind="${s.kind}"]`);
      const pct = Math.round(st[s.kind] * 100);
      if (document.activeElement !== input) input.value = pct;
      input.style.setProperty('--fill', `${pct}%`);
      this.el.querySelector(`[data-val="${s.kind}"]`).textContent = `${pct}%`;
    }
    const mute = this.el.querySelector('[data-mute]');
    mute.textContent = st.muted ? 'SOUND OFF — TAP TO UNMUTE' : 'SOUND ON — TAP TO MUTE';
    mute.classList.toggle('is-off', st.muted);
    this.el.querySelector('.gtc-audio__card').classList.toggle('is-muted', st.muted);

    const cur = this.music?.available ? this.music.current?.track : null;
    const now = this.el.querySelector('.gtc-audio__now');
    now.hidden = !cur;
    if (cur) {
      now.querySelector('[data-song]').textContent = cur.title;
      now.querySelector('[data-station]').textContent = cur.station;
    }
  }
}
