// Build public/puzzles/puzzles.json — a small, rating-tiered pack of real Lichess puzzles (CC0).
//
// Sources (merged, de-duplicated by puzzle id):
//   1. the local SQLite copy used by the Chess_Trainer project (read-only; covers ~800–1300 only)
//   2. a bounded streamed slice of https://database.lichess.org/lichess_db_puzzle.csv.zst
//      (decompressed in memory, never written to disk; the stream is aborted once every tier
//      has enough candidates). Skip it with --offline.
//
// Usage:
//   node tools/puzzles/extract.mjs [--offline] [--per-tier 120] [--max-rows 400000] [--db <path>] [--seed 7]
//
// better-sqlite3 and fzstd are borrowed from Chess_Trainer/node_modules (not dependencies of this
// project); chess.js comes from this project. The Chess_Trainer project is never modified.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { TIERS, tierOf } from '../../src/puzzles/tiers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const TRAINER = path.resolve(ROOT, '../Chess_Trainer');
const OUT = path.join(ROOT, 'public/puzzles/puzzles.json');
const CSV_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const PER_TIER = Number(arg('per-tier', 120));
const MAX_ROWS = Number(arg('max-rows', 400000));
const DB_PATH = arg('db', path.join(TRAINER, 'data/puzzles.db'));
let seed = Number(arg('seed', 7)) >>> 0 || 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// "short, punchy" themes, in priority order — the first match becomes the puzzle's headline theme
const HEADLINE = [
  'mateIn1', 'mateIn2', 'promotion', 'fork', 'hangingPiece', 'skewer', 'pin', 'discoveredAttack',
  'backRankMate', 'smotheredMate', 'doubleCheck', 'mateIn3', 'deflection', 'attraction',
  'capturingDefender', 'trappedPiece', 'xRayAttack', 'sacrifice', 'advancedPawn',
];
const BANNED = new Set(['long', 'veryLong', 'mateIn4', 'mateIn5', 'equality']);

// ------------------------------------------------------------------ candidate filter
function candidate(row) {
  const rating = Number(row.rating);
  const tier = tierOf(rating);
  if (!tier) return null;
  if (rating < TIERS[0].min || rating > TIERS[TIERS.length - 1].max) return null;
  const moves = String(row.moves || '').trim().split(/\s+/);
  const themes = String(row.themes || '').trim().split(/\s+/).filter(Boolean);
  if (themes.some((t) => BANNED.has(t))) return null;
  const head = HEADLINE.find((t) => themes.includes(t));
  if (!head) return null;
  // setup move + player moves: 2 = one-mover, 4 = two-mover, 6 = three-mover (only for the top tiers)
  const maxPlies = tier.index >= 2 ? 6 : 4;
  if (moves.length < 2 || moves.length > maxPlies || moves.length % 2) return null;
  if (Number(row.popularity) < 80 || Number(row.nbplays) < 150) return null;
  return {
    id: String(row.id), fen: String(row.fen), moves, rating, themes, head, tier: tier.id,
    pop: Number(row.popularity), plays: Number(row.nbplays),
  };
}

