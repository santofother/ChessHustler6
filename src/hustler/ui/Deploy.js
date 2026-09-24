// Hustler Mode — Deploy phase on the 3D board (HUSTLER_SPEC §2/§6).
// The player places the pieces they hired on ranks 1–2 (pawns only on rank 2): pick a piece in the tray,
// then click a highlighted square. Clicking one of your pieces on the board picks it back up (the Boss can be
// moved but never removed). AUTO-DEPLOY fills the rest on standard squares; CLEAR returns everything.
//
//   const d = new Deploy({ world, rootEl, sfx });
//   const res = await d.run({ army, freePawns, botPlacement });   // { placement, fen } | null (back)
//   d.cancel();                                                     // force-exit (resolves run() with null)
//
// While running it owns world.onSquareClick and restores the previous handler on exit.
import { pieceSvg, PIECE_NAMES } from '../../ui/icons.js';
import { esc } from './Screens.js';
import { deploySquares, autoDeploy, autoDeployRemaining, buildFen, placementBoard } from '../army.js';

const TYPES_ORDER = ['q', 'r', 'b', 'n', 'p'];

export class Deploy {
  constructor({ world, rootEl, sfx }) {
    this.world = world;
    this.root = rootEl;
    this.sfx = sfx;
    this.running = false;
  }

  _play(n) {
    try {
      this.sfx?.play(n);
    } catch {
      /* ignore */
    }
  }

