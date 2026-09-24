// GameController — turn flow, modes, economy/heat, glue between World, Hud, Sfx and the AI (PLAN §1.7/1.8).
import { Rules, toAnimArgs } from '../chess/rules.js';
import { getArena, TITLE_ARENAS, DEFAULT_ARENA } from '../world/arenas/registry.js';

export { toAnimArgs };

export const CASH = { p: 1000, n: 3000, b: 3000, r: 5000, q: 9000, k: 0 };
export const CHECK_BONUS = 500;
export const MATE_BONUS = 50000;

const AI_MIN_DELAY = 600;
const ANIM_WATCHDOG = 5000;

const CREW = { w: 'VICE CREW', b: 'CARTEL NOCTURNO' };
const ARENA_LOAD_TIMEOUT = 15000;
// intro-card kicker per registry district (VS AI / Local 2P); Hustler passes its own (neighborhood · street)
const DISTRICT_LABEL = { nh1: 'SUNSET STRAND', nh2: 'RUSTWATER', nh3: 'NEON MILE', nh4: 'CROWN HILLS', downtown: 'DOWNTOWN VICE' };

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
/** "The Strand Rats" -> "STRAND RATS" style short label for the HUD typing indicator. */
function shortName(s) {
  const t = String(s || '').toUpperCase().replace(/^THE\s+/, '').trim();
  return t.length > 16 ? t.split(/\s+/)[0] : t;
}

