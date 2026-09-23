// Hustler Mode balance simulator (owned by the Economy agent). Node >= 18, ESM.
//
//   node tools/hustler_sim.mjs                      FEN check + all attack & defense matches + campaign money curve
//   node tools/hustler_sim.mjs --fens               only build/validate the auto-deployed FENs
//   node tools/hustler_sim.mjs --games 12           games per node (default 12)
//   node tools/hustler_sim.mjs --nodes nh1_s1,nh1_s2 --no-defense
//   node tools/hustler_sim.mjs --save out.json      save raw match results;  --load out.json  skip the matches
//   node tools/hustler_sim.mjs --proxy strong       proxy player: 'decent' (default, depth 3) | 'strong' (depth 4)
//   node tools/hustler_sim.mjs --threads 10 --runs 4000 --puzzle 600
//
// (a) auto-deploys armies per HUSTLER_SPEC §2 and validates the FENs with chess.js
// (b) plays a proxy player (engine.js search) with NODES[id].recommended vs each node's bot + army
// (c) Monte-Carlo campaign: cash before every node, with and without rival challenges
//
// Bot profiles are emulated exactly as the campaign should implement them: depth>=1 profiles are registered
// as extra engine.js LEVELS entries (the Searcher reads noise/randomTop/randomChance/depth/budget from there),
// plus a blunderChance coin flip; depth 0 = random legal move with captureBias.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { Chess } from 'chess.js';
import { search, LEVELS } from '../src/chess/engine.js';
import * as BAL from '../src/hustler/data/balance.js';

const { NODES, BOT_PROFILES, PRICES } = BAL;
const TYPES = ['p', 'n', 'b', 'r', 'q'];
const MAX_PLIES = 300; // 150 full moves; anything longer is adjudicated a standoff

// ------------------------------------------------------------------------------------------------ deploy
// Standard home squares; for a lone piece of a pair the KINGSIDE square is used first (g1 knight, f1 bishop,
// h1 rook) so a single rook keeps castling. Pawn files e,d,f,c,g,b,h,a.
const PAWN_FILES = ['e', 'd', 'f', 'c', 'g', 'b', 'h', 'a'];
const HOME = { n: ['g', 'b'], b: ['f', 'c'], r: ['h', 'a'], q: ['d'] };

export function deploy(army, color) {
  const back = color === 'w' ? '1' : '8';
  const front = color === 'w' ? '2' : '7';
  const sq = new Map(); // square -> piece char
  sq.set('e' + back, 'k');
  for (let i = 0; i < (army.p || 0); i++) sq.set(PAWN_FILES[i] + front, 'p');
  const extras = [];
  for (const t of ['r', 'n', 'b', 'q']) {
    for (let i = 0; i < (army[t] || 0); i++) {
      const f = HOME[t][i];
      if (f && !sq.has(f + back)) sq.set(f + back, t);
      else extras.push(t);
    }
  }
  const fill = [...'abcdefgh'].map((f) => f + back).concat([...'abcdefgh'].map((f) => f + front));
  for (const t of extras) {
    const s = fill.find((x) => !sq.has(x));
    if (!s) throw new Error('army does not fit');
    sq.set(s, t);
  }
  return sq;
}

