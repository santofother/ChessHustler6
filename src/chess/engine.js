// Grand Theft Chess — search core (shared by ai.worker.js and tools/ai_bench.mjs).
//
// Negamax alpha-beta with iterative deepening, time budget, PV / MVV-LVA / promotion / killer / history
// ordering, optional quiescence, Simplified-Evaluation-Function PSTs and per-level root noise.
//
// Fast path: chess.js@1.4.0 internals (`_moves({legal:false})`, `_makeMove`, `_undoMove`,
// `_isKingAttacked`, `_board` 0x88 array, `_turn`, `_halfMoves`, `_hash`). These are private, so they are
// feature-detected and sanity-checked; if anything looks off we fall back to the (much slower) public API.

import { Chess } from 'chess.js';

export const LEVELS = {
  1: { name: 'Street', depth: 1, quiesce: false, budget: 200, noise: 80, randomTop: 5, randomChance: 0.35 },
  2: { name: 'Hustler', depth: 2, quiesce: false, budget: 500, noise: 40, randomTop: 0, randomChance: 0 },
  3: { name: 'Kingpin', depth: 3, quiesce: true, budget: 1500, noise: 10, randomTop: 0, randomChance: 0 },
  4: { name: 'Boss', depth: 4, quiesce: true, budget: 2500, noise: 0, randomTop: 0, randomChance: 0 },
};

export const MATE = 100000;
const INF = 1000000;
const MAX_PLY = 64;
const Q_MAX = 4;
const TIMEOUT = { timeout: true };

// chess.js move flag bits (same values as chess.js BITS)
const F_NORMAL = 1,
  F_CAPTURE = 2,
  F_BIG_PAWN = 4,
  F_EP = 8,
  F_PROMO = 16,
  F_KSIDE = 32,
  F_QSIDE = 64;

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const ORD = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 }; // for MVV-LVA

// Piece-square tables (white's point of view, index 0 = a8 ... 63 = h1). Black uses the mirrored rank.
// prettier-ignore
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20],
  kMG: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20],
  kEG: [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50],
};

