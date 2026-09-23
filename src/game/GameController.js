// GameController — turn flow, modes, economy/heat, glue between World, Hud, Sfx and the AI (PLAN §1.7/1.8).
import { Rules, toAnimArgs } from '../chess/rules.js';

export { toAnimArgs };

export const CASH = { p: 1000, n: 3000, b: 3000, r: 5000, q: 9000, k: 0 };
export const CHECK_BONUS = 500;
export const MATE_BONUS = 50000;

const AI_MIN_DELAY = 600;
const ANIM_WATCHDOG = 5000;

const CREW = { w: 'VICE CREW', b: 'CARTEL NOCTURNO' };

const TAUNTS = {
  move: [
    'Nice board. Shame if something happened to it.',
    'You drive like a tourist.',
    "You're in our territory now, amigo.",
    'Tick tock. The Boss is waiting.',
    "Traffic's heavy on your side of town.",
    "Keep your phone on. We'll be in touch.",
    'Heard you rented that ride.',
    'Vice City eats rookies for breakfast.',
  ],
  capture: [
    'Your ride got repo\'d.',
    "That one's going in the canal.",
    "Insurance won't cover that.",
    'Chop shop says thanks.',
    'Nothing personal. Just business.',
    'Another one for the scrapyard.',
  ],
  check: ['Knock knock. Guess who.', 'Your Boss should have stayed home.', 'Nowhere to hide in Leonida.'],
  hurt: [
    "That was my cousin's bike!",
    "You'll pay for that paint job.",
    'Lucky shot, tourist.',
    'Okay. Now it\'s personal.',
    'I just washed that.',
  ],
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const other = (c) => (c === 'w' ? 'b' : 'w');

/** Pure economy step (exported for tests). Returns new {cash, wanted}. */
export function applyEconomy(prev, m, { check, mate }) {
  const cash = { ...prev.cash };
  let wanted = prev.wanted;
  if (m.captured) {
    cash[m.color] += CASH[m.captured] || 0;
    wanted += 1;
  }
  if (check) {
    cash[m.color] += CHECK_BONUS;
    wanted += 2;
  }
  if (!m.captured && !check) wanted -= 1;
  if (mate) {
    cash[m.color] += MATE_BONUS;
    wanted = 5;
  }
  wanted = Math.max(0, Math.min(5, wanted));
  return { cash, wanted };
}

export class GameController {
  constructor({ world, hud, sfx, ai, rules = new Rules() }) {
    this.world = world;
    this.hud = hud;
    this.sfx = sfx;
    this.ai = ai;
    this.rules = rules;

    this.state = 'menu'; // menu | human | animating | ai | promoting | gameover
    this.gameId = 0;
    this.opts = { mode: 'ai', playerColor: 'w', level: 2 };
    this.selected = null;
    this.viewColor = 'w';
    this.cameraTop = false;
    this.econ = { cash: { w: 0, b: 0 }, wanted: 0 };
    this.econHistory = []; // econ snapshot before each ply (for undo)
    this.lapStart = performance.now();
    this.lastTauntPly = -99;

    world.onSquareClick = (sq) => this.onSquareClick(sq);
    world.onFx = (name, data) => this.sfx?.fx(name, data);
    world.onFrame = () => this.tickClock();
    hud.onAction = (name) => this.onAction(name);

    this.hud.setMuted?.(!!this.sfx?.muted);

    this._onKey = (e) => this.onKey(e);
    window.addEventListener('keydown', this._onKey);
  }

  // ------------------------------------------------------------------ menu / new game

  showMenu() {
    this.gameId++;
    this.ai?.cancel?.();
    this.state = 'menu';
    this.selected = null;
    this.hud.hideAll?.();
    this.hud.setThinking?.(false);
    this.rules.reset();
    this.econ = { cash: { w: 0, b: 0 }, wanted: 0 };
    this.world.setPosition(this.rules.board());
    this.world.highlight({});
    this.setWanted(0);
    this.world.setInputEnabled?.(false);
    this.world.setCameraPreset?.('white');
    this.viewColor = 'w';
    this.hud.showTitle({
      onStart: (opts) => {
        this.sfx?.resume();
        this.sfx?.play('click');
        this.newGame(opts);
      },
    });
  }

  newGame(opts = this.opts) {
    this.gameId++;
    this.ai?.cancel?.();
    this.opts = {
      mode: opts?.mode === 'local' ? 'local' : 'ai',
      playerColor: opts?.playerColor === 'b' ? 'b' : 'w',
      level: Math.max(1, Math.min(4, +opts?.level || 2)),
    };
    this.hud.hideAll?.();
    this.rules.reset();
    this.selected = null;
    this.econ = { cash: { w: 0, b: 0 }, wanted: 0 };
    this.econHistory = [];
    this.lastTauntPly = -99;
    this.cameraTop = false;

    const board = this.rules.board();
    this.world.setPosition(board);
    this.world.highlight({});
    this.hud.setMoves([]);
    this.hud.setCash({ ...this.econ.cash });
    this.setWanted(0);
    this.hud.setThinking?.(false);

    this.viewColor = this.opts.mode === 'ai' ? this.opts.playerColor : 'w';
    this.world.flipTo(this.viewColor);
    this.hud.updateMinimap(board, null, this.viewColor);
    this.resetLap();

    this.sfx?.startRadio?.();
    if (this.opts.mode === 'ai') {
      const ai = other(this.opts.playerColor);
      this.hud.flash(`${CREW[this.opts.playerColor]} vs ${CREW[ai]}`, 'info');
    }
    this.nextTurn();
  }

  // ------------------------------------------------------------------ turn flow

  isHumanTurn(color = this.rules.turn()) {
    return this.opts.mode === 'local' || color === this.opts.playerColor;
  }

  nextTurn() {
    const turn = this.rules.turn();
    const human = this.isHumanTurn(turn);
    this.hud.setTurn(turn, human);
    if (human) {
      this.state = 'human';
      this.world.setInputEnabled?.(true);
    } else {
      this.runAI();
    }
  }

  async runAI() {
    const id = this.gameId;
    this.state = 'ai';
    this.world.setInputEnabled?.(false);
    this.hud.setThinking?.(true);
    const fen = this.rules.fen();
    const [mv] = await Promise.all([this.ai.getBestMove(fen, this.opts.level), delay(AI_MIN_DELAY)]);
    if (id !== this.gameId || this.state !== 'ai') return; // stale (rematch/menu/resign while thinking)
    this.hud.setThinking?.(false);
    let move = mv;
    if (!move || !this.rules.isLegal(move.from, move.to)) {
      // defensive: never soft-lock on a bad AI answer
      const legal = this.rules.legalMoves();
      if (!legal.length) return;
      move = pick(legal);
    }
    await this.commit(move);
  }

  /** Make a (legal) move and play it out. Returns false if illegal. */
  async commit(mv) {
    const id = this.gameId;
    const before = { cash: { ...this.econ.cash }, wanted: this.econ.wanted };
    const m = this.rules.move(mv);
    if (!m) {
      this.sfx?.play('illegal');
      if (this.state !== 'ai') this.state = 'human';
      return false;
    }
    this.econHistory.push(before);
    this.selected = null;
    this.state = 'animating';
    this.world.setInputEnabled?.(false);
    this.world.highlight({ lastMove: { from: m.from, to: m.to } });

    const args = toAnimArgs(m);
    try {
      await Promise.race([Promise.resolve(this.world.animateMove(args)), delay(ANIM_WATCHDOG)]);
    } catch (err) {
      console.warn('[Game] animateMove failed', err);
    }
    if (id !== this.gameId) return true; // game was abandoned mid-animation

    const board = this.rules.board();
    this.world.setPosition(board); // resync (normally a no-op)
    const check = this.rules.checkSquare();
    const over = this.rules.gameOver();
    const mate = over?.reason === 'checkmate';
    const lastMove = { from: m.from, to: m.to };
    this.world.highlight({ lastMove, check });
    this.hud.setMoves(this.rules.sanHistory());
    this.hud.updateMinimap(board, lastMove, this.viewColor);

    // economy & heat
    this.econ = applyEconomy(this.econ, m, { check: !!check, mate });
    this.hud.setCash({ ...this.econ.cash });
    this.setWanted(this.econ.wanted);
    if (m.captured) this.sfx?.play('cash');
    if (check && !mate) {
      this.sfx?.play('siren');
      this.hud.flash('WANTED', 'wanted');
    }
    this.resetLap();

    if (!over) this.maybeTaunt(m, !!check);

    if (over) await this.endGame(over);
    else this.nextTurn();
    return true;
  }

  maybeTaunt(m, check) {
    if (this.opts.mode !== 'ai') return;
    const ply = this.rules.historyLength();
    if (ply - this.lastTauntPly < 4) return;
    const aiColor = other(this.opts.playerColor);
    let pool = null;
    let chance = 0;
    if (m.color === aiColor) {
      if (check) (pool = TAUNTS.check), (chance = 0.6);
      else if (m.captured) (pool = TAUNTS.capture), (chance = 0.5);
      else (pool = TAUNTS.move), (chance = ply < 3 ? 0.9 : 0.12);
    } else if (m.captured && CASH[m.captured] >= 3000) {
      (pool = TAUNTS.hurt), (chance = 0.45);
    }
    if (!pool || Math.random() > chance) return;
    this.lastTauntPly = ply;
    const text = `SMS // ${CREW[aiColor]}: ${pick(pool)}`;
    setTimeout(() => {
      if (this.state === 'gameover' || this.state === 'menu') return;
      this.sfx?.play('sms');
      this.hud.flash(text, 'info');
    }, 700);
  }

  async endGame(over, { resigned = null } = {}) {
    const id = this.gameId;
    this.state = 'gameover';
    this.selected = null;
    this.ai?.cancel?.();
    this.hud.setThinking?.(false);
    this.world.setInputEnabled?.(false);
    this.world.setCameraPreset?.('cinematic');

    const perspective = this.opts.mode === 'ai' ? this.opts.playerColor : null;
    let text;
    let style;
    if (over.result === 'draw') {
      style = 'busted';
      text = 'MISSION FAILED';
      this.sfx?.play('busted');
    } else if (perspective) {
      const won = over.result === perspective;
      style = won ? 'passed' : 'wasted';
      text = won ? 'MISSION PASSED' : 'WASTED';
      this.sfx?.play(won ? 'passed' : 'wasted');
    } else {
      style = 'passed';
      text = `${CREW[over.result]} WINS`;
      this.sfx?.play('passed');
    }
    if (resigned) this.setWanted(0);

    try {
      await Promise.race([Promise.resolve(this.hud.flash(text, style)), delay(4500)]);
    } catch {
      /* ignore */
    }
    if (id !== this.gameId) return;
    this.hud.showGameOver({
      result: over.result,
      reason: over.reason,
      perspective,
      onRematch: () => {
        this.sfx?.play('click');
        this.newGame(this.opts);
      },
      onMenu: () => {
        this.sfx?.play('click');
        this.showMenu();
      },
    });
  }

  // ------------------------------------------------------------------ input

  onSquareClick(sq) {
    if (this.state !== 'human') return;
    if (!sq) return this.deselect();
    const turn = this.rules.turn();
    const piece = this.rules.get(sq);

    if (this.selected && sq !== this.selected) {
      const targets = this.rules.movesFrom(this.selected).filter((m) => m.to === sq);
      if (targets.length) return this.tryMove(this.selected, sq, targets);
    }
    if (piece && piece.color === turn) {
      if (sq === this.selected) return this.deselect();
      this.select(sq);
      return;
    }
    if (this.selected) this.sfx?.play('illegal');
    this.deselect();
  }

  select(sq) {
    this.selected = sq;
    const { moves, captures } = this.rules.targetsFrom(sq);
    this.world.highlight({
      selected: sq,
      moves,
      captures,
      lastMove: this.rules.lastMove(),
      check: this.rules.checkSquare(),
    });
    this.sfx?.play(moves.length || captures.length ? 'select' : 'click');
  }

  deselect() {
    if (!this.selected) return;
    this.selected = null;
    this.world.highlight({ lastMove: this.rules.lastMove(), check: this.rules.checkSquare() });
  }

  async tryMove(from, to, targets) {
    let promotion;
    if (targets.some((m) => m.promotion)) {
      const id = this.gameId;
      this.state = 'promoting';
      this.world.setInputEnabled?.(false);
      let choice = 'q';
      try {
        choice = await this.hud.showPromotion(this.rules.turn());
      } catch {
        choice = 'q';
      }
      if (id !== this.gameId || this.state !== 'promoting') return;
      promotion = ['q', 'r', 'b', 'n'].includes(choice) ? choice : 'q';
    }
    await this.commit({ from, to, promotion });
  }

  onAction(name) {
    switch (name) {
      case 'resign':
        return this.resign();
      case 'undo':
        return this.undo();
      case 'flip':
        return this.flip();
      case 'camera':
        return this.cycleCamera();
      case 'mute': {
        const muted = !!this.sfx?.toggleMute();
        this.hud.setMuted?.(muted); // optional Hud extra: keep the phone's SOUND button in sync
        if (!muted) this.sfx?.play('click');
        this.hud.flash(muted ? 'RADIO OFF' : 'RADIO ON', 'info');
        return;
      }
      case 'menu':
        this.sfx?.play('click');
        return this.showMenu();
      default:
        console.warn('[Game] unknown action', name);
    }
  }

  onKey(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'm') return this.onAction('mute');
    if (this.state === 'menu') return;
    if (k === 'escape') this.deselect();
    else if (k === 'u') this.onAction('undo');
    else if (k === 'f') this.onAction('flip');
    else if (k === 'c') this.onAction('camera');
  }

  resign() {
    if (!['human', 'ai', 'promoting', 'animating'].includes(this.state)) return;
    const loser = this.opts.mode === 'ai' ? this.opts.playerColor : this.rules.turn();
    this.gameId++; // drop pending AI/animation continuations
    this.endGame({ result: other(loser), reason: 'resign' }, { resigned: loser });
  }

  undo() {
    if (this.state !== 'human') {
      this.sfx?.play('illegal');
      return;
    }
    const plies = this.opts.mode === 'ai' ? 2 : 1;
    const hist = this.rules.historyLength();
    // AI mode: only undo if the human has a move of their own to take back
    if (hist < plies) {
      this.sfx?.play('illegal');
      return;
    }
    for (let i = 0; i < plies; i++) {
      this.rules.undo();
      const snap = this.econHistory.pop();
      if (snap) this.econ = snap;
    }
    this.selected = null;
    const board = this.rules.board();
    this.world.setPosition(board);
    const lastMove = this.rules.lastMove();
    this.world.highlight({ lastMove, check: this.rules.checkSquare() });
    this.hud.setMoves(this.rules.sanHistory());
    this.hud.updateMinimap(board, lastMove, this.viewColor);
    this.hud.setCash({ ...this.econ.cash });
    this.setWanted(this.econ.wanted);
    this.resetLap();
    this.sfx?.play('click');
    this.hud.flash('REWIND', 'info');
    this.nextTurn();
  }

  flip() {
    if (this.state === 'menu') return;
    this.viewColor = other(this.viewColor);
    this.cameraTop = false;
    this.world.flipTo(this.viewColor);
    this.hud.updateMinimap(this.rules.board(), this.rules.lastMove(), this.viewColor);
    this.sfx?.play('click');
  }

  cycleCamera() {
    if (this.state === 'menu') return;
    this.cameraTop = !this.cameraTop;
    this.world.setCameraPreset(this.cameraTop ? 'top' : this.viewColor === 'w' ? 'white' : 'black');
    this.sfx?.play('click');
  }

  // ------------------------------------------------------------------ helpers

  setWanted(level) {
    this.world.setWanted(level);
    this.hud.setWanted(level);
  }

  resetLap() {
    this.lapStart = performance.now();
  }

  tickClock() {
    if (this.state === 'menu' || this.state === 'gameover') return;
    this.hud.setClock({ moveNo: this.rules.moveNumber(), elapsedMs: performance.now() - this.lapStart });
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.gameId++;
    this.ai?.cancel?.();
  }
}