export function buildFen(white, black) {
  const w = deploy(white, 'w');
  const b = deploy(black, 'b');
  const rows = [];
  for (let r = 8; r >= 1; r--) {
    let row = '';
    let empty = 0;
    for (const f of 'abcdefgh') {
      const s = f + r;
      const ch = w.has(s) ? w.get(s).toUpperCase() : b.has(s) ? b.get(s) : null;
      if (!ch) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += ch;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let castle = '';
  if (w.get('h1') === 'r') castle += 'K';
  if (w.get('a1') === 'r') castle += 'Q';
  if (b.get('h8') === 'r') castle += 'k';
  if (b.get('a8') === 'r') castle += 'q';
  return `${rows.join('/')} w ${castle || '-'} - 0 1`;
}

// ------------------------------------------------------------------------------------------------ players
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const PROXIES = {
  // "decent club player": 3 plies + quiescence, a hair of noise, rare slip
  decent: { maxDepth: 3, timeMs: 400, quiescence: true, noiseCp: 10, randomChance: 0, topN: 0, blunderChance: 0.01 },
  strong: { maxDepth: 4, timeMs: 1200, quiescence: true, noiseCp: 0, randomChance: 0, topN: 0, blunderChance: 0 },
};

function registerProfile(key, p) {
  LEVELS[key] = {
    name: key,
    depth: Math.max(1, p.maxDepth),
    quiesce: !!p.quiescence,
    budget: p.timeMs || 200,
    noise: p.noiseCp || 0,
    randomTop: p.topN || 0,
    randomChance: p.topN ? p.randomChance || 0 : 0,
  };
}
for (const [id, p] of Object.entries(BOT_PROFILES)) registerProfile('bot_' + id, p);
for (const [id, p] of Object.entries(PROXIES)) registerProfile('proxy_' + id, p);

function randomPick(chess, rng, captureBias = 0) {
  const ms = chess.moves({ verbose: true });
  if (!ms.length) return null;
  if (captureBias > 0 && rng() < captureBias) {
    const caps = ms.filter((m) => m.captured);
    if (caps.length) return caps[Math.floor(rng() * caps.length)];
  }
  return ms[Math.floor(rng() * ms.length)];
}

function profileMove(chess, key, prof, rng, timeScale) {
  if (prof.maxDepth === 0) return randomPick(chess, rng, prof.captureBias || 0);
  if (prof.blunderChance > 0 && rng() < prof.blunderChance) return randomPick(chess, rng, 0);
  const r = search(chess.fen(), key, { rng, budgetMs: Math.max(30, Math.round((prof.timeMs || 200) * timeScale)) });
  return r.move;
}

/** One match. Player = white with `white` army + proxy; bot = black. */
function playGame({ white, black, bot, proxy, seed, timeScale }) {
  const rng = seeded(seed);
  const fen = buildFen(white, black);
  const chess = new Chess(fen);
  const botProf = BOT_PROFILES[bot];
  const pxProf = PROXIES[proxy];
  const captured = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  let plies = 0;
  while (!chess.isGameOver() && plies < MAX_PLIES) {
    const white2move = chess.turn() === 'w';
    let mv;
    if (white2move) {
      // mop-up: against a bare king look deeper so the proxy actually converts (a human would)
      const bare = !chess.board().flat().some((c) => c && c.color === 'b' && c.type !== 'k');
      mv = bare
        ? search(chess.fen(), 'proxy_strong', { rng, maxDepth: 5, budgetMs: 800 * timeScale }).move
        : profileMove(chess, 'proxy_' + proxy, pxProf, rng, timeScale);
    } else mv = profileMove(chess, 'bot_' + bot, botProf, rng, timeScale);
    if (!mv) break;
    const res = chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    if (white2move && res.captured) captured[res.captured]++;
    plies++;
  }
  let result, reason;
  if (chess.isCheckmate()) {
    result = chess.turn() === 'b' ? 'win' : 'loss';
    reason = 'mate';
  } else {
    result = 'standoff';
    reason = chess.isStalemate()
      ? 'stalemate'
      : chess.isInsufficientMaterial()
        ? 'insufficient'
        : chess.isThreefoldRepetition()
          ? 'repetition'
          : chess.isDraw()
            ? '50-move'
            : 'move-cap';
  }
  const survivors = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const c of chess.board().flat()) if (c && c.color === 'w' && c.type !== 'k') survivors[c.type]++;
  return { result, reason, plies, captured, survivors };
}

// ------------------------------------------------------------------------------------------------ worker
if (!isMainThread) {
  parentPort.on('message', (job) => {
    try {
      parentPort.postMessage({ id: job.id, res: playGame(job) });
    } catch (e) {
      parentPort.postMessage({ id: job.id, err: String(e && e.stack) });
    }
  });
}

// ------------------------------------------------------------------------------------------------ main
async function runPool(jobs, threads, onDone) {
  const file = fileURLToPath(import.meta.url);
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  await new Promise((resolve, reject) => {
    const workers = [];
    const feed = (w) => {
      if (next >= jobs.length) return;
      const id = next++;
      w.postMessage({ ...jobs[id], id });
    };
    for (let i = 0; i < Math.min(threads, jobs.length); i++) {
      const w = new Worker(file, { workerData: {} });
      w.on('message', (m) => {
        if (m.err) return reject(new Error(m.err));
        results[m.id] = m.res;
        done++;
        onDone?.(done, jobs.length, jobs[m.id], m.res);
        if (done === jobs.length) resolve();
        else feed(w);
      });
      w.on('error', reject);
      workers.push(w);
      feed(w);
    }
    if (!jobs.length) resolve();
    resolve.workers = workers;
  }).finally(() => {});
  return results;
}

const armyStr = (a) =>
  TYPES.filter((t) => a[t])
    .map((t) => `${a[t]}${t.toUpperCase()}`)
    .join(' ') || '-';
const $ = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
const value = (a) => BAL.armyCost(a);
const bountyOf = (captured, bounty) => TYPES.reduce((s, t) => s + (captured[t] || 0) * bounty[t], 0);

function args() {
  const a = process.argv.slice(2);
  const o = { games: 12, threads: Math.max(1, Math.min(10, os.cpus().length - 2)), runs: 4000, proxy: 'decent', puzzle: 600, timeScale: 0.5 };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--fens') o.fensOnly = true;
    else if (k === '--no-defense') o.noDefense = true;
    else if (k === '--games') o.games = +a[++i];
    else if (k === '--threads') o.threads = +a[++i];
    else if (k === '--runs') o.runs = +a[++i];
    else if (k === '--nodes') o.nodes = a[++i].split(',');
    else if (k === '--save') o.save = a[++i];
    else if (k === '--load') o.load = a[++i];
    else if (k === '--proxy') o.proxy = a[++i];
    else if (k === '--puzzle') o.puzzle = +a[++i];
    else if (k === '--time-scale') o.timeScale = +a[++i];
    else if (k === '--help') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 16).join('\n'));
      process.exit(0);
    }
  }
  return o;
}