const FILES = 'abcdefgh';
export function sq88ToAlg(sq) {
  return FILES[sq & 7] + (8 - (sq >> 4));
}
function algToSq88(s) {
  return (8 - +s[1]) * 16 + (s.charCodeAt(0) - 97);
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------------------------------------------------------------------------------------------------------
// Board adapters: both expose the same small interface over 0x88 squares.
//   board[128] of {type,color}|undefined, turn(), halfMoves(), key(), inCheck(),
//   gen() -> pseudo-legal (fast) or legal (public) moves {from,to,piece,captured,promotion,flags,color}
//   make(m) -> bool (false = illegal, nothing to undo), undo()
// ---------------------------------------------------------------------------------------------------------

class FastAdapter {
  constructor(chess) {
    this.c = chess;
    this.board = chess._board;
    this.fast = true;
  }
  turn() {
    return this.c._turn;
  }
  halfMoves() {
    return this.c._halfMoves;
  }
  key() {
    return this.c._hash;
  }
  inCheck() {
    return this.c._isKingAttacked(this.c._turn);
  }
  gen() {
    return this.c._moves({ legal: false });
  }
  make(m) {
    const c = this.c;
    c._makeMove(m);
    if (c._isKingAttacked(m.color)) {
      c._undoMove();
      return false;
    }
    return true;
  }
  undo() {
    this.c._undoMove();
  }
}

const FLAG_BITS = { n: F_NORMAL, c: F_CAPTURE, b: F_BIG_PAWN, e: F_EP, p: F_PROMO, k: F_KSIDE, q: F_QSIDE };

class PublicAdapter {
  constructor(chess) {
    this.c = chess;
    this.board = new Array(128);
    this.fast = false;
    this._sync();
  }
  _sync() {
    const b = this.board;
    b.fill(undefined);
    for (const row of this.c.board()) for (const cell of row) if (cell) b[algToSq88(cell.square)] = cell;
  }
  turn() {
    return this.c.turn();
  }
  halfMoves() {
    return +this.c.fen().split(' ')[4] || 0;
  }
  key() {
    return this.c.fen().split(' ').slice(0, 4).join(' ');
  }
  inCheck() {
    return this.c.inCheck();
  }
  gen() {
    return this.c.moves({ verbose: true }).map((m) => {
      let flags = 0;
      for (const ch of m.flags) flags |= FLAG_BITS[ch] || 0;
      return {
        color: m.color,
        from: algToSq88(m.from),
        to: algToSq88(m.to),
        piece: m.piece,
        captured: m.captured,
        promotion: m.promotion,
        flags,
      };
    });
  }
  make(m) {
    this.c.move({ from: sq88ToAlg(m.from), to: sq88ToAlg(m.to), promotion: m.promotion });
    this._sync();
    return true;
  }
  undo() {
    this.c.undo();
    this._sync();
  }
}

let fastOk = null;
/** Feature-detect + sanity-check chess.js internals once. */
export function fastPathAvailable() {
  if (fastOk !== null) return fastOk;
  try {
    const c = new Chess();
    const shapeOk =
      typeof c._moves === 'function' &&
      typeof c._makeMove === 'function' &&
      typeof c._undoMove === 'function' &&
      typeof c._isKingAttacked === 'function' &&
      Array.isArray(c._board) &&
      c._board.length === 128 &&
      (c._turn === 'w' || c._turn === 'b') &&
      typeof c._halfMoves === 'number';
    if (!shapeOk) return (fastOk = false);
    const fen0 = c.fen();
    const pseudo = c._moves({ legal: false });
    if (pseudo.length !== 20 || typeof pseudo[0].from !== 'number') return (fastOk = false);
    const e2e4 = pseudo.find((m) => m.from === 100 && m.to === 68); // e2 -> e4 in 0x88
    if (!e2e4 || !(e2e4.flags & F_BIG_PAWN)) return (fastOk = false);
    c._makeMove(e2e4);
    const ok1 = c._turn === 'b' && c._board[68]?.type === 'p' && !c._board[100];
    c._undoMove();
    fastOk = ok1 && c.fen() === fen0 && perftCheck();
  } catch {
    fastOk = false;
  }
  return fastOk;
}

// "Kiwipete" perft(2) = 2039 exercises castling, ep, promotions through the internal make/undo.
function perftCheck() {
  const c = new Chess('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const a = new FastAdapter(c);
  const fen0 = c.fen();
  let n = 0;
  for (const m of a.gen()) {
    if (!a.make(m)) continue;
    for (const m2 of a.gen()) {
      if (a.make(m2)) {
        n++;
        a.undo();
      }
    }
    a.undo();
  }
  return n === 2039 && c.fen() === fen0;
}

// ---------------------------------------------------------------------------------------------------------

function evaluate(a) {
  const b = a.board;
  let mgW = 0,
    mgB = 0,
    queens = 0,
    minors = 0,
    rooks = 0,
    pawns = 0,
    wBishops = 0,
    bBishops = 0,
    wk = -1,
    bk = -1;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq];
    if (!p) continue;
    const t = p.type;
    const idx = (sq >> 4) * 8 + (sq & 7);
    if (t === 'k') {
      if (p.color === 'w') wk = idx;
      else bk = idx;
      continue;
    }
    if (t === 'q') queens++;
    else if (t === 'r') rooks++;
    else if (t === 'p') pawns++;
    else {
      minors++;
      if (t === 'b') {
        if (p.color === 'w') wBishops++;
        else bBishops++;
      }
    }
    if (p.color === 'w') mgW += VAL[t] + PST[t][idx];
    else mgB += VAL[t] + PST[t][idx ^ 56];
  }
  // insufficient material (K vs K, K+minor vs K)
  if (pawns === 0 && rooks === 0 && queens === 0 && minors <= 1) return 0;
  const endgame = queens === 0 || (rooks === 0 && minors <= 2);
  const kt = endgame ? PST.kEG : PST.kMG;
  if (wk >= 0) mgW += kt[wk];
  if (bk >= 0) mgB += kt[bk ^ 56];
  if (wBishops >= 2) mgW += 30;
  if (bBishops >= 2) mgB += 30;
  const s = mgW - mgB;
  return a.turn() === 'w' ? s : -s;
}

const moveKey = (m) => m.from | (m.to << 7) | ((m.promotion ? ORD[m.promotion] : 0) << 14);
const isTactical = (m) => (m.flags & (F_CAPTURE | F_EP | F_PROMO)) !== 0;

