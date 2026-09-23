// Hustler armies -> deployments -> FEN (HUSTLER_SPEC §2). Pure, Node-testable.
//
//   army        { p, n, b, r, q }                       counts (king implicit, always 1)
//   placement   { e1:'k', e2:'p', ... }                 square -> piece type, for ONE color
//   buildFen({ w: placement, b: placement })  -> { ok, fen, error }
import { Chess, validateFen } from 'chess.js';

export const TYPES = ['p', 'n', 'b', 'r', 'q'];
export const FILES = 'abcdefgh';
export const PAWN_FILE_ORDER = ['e', 'd', 'f', 'c', 'g', 'b', 'h', 'a'];
const HOME = { n: ['b', 'g'], b: ['c', 'f'], r: ['a', 'h'], q: ['d'], k: ['e'] };
const PLACE_ORDER = ['q', 'r', 'b', 'n']; // for home squares; overflow fills in this order too

export const emptyArmy = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0 });

export function normArmy(a) {
  const out = emptyArmy();
  for (const t of TYPES) out[t] = Math.max(0, Math.floor(+(a && a[t]) || 0));
  return out;
}

export function armySize(a) {
  return TYPES.reduce((s, t) => s + (+(a && a[t]) || 0), 0);
}

/** Back rank / pawn rank for a color. */
export function ranksFor(color) {
  return color === 'b' ? { back: '8', pawn: '7' } : { back: '1', pawn: '2' };
}

/** Squares a color may deploy a piece type on (spec §2: pawns only on the pawn rank, others on both ranks). */
export function deploySquares(type, color = 'w') {
  const { back, pawn } = ranksFor(color);
  const out = [];
  if (type !== 'p') for (const f of FILES) out.push(f + back);
  for (const f of FILES) out.push(f + pawn);
  return out;
}

export function canDeploy(type, square, color = 'w') {
  return deploySquares(type, color).includes(square);
}

/**
 * Standard auto-deploy for an army (spec §2). Returns a placement (square -> type) including the king.
 * Pawn files in order e,d,f,c,g,b,h,a on the pawn rank; other pieces on their standard home squares;
 * extras fill empty back-rank squares, then empty pawn-rank squares. Pieces that cannot fit are dropped
 * (never happens within MAX_ARMY).
 */
export function autoDeploy(army, color = 'w', { kingSquare } = {}) {
  const a = normArmy(army);
  const { back, pawn } = ranksFor(color);
  const pl = {};
  pl[kingSquare && canDeploy('k', kingSquare, color) ? kingSquare : 'e' + back] = 'k';
  const free = (sq) => !pl[sq];
  let pawns = a.p;
  for (const f of PAWN_FILE_ORDER) {
    if (pawns <= 0) break;
    if (free(f + pawn)) {
      pl[f + pawn] = 'p';
      pawns--;
    }
  }
  const extras = [];
  for (const t of PLACE_ORDER) {
    let n = a[t];
    for (const f of HOME[t]) {
      if (n <= 0) break;
      if (free(f + back)) {
        pl[f + back] = t;
        n--;
      }
    }
    for (let i = 0; i < n; i++) extras.push(t);
  }
  const overflow = [...FILES].map((f) => f + back).concat([...FILES].map((f) => f + pawn));
  for (const t of extras) {
    const sq = overflow.find(free);
    if (sq) pl[sq] = t;
  }
  return pl;
}

/** Auto-deploy the pieces that are not yet on the board (keeps the player's manual placements). */
export function autoDeployRemaining(army, placement, color = 'w') {
  const pl = { ...placement };
  const left = remaining(army, pl);
  const hasKing = Object.values(pl).includes('k');
  const { back, pawn } = ranksFor(color);
  if (!hasKing) {
    const ks = ['e' + back, ...[...FILES].map((f) => f + back)].find((s) => !pl[s]);
    if (ks) pl[ks] = 'k';
  }
  const ideal = autoDeploy(army, color);
  // first try each remaining piece's ideal square, then any legal free square
  for (const t of TYPES) {
    let n = left[t];
    for (const [sq, tt] of Object.entries(ideal)) {
      if (n <= 0) break;
      if (tt === t && !pl[sq]) {
        pl[sq] = t;
        n--;
      }
    }
    const order = t === 'p' ? PAWN_FILE_ORDER.map((f) => f + pawn) : deploySquares(t, color);
    for (const sq of order) {
      if (n <= 0) break;
      if (!pl[sq]) {
        pl[sq] = t;
        n--;
      }
    }
  }
  return pl;
}