// ---- (a) FENs
function checkFens() {
  console.log('\n== (a) auto-deploy FENs (player = recommended army) ==');
  let bad = 0;
  const check = (label, w, b) => {
    const fen = buildFen(w, b);
    let ok = true;
    let msg = '';
    try {
      const c = new Chess(fen);
      if (c.isGameOver()) (ok = false), (msg = 'game over at start');
      if (c.moves().length === 0) (ok = false), (msg = 'no moves');
    } catch (e) {
      ok = false;
      msg = e.message;
    }
    if (!ok) bad++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(18)} ${fen}${msg ? '  <- ' + msg : ''}`);
  };
  for (const [id, n] of Object.entries(NODES)) {
    check(id, n.recommended, n.army);
    if (n.defense) check(id + ' (def)', n.recommended, n.defense.army);
  }
  // edge cases the shop allows
  check('king only', {}, { p: 1 });
  check('max army', BAL.MAX_ARMY, BAL.MAX_ARMY);
  check('1 rook (a/h?)', { r: 1 }, { r: 1, p: 1 });
  // limits sanity
  for (const [id, n] of Object.entries(NODES)) {
    for (const t of TYPES) {
      if ((n.army[t] || 0) > BAL.MAX_ARMY[t] || (n.recommended[t] || 0) > BAL.MAX_ARMY[t]) {
        bad++;
        console.log(`  FAIL ${id}: ${t} exceeds MAX_ARMY`);
      }
    }
    if (!n.army.p) (bad++, console.log(`  FAIL ${id}: bot has no pawn (draw-prone)`));
    if (n.defense && !n.defense.army.p) (bad++, console.log(`  FAIL ${id}: defense army has no pawn`));
    if (!BOT_PROFILES[n.bot] || (n.defense && !BOT_PROFILES[n.defense.bot])) (bad++, console.log(`  FAIL ${id}: unknown bot`));
  }
  console.log(bad ? `  ${bad} problem(s)` : '  all FENs valid');
  return bad;
}

// ---- (b) matches
function summarize(games, node, kind) {
  const n = games.length;
  const s = { n, win: 0, standoff: 0, loss: 0, reasons: {}, plies: 0, bounty: 0, refundVal: 0 };
  const bounty = node.captureBounty;
  for (const g of games) {
    s[g.result]++;
    if (g.result === 'standoff') s.reasons[g.reason] = (s.reasons[g.reason] || 0) + 1;
    s.plies += g.plies;
    s.bounty += bountyOf(g.captured, bounty);
    s.refundVal += value(g.survivors) * (BAL.REFUNDS[g.result] || 0);
  }
  s.plies /= n;
  s.bounty /= n;
  s.refundVal /= n;
  return s;
}

function printMatchTable(title, rows) {
  console.log(`\n== ${title} ==`);
  console.log(
    '  node        bot          bot army        player (rec)     cost    win  draw loss  avg-ply  bounty  refund  draw reasons',
  );
  for (const r of rows) {
    const s = r.s;
    console.log(
      `  ${r.id.padEnd(11)} ${r.bot.padEnd(12)} ${armyStr(r.army).padEnd(15)} ${armyStr(r.rec).padEnd(15)} ${$(value(r.rec)).padStart(7)}  ${pct(s.win / s.n)} ${pct(s.standoff / s.n)} ${pct(s.loss / s.n)}  ${String(Math.round(s.plies)).padStart(6)}  ${$(s.bounty).padStart(6)}  ${$(s.refundVal).padStart(6)}  ${Object.entries(s.reasons).map(([k, v]) => k + ':' + v).join(' ')}`,
    );
  }
}

// ---- (c) campaign
const ORDER = [
  'nh1_s1', 'nh1_s2', 'nh1_s3', 'nh1_boss',
  'nh2_s1', 'nh3_s1', 'nh2_s2', 'nh3_s2', 'nh2_s3', 'nh3_s3', 'nh2_boss', 'nh3_boss',
  'nh4_s1', 'nh4_s2', 'nh4_s3', 'nh4_boss', 'city_boss',
];
const NH_OF = (id) => (id === 'city_boss' ? 'downtown' : id.slice(0, 3));
const ADJ = { nh1: ['nh2', 'nh3'], nh2: ['nh1', 'nh3', 'nh4'], nh3: ['nh1', 'nh2', 'nh4'], nh4: ['nh2', 'nh3', 'downtown'], downtown: ['nh4'] };

/** Best affordable army not exceeding the recommended one: drop the priciest pieces, then backfill pawns. */
function affordable(rec, cash) {
  const a = { ...rec };
  const drop = ['q', 'r', 'b', 'n', 'p'];
  while (value(a) > cash) {
    const t = drop.find((x) => a[x] > 0);
    if (!t) break;
    a[t]--;
  }
  while (a.p < BAL.MAX_ARMY.p && value(a) + PRICES.p <= cash && value(a) < value(rec)) a.p++;
  return a;
}

function campaign(res, { runs, challenges, puzzle, seed = 7 }) {
  const rng = seeded(seed);
  const stats = ORDER.map(() => ({ cashBefore: [], afford: 0, matches: [] }));
  const totals = { matches: [], challenges: [], lost: [], finished: 0, finalCash: [], bankrupt: 0 };
  const sample = (arr) => arr[Math.floor(rng() * arr.length)];

  for (let run = 0; run < runs; run++) {
    let cash = BAL.START_CASH;
    const owned = new Set();
    const lostOnce = new Set();
    let gameNo = 0;
    let challenge = null; // {target, gamesLeft}
    let cooldown = 0;
    const immune = new Map();
    let nChal = 0, nLost = 0, bankrupt = 0;
    const controlled = (nh) => ['s1', 's2', 's3', 'boss'].every((s) => owned.has(`${nh}_${s}`));

    const income = () => {
      let inc = 0;
      for (const id of owned) if (!(challenge && challenge.target === id)) inc += NODES[id].income;
      return inc;
    };
    const pay = (node, g, army, isFree, rewardFlat, incomeNow) => {
      let d = bountyOf(g.captured, node.captureBounty) + rewardFlat;
      // refund only bought pieces: scale survivors by the bought share of the army
      const bought = isFree ? 0 : 1;
      d += value(g.survivors) * (BAL.REFUNDS[g.result] || 0) * bought;
      const movesOk = g.plies / 2 >= BAL.INCOME.minFullMoves;
      d += movesOk ? incomeNow * BAL.INCOME.byResult[g.result] : 0;
      return d;
    };
    /** Sample an outcome for a player army vs the recorded games at the recommended army. */
    const outcome = (games, rec, army) => {
      const g = sample(games);
      const ratio = value(rec) ? Math.min(1, value(army) / value(rec)) : 1;
      if (ratio >= 0.999 || g.result !== 'win') return g;
      // under-funded: a win becomes a standoff/loss with prob (1 - ratio^2)
      if (rng() < 1 - ratio * ratio) return { ...g, result: rng() < 0.5 ? 'loss' : 'standoff', survivors: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
      return g;
    };
    const buy = (rec) => {
      if (cash < BAL.BANKRUPTCY.threshold) {
        bankrupt++;
        return { army: { p: BAL.BANKRUPTCY.freePawns, n: 0, b: 0, r: 0, q: 0 }, free: true };
      }
      const a = affordable(rec, cash);
      cash -= value(a);
      return { army: a, free: false };
    };
    const afterMatch = () => {
      gameNo++;
      cash += puzzle; // puzzle cash between matches (capped by PUZZLES.perSessionCap)
      if (!challenges) return;
      if (challenge) {
        challenge.gamesLeft--;
        return;
      }
      if (cooldown > 0) return void cooldown--;
      if (gameNo < BAL.CHALLENGES.graceGames || owned.size < BAL.CHALLENGES.minOwnedNodes) return;
      const nCtrl = ['nh1', 'nh2', 'nh3', 'nh4'].filter(controlled).length;
      const chance = Math.min(BAL.CHALLENGES.maxChance, BAL.CHALLENGES.baseChance + nCtrl * BAL.CHALLENGES.perControlledNeighborhood);
      if (rng() >= chance) return;
      const frontier = [...owned].filter((id) => {
        if (!NODES[id].defense) return false;
        if ((immune.get(id) || 0) > gameNo) return false;
        return ADJ[NH_OF(id)].some((nb) => nb === 'downtown' || !controlled(nb));
      });
      if (!frontier.length) return;
      const w = frontier.map((id) => (id.endsWith('boss') ? BAL.CHALLENGES.targetWeights.boss : BAL.CHALLENGES.targetWeights.street));
      let x = rng() * w.reduce((a, b) => a + b, 0);
      let target = frontier[0];
      for (let i = 0; i < frontier.length; i++) if ((x -= w[i]) < 0) { target = frontier[i]; break; }
      challenge = { target, gamesLeft: BAL.CHALLENGES.deadlineGames };
      nChal++;
    };
    const defend = () => {
      // policy: defend right away with the target node's recommended army
      const id = challenge.target;
      const node = NODES[id];
      const incomeNow = income();
      const { army, free } = buy(node.recommended);
      const g = outcome(res.defense[id], node.recommended, army);
      let flat = 0;
      if (g.result === 'win') flat = node.defense.reward;
      else if (g.result === 'standoff') flat = node.defense.reward * BAL.CHALLENGES.standoffRewardMult;
      cash += pay(node, g, army, free, flat, incomeNow);
      if (g.result === 'loss') {
        owned.delete(id);
        lostOnce.add(id);
        nLost++;
      } else immune.set(id, gameNo + BAL.CHALLENGES.immunityGames);
      challenge = null;
      cooldown = BAL.CHALLENGES.cooldownGames;
      afterMatch();
    };

    let finished = true;
    let guard = 0;
    for (let i = 0; i < ORDER.length; i++) {
      const id = ORDER[i];
      // retake anything lost first (policy), then the next node
      const todo = [...ORDER.slice(0, i).filter((x) => !owned.has(x)), id];
      for (const tid of todo) {
        let tries = 0;
        while (!owned.has(tid)) {
          if (challenge) defend();
          if (++guard > 400 || ++tries > 25) { finished = false; break; }
          const node = NODES[tid];
          if (tid === id && tries === 1) {
            stats[i].cashBefore.push(cash);
            if (cash >= value(node.recommended)) stats[i].afford++;
          }
          const incomeNow = income();
          const { army, free } = buy(node.recommended);
          const g = outcome(res.attack[tid], node.recommended, army);
          if (tid === id) stats[i].matches.push(1);
          let flat = 0;
          const mult = lostOnce.has(tid) ? BAL.CHALLENGES.retakeWinMult : 1;
          if (g.result === 'win') flat = node.reward.win * mult;
          else if (g.result === 'standoff') flat = node.reward.standoff;
          cash += pay(node, g, army, free, flat, incomeNow);
          if (g.result === 'win') owned.add(tid);
          if (tid === 'city_boss' && g.result === 'win') break;
          afterMatch();
        }
        if (!finished) break;
      }
      if (!finished) break;
    }
    if (finished) totals.finished++;
    totals.matches.push(gameNo);
    totals.challenges.push(nChal);
    totals.lost.push(nLost);
    totals.finalCash.push(cash);
    if (bankrupt) totals.bankrupt++;
  }
  return { stats, totals };
}

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const quant = (a, q) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor((s.length - 1) * q)];
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

function printCampaign(title, c) {
  console.log(`\n== (c) campaign money curve: ${title} ==`);
  console.log('  node        rec cost  cash before (p10 / median / p90)      can afford rec   avg attempts');
  ORDER.forEach((id, i) => {
    const s = c.stats[i];
    const n = s.cashBefore.length;
    console.log(
      `  ${id.padEnd(11)} ${$(value(NODES[id].recommended)).padStart(8)}  ${$(quant(s.cashBefore, 0.1)).padStart(9)} / ${$(median(s.cashBefore)).padStart(9)} / ${$(quant(s.cashBefore, 0.9)).padStart(9)}      ${n ? pct(s.afford / n) : '  - '}          ${n ? (s.matches.length / n).toFixed(2) : '-'}`,
    );
  });
  const t = c.totals;
  const runs = t.matches.length;
  console.log(
    `  finished ${pct(t.finished / runs)} | matches median ${median(t.matches)} | challenges avg ${mean(t.challenges).toFixed(1)} | nodes lost avg ${mean(t.lost).toFixed(2)} | used safety net ${pct(t.bankrupt / runs)} | final cash median ${$(median(t.finalCash))}`,
  );
}

async function main() {
  const o = args();
  const bad = checkFens();
  if (o.fensOnly) process.exit(bad ? 1 : 0);

  let res;
  if (o.load) res = JSON.parse(fs.readFileSync(o.load, 'utf8'));
  else {
    const ids = o.nodes || Object.keys(NODES);
    const jobs = [];
    let seed = 1000;
    for (const id of ids) {
      const n = NODES[id];
      for (let g = 0; g < o.games; g++)
        jobs.push({ kind: 'attack', node: id, white: n.recommended, black: n.army, bot: n.bot, proxy: o.proxy, seed: seed++, timeScale: o.timeScale });
      if (n.defense && !o.noDefense)
        for (let g = 0; g < o.games; g++)
          jobs.push({ kind: 'defense', node: id, white: n.recommended, black: n.defense.army, bot: n.defense.bot, proxy: o.proxy, seed: seed++, timeScale: o.timeScale });
    }
    console.log(`\n== (b) playing ${jobs.length} games on ${o.threads} threads (proxy '${o.proxy}', timeScale ${o.timeScale}) ==`);
    const t0 = Date.now();
    const out = await runPool(jobs, o.threads, (d, n) => {
      if (d % 20 === 0 || d === n) process.stderr.write(`  ${d}/${n} games, ${Math.round((Date.now() - t0) / 1000)}s\r`);
    });
    process.stderr.write('\n');
    res = { attack: {}, defense: {} };
    jobs.forEach((j, i) => ((res[j.kind][j.node] ||= []).push(out[i])));
    if (o.save) fs.writeFileSync(o.save, JSON.stringify(res));
  }

  const rows = (kind) =>
    Object.keys(NODES)
      .filter((id) => res[kind][id])
      .map((id) => {
        const n = NODES[id];
        const src = kind === 'attack' ? n : n.defense;
        return { id, bot: src.bot, army: src.army, rec: n.recommended, s: summarize(res[kind][id], n, kind) };
      });
  printMatchTable('(b) attack matches: proxy with recommended army vs node bot', rows('attack'));
  if (Object.keys(res.defense).length) printMatchTable('(b) defense matches: proxy with recommended army vs raiding party', rows('defense'));

  const full = ORDER.every((id) => res.attack[id]?.length) && ORDER.every((id) => !NODES[id].defense || res.defense[id]?.length);
  if (!full) {
    console.log('\n(campaign skipped: needs results for every node incl. defenses)');
    return;
  }
  printCampaign(`no challenges, puzzles ${$(o.puzzle)}/visit`, campaign(res, { runs: o.runs, challenges: false, puzzle: o.puzzle }));
  printCampaign(`with challenges, puzzles ${$(o.puzzle)}/visit`, campaign(res, { runs: o.runs, challenges: true, puzzle: o.puzzle }));
  printCampaign('with challenges, no puzzles', campaign(res, { runs: o.runs, challenges: true, puzzle: 0 }));
  process.exit(0);
}

if (isMainThread) main().catch((e) => (console.error(e), process.exit(1)));