class Searcher {
  constructor(adapter, level, opts = {}) {
    this.a = adapter;
    this.cfg = LEVELS[level] || LEVELS[2];
    this.rng = opts.rng || Math.random;
    this.budget = opts.budgetMs ?? this.cfg.budget;
    this.maxDepth = opts.maxDepth ?? this.cfg.depth;
    this.useQ = opts.quiesce ?? this.cfg.quiesce;
    this.nodes = 0;
    this.killers = Array.from({ length: MAX_PLY + 1 }, () => [0, 0]);
    this.history = new Int32Array(1 << 17);
    this.pvTable = Array.from({ length: MAX_PLY + 1 }, () => new Array(MAX_PLY + 1));
    this.pvLen = new Int32Array(MAX_PLY + 1);
    this.keys = []; // position keys along the current path (for repetition)
    this.stack = 0; // number of made moves (for unwinding after TIMEOUT)
    this.canStop = false;
    this.deadline = Infinity;
  }

  tick() {
    if ((++this.nodes & 1023) === 0 && this.canStop && nowMs() > this.deadline) throw TIMEOUT;
  }

  make(m) {
    if (!this.a.make(m)) return false;
    this.stack++;
    this.keys.push(this.a.key());
    return true;
  }
  undo() {
    this.a.undo();
    this.stack--;
    this.keys.pop();
  }

  isRepetition() {
    const k = this.keys;
    const n = k.length - 1;
    const cur = k[n];
    const limit = Math.max(0, n - this.a.halfMoves());
    for (let i = n - 2; i >= limit; i -= 2) if (k[i] === cur) return true;
    return false;
  }

