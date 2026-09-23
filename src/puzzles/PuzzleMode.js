// PuzzleMode — the "HUSTLE BOARD": real Lichess puzzles (CC0) played on the 3D board for side cash.
// Contract: docs/hustler/HUSTLER_SPEC.md §4.6
//
//   const pm = new PuzzleMode({ world, hud, sfx, rootEl });   // hud/sfx may be null
//   await pm.run({ solvedIds, rewardFor, onSolved });          // resolves when the player backs out to the map
//   pm.stop();                                                 // optional: force-exit (resolves run())
//
// While running it owns world.onSquareClick / onFx / onFrame and restores the previous handlers on exit.
// Payout rules live with the caller: rewardFor(puzzle, { firstTry, repeat }) → cash. A puzzle whose
// solution was revealed this session pays nothing and does not fire onSolved.
import './puzzles.css';
import { loadPuzzles, byTier } from './data.js';
import { PuzzleSession } from './session.js';
import { TIERS, themeLabel } from './tiers.js';
import { toAnimArgs } from '../chess/rules.js';
import { Chess } from 'chess.js';
import { pieceSvg, signalSvg, batterySvg, PIECE_NAMES } from '../ui/icons.js';

const SIDE = { w: 'WHITE', b: 'BLACK' };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function cash(n) {
  return '$' + Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
}
function statusBar() {
  const d = new Date();
  const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return `<div class="gtp-sb"><span>${t}</span><span class="gtp-sb__notch"></span><span class="gtp-sb__right"><small>LEONIDA</small>${signalSvg()}${batterySvg()}</span></div>`;
}
function reflow(el) {
  void el.offsetWidth;
}
function mateGoal(p) {
  const m = p.themes.find((t) => /^mateIn\d$/.test(t));
  return m ? `Checkmate in ${m.slice(6)}` : null;
}

export class PuzzleMode {
  constructor({ world, hud = null, sfx = null, rootEl }) {
    this.world = world;
    this.hud = hud;
    this.sfx = sfx;
    this.rootEl = rootEl;
    this.running = false;
    this.state = 'idle'; // idle | picker | setup | player | animating | promoting | done
    this._token = 0;
    this._revealed = new Set();
    this._cursor = {};
    this._earned = 0;
    this._solvedThisRun = 0;
  }

  // ================================================================= public API
  run({ solvedIds = new Set(), rewardFor = () => 0, onSolved = () => {} } = {}) {
    if (this.running) this.stop();
    this.running = true;
    this._solved = new Set(solvedIds || []);
    this._rewardFor = rewardFor;
    this._onSolved = onSolved;
    this._earned = 0;
    this._solvedThisRun = 0;

    const w = this.world;
    this._prev = { onSquareClick: w.onSquareClick, onFx: w.onFx, onFrame: w.onFrame };
    w.onSquareClick = (sq) => this._click(sq);
    w.onFx = (name, data) => {
      try {
        this.sfx?.fx?.(name, data);
      } catch (_) {
        /* ignore */
      }
    };
    w.onFrame = null;

    this._build();
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);