/** Pieces of `army` not yet present in `placement` (king excluded). */
export function remaining(army, placement) {
  const a = normArmy(army);
  for (const t of Object.values(placement || {})) if (t !== 'k' && a[t] > 0) a[t]--;
  return a;
}

/** Mirror a white placement to black (a1 -> a8, e2 -> e7). */
export function mirror(placement) {
  const out = {};
  for (const [sq, t] of Object.entries(placement)) out[sq[0] + (9 - +sq[1])] = t;
  return out;
}

function castling(w, b) {
  let s = '';
  if (w.e1 === 'k') {
    if (w.h1 === 'r') s += 'K';
    if (w.a1 === 'r') s += 'Q';
  }
  if (b.e8 === 'k') {
    if (b.h8 === 'r') s += 'k';
    if (b.a8 === 'r') s += 'q';
  }
  return s || '-';
}

/** Placement (w + b) -> FEN string, white to move, no en passant (unvalidated). */
export function placementToFen(w, b) {
  const grid = {};
  for (const [sq, t] of Object.entries(w || {})) grid[sq] = t.toUpperCase();
  for (const [sq, t] of Object.entries(b || {})) grid[sq] = t.toLowerCase();
  const rows = [];
  for (let r = 8; r >= 1; r--) {
    let row = '';
    let empty = 0;
    for (const f of FILES) {
      const c = grid[f + r];
      if (c) {
        if (empty) row += empty;
        empty = 0;
        row += c;
      } else empty++;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} w ${castling(w || {}, b || {})} - 0 1`;
}

/**
 * Build and validate a Hustler start FEN. Returns { ok:true, fen } or { ok:false, error, code }.
 * Checks: exactly one king each, pawns not on ranks 1/8, no overlapping squares, chess.js validateFen,
 * and the side NOT to move (black) must not already be in check.
 */
export function buildFen({ w, b }) {
  try {
    const wk = Object.values(w || {}).filter((t) => t === 'k').length;
    const bk = Object.values(b || {}).filter((t) => t === 'k').length;
    if (wk !== 1 || bk !== 1) return { ok: false, code: 'kings', error: 'Each side needs exactly one Boss.' };
    for (const sq of Object.keys(w || {})) {
      if (b && b[sq]) return { ok: false, code: 'overlap', error: `Two pieces on ${sq}.` };
    }
    for (const [sq, t] of [...Object.entries(w || {}), ...Object.entries(b || {})]) {
      if (!/^[a-h][1-8]$/.test(sq)) return { ok: false, code: 'square', error: `Bad square ${sq}.` };
      if (!['p', 'n', 'b', 'r', 'q', 'k'].includes(t)) return { ok: false, code: 'type', error: `Bad piece ${t}.` };
      if (t === 'p' && (sq[1] === '1' || sq[1] === '8'))
        return { ok: false, code: 'pawnrank', error: 'Street Thugs cannot stand on the back rank.' };
    }
    const fen = placementToFen(w, b);
    const v = validateFen(fen);
    if (!v.ok) return { ok: false, code: 'invalid', error: v.error || 'Invalid position.' };
    const c = new Chess(fen);
    const bkSq = c.findPiece({ type: 'k', color: 'b' })[0];
    if (bkSq && c.isAttacked(bkSq, 'w'))
      return { ok: false, code: 'check', error: "Their Boss can't start the job already in your sights. Block the line." };
    return { ok: true, fen };
  } catch (err) {
    return { ok: false, code: 'error', error: String((err && err.message) || err) };
  }
}

/** Convenience: bot (black) placement from its army counts. */
export function botPlacement(army) {
  return autoDeploy(army, 'b');
}

/** Count pieces by type for one color on a chess.js-style board array (king excluded). */
export function countOnBoard(boardArray, color) {
  const a = emptyArmy();
  for (const row of boardArray || []) for (const c of row || []) if (c && c.color === color && c.type !== 'k') a[c.type]++;
  return a;
}

/** Board array (chess.js board() shape) from placements, for world.setPosition during deploy. */
export function placementBoard(w, b) {
  const board = [];
  for (let r = 8; r >= 1; r--) {
    const row = [];
    for (const f of FILES) {
      const sq = f + r;
      if (w && w[sq]) row.push({ square: sq, type: w[sq], color: 'w' });
      else if (b && b[sq]) row.push({ square: sq, type: b[sq], color: 'b' });
      else row.push(null);
    }
    board.push(row);
  }
  return board;
}