  scoreMoves(moves, ply, pvKey) {
    const k = this.killers[ply];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const key = moveKey(m);
      let s;
      if (key === pvKey) s = 10000000;
      else if (m.flags & (F_CAPTURE | F_EP)) {
        const victim = m.flags & F_EP ? 'p' : m.captured;
        s = 1000000 + ORD[victim] * 100 - ORD[m.piece] + (m.promotion ? ORD[m.promotion] * 10 : 0);
      } else if (m.promotion) s = 900000 + ORD[m.promotion];
      else if (key === k[0]) s = 800000;
      else if (key === k[1]) s = 700000;
      else s = this.history[key & 0x1ffff];
      m._s = s;
      m._k = key;
    }
    moves.sort((x, y) => y._s - x._s);
  }

  quiesce(alpha, beta, ply, qd) {
    this.tick();
    const stand = evaluate(this.a);
    if (stand >= beta) return stand;
    if (qd >= Q_MAX || ply >= MAX_PLY) return stand;
    if (stand > alpha) alpha = stand;
    let best = stand;
    const all = this.a.gen();
    const moves = [];
    for (let i = 0; i < all.length; i++) {
      const m = all[i];
      if (!isTactical(m)) continue;
      // delta pruning
      const gain = (m.flags & F_EP ? 100 : VAL[m.captured] || 0) + (m.promotion ? VAL[m.promotion] - 100 : 0);
      if (stand + gain + 200 < alpha) continue;
      if (m.promotion && m.promotion !== 'q') continue; // underpromotions are never tactical here
      moves.push(m);
    }
    this.scoreMoves(moves, ply, -1);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!this.make(m)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1, qd + 1);
      this.undo();
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) return score;
        }
      }
    }
    return best;
  }

  negamax(depth, alpha, beta, ply) {
    this.pvLen[ply] = ply;
    if (this.a.halfMoves() >= 100 || this.isRepetition()) return 0;
    if (ply >= MAX_PLY) return evaluate(this.a);
    const inCheck = this.a.inCheck();
    if (inCheck) depth++; // check extension
    if (depth <= 0) return this.useQ ? this.quiesce(alpha, beta, ply, 0) : (this.tick(), evaluate(this.a));
    this.tick();

    // mate distance pruning
    const mAlpha = Math.max(alpha, -(MATE - ply));
    const mBeta = Math.min(beta, MATE - ply - 1);
    if (mAlpha >= mBeta) return mAlpha;

    const moves = this.a.gen();
    const pvKey = this.followPv && this.prevPv[ply] ? this.prevPv[ply] : -1;
    this.scoreMoves(moves, ply, pvKey);
    let best = -INF;
    let legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!this.make(m)) continue;
      legal++;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      this.undo();
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          const row = this.pvTable[ply];
          const child = this.pvTable[ply + 1];
          row[ply] = m._k;
          for (let j = ply + 1; j < this.pvLen[ply + 1]; j++) row[j] = child[j];
          this.pvLen[ply] = Math.max(ply + 1, this.pvLen[ply + 1]);
          if (score >= beta) {
            if (!isTactical(m)) {
              const k = this.killers[ply];
              if (k[0] !== m._k) {
                k[1] = k[0];
                k[0] = m._k;
              }
              this.history[m._k & 0x1ffff] += depth * depth;
            }
            return score;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -(MATE - ply) : 0;
    return best;
  }

  run() {
    const t0 = nowMs();
    const a = this.a;
    this.keys = [a.key()];
    const rootMoves = [];
    for (const m of a.gen()) {
      if (!a.make(m)) continue;
      a.undo();
      m._k = moveKey(m);
      m._noise = this.cfg.noise ? Math.round((this.rng() * 2 - 1) * this.cfg.noise) : 0;
      m._score = -INF;
      rootMoves.push(m);
    }
    if (rootMoves.length === 0) return { move: null, depth: 0, score: a.inCheck() ? -MATE : 0, nodes: 0, ms: 0 };

    // initial order: tactical first
    this.scoreMoves(rootMoves, 0, -1);

    const exactRoot = this.cfg.randomChance > 0; // need true scores for "random among top N"
    let best = rootMoves[0];
    let bestScore = -INF;
    let completed = 0;
    this.prevPv = [];
    this.deadline = t0 + this.budget;

    for (let depth = 1; depth <= this.maxDepth; depth++) {
      this.canStop = completed >= 1;
      let alpha = -INF;
      let iterBest = null;
      let iterBestScore = -INF;
      this.followPv = true;
      try {
        for (let i = 0; i < rootMoves.length; i++) {
          const m = rootMoves[i];
          const n = m._noise;
          this.make(m);
          const lo = exactRoot ? -INF : alpha;
          const raw = -this.negamax(depth - 1, -(INF - n), -(lo - n), 1);
          this.undo();
          const score = raw + n;
          m._score = score;
          if (score > iterBestScore) {
            iterBestScore = score;
            iterBest = m;
            if (score > alpha) alpha = score;
            this.prevPv = this.pvTable[1].slice(0, this.pvLen[1]);
            this.prevPv[0] = m._k;
          }
          this.followPv = false;
        }
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        while (this.stack > 0) this.undo();
        // partial iteration: the first root move is last iteration's best, so a strictly better one is trustworthy
        if (iterBest && iterBestScore > bestScore && iterBest !== best) {
          best = iterBest;
          bestScore = iterBestScore;
        }
        break;
      }
      best = iterBest;
      bestScore = iterBestScore;
      completed = depth;
      // re-order root: best first (stable for the rest)
      rootMoves.sort((x, y) => y._score - x._score);
      if (Math.abs(bestScore) > MATE - 200) break; // forced mate found
      if (nowMs() - t0 > this.budget * 0.55) break; // next iteration would not finish
    }

    // Street level: sometimes pick randomly among the top N (never when a mate is on the board)
    let pick = best;
    if (this.cfg.randomChance > 0 && Math.abs(bestScore) < MATE - 200 && this.rng() < this.cfg.randomChance) {
      const top = rootMoves
        .slice()
        .sort((x, y) => y._score - x._score)
        .slice(0, this.cfg.randomTop);
      pick = top[Math.floor(this.rng() * top.length)] || best;
    }

    return {
      move: { from: sq88ToAlg(pick.from), to: sq88ToAlg(pick.to), promotion: pick.promotion || undefined },
      depth: completed,
      score: pick === best ? bestScore : pick._score,
      nodes: this.nodes,
      ms: Math.round(nowMs() - t0),
    };
  }
}

/**
 * Search a position.
 * @param {string} fen
 * @param {number} level 1..4
 * @param {{rng?:()=>number, budgetMs?:number, maxDepth?:number, quiesce?:boolean, forcePublic?:boolean}} opts
 * @returns {{move:{from,to,promotion}|null, depth:number, score:number, nodes:number, ms:number, fast:boolean}}
 */
export function search(fen, level = 2, opts = {}) {
  const chess = new Chess(fen);
  const useFast = !opts.forcePublic && fastPathAvailable();
  const adapter = useFast ? new FastAdapter(chess) : new PublicAdapter(chess);
  const res = new Searcher(adapter, level, opts).run();
  res.fast = useFast;
  return res;
}

/** Uniform random legal move (used as a last-resort fallback). */
export function randomMove(fen) {
  const c = new Chess(fen);
  const ms = c.moves({ verbose: true });
  if (!ms.length) return null;
  const m = ms[Math.floor(Math.random() * ms.length)];
  return { from: m.from, to: m.to, promotion: m.promotion || undefined };
}
