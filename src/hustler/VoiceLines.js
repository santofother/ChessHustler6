// Hustler Mode voice lines: fixed, pre-written lines (src/hustler/data/voicelines.js, generated once with Gemini)
// shown as speech bubbles rising from the speaking side's king.
//
//   const voice = new VoiceLines({ world, rootEl, speakerId, speakerName, speakerColor, gangName, rivalName });
//   GameController (custom mode) calls: voice.start(), voice.onMove(m, { check, board }), voice.onTurn(isHuman),
//   voice.end(over, playerColor) and voice.dispose().
// The rival leader is the star (speaks most); the player's Boss chimes in less often.
import './voice.css';
import { VOICE_LINES } from './data/voicelines.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const GAP_MS = 5500; // minimum time between two ordinary bubbles
const IDLE_MS = 20000;
const MAX_IDLE = 3;

const sideOf = (who, playerColor) => (who === 'player' ? playerColor : playerColor === 'w' ? 'b' : 'w');

export class VoiceLines {
  constructor({ world, rootEl, speakerId, speakerName, speakerColor, gangName, rivalName, playerColor = 'w' }) {
    this.world = world;
    this.playerColor = playerColor;
    this.lines = {
      leader: VOICE_LINES?.speakers?.[speakerId] || null,
      player: VOICE_LINES?.speakers?.player || null,
    };
    this.names = { leader: speakerName || 'Rival', player: gangName || 'Your Boss' };
    this.colors = { leader: speakerColor || '#ffcc4d', player: '#29e3d6' };
    this.fill = { '{gang}': gangName || 'the crew', '{rival}': rivalName || speakerName || 'pal' };
    this.used = new Set();
    this.lastAt = 0;
    this.idleCount = 0;
    this.material = 0; // leader-perspective material balance band: -1 losing, 0 even, 1 winning
    this.timers = new Set();
    this.bubbles = new Map(); // who -> { el, until }
    this.alive = true;

    this.layer = document.createElement('div');
    this.layer.className = 'gtc-voice';
    rootEl.appendChild(this.layer);
    this._raf = requestAnimationFrame(() => this._follow());
  }

  get available() {
    return !!(this.lines.leader || this.lines.player);
  }

  // ------------------------------------------------------------------ game events

  start() {
    this._later(1200, () => this.say('leader', 'intro', { force: true }));
    this._later(5200, () => Math.random() < 0.5 && this.say('player', 'intro'));
  }

  /** After every move (m = chess.js move). board = chess.js board() after the move. */
  onMove(m, { check = false, board = null } = {}) {
    this._clearIdle();
    const mover = m.color === this.playerColor ? 'player' : 'leader';
    const victim = mover === 'player' ? 'leader' : 'player';
    const castled = m.flags.includes('k') || m.flags.includes('q');

    // one reaction per move, most dramatic first
    if (check) {
      if (this._roll(mover, 0.55) && this.say(mover, 'give_check')) return;
      if (this._roll(victim, 0.55) && this.say(victim, 'in_check')) return;
    }
    if (m.captured) {
      if (this._wasBiggest(m.captured, m.color === 'w' ? 'b' : 'w', board) && this.say(victim, 'lose_big', { force: true })) return;
      if (this._roll(mover, 0.4) && this.say(mover, 'capture')) return;
      if (this._roll(victim, 0.35) && this.say(victim, 'lose_piece')) return;
    }
    if (m.promotion && this.say(Math.random() < 0.6 ? 'leader' : 'player', 'promotion')) return;
    if (castled && this._roll(mover, 0.5) && this.say(mover, 'castle')) return;
    if (board) this._materialSwing(board);
  }

  /** Called when a turn starts; starts the "hurry up" timer while the human is thinking. */
  onTurn(humanToMove) {
    this._clearIdle();
    if (!humanToMove || this.idleCount >= MAX_IDLE) return;
    this._idle = this._later(IDLE_MS, () => {
      if (this.say('leader', 'idle')) this.idleCount++;
    });
  }