    return new Promise((resolve) => {
      this._resolve = resolve;
      this._openPicker();
    });
  }

  /** Force-exit (e.g. the campaign needs the screen back). Safe to call when not running. */
  stop() {
    if (!this.running) return;
    this.running = false;
    this._token++;
    this.state = 'idle';
    window.removeEventListener('keydown', this._onKey);
    clearTimeout(this._nopeT);
    clearTimeout(this._rewardT);
    const w = this.world;
    try {
      w.highlight({});
      w.setInputEnabled(true);
      w.setCameraPreset('white'); // Hustler player is always white; campaign resets the board itself
    } catch (_) {
      /* ignore */
    }
    if (this._prev) {
      w.onSquareClick = this._prev.onSquareClick;
      w.onFx = this._prev.onFx;
      w.onFrame = this._prev.onFrame;
      this._prev = null;
    }
    this.el?.remove();
    this.el = null;
    const r = this._resolve;
    this._resolve = null;
    r?.({ solved: this._solvedThisRun, earned: this._earned });
  }

  // ================================================================= DOM
  _build() {
    this.el?.remove();
    const E = (this.E = {});
    const root = (this.el = h('div', 'gtp'));

    // --- picker
    E.picker = h('div', 'gtp-picker gtp-layer', `
      <div class="gtp-picker__bg"></div>
      <div class="gtp-picker__left">
        <div class="gtp-logo__small">SIDE HUSTLE</div>
        <div class="gtp-logo__big">HUSTLE<br>BOARD</div>
        <div class="gtp-logo__sub"><span>STREET SMARTS PAY</span></div>
        <p class="gtp-picker__tag">Real positions from real street games. Find the killer move, collect the cash.
          First try pays best — hints and wrong guesses cost you the bonus.</p>
        <div class="gtp-picker__stats">
          <div class="gtp-stat"><b data-s="solved">0</b><span>JOBS DONE</span></div>
          <div class="gtp-stat"><b data-s="earned" class="gtp-money">$0</b><span>THIS VISIT</span></div>
        </div>
        <p class="gtp-credit">Puzzles: Lichess puzzle database, CC0 public domain.</p>
      </div>
      <div class="gtp-picker__phone gtp-phone gtp-int" role="dialog" aria-label="Hustle board">
        ${statusBar()}
        <div class="gtp-head"><span class="gtp-kicker">BURNER PHONE · SIDE JOBS</span><b>PICK YOUR CORNER</b></div>
        <div class="gtp-tiers"></div>
        <div class="gtp-picker__foot">
          <button type="button" class="gtp-btn" data-a="exit">BACK TO THE MAP</button>
        </div>
        <div class="gtp-hintkeys"><span><kbd>1</kbd>–<kbd>4</kbd> PICK</span><span><kbd>ESC</kbd> MAP</span></div>
      </div>`);
    E.tiers = E.picker.querySelector('.gtp-tiers');
    E.statSolved = E.picker.querySelector('[data-s="solved"]');
    E.statEarned = E.picker.querySelector('[data-s="earned"]');
    E.picker.querySelector('[data-a="exit"]').addEventListener('click', () => {
      this._sfx('click');
      this.stop();
    });

    // --- play
    E.play = h('div', 'gtp-play gtp-layer', `
      <div class="gtp-card gtp-phone gtp-int">
        ${statusBar()}
        <div class="gtp-card__head">
          <span class="gtp-kicker" data-k="kicker">JOB</span>
          <div class="gtp-card__row">
            <div class="gtp-card__side"><i></i><span data-k="side">WHITE TO MOVE</span></div>
            <div class="gtp-card__pay gtp-money" data-k="pay"></div>
          </div>
          <div class="gtp-card__goal"><span data-k="goal"></span><span class="gtp-dots" data-k="dots"></span></div>
        </div>
        <div class="gtp-msg" data-k="msg"></div>
        <div class="gtp-actions" data-k="actions"></div>
        <div class="gtp-card__foot"><span><kbd>H</kbd>HINT <kbd>ESC</kbd>BACK</span><a data-k="link" target="_blank" rel="noopener"></a></div>
      </div>
      <div class="gtp-nope"></div>
      <div class="gtp-reward"></div>`);
    const q = (k) => E.play.querySelector(`[data-k="${k}"]`);
    Object.assign(E, {
      card: E.play.querySelector('.gtp-card'),
      kicker: q('kicker'),
      side: q('side'),
      sideChip: E.play.querySelector('.gtp-card__side i'),
      pay: q('pay'),
      goal: q('goal'),
      dots: q('dots'),
      msg: q('msg'),
      actions: q('actions'),
      link: q('link'),
      nope: E.play.querySelector('.gtp-nope'),
      reward: E.play.querySelector('.gtp-reward'),
    });
    E.actions.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && !b.disabled) this._action(b.dataset.a);
    });

    root.append(E.picker, E.play);
    this.rootEl.appendChild(root);
  }

  _show(layer) {
    for (const k of ['picker', 'play']) {
      const el = this.E[k];
      const on = k === layer;
      if (on && !el.classList.contains('is-on')) {
        reflow(el);
        el.classList.add('is-on');
      } else if (!on) el.classList.remove('is-on');
    }
  }

  _sfx(name) {
    try {
      this.sfx?.play?.(name);
    } catch (_) {
      /* ignore */
    }
  }

  _reward(puzzle, firstTry) {
    try {
      const v = Number(this._rewardFor?.(puzzle, { firstTry, repeat: this._solved.has(puzzle.id) }));
      return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
    } catch (e) {
      console.error('[puzzles] rewardFor failed', e);
      return 0;
    }
  }

  // ================================================================= picker
  async _openPicker() {
    const tok = ++this._token;
    this.state = 'picker';
    this.session = null;
    this.selected = null;
    this._show('picker');
    this._paintStats();
    const w = this.world;
    w.setInputEnabled(false);
    w.highlight({});
    w.setCameraPreset('cinematic');
    if (!this.puzzles) {
      this.E.tiers.innerHTML = `<div class="gtp-error">Dialing the plug…</div>`;
      try {
        this.puzzles = await loadPuzzles();
        this.tiers = byTier(this.puzzles);
      } catch (e) {
        console.error('[puzzles] load failed', e);
        if (tok !== this._token) return;
        this.E.tiers.innerHTML = `<div class="gtp-error">Couldn't reach the plug — the puzzle pack failed to load.<br><br>
          <button type="button" class="gtp-btn" data-a="retry">TRY AGAIN</button></div>`;
        this.E.tiers.querySelector('[data-a="retry"]').addEventListener('click', () => this._openPicker());
        return;
      }
      if (tok !== this._token) return;
    }
    this._renderTiers();
    // dress the board with the next job so the city doesn't look empty behind the menu
    const next = this._nextPuzzle(TIERS[0].id, false);
    if (next) {
      try {
        w.setPosition(new Chess(next.fen).board());
      } catch (_) {
        /* ignore */
      }
    }
  }

  _paintStats() {
    if (!this.E) return;
    this.E.statSolved.textContent = String(this._solvedThisRun);
    this.E.statEarned.textContent = cash(this._earned);
  }

  _renderTiers() {
    const E = this.E;
    E.tiers.innerHTML = '';
    TIERS.forEach((t, i) => {
      const list = this.tiers[t.id] || [];
      const solved = list.filter((p) => this._solved.has(p.id)).length;
      const clear = list.length > 0 && solved >= list.length;
      let pay = '';
      if (list.length) {
        const lo = this._rewardHint(list[0]);
        const hi = this._rewardHint(list[list.length - 1]);
        pay = hi <= 0 ? '' : lo === hi ? cash(hi) : `${cash(lo)}–${cash(hi).slice(1)}`;
      }
      const b = h('button', `gtp-tier${clear ? ' is-clear' : ''}`, `
        <span class="gtp-tier__ico">${pieceSvg(t.icon)}</span>
        <span class="gtp-tier__name">${esc(t.name)}<small>${t.min}–${t.max}</small></span>
        <span class="gtp-tier__pay gtp-money">${pay}</span>
        <span class="gtp-tier__blurb">${esc(t.blurb)}</span>
        <span class="gtp-tier__bar"><i><b style="transform:scaleX(${list.length ? solved / list.length : 0})"></b></i>${
          clear ? 'CLEARED · REPLAYS' : `${solved} / ${list.length} DONE`
        }</span>`);
      b.type = 'button';
      b.dataset.i = String(i);
      b.disabled = !list.length;
      b.addEventListener('click', () => this._startTier(t.id));
      E.tiers.appendChild(b);
    });
  }

  _rewardHint(p) {
    try {
      const v = Number(this._rewardFor?.(p, { firstTry: true, repeat: false }));
      return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
    } catch {
      return 0;
    }
  }

  /** Next unsolved puzzle in a tier (easy → hard, after the last one played); a random replay once all are solved. */
  _nextPuzzle(tierId, advance = true) {
    const list = (this.tiers && this.tiers[tierId]) || [];
    if (!list.length) return null;
    const start = this._cursor[tierId] ?? -1;
    for (let k = 1; k <= list.length; k++) {
      const i = (start + k) % list.length;
      const p = list[i];
      if (!this._solved.has(p.id) && !this._revealed.has(p.id)) {
        if (advance) this._cursor[tierId] = i;
        return p;
      }
    }
    const i = Math.floor(Math.random() * list.length);
    if (advance) this._cursor[tierId] = i;
    return list[i];
  }

  _startTier(tierId) {
    this._sfx('click');
    const p = this._nextPuzzle(tierId);
    if (p) this._play(p);
  }

  // ================================================================= play
  async _play(puzzle) {
    const tok = ++this._token;
    const E = this.E;
    const w = this.world;
    const s = (this.session = new PuzzleSession(puzzle));
    this.selected = null;
    this.state = 'setup';
    this._show('play');
    E.reward.classList.remove('is-on');
    E.nope.classList.remove('is-on');

    const tier = TIERS.find((t) => t.id === puzzle.tier);
    const repeat = this._solved.has(puzzle.id);
    const practice = this._revealed.has(puzzle.id);
    const pay = practice ? 0 : this._reward(puzzle, true);
    E.kicker.textContent = `JOB #${puzzle.id} · ${tier ? tier.name : ''} · ${puzzle.rating}${repeat ? ' · REPLAY' : ''}`;
    E.side.textContent = `${SIDE[s.playerColor]} TO MOVE`;
    E.sideChip.className = s.playerColor === 'w' ? 'is-w' : 'is-b';
    E.pay.textContent = pay ? cash(pay) : practice ? 'PRACTICE' : 'STREET CRED';
    E.pay.classList.toggle('is-none', !pay);
    const goal = mateGoal(puzzle);
    E.goal.innerHTML = goal
      ? `<span class="gtp-chip">${esc(goal)}</span>`
      : `<span class="gtp-chip gtp-chip--ghost">FIND THE BEST MOVE</span>`;
    E.link.textContent = 'LICHESS ↗';
    E.link.href = `https://lichess.org/training/${encodeURIComponent(puzzle.id)}`;
    this._paintDots();
    this._msg('', 'Watch their move…');
    this._buttons();

    w.setInputEnabled(false);
    w.highlight({});
    w.setPosition(s.board());
    w.flipTo(s.playerColor);
    await delay(900);
    if (tok !== this._token) return;
    const setup = s.playOpponent();
    await w.animateMove(toAnimArgs(setup));
    if (tok !== this._token) return;
    w.setPosition(s.board());
    this._paintBoard();
    this.state = 'player';
    w.setInputEnabled(true);
    this._msg('', practice ? 'Practice run — no payout on this one. Your move.' : 'Your move. Make it count.');
    this._buttons();
  }

  _paintDots() {
    const s = this.session;
    if (!s) return;
    const total = s.moves.length / 2;
    const done = total - s.movesLeft;
    this.E.dots.innerHTML = total > 1 ? Array.from({ length: total }, (_, i) => `<b class="${i < done ? 'is-on' : ''}"></b>`).join('') : '';
  }

  _paintBoard(extra = {}) {
    const s = this.session;
    this.world.highlight({ lastMove: s.lastMove, check: s.checkSquare(), ...extra });
  }

  _msg(kind, html, title) {
    const m = this.E.msg;
    m.className = `gtp-msg${kind ? ` gtp-msg--${kind}` : ''}`;
    m.innerHTML = (title ? `<b>${esc(title)}</b>` : '') + html;
    reflow(m);
    m.classList.add('is-new');
  }

  _buttons() {
    const st = this.state;
    const A = this.E.actions;
    if (st === 'done') {
      A.className = 'gtp-actions gtp-actions--done';
      A.innerHTML = `<button type="button" class="gtp-btn gtp-btn--primary" data-a="next">NEXT JOB</button>
        <button type="button" class="gtp-btn" data-a="retry">RETRY</button>
        <button type="button" class="gtp-btn" data-a="back">BACK</button>`;
      return;
    }
    const busy = st !== 'player';
    A.className = 'gtp-actions';
    A.innerHTML = `<button type="button" class="gtp-btn" data-a="hint"${busy ? ' disabled' : ''}>HINT</button>
      <button type="button" class="gtp-btn" data-a="reveal"${busy ? ' disabled' : ''}>SOLUTION</button>
      <button type="button" class="gtp-btn" data-a="back">BACK</button>`;
  }

  _action(a) {
    switch (a) {
      case 'hint':
        return this._hint();
      case 'reveal':
        return this._revealSolution();
      case 'next': {
        this._sfx('click');
        const p = this._nextPuzzle(this.session?.puzzle.tier || TIERS[0].id);
        return p ? this._play(p) : this._openPicker();
      }
      case 'retry':
        this._sfx('click');
        return this.session && this._play(this.session.puzzle);
      case 'back':
        this._sfx('click');
        return this._openPicker();
    }
  }

  _key(e) {
    if (!this.running || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.state === 'promoting') return; // Hud owns the keyboard while its promotion modal is up
    const k = e.key.toLowerCase();
    let used = true;
    if (this.state === 'picker') {
      if (k === 'escape') {
        this._sfx('click');
        this.stop();
      } else if ('1234'.includes(k) && k.length === 1 && this.tiers) this._startTier(TIERS[+k - 1].id);
      else used = false;
    } else if (this.state !== 'idle') {
      if (k === 'escape') this._action('back');
      else if (k === 'h' && this.state === 'player') this._hint();
      else if ((k === 'n' || k === 'enter') && this.state === 'done') this._action('next');
      else if (k === 'r' && this.state === 'done') this._action('retry');
      else used = false;
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ================================================================= input
  _click(sq) {
    if (this.state !== 'player' || !this.session) return;
    const s = this.session;
    if (!sq) return this._deselect();
    const piece = s.get(sq);
    if (this.selected && sq !== this.selected) {
      const targets = s.movesFrom(this.selected).filter((m) => m.to === sq);
      if (targets.length) return this._tryMove(this.selected, sq);
    }
    if (piece && piece.color === s.turn()) {
      if (sq === this.selected) return this._deselect();
      this.selected = sq;
      const { moves, captures } = s.targetsFrom(sq);
      this._paintBoard({ selected: sq, moves, captures });
      this._sfx(moves.length || captures.length ? 'select' : 'click');
      return;
    }
    if (this.selected) this._sfx('illegal');
    this._deselect();
  }

  _deselect() {
    if (!this.selected) return;
    this.selected = null;
    this._paintBoard();
  }

  async _tryMove(from, to) {
    const s = this.session;
    const tok = this._token;
    let promotion;
    if (s.needsPromotion(from, to)) {
      this.state = 'promoting';
      this.world.setInputEnabled(false);
      let choice = 'q';
      try {
        if (this.hud?.showPromotion) choice = await this.hud.showPromotion(s.turn());
      } catch {
        choice = 'q';
      }
      if (tok !== this._token || this.state !== 'promoting') return;
      promotion = ['q', 'r', 'b', 'n'].includes(choice) ? choice : 'q';
      this.state = 'player';
      this.world.setInputEnabled(true);
    }
    const r = s.tryMove({ from, to, promotion });
    this.selected = null;
    if (r.status === 'illegal') {
      this._sfx('illegal');
      this._paintBoard();
      return;
    }
    if (r.status === 'wrong') return this._nope(r.move);

    // correct / solved: animate the player's move
    this.state = 'animating';
    this._buttons();
    this.world.setInputEnabled(false);
    this.world.highlight({});
    await this.world.animateMove(toAnimArgs(r.move));
    if (tok !== this._token) return;
    this.world.setPosition(s.board());
    this._paintBoard();
    this._paintDots();
    if (r.status === 'solved') return this._finish(r);

    this._msg('good', 'Keep the pressure on.', 'CLEAN.');
    await delay(380);
    if (tok !== this._token) return;
    const reply = s.playOpponent();
    if (reply) {
      await this.world.animateMove(toAnimArgs(reply));
      if (tok !== this._token) return;
      this.world.setPosition(s.board());
    }
    this._paintBoard();
    this.state = 'player';
    this.world.setInputEnabled(true);
    this._msg('good', 'They answered. Find the follow-up.', 'YOUR MOVE.');
    this._buttons();
  }

  _nope(move) {
    this._sfx('illegal');
    const s = this.session;
    this._paintBoard();
    const name = PIECE_NAMES[move.piece] || 'piece';
    const lines = ['Not the play.', 'That lets them off the hook.', 'The block saw that coming.', 'Look again — something is loose.'];
    this._msg('nope', `${esc(name)} to ${move.to} isn't it. ${lines[s.mistakes % lines.length]}`, 'NOPE.');
    const n = this.E.nope;
    n.innerHTML = `NOPE<small>NO FIRST-TRY BONUS</small>`;
    n.classList.remove('is-on');
    reflow(n);
    n.classList.add('is-on');
    clearTimeout(this._nopeT);
    this._nopeT = setTimeout(() => n.classList.remove('is-on'), 2000);
    // a wrong guess forfeits the first-try rate: refresh the quoted payout
    const pay = this._revealed.has(s.puzzle.id) ? 0 : this._reward(s.puzzle, false);
    this.E.pay.textContent = pay ? cash(pay) : this.E.pay.textContent;
  }

  _hint() {
    if (this.state !== 'player' || !this.session) return;
    const s = this.session;
    const hnt = s.hint();
    if (!hnt) return;
    this._sfx('select');
    const piece = s.get(hnt.from);
    const name = piece ? PIECE_NAMES[piece.type] : 'piece';
    if (hnt.to) {
      const cap = s.movesFrom(hnt.from).some((m) => m.to === hnt.to && (m.flags.includes('c') || m.flags.includes('e')));
      this.selected = hnt.from;
      this._paintBoard({ selected: hnt.from, moves: cap ? [] : [hnt.to], captures: cap ? [hnt.to] : [] });
      this._msg('hint', `${esc(name)} to <b>${hnt.to}</b>. Pull the trigger.`, 'TIP:');
    } else {
      this.selected = hnt.from;
      const { moves, captures } = s.targetsFrom(hnt.from);
      this._paintBoard({ selected: hnt.from, moves, captures });
      this._msg('hint', `Your ${esc(name)} on ${hnt.from} makes the play. Hint again for the square.`, 'TIP:');
    }
    const pay = this._reward(s.puzzle, false);
    if (!this._revealed.has(s.puzzle.id) && pay) this.E.pay.textContent = cash(pay);
  }

  async _revealSolution() {
    if (this.state !== 'player' || !this.session) return;
    const tok = this._token;
    const s = this.session;
    const w = this.world;
    s.reveal();
    this._revealed.add(s.puzzle.id);
    this._sfx('click');
    this.state = 'animating';
    this.selected = null;
    this._buttons();
    this.E.pay.textContent = 'NO PAYOUT';
    this.E.pay.classList.add('is-none');
    this._msg('hint', 'Watch how the pros run it.', 'SOLUTION:');
    w.setInputEnabled(false);
    while (s.ply < s.moves.length) {
      const m = s.playScripted();
      w.highlight({});
      await w.animateMove(toAnimArgs(m));
      if (tok !== this._token) return;
      w.setPosition(s.board());
      this._paintBoard();
      this._paintDots();
      await delay(450);
      if (tok !== this._token) return;
    }
    this.state = 'done';
    const tags = this._themeTags(s.puzzle);
    this._msg('', `That's the line${tags ? ` — ${tags}` : ''}. Retry it for practice, or take the next job.`, 'SEEN IT.');
    this._buttons();
  }

  _themeTags(p) {
    const shown = p.themes.filter((t) => !['short', 'middlegame', 'endgame', 'opening', 'crushing', 'advantage', 'master', 'masterVsMaster', 'superGM', 'oneMove', 'mate', 'kingsideAttack', 'queensideAttack'].includes(t) && !/Endgame$/.test(t));
    return shown.slice(0, 3).map(themeLabel).join(' · ');
  }

  _finish(r) {
    const s = this.session;
    const p = s.puzzle;
    const practice = this._revealed.has(p.id);
    const firstTry = s.firstTry && !practice;
    let reward = 0;
    if (!practice) {
      reward = this._reward(p, firstTry);
      try {
        this._onSolved?.(p, { reward, firstTry });
      } catch (e) {
        console.error('[puzzles] onSolved failed', e);
      }
      this._solved.add(p.id);
      this._solvedThisRun++;
      this._earned += reward;
      this._paintStats();
    }
    this.state = 'done';
    this._sfx(reward ? 'cash' : 'select');
    const tags = this._themeTags(p);
    const how = r.mate ? 'Checkmate. ' : '';
    this._msg(
      'done',
      practice
        ? `${how}Practice complete${tags ? ` — ${esc(tags)}` : ''}.`
        : `${how}${firstTry ? 'First try — full rate.' : 'Got there. The bonus walked, the cash didn\'t.'}${tags ? `<br>${esc(tags)}` : ''}`,
      'JOB DONE.',
    );
    this._buttons();
    // reward toast
    const t = this.E.reward;
    t.innerHTML = `<div class="gtp-reward__band">
        <div class="gtp-reward__kick">${practice ? 'PRACTICE RUN' : 'JOB DONE'}</div>
        <div class="gtp-reward__amt gtp-money${reward ? '' : ' is-zero'}">${reward ? '+' + cash(reward) : practice ? 'NO PAYOUT' : 'STREET CRED'}</div>
        <div class="gtp-reward__sub">${firstTry ? 'FIRST-TRY RATE' : practice ? 'SOLUTION WAS REVEALED' : 'ASSISTED'} · ${esc(themeLabel(p.headline || 'puzzle'))}</div>
      </div>`;
    t.classList.remove('is-on');
    reflow(t);
    t.classList.add('is-on');
    clearTimeout(this._rewardT);
    this._rewardT = setTimeout(() => t.classList.remove('is-on'), 3500);
  }
}