function legal(p) {
  try {
    const c = new Chess(p.fen);
    for (const uci of p.moves) {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    }
    if (p.themes.some((t) => t.startsWith('mate')) && !c.isCheckmate()) return false;
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ sources
const pool = new Map();
const needed = () => TIERS.every((t) => [...pool.values()].filter((p) => p.tier === t.id).length >= PER_TIER * 4);
const add = (row) => {
  const c = candidate(row);
  if (c && !pool.has(c.id)) pool.set(c.id, c);
};

function fromLocalDb() {
  if (!fs.existsSync(DB_PATH)) return console.log(`[extract] no local DB at ${DB_PATH}`);
  const req = createRequire(path.join(TRAINER, 'package.json'));
  const Database = req('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db.prepare('SELECT id, fen, moves, rating, popularity, nbplays, themes FROM puzzles').all();
  db.close();
  const before = pool.size;
  rows.forEach(add);
  console.log(`[extract] local DB: ${rows.length} rows, ${pool.size - before} candidates`);
}

async function fromLichessStream() {
  const req = createRequire(path.join(TRAINER, 'package.json'));
  const fzstd = req('fzstd');
  const ctl = new AbortController();
  const res = await fetch(CSV_URL, { signal: ctl.signal });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const td = new TextDecoder();
  let left = '';
  let rows = 0;
  let bytes = 0;
  let stop = false;
  const before = pool.size;
  const onLine = (line) => {
    if (!line || line.startsWith('PuzzleId')) return;
    rows++;
    // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
    const c = line.split(',');
    if (c.length < 8) return;
    add({ id: c[0], fen: c[1], moves: c[2], rating: c[3], popularity: c[5], nbplays: c[6], themes: c[7] });
    if (rows >= MAX_ROWS || (rows % 5000 === 0 && needed())) stop = true;
  };
  const dec = new fzstd.Decompress((chunk) => {
    if (stop) return;
    const lines = (left + td.decode(chunk, { stream: true })).split('\n');
    left = lines.pop();
    for (const l of lines) {
      onLine(l.replace(/\r$/, ''));
      if (stop) break;
    }
  });
  const reader = res.body.getReader();
  try {
    while (!stop) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      dec.push(value);
    }
  } finally {
    ctl.abort();
  }
  console.log(`[extract] lichess stream: ${(bytes / 1e6).toFixed(1)} MB read, ${rows} rows, ${pool.size - before} new candidates`);
}

// ------------------------------------------------------------------ selection
function pickTier(tier) {
  const cands = [...pool.values()].filter((p) => p.tier === tier.id && legal(p));
  // bucket by headline theme, most popular first (small random jitter so reruns with a new seed vary)
  const buckets = new Map();
  for (const p of cands) {
    if (!buckets.has(p.head)) buckets.set(p.head, []);
    buckets.get(p.head).push(p);
  }
  for (const b of buckets.values()) b.sort((a, z) => z.pop + rand() * 3 - (a.pop + rand() * 3) || z.plays - a.plays);
  // weights: one-/two-movers and the classic motifs get more slots
  const weight = { mateIn1: 3, mateIn2: 3, fork: 2, hangingPiece: 2, promotion: 2, pin: 2, skewer: 2, discoveredAttack: 2 };
  const order = [...buckets.keys()].sort((a, z) => HEADLINE.indexOf(a) - HEADLINE.indexOf(z));
  const out = [];
  let guard = 0;
  while (out.length < PER_TIER && guard++ < 10000) {
    let took = false;
    for (const k of order) {
      const b = buckets.get(k);
      for (let i = 0; i < (weight[k] || 1) && b.length && out.length < PER_TIER; i++) {
        out.push(b.shift());
        took = true;
      }
    }
    if (!took) break;
  }
  // easy → hard inside the tier
  out.sort((a, z) => a.rating - z.rating);
  return { out, available: cands.length };
}

async function main() {
  fromLocalDb();
  if (!flag('offline')) {
    try {
      await fromLichessStream();
    } catch (e) {
      console.warn(`[extract] lichess stream failed (${e.message}); using local data only`);
    }
  }
  const puzzles = [];
  for (const t of TIERS) {
    const { out, available } = pickTier(t);
    const heads = {};
    out.forEach((p) => (heads[p.head] = (heads[p.head] || 0) + 1));
    console.log(`[extract] ${t.id.padEnd(10)} ${t.min}-${t.max}: ${out.length}/${available}`, JSON.stringify(heads));
    puzzles.push(...out);
  }
  const data = {
    v: 1,
    source: 'Lichess puzzle database (https://database.lichess.org/#puzzles)',
    license: 'CC0 1.0 — public domain dedication by lichess.org',
    generated: new Date().toISOString().slice(0, 10),
    note: 'fen = position BEFORE the opponent setup move; moves[0] = setup (auto-played), then player/opponent alternate (UCI).',
    puzzles: puzzles.map((p) => ({ id: p.id, fen: p.fen, moves: p.moves.join(' '), rating: p.rating, themes: p.themes.join(' ') })),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // one puzzle per line: compact but diff-friendly
  const body = data.puzzles.map((p) => JSON.stringify(p)).join(',\n');
  const { puzzles: _omit, ...meta } = data;
  const json = JSON.stringify(meta).slice(0, -1) + ',"puzzles":[\n' + body + '\n]}\n';
  fs.writeFileSync(OUT, json);
  console.log(`[extract] wrote ${puzzles.length} puzzles, ${(json.length / 1024).toFixed(1)} KB -> ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
