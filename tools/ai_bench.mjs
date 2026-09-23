// AI benchmark + tactical sanity checks for src/chess/engine.js.
// Run: node tools/ai_bench.mjs   (or npm run ai:bench)
import { search, fastPathAvailable, LEVELS } from '../src/chess/engine.js';
import { Chess } from 'chess.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

// deterministic rng so noisy levels are reproducible
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

console.log(`chess.js internals fast path: ${fastPathAvailable() ? 'YES' : 'NO (public API fallback)'}\n`);

const TACTICS = [
  {
    name: 'mate-in-1 (back rank)',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    check: (m, c) => {
      c.move(m);
      return c.isCheckmate();
    },
  },
  {
    name: 'mate-in-1 (scholar Qxf7#)',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    check: (m, c) => {
      c.move(m);
      return c.isCheckmate();
    },
  },
  {
    name: 'mate-in-1 for black (fool mate Qh4#)',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
    check: (m, c) => {
      c.move(m);
      return c.isCheckmate();
    },
  },
  {
    name: 'take the hanging queen',
    fen: 'rnb1kbnr/pppp1ppp/8/4p3/3Pq3/2N5/PPP1PPPP/R1BQKBNR w KQkq - 0 1',
    check: (m) => m.from === 'c3' && m.to === 'e4',
  },
  {
    name: 'take the hanging queen (black, Nxd5)',
    fen: 'rnbqkb1r/pppppppp/5n2/3Q4/8/8/PPP1PPPP/RNB1KBNR b KQkq - 0 1',
    check: (m) => m.from === 'f6' && m.to === 'd5',
  },
  {
    name: 'promote (and not stalemate)',
    fen: '8/4P3/8/8/8/2k5/8/2K5 w - - 0 1',
    check: (m) => m.from === 'e7' && m.to === 'e8' && (m.promotion === 'q' || m.promotion === 'r'),
  },
];

for (const lvl of [2, 3, 4]) {
  console.log(`Level ${lvl} (${LEVELS[lvl].name}) tactics:`);
  for (const t of TACTICS) {
    if (t.skip) continue;
    const r = search(t.fen, lvl, { rng: seeded(lvl * 7 + 1) });
    const c = new Chess(t.fen);
    let good = false;
    try {
      good = !!r.move && t.check(r.move, c);
    } catch {
      good = false;
    }
    ok(good, `${t.name}: ${r.move ? r.move.from + r.move.to + (r.move.promotion || '') : 'none'}  d${r.depth} ${r.ms}ms score ${r.score}`);
  }
}

// Level 1 is intentionally sloppy (35% random top-5) — report how often it finds mate-in-1
{
  let hits = 0;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const r = search(TACTICS[0].fen, 1, { rng: seeded(100 + i) });
    const c = new Chess(TACTICS[0].fen);
    c.move(r.move);
    if (c.isCheckmate()) hits++;
  }
  console.log(`\nLevel 1 finds back-rank mate-in-1 ${hits}/${N} times (mates are never randomized away)`);
  ok(hits === N, 'level 1 always plays mate-in-1');
}

// Performance: time per level on typical middlegame positions
const PERF = [
  ['opening', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
  ['italian', 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'],
  ['middlegame', 'r2q1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 9'],
  ['endgame', '8/5pk1/6p1/8/3R4/6P1/5PKP/2r5 b - - 0 40'],
];

console.log('\nPerformance (budget per level in brackets):');
console.log('level  position     depth   nodes     ms    knps');
const summary = {};
for (const lvl of [1, 2, 3, 4]) {
  let tn = 0,
    tms = 0,
    maxMs = 0,
    minDepth = 99;
  for (const [name, fen] of PERF) {
    const r = search(fen, lvl, { rng: seeded(42) });
    tn += r.nodes;
    tms += r.ms;
    maxMs = Math.max(maxMs, r.ms);
    minDepth = Math.min(minDepth, r.depth);
    console.log(
      `  ${lvl}    ${name.padEnd(11)}  ${String(r.depth).padStart(3)}  ${String(r.nodes).padStart(8)}  ${String(r.ms).padStart(5)}  ${(r.nodes / Math.max(1, r.ms)).toFixed(1).padStart(6)}`,
    );
  }
  summary[lvl] = { nps: Math.round((tn / Math.max(1, tms)) * 1000), avgMs: Math.round(tms / PERF.length), maxMs, minDepth };
}
console.log('\nSummary:');
for (const lvl of [1, 2, 3, 4]) {
  const s = summary[lvl];
  const b = LEVELS[lvl].budget;
  console.log(
    `  L${lvl} ${LEVELS[lvl].name.padEnd(8)} budget ${String(b).padStart(4)}ms  avg ${String(s.avgMs).padStart(4)}ms  max ${String(s.maxMs).padStart(4)}ms  min depth ${s.minDepth}/${LEVELS[lvl].depth}  ~${s.nps} nodes/s`,
  );
  // allow a little slack over the budget for the final node batch + move gen
  ok(s.maxMs <= b + 150, `level ${lvl} stays within budget`);
}

// Public-API fallback still works (slow)
{
  const r = search(TACTICS[0].fen, 2, { forcePublic: true, rng: seeded(1) });
  const c = new Chess(TACTICS[0].fen);
  c.move(r.move);
  ok(c.isCheckmate() && r.fast === false, `public-API fallback finds mate (${r.nodes} nodes, ${r.ms}ms)`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL OK');
process.exit(failures ? 1 : 0);