  run({ army, freePawns = 0, botPlacement, title = 'DEPLOY YOUR CREW', initial = null }) {
    this.cancel();
    this.running = true;
    // tray = list of pieces {id, type, free}
    const tray = [];
    let uid = 0;
    for (const t of TYPES_ORDER) {
      const n = (army?.[t] || 0) + (t === 'p' ? freePawns : 0);
      for (let i = 0; i < n; i++) tray.push({ id: ++uid, type: t, free: t === 'p' && i >= (army?.p || 0) });
    }
    this.all = tray.slice();
    this.placed = new Map(); // square -> piece
    this.kingSq = 'e1';
    this.bot = botPlacement || { e8: 'k' };
    this.sel = null; // {piece} selected in tray
    this.lifted = null; // square picked up from the board
    if (initial) this._applyPlacement(initial);

    const w = this.world;
    this._prev = w.onSquareClick;
    w.onSquareClick = (sq) => this._click(sq);
    w.setInputEnabled?.(true);
    w.setCameraPreset?.('white');

    this.el = document.createElement('div');
    this.el.className = 'gth-deploy gth-int';
    this.el.innerHTML = `
      <div class="gth-deploy__top"><span class="gth-deploy__title">${esc(title)}</span><span class="gth-small">RANKS 1–2 · THUGS ON RANK 2</span></div>
      <div class="gth-deploy__msg"></div>
      <div class="gth-tray"></div>
      <div class="gth-deploy__btns">
        <button type="button" class="gth-btn" data-a="back">BACK</button>
        <button type="button" class="gth-btn" data-a="clear">CLEAR</button>
        <button type="button" class="gth-btn gth-btn--cash" data-a="auto">AUTO-DEPLOY</button>
        <button type="button" class="gth-btn gth-btn--primary" data-a="go">ROLL OUT</button>
      </div>`;
    this.root.appendChild(this.el);
    this.msgEl = this.el.querySelector('.gth-deploy__msg');
    this.trayEl = this.el.querySelector('.gth-tray');
    this.goBtn = this.el.querySelector('[data-a="go"]');
    this.el.querySelector('.gth-deploy__btns').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || b.disabled) return;
      this._action(b.dataset.a);
    });
    this.trayEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      const p = this._unplaced().find((x) => x.id === +b.dataset.id);
      if (!p) return;
      this._play('select');
      this.lifted = null;
      this.sel = this.sel?.id === p.id ? null : p;
      this._render();
    });
    this._onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'a') this._action('auto');
      else if (k === 'enter') this._action('go');
      else if (k === 'escape') {
        if (this.sel || this.lifted) {
          this.sel = null;
          this.lifted = null;
          this._render();
        } else this._action('back');
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this._onKey);

    // auto-select the first piece so a single click on the board places it
    this.sel = this._unplaced()[0] || null;
    this._render();
    this._say(tray.length ? 'Pick a piece, then a glowing square. Or hit AUTO-DEPLOY.' : 'Just you and the Boss. Place him and roll out.');

    return new Promise((resolve) => (this._resolve = resolve));
  }

  cancel(value = null) {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('keydown', this._onKey);
    const w = this.world;
    w.onSquareClick = this._prev ?? null;
    this._prev = null;
    try {
      w.highlight({});
    } catch {
      /* ignore */
    }
    this.el?.remove();
    this.el = null;
    const r = this._resolve;
    this._resolve = null;
    r?.(value);
  }

  // ---------------------------------------------------------------- state helpers
  _unplaced() {
    const placedIds = new Set([...this.placed.values()].map((p) => p.id));
    return this.all.filter((p) => !placedIds.has(p.id));
  }
  _whitePlacement() {
    const pl = { [this.kingSq]: 'k' };
    for (const [sq, p] of this.placed) pl[sq] = p.type;
    return pl;
  }
  _applyPlacement(pl) {
    this.placed.clear();
    const pool = this._unplaced();
    for (const [sq, t] of Object.entries(pl)) {
      if (t === 'k') {
        this.kingSq = sq;
        continue;
      }
      const i = pool.findIndex((p) => p.type === t);
      if (i >= 0) this.placed.set(sq, pool.splice(i, 1)[0]);
    }
  }
  _legalFor(type) {
    const w = this._whitePlacement();
    return deploySquares(type, 'w').filter((sq) => !w[sq] || sq === this.lifted);
  }

  // ---------------------------------------------------------------- input
  _click(sq) {
    if (!this.running) return;
    if (!sq) {
      this.sel = null;
      this.lifted = null;
      return this._render();
    }
    const w = this._whitePlacement();
    // moving a lifted board piece (incl. the Boss)
    if (this.lifted) {
      const from = this.lifted;
      const type = w[from];
      if (sq === from) {
        this.lifted = null;
        return this._render();
      }
      if (deploySquares(type, 'w').includes(sq)) {
        if (w[sq]) {
          // swap two of your pieces if both squares are legal for both
          const other = w[sq];
          if (!deploySquares(other, 'w').includes(from)) return this._err(`${PIECE_NAMES[other]} can't stand on ${from}.`);
          this._move(from, sq, true);
        } else this._move(from, sq, false);
        this._play('land');
        this.lifted = null;
        return this._render();
      }
      return this._err(type === 'p' ? 'Street Thugs start on rank 2.' : 'Your crew sets up on ranks 1–2.');
    }
    // placing from the tray
    if (this.sel) {
      if (!w[sq] && deploySquares(this.sel.type, 'w').includes(sq)) {
        this.placed.set(sq, this.sel);
        this._play('land');
        this.sel = this._unplaced().find((p) => p.type === this.sel.type) || this._unplaced()[0] || null;
        return this._render();
      }
      if (!w[sq]) return this._err(this.sel.type === 'p' ? 'Street Thugs start on rank 2.' : 'Your crew sets up on ranks 1–2.');
    }
    // pick up one of your pieces
    if (w[sq]) {
      this.sel = null;
      this.lifted = sq;
      this._play('select');
      return this._render();
    }
    this._play('illegal');
  }

  _move(from, to, swap) {
    const pf = from === this.kingSq ? 'k' : this.placed.get(from);
    const pt = to === this.kingSq ? 'k' : this.placed.get(to);
    const set = (sq, v) => {
      if (v === 'k') this.kingSq = sq;
      else if (v) this.placed.set(sq, v);
    };
    this.placed.delete(from);
    this.placed.delete(to);
    set(to, pf);
    if (swap) set(from, pt);
  }

  _action(a) {
    if (!this.running) return;
    if (a === 'back') {
      this._play('click');
      return this.cancel(null);
    }
    if (a === 'clear') {
      this._play('click');
      this.placed.clear();
      this.kingSq = 'e1';
      this.lifted = null;
      this.sel = this._unplaced()[0] || null;
      this._say('Board cleared.');
      return this._render();
    }
    if (a === 'auto') {
      this._play('click');
      const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
      for (const p of this.all) counts[p.type]++;
      const pl = this.placed.size || this.kingSq !== 'e1' ? autoDeployRemaining(counts, this._whitePlacement()) : autoDeploy(counts, 'w');
      this._applyPlacement(pl);
      this.sel = null;
      this.lifted = null;
      this._say('Crew in position. Adjust or roll out.');
      return this._render();
    }
    if (a === 'go') {
      if (this._unplaced().length) return this._err('Place every piece you hired first (or AUTO-DEPLOY).');
      const res = buildFen({ w: this._whitePlacement(), b: this.bot });
      if (!res.ok) return this._err(res.error);
      this._play('click');
      return this.cancel({ placement: this._whitePlacement(), fen: res.fen });
    }
  }

  _say(t) {
    if (!this.msgEl) return;
    this.msgEl.classList.remove('is-err');
    this.msgEl.textContent = t;
  }
  _err(t) {
    this._play('illegal');
    if (!this.msgEl) return;
    this.msgEl.classList.add('is-err');
    this.msgEl.textContent = t;
  }

  _render() {
    if (!this.el) return;
    const w = this._whitePlacement();
    this.world.setPosition(placementBoard(w, this.bot));
    const type = this.lifted ? w[this.lifted] : this.sel?.type;
    const moves = type ? this._legalFor(type).filter((s) => s !== this.lifted && !w[s]) : [];
    const swaps = this.lifted ? deploySquares(type, 'w').filter((s) => w[s] && s !== this.lifted && deploySquares(w[s], 'w').includes(this.lifted)) : [];
    try {
      this.world.highlight({ selected: this.lifted || null, moves, captures: swaps });
    } catch {
      /* ignore */
    }
    const left = this._unplaced();
    this.trayEl.innerHTML = left.length
      ? left
          .map(
            (p) =>
              `<button type="button" class="gth-tray__pc${this.sel?.id === p.id ? ' is-sel' : ''}${p.free ? ' is-free' : ''}" data-id="${p.id}" title="${esc(
                PIECE_NAMES[p.type],
              )}${p.free ? ' (free)' : ''}">${pieceSvg(p.type)}</button>`,
          )
          .join('')
      : `<span class="gth-tray__empty">Everyone's in position.${this.lifted ? '' : ' Click a piece on the board to move it.'}</span>`;
    this.goBtn.disabled = left.length > 0;
    if (this.lifted) this._say(`Moving your ${PIECE_NAMES[w[this.lifted]]} — pick a glowing square.`);
  }
}