  /** over = { result:'w'|'b'|'draw', reason } */
  end(over) {
    this._clearIdle();
    if (over.result === 'draw') {
      this.say('leader', 'standoff', { force: true });
      return;
    }
    const playerWon = over.result === this.playerColor;
    if (over.reason === 'checkmate') {
      this.say(playerWon ? 'leader' : 'player', 'checkmated', { force: true });
      this._later(2600, () => this.say(playerWon ? 'player' : 'leader', 'win', { force: true }));
    } else {
      this.say(playerWon ? 'player' : 'leader', 'win', { force: true });
    }
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this._raf);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.layer.remove();
  }

  // ------------------------------------------------------------------ speaking

  /** Show a line for `who` ('leader'|'player') from `trigger`. Returns true if something was said. */
  say(who, trigger, { force = false } = {}) {
    if (!this.alive) return false;
    const pool = this.lines[who]?.[trigger];
    if (!pool || !pool.length) return false;
    const now = performance.now();
    if (!force && now - this.lastAt < GAP_MS) return false;
    const fresh = pool.filter((l) => !this.used.has(l));
    const line = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    this.used.add(line);
    this.lastAt = now;
    this._show(who, line.replace(/\{gang\}|\{rival\}/g, (k) => this.fill[k]));
    return true;
  }

  _show(who, text) {
    this.bubbles.get(who)?.el.remove();
    const el = document.createElement('div');
    el.className = `gtc-voice__bubble gtc-voice__bubble--${who}`;
    el.style.setProperty('--who', this.colors[who]);
    const name = document.createElement('div');
    name.className = 'gtc-voice__name';
    name.textContent = this.names[who];
    const body = document.createElement('div');
    body.className = 'gtc-voice__text';
    body.textContent = text;
    el.append(name, body);
    this.layer.appendChild(el);
    const until = performance.now() + Math.min(6500, 2400 + text.length * 45);
    this.bubbles.set(who, { el, until });
    this._position(who);
  }

  _follow() {
    if (!this.alive) return;
    const now = performance.now();
    for (const [who, b] of this.bubbles) {
      if (now > b.until) {
        if (!b.closing) {
          b.closing = true;
          b.el.classList.add('is-out');
          this._later(400, () => {
            b.el.remove();
            if (this.bubbles.get(who) === b) this.bubbles.delete(who);
          });
        }
      } else this._position(who);
    }
    this._raf = requestAnimationFrame(() => this._follow());
  }

  _position(who) {
    const b = this.bubbles.get(who);
    if (!b) return;
    const pos = this.world.pieceScreenPos?.(sideOf(who, this.playerColor), 'k');
    if (!pos || !pos.onScreen) {
      b.el.classList.add('is-hidden');
      return;
    }
    b.el.classList.remove('is-hidden');
    // keep the bubble inside the viewport; the tail still points at the king
    const w = b.el.offsetWidth || 240;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, pos.x - w / 2));
    b.el.style.transform = `translate(${left}px, ${Math.max(8, pos.y - b.el.offsetHeight - 14)}px)`;
    b.el.style.setProperty('--tail', `${Math.max(18, Math.min(w - 18, pos.x - left))}px`);
  }

  // ------------------------------------------------------------------ helpers

  _roll(who, chance) {
    return Math.random() < (who === 'player' ? chance * 0.5 : chance);
  }

  /** Was the captured piece the side's most valuable non-king piece (queen, or a rook with no queen)? */
  _wasBiggest(type, side, board) {
    if (VALUE[type] < 5 || !board) return false;
    for (const row of board) for (const c of row) if (c && c.color === side && VALUE[c.type] >= VALUE[type]) return false;
    return true;
  }

  _materialSwing(board) {
    const leaderSide = sideOf('leader', this.playerColor);
    let diff = 0;
    for (const row of board) for (const c of row) if (c) diff += (c.color === leaderSide ? 1 : -1) * VALUE[c.type];
    const band = diff >= 3 ? 1 : diff <= -3 ? -1 : Math.abs(diff) <= 1 ? 0 : this.material;
    if (band !== this.material) {
      this.material = band;
      if (band === 1) this.say('leader', 'winning');
      else if (band === -1) this.say('leader', 'losing');
    }
  }

  _later(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.alive) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  _clearIdle() {
    if (this._idle) clearTimeout(this._idle);
    this.timers.delete(this._idle);
    this._idle = null;
  }
}
