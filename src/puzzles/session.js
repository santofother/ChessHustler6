// PuzzleSession — pure puzzle logic (no DOM / Three.js), usable in Node tests.
// Lichess convention: fen is BEFORE the opponent's setup move moves[0]; the player then plays moves[1],
// the opponent replies moves[2], and so on. Only the exact solution move is accepted, EXCEPT that any
// move delivering checkmate is always accepted (and ends the puzzle as solved).
import { Chess } from 'chess.js';

const uciOf = (m) => m.from + m.to + (m.promotion || '');
const parseUci = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });

export class PuzzleSession {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.moves = puzzle.moves;
    this.chess = new Chess(puzzle.fen);
    this.ply = 0; // index into moves of the NEXT move to be played
    this.solved = false;
    this.mistakes = 0;
    this.hints = 0;
    this.revealed = false;
    this.lastMove = null;
    this.playerColor = this.chess.turn() === 'w' ? 'b' : 'w'; // the side that answers the setup move
  }

  get done() {
    return this.solved || this.ply >= this.moves.length;
  }
  get firstTry() {
    return this.mistakes === 0 && this.hints === 0 && !this.revealed;
  }
  get isPlayerTurn() {
    return !this.done && this.ply % 2 === 1;
  }
  /** Player moves still to find (including the current one). */
  get movesLeft() {
    return Math.max(0, Math.ceil((this.moves.length - this.ply) / 2));
  }

  _apply(uci) {
    const m = this.chess.move(parseUci(uci)); // throws if illegal
    this.ply++;
    this.lastMove = { from: m.from, to: m.to };
    return m;
  }

  /** Play the opponent's scripted move (setup move or a reply). Returns the chess.js verbose move, or null. */
  playOpponent() {
    if (this.done || this.ply % 2 !== 0) return null;
    return this._apply(this.moves[this.ply]);
  }

  board() {
    return this.chess.board();
  }
  turn() {
    return this.chess.turn();
  }
  checkSquare() {
    if (!this.chess.inCheck()) return null;
    const k = this.chess.findPiece({ type: 'k', color: this.chess.turn() });
    return k && k[0] ? k[0] : null;
  }
  get(sq) {
    return this.chess.get(sq) || null;
  }
  movesFrom(sq) {
    return this.chess.moves({ square: sq, verbose: true });
  }
  targetsFrom(sq) {
    const moves = [];
    const captures = [];
    for (const m of this.movesFrom(sq)) {
      const list = m.flags.includes('c') || m.flags.includes('e') ? captures : moves;
      if (!list.includes(m.to)) list.push(m.to);
    }
    return { moves, captures };
  }
  needsPromotion(from, to) {
    return this.movesFrom(from).some((m) => m.to === to && m.promotion);
  }

  /** The expected player move as { from, to, promotion } (null if not the player's turn). */
  expected() {
    return this.isPlayerTurn ? parseUci(this.moves[this.ply]) : null;
  }

  /**
   * Try a player move. Returns:
   *   { status:'illegal' }                 — not a legal move (position unchanged)
   *   { status:'wrong', move }             — legal but not the solution (position unchanged; move = would-be verbose)
   *   { status:'correct', move }           — applied; the opponent reply is still to come (call playOpponent)
   *   { status:'solved', move, mate }      — applied; puzzle complete
   */
  tryMove({ from, to, promotion }) {
    if (!this.isPlayerTurn) return { status: 'illegal' };
    const legal = this.movesFrom(from).filter((m) => m.to === to);
    if (!legal.length) return { status: 'illegal' };
    const cand = legal.find((m) => (m.promotion || undefined) === (promotion || undefined)) || legal.find((m) => m.promotion === 'q') || legal[0];
    const uci = uciOf(cand);
    const want = this.moves[this.ply];
    // mate always wins (Lichess accepts any mating move)
    const probe = new Chess(this.chess.fen());
    probe.move({ from: cand.from, to: cand.to, promotion: cand.promotion });
    const mates = probe.isCheckmate();
    if (uci !== want && !mates) {
      this.mistakes++;
      return { status: 'wrong', move: cand };
    }
    const m = this._apply(uci);
    if (mates || this.ply >= this.moves.length) {
      this.solved = true;
      return { status: 'solved', move: m, mate: mates };
    }
    return { status: 'correct', move: m };
  }

  /** Hint: level 1 = which piece moves, level 2 = also the destination. Marks the run as assisted. */
  hint() {
    const e = this.expected();
    if (!e) return null;
    this.hints++;
    return { from: e.from, to: this.hints >= 2 ? e.to : null };
  }

  /** Reveal: returns the remaining scripted UCI moves and marks the run as revealed (no payout). */
  reveal() {
    this.revealed = true;
    return this.moves.slice(this.ply);
  }

  /** Apply the next scripted move regardless of side (used to animate a revealed solution). */
  playScripted() {
    if (this.ply >= this.moves.length) return null;
    return this._apply(this.moves[this.ply]);
  }
}
