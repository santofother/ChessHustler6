// Thin wrapper around chess.js 1.x. The only module (besides the AI) that talks to chess.js.
import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** chess.js verbose move -> World.animateMove args (PLAN §1.4). */
export function toAnimArgs(m) {
  const ep = m.flags.includes('e');
  const capSq = ep ? m.to[0] + m.from[1] : m.to;
  const r = m.color === 'w' ? '1' : '8';
  const castle = m.flags.includes('k')
    ? { rookFrom: 'h' + r, rookTo: 'f' + r }
    : m.flags.includes('q')
      ? { rookFrom: 'a' + r, rookTo: 'd' + r }
      : null;
  return {
    from: m.from,
    to: m.to,
    piece: { type: m.piece, color: m.color },
    captured: m.captured ? { type: m.captured, color: m.color === 'w' ? 'b' : 'w', square: capSq } : null,
    promotion: m.promotion,
    castle,
    san: m.san,
  };
}

/** Strip a chess.js Move instance to a plain object (safe to keep in history / post to workers). */
function plain(m) {
  return {
    color: m.color,
    from: m.from,
    to: m.to,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    flags: m.flags,
    san: m.san,
    lan: m.lan,
  };
}

export class Rules {
  constructor(fen = START_FEN) {
    this.chess = new Chess();
    this.reset(fen);
  }

  reset(fen = START_FEN) {
    if (fen === START_FEN) this.chess.reset();
    else this.chess.load(fen); // throws on invalid FEN
  }

  fen() {
    return this.chess.fen();
  }
  board() {
    return this.chess.board();
  }
  turn() {
    return this.chess.turn();
  }
  get(square) {
    return this.chess.get(square) || null;
  }
  moveNumber() {
    return this.chess.moveNumber();
  }
  inCheck() {
    return this.chess.inCheck();
  }
  historyLength() {
    return this.chess.history().length;
  }
  sanHistory() {
    return this.chess.history();
  }
  /** plain verbose history */
  history() {
    return this.chess.history({ verbose: true }).map(plain);
  }
  lastMove() {
    const h = this.chess.history({ verbose: true });
    const m = h[h.length - 1];
    return m ? { from: m.from, to: m.to } : null;
  }

  kingSquare(color) {
    const sq = this.chess.findPiece({ type: 'k', color });
    return sq && sq.length ? sq[0] : null;
  }

  /** Square of the side-to-move's king if it is in check, else null. */
  checkSquare() {
    return this.chess.inCheck() ? this.kingSquare(this.chess.turn()) : null;
  }

  /** All legal moves (plain verbose). */
  legalMoves() {
    return this.chess.moves({ verbose: true }).map(plain);
  }

  /** Legal moves from a square: [{ to, flags, captured, promotion, san, ... }] */
  movesFrom(square) {
    return this.chess.moves({ square, verbose: true }).map(plain);
  }

  /** Split legal targets for World.highlight: captures = flags c/e. */
  targetsFrom(square) {
    const moves = [];
    const captures = [];
    for (const m of this.movesFrom(square)) {
      const isCap = m.flags.includes('c') || m.flags.includes('e');
      const list = isCap ? captures : moves;
      if (!list.includes(m.to)) list.push(m.to);
    }
    return { moves, captures };
  }

  isPromotion(from, to) {
    return this.movesFrom(from).some((m) => m.to === to && m.promotion);
  }

  isLegal(from, to) {
    return this.movesFrom(from).some((m) => m.to === to);
  }

  /** Make a move ({from,to,promotion?} or SAN). Returns plain verbose move or null if illegal. */
  move(mv) {
    try {
      const arg = typeof mv === 'string' ? mv : { from: mv.from, to: mv.to, promotion: mv.promotion || undefined };
      const m = this.chess.move(arg);
      return m ? plain(m) : null;
    } catch {
      return null;
    }
  }

  undo() {
    const m = this.chess.undo();
    return m ? plain(m) : null;
  }

  /**
   * null while the game goes on, else { result:'w'|'b'|'draw', reason } with PLAN reasons:
   * 'checkmate'|'stalemate'|'threefold'|'insufficient'|'fifty-move'
   */
  gameOver() {
    const c = this.chess;
    if (c.isCheckmate()) return { result: c.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
    if (c.isStalemate()) return { result: 'draw', reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { result: 'draw', reason: 'insufficient' };
    if (c.isThreefoldRepetition()) return { result: 'draw', reason: 'threefold' };
    if (c.isDrawByFiftyMoves()) return { result: 'draw', reason: 'fifty-move' };
    if (c.isDraw()) return { result: 'draw', reason: 'fifty-move' }; // safety net
    return null;
  }
}