/** Pure economy step (exported for tests). Returns new {cash, wanted}. */
export function applyEconomy(prev, m, { check, mate, table = CASH, checkBonus = CHECK_BONUS, mateBonus = MATE_BONUS }) {
  const cash = { ...prev.cash };
  let wanted = prev.wanted;
  if (m.captured) {
    cash[m.color] += table[m.captured] || 0;
    wanted += 1;
  }
  if (check) {
    cash[m.color] += checkBonus;
    wanted += 2;
  }
  if (!m.captured && !check) wanted -= 1;
  if (mate) {
    cash[m.color] += mateBonus;
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

    this.custom = null; // Hustler match config (startCustom) or null for the normal modes
    this.onHustler = null; // set by main.js: called when the title menu picks HUSTLER MODE
    this.lastArena = null; // arena of the previous VS AI / Local match (RANDOM avoids repeating it)
    // ?arena=<id> (spec §4): the first title menu shows that arena instead of the saved LOCATION
    try {
      const a = new URLSearchParams(location.search).get('arena');
      this._urlArena = a && TITLE_ARENAS.includes(a) ? a : null;
    } catch {
      this._urlArena = null;
    }
    // the one and only World.onArenaLoading hook → HUD "Driving to …" chip
    this.world.onArenaLoading = (loading, info) => this.hud.setArenaLoading?.(loading, info);

    this._handlers = {
      square: (sq) => this.onSquareClick(sq),
      fx: (name, data) => this.sfx?.fx(name, data),
      frame: () => this.tickClock(),
      action: (name) => this.onAction(name),
    };
    this.attach();

    this.hud.setMuted?.(!!this.sfx?.muted);

    this._onKey = (e) => this.onKey(e);
    window.addEventListener('keydown', this._onKey);
  }

  // ------------------------------------------------------------------ handler ownership

  /** (Re)install this controller's World/Hud handlers (other modes borrow them: Hustler deploy, puzzles). */
  attach() {
    this.world.onSquareClick = this._handlers.square;
    this.world.onFx = this._handlers.fx;
    this.world.onFrame = this._handlers.frame;
    this.hud.onAction = this._handlers.action;
  }

  /** Stop any running game without showing the title (used when another mode takes over the screen). */
  suspend() {
    this.gameId++;
    this.ai?.cancel?.();
    this.state = 'menu';
    this.selected = null;
    this.custom = null;
    this.hud.setThinking?.(false);
    this.world.setInputEnabled?.(false);
  }

  // ------------------------------------------------------------------ menu / new game

  showMenu() {
    this.gameId++;
    this.ai?.cancel?.();
    this.state = 'menu';
    this.selected = null;
    this.custom = null;
    this.attach();
    this.world.setTeamColors?.('w', null);
    this.world.setTeamColors?.('b', null);
    this.hud.setCrews?.(null);
    this.hud.hideAll?.();
    this.hud.setThinking?.(false);
    this.rules.reset();
    this.econ = { cash: { w: 0, b: 0 }, wanted: 0 };
    this.world.setCashTable?.(null);
    if (this.sfx?.music) {
      this.sfx.music.matchTag = null;
      if (this.sfx.music.available) this.sfx.startRadio('title');
    }
    this.world.setPosition(this.rules.board());
    this.world.highlight({});
    this.setWanted(0);
    this.world.setInputEnabled?.(false);
    this.world.setCameraPreset?.('white');
    this.viewColor = 'w';
    const urlArena = this._urlArena;
    this._urlArena = null;
    this.hud.showTitle({
      arena: urlArena || undefined,
      // live LOCATION preview behind the menu ('random' keeps what is on screen; the ?arena= boot arena is
      // already loaded with its URL variant, so leave it alone on that first menu)
      onArena: (id) => {
        if (!id || id === 'random' || this.state !== 'menu') return;
        if (urlArena && id === urlArena && this.world.arenaId === urlArena) return;
        this.world.setArena?.(id)?.catch?.((err) => console.warn('[Game] arena preview failed', err));
      },
      onStart: (opts) => {
        this.sfx?.resume();
        this.sfx?.play('click');
        if (opts?.mode === 'hustler' && this.onHustler) {
          this.suspend();
          this.onHustler();
          return;
        }
        this.newGame(opts);
      },
    });
  }

  /** VS AI / Local 2P. Loads the chosen LOCATION (RANDOM = a fresh pick per match) before the match starts. */
  async newGame(opts = this.opts) {
    if (this.custom) {
      // leaving a Hustler match for a normal game: restore the stock look
      this.world.setTeamColors?.('w', null);
      this.world.setTeamColors?.('b', null);
      this.hud.setCrews?.(null);
    }
    this.custom = null;
    this.opts = {
      mode: opts?.mode === 'local' ? 'local' : 'ai',
      playerColor: opts?.playerColor === 'b' ? 'b' : 'w',
      level: Math.max(1, Math.min(4, +opts?.level || 2)),
      arena: opts?.arena === 'random' || TITLE_ARENAS.includes(opts?.arena) ? opts.arena : this.opts.arena || DEFAULT_ARENA,
    };
    const target = this.pickArena(this.opts.arena);
    this.lastArena = target;
    const id = ++this.gameId;
    this.ai?.cancel?.();
    this.state = 'menu'; // no input / clock while we drive over
    this.selected = null;
    this.world.setInputEnabled?.(false);
    this.hud.setThinking?.(false);
    if (this.world.setArena) {
      // no-op when that arena (default variant) is already up — e.g. the title preview loaded it
      try {
        await Promise.race([this.world.setArena(target, { variant: {} }), delay(ARENA_LOAD_TIMEOUT)]);
      } catch (err) {
        console.warn('[Game] arena load failed', err);
      }
      if (id !== this.gameId) return; // menu / another game meanwhile
    }
    this._begin();
  }

  /** 'random' → a title arena other than the previous match's (and the one on screen, when possible). */
  pickArena(choice) {
    if (choice !== 'random') return TITLE_ARENAS.includes(choice) ? choice : DEFAULT_ARENA;
    let pool = TITLE_ARENAS.filter((a) => a !== this.lastArena && a !== this.world.arenaId);
    if (!pool.length) pool = TITLE_ARENAS.filter((a) => a !== this.lastArena);
    if (!pool.length) pool = TITLE_ARENAS;
    return pick(pool);
  }

  /** Intro card + crowd 'start' reaction for the arena on screen. */
  _arenaIntro() {
    const id = this.gameId;
    const entry = getArena(this.world.arenaId || DEFAULT_ARENA);
    const kicker = this.custom?.introKicker || (entry.district && DISTRICT_LABEL[entry.district] ? `VICE CITY · ${DISTRICT_LABEL[entry.district]}` : 'VICE CITY');
    this.world.react?.('start', {});
    setTimeout(() => {
      if (id !== this.gameId) return;
      this.hud.showArenaIntro?.({ kicker, name: entry.name, tagline: entry.tagline });
    }, 450);
  }

  /**
   * Start a Hustler match (spec §6). The human always plays white.
   * cfg = {
   *   fen,                         // custom start position (validated by the caller; falls back to standard)
   *   profile,                     // bot profile object for ai.getBestMove (or a level number)
   *   opponent: { name, crew, lines:{intro,...}, taunts:[] },  // HUD / SMS strings
   *   player: { name },            // player's crew name for HUD strings
   *   allowUndo = false,
   *   onGameEnd({ result:'win'|'loss'|'standoff', winner, reason, captures, survivors, lost, moves }),
   *   onMenu()                     // phone MENU pressed during the match (caller decides; e.g. confirm + resign)
   * }
   */
  startCustom(cfg = {}) {
    this.custom = { allowUndo: false, ...cfg };
    this.opts = { mode: 'ai', playerColor: 'w', level: 2 };
    this.attach();
    const opp = cfg.opponent || {};
    this.hud.setCrews?.({
      w: cfg.player?.name ? { name: String(cfg.player.name).toUpperCase(), short: shortName(cfg.player.name) } : null,
      b: opp.crew || opp.name ? { name: String(opp.crew || opp.name).toUpperCase(), short: shortName(opp.name || opp.crew) } : null,
    });
    this._begin(cfg.fen);
  }

  _begin(fen) {
    this.gameId++;
    this.ai?.cancel?.();
    this.hud.hideAll?.();
    try {
      this.rules.reset(fen || undefined);
    } catch (err) {
      console.warn('[Game] bad start FEN, using the standard position', fen, err);
      this.rules.reset();
    }
    this.startFen = this.rules.fen();
    this.selected = null;
    this.econ = { cash: { w: 0, b: 0 }, wanted: 0 };
    this.econHistory = [];
    this.world.setCashTable?.(this.custom?.cashTable || null);
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
    if (this.custom) {
      const c = this.custom;
      const me = String(c.player?.name || CREW.w).toUpperCase();
      const them = String(c.opponent?.crew || c.opponent?.name || CREW.b).toUpperCase();
      this.hud.flash(`${me} vs ${them}`, 'info');
      const intro = c.opponent?.lines?.intro;
      if (c.voice?.available) c.voice.start(); // speech bubbles from the kings replace the SMS intro
      else if (intro) this.smsLater(intro, 1400);
    } else if (this.opts.mode === 'ai') {
      const ai = other(this.opts.playerColor);
      this.hud.flash(`${CREW[this.opts.playerColor]} vs ${CREW[ai]}`, 'info');
    }
    this._arenaIntro();
    const over = this.rules.gameOver();
    if (over) {
      // a custom start can already be finished (e.g. bare kings = insufficient material)
      this.state = 'animating';
      this.endGame(over);
      return;
    }
    this.nextTurn();
  }

  /** SMS toast from the opponent after a delay (dropped if the game changed/ended meanwhile). */
  smsLater(text, ms = 700) {
    const id = this.gameId;
    const sender = this.custom
      ? String(this.custom.opponent?.name || this.custom.opponent?.crew || CREW.b).toUpperCase()
      : CREW[other(this.opts.playerColor)];
    setTimeout(() => {
      if (id !== this.gameId || this.state === 'gameover' || this.state === 'menu') return;
      this.sfx?.play('sms');
      this.hud.flash(`SMS // ${sender}: ${text}`, 'info');
    }, ms);
  }

  // ------------------------------------------------------------------ turn flow

  isHumanTurn(color = this.rules.turn()) {
    return this.opts.mode === 'local' || color === this.opts.playerColor;
  }

  nextTurn() {
    const turn = this.rules.turn();
    const human = this.isHumanTurn(turn);
    this.hud.setTurn(turn, human);
    this.custom?.voice?.onTurn(human);
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
    const level = this.custom?.profile ?? this.opts.level;
    const [mv] = await Promise.all([this.ai.getBestMove(fen, level), delay(AI_MIN_DELAY)]);
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
    // Hustler jobs pay the node's capture bounties (no check/mate bonus); the real payout is on the results screen
    const table = this.custom?.cashTable;
    this.econ = applyEconomy(this.econ, m, table
      ? { check: !!check, mate, table, checkBonus: 0, mateBonus: 0 }
      : { check: !!check, mate });
    this.hud.setCash({ ...this.econ.cash });
    this.setWanted(this.econ.wanted);
    if (m.captured) this.sfx?.play('cash');
    if (check && !mate) {
      this.world.react?.('check', { color: this.rules.turn() }); // the side whose king is attacked
      this.sfx?.play('siren');
      this.hud.flash('WANTED', 'wanted');
    }
    this.resetLap();

    const voice = this.custom?.voice;
    if (voice?.available) {
      if (over) voice.end(over);
      else voice.onMove(m, { check: !!check, board });
    } else if (!over) this.maybeTaunt(m, !!check);

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
    // Hustler: the leader's own lines take over part of the generic pool
    const own = this.custom?.opponent?.taunts;
    const line = own && own.length && m.color === aiColor && Math.random() < 0.6 ? pick(own) : pick(pool);
    this.smsLater(line, 700);
  }

  async endGame(over, { resigned = null } = {}) {
    const id = this.gameId;
    this.state = 'gameover';
    this.world.react?.('finale', over || {}); // crowd celebrates (arena NpcCrowd)
    this.selected = null;
    this.ai?.cancel?.();
    this.hud.setThinking?.(false);
    this.world.setInputEnabled?.(false);
    this.world.setCameraPreset?.('cinematic');
    if (resigned && this.custom?.voice?.available) this.custom.voice.end(over);

    const perspective = this.opts.mode === 'ai' ? this.opts.playerColor : null;
    let text;
    let style;
    if (over.result === 'draw') {
      style = 'busted';
      text = this.custom ? 'STANDOFF' : 'MISSION FAILED';
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

    const custom = this.custom;
    const summary = custom ? this.matchSummary(over) : null;

    try {
      await Promise.race([Promise.resolve(this.hud.flash(text, style)), delay(4500)]);
    } catch {
      /* ignore */
    }
    if (id !== this.gameId) return;
    if (custom && typeof custom.onGameEnd === 'function') {
      // Hustler shows its own Results screen instead of the normal game-over card
      this.state = 'menu';
      try {
        custom.onGameEnd(summary);
      } catch (err) {
        console.error('[Game] onGameEnd failed', err);
      }
      return;
    }
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

  /**
   * Hustler result payload from the human's (white's) point of view.
   * captures = enemy pieces the player took; survivors / lost = player's pieces on the final board (by current
   * type, so a promoted pawn counts as its new piece) / pieces lost; moves = player's moves made.
   */
  matchSummary(over) {
    const me = this.opts.playerColor;
    const result = over.result === 'draw' ? 'standoff' : over.result === me ? 'win' : 'loss';
    const empty = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0 });
    const captures = empty();
    const lost = empty();
    let moves = 0;
    for (const m of this.rules.history()) {
      if (m.color === me) moves++;
      if (m.captured && m.captured !== 'k') (m.color === me ? captures : lost)[m.captured]++;
    }
    const survivors = empty();
    for (const row of this.rules.board()) for (const c of row) if (c && c.color === me && c.type !== 'k') survivors[c.type]++;
    return { result, winner: over.result, reason: over.reason, captures, survivors, lost, moves, fen: this.rules.fen() };
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
      case 'audio': // phone SOUND button / title AUDIO button → volume settings panel (wired in main.js)
        this.sfx?.play('click');
        return this.onAudio?.();
      case 'menu':
        this.sfx?.play('click');
        if (this.custom && typeof this.custom.onMenu === 'function') {
          if (this.state === 'gameover' || this.state === 'menu') return; // results are on their way
          try {
            this.custom.onMenu();
          } catch (err) {
            console.error(err);
          }
          return;
        }
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
    if (this.state !== 'human' || (this.custom && !this.custom.allowUndo)) {
      if (this.custom && this.state === 'human') this.hud.flash('NO TAKEBACKS ON A JOB', 'info');
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
