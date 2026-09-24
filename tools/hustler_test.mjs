// Hustler Mode tests: AI bot profiles, army/FEN builder, campaign rules + save. Run: node tools/hustler_test.mjs
import { Chess } from 'chess.js';
import { chooseMove, search, profileConfig } from '../src/chess/engine.js';
import { sanitizeLevel } from '../src/chess/ai.js';
import * as army from '../src/hustler/army.js';
import { Campaign, MemoryStorage, SAVE_KEY, NODE_IDS } from '../src/hustler/Campaign.js';
import * as balance from '../src/hustler/data/balance.js';
import * as lore from '../src/hustler/data/lore.js';

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}${!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  if (!cond) failures++;
};
/** deterministic rng (mulberry32) */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const constRng = (v) => () => v;

// ================================================================== AI profiles
console.log('AI profiles:');
{
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2'; // dxe5 available
  const legal = new Chess(fen).moves({ verbose: true });
  const isLegal = (m) => legal.some((x) => x.from === m.from && x.to === m.to);
  const r0 = chooseMove(fen, { maxDepth: 0, captureBias: 1 }, { rng: seeded(3) });
  ok(r0.kind === 'random' && r0.move.from === 'd4' && r0.move.to === 'e5', 'maxDepth 0 + captureBias 1 takes the only capture', r0);
  const r1 = chooseMove(fen, { maxDepth: 0, captureBias: 0 }, { rng: seeded(5) });
  ok(r1.kind === 'random' && isLegal(r1.move), 'maxDepth 0 with captureBias 0 plays a legal random move');
  const rb = chooseMove(fen, { maxDepth: 3, blunderChance: 1 }, { rng: seeded(7) });
  ok(rb.kind === 'blunder' && isLegal(rb.move), 'blunderChance 1 always blunders (random legal move)', rb);
  const mateFen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'; // Ra8#
  const rm = chooseMove(mateFen, { maxDepth: 2, timeMs: 400, blunderChance: 0, noiseCp: 0 }, { rng: seeded(9) });
  ok(rm.kind === 'search' && rm.move.to === 'a8', 'profile depth 2 finds mate in 1', rm.move);
  for (const [id, p] of Object.entries(balance.BOT_PROFILES)) {
    const r = chooseMove('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', p, { rng: seeded(11) });
    ok(!!r.move && r.ms < 4500, `BOT_PROFILES.${id} returns a move (${r.kind}, ${r.ms}ms)`);
  }
  const lvl = chooseMove(mateFen, 2);
  const lvl2 = search(mateFen, 2);
  ok(lvl.kind === 'search' && lvl.move.to === lvl2.move.to, 'level numbers still go through the original search');
  const cfg = profileConfig({ maxDepth: 9, timeMs: 99999, topN: 0 });
  ok(cfg.depth === 5 && cfg.budget === 4000 && cfg.randomTop === 1, 'profileConfig clamps garbage', cfg);
  ok(sanitizeLevel(7) === 2 && sanitizeLevel(3) === 3, 'sanitizeLevel keeps 1..4, else 2');
  const sp = sanitizeLevel({ maxDepth: 1, fn: () => 1, extra: { a: 1 }, captureBias: 0.5 });
  ok(sp.maxDepth === 1 && sp.captureBias === 0.5 && !('fn' in sp) && !('extra' in sp), 'sanitizeLevel strips non-profile fields', sp);
}

// ================================================================== army / FEN
console.log('army + FEN:');
{
  const w = army.autoDeploy({ p: 3, n: 1, b: 1, r: 2, q: 1 }, 'w');
  ok(w.e1 === 'k' && w.e2 === 'p' && w.d2 === 'p' && w.f2 === 'p' && !w.c2, 'pawns fill e,d,f first', w);
  ok(w.b1 === 'n' && w.c1 === 'b' && w.a1 === 'r' && w.h1 === 'r' && w.d1 === 'q', 'pieces on home squares', w);
  const b = army.autoDeploy({ p: 2 }, 'b');
  ok(b.e8 === 'k' && b.e7 === 'p' && b.d7 === 'p' && Object.keys(b).length === 3, 'bot army mirrored to ranks 7-8', b);
  const full = army.autoDeploy(balance.MAX_ARMY, 'w');
  ok(Object.keys(full).length === 16, 'MAX_ARMY auto-deploys 16 pieces', full);
  const f1 = army.buildFen({ w, b });
  ok(f1.ok && f1.fen.endsWith(' w KQ - 0 1'), 'castling rights only for K+R on home squares (white KQ, black none)', f1);
  const f2 = army.buildFen({ w: { e1: 'k', h1: 'r', a2: 'r' }, b: army.autoDeploy(balance.MAX_ARMY, 'b') });
  ok(f2.ok && f2.fen.split(' ')[2] === 'Kkq', 'rook off a1 loses Q-side right', f2);
  const f3 = army.buildFen({ w: { e1: 'k', e2: 'q' }, b: { e8: 'k' } });
  ok(!f3.ok && f3.code === 'check', 'rejects start with black king already in check', f3);
  const f4 = army.buildFen({ w: { e1: 'k', a1: 'p' }, b: { e8: 'k' } });
  ok(!f4.ok && f4.code === 'pawnrank', 'rejects pawn on rank 1', f4);
  const f5 = army.buildFen({ w: { e1: 'k' }, b: { e8: 'k', e7: 'p' } });
  ok(f5.ok && new Chess(f5.fen).fen() === f5.fen, 'chess.js accepts the FEN verbatim', f5);
  ok(army.canDeploy('p', 'a2') && !army.canDeploy('p', 'a1') && army.canDeploy('n', 'a1') && !army.canDeploy('n', 'a3'), 'deploy squares: pawns rank 2, others ranks 1-2');
  const partial = army.autoDeployRemaining({ p: 2, n: 1 }, { e1: 'k', a2: 'p' });
  const counts = army.remaining({ p: 2, n: 1 }, partial);
  ok(counts.p === 0 && counts.n === 0 && partial.a2 === 'p' && partial.b1 === 'n', 'autoDeployRemaining keeps manual placements', partial);
  const board = army.placementBoard({ e1: 'k' }, { e8: 'k' });
  ok(board[7][4]?.square === 'e1' && board[0][4]?.color === 'b', 'placementBoard uses chess.js board() layout');
}

// ================================================================== campaign
console.log('campaign:');
const mk = (rng = seeded(42), storage = new MemoryStorage()) => new Campaign({ balance, lore, storage, rng });
const winOutcome = (extra = {}) => ({ result: 'win', reason: 'checkmate', captures: { p: 1 }, survivors: { p: 1 }, moves: 20, ...extra });
function play(c, nodeId, outcome, buy = { p: 2 }) {
  const m = nodeId === 'defense' ? c.prepareDefense() : c.prepareMatch(nodeId);
  if (!m) return { err: 'not available ' + nodeId };
  const st = c.startMatch(m, buy);
  if (!st.ok) return { err: st.error };
  return c.resolveMatch(outcome);
}
{
  const c = mk();
  c.newCampaign('Test Crew');
  ok(c.state.cash === balance.START_CASH, 'start cash from balance');
  const v = c.view();
  ok(v.nodes.length === 17 && v.neighborhoods.length === 5, 'view has 17 nodes and 5 districts');
  ok(['nh1_s1', 'nh1_s2', 'nh1_s3'].every((id) => c.nodeStatus(id) === 'available'), 'nh1 streets available at start');
  ok(c.nodeStatus('nh1_boss') === 'locked' && c.nodeStatus('nh2_s1') === 'locked' && c.nodeStatus('city_boss') === 'locked', 'boss/nh2/city locked at start');
  const n0 = v.nodes.find((n) => n.id === 'nh1_s1');
  ok(n0.leader.name === lore.LEADERS.nh1_s1.name && n0.name === lore.STREETS.nh1_s1.name && n0.difficulty >= 1, 'node view carries lore + difficulty', n0.leader);

  // purchase rules
  const m = c.prepareMatch('nh1_s1');
  ok(!c.checkArmy(m, { q: 1 }).ok, 'cannot buy what you cannot afford');
  ok(!c.checkArmy(m, {}).ok, 'must hire at least one piece (minArmy)');
  ok(!c.startMatch(m, { p: 3 }).ok, 'startMatch refuses 3 pawns on $2,500');

  // win street 1
  const r = play(c, 'nh1_s1', winOutcome());
  ok(r && r.result === 'win' && c.isOwned('nh1_s1') && r.gained[0] === 'nh1_s1', 'winning takes the street', r?.err);
  const expect = balance.START_CASH - 2000 + balance.NODES.nh1_s1.reward.win + balance.NODES.nh1_s1.captureBounty.p + Math.round(balance.PRICES.p * balance.REFUNDS.win);
  ok(c.state.cash === expect, `cash = start - army + reward + bounty + refund (${expect})`, c.state.cash);
  ok(r.lines.some((l) => /Bounties/.test(l.label)) && r.lines.some((l) => /resold/.test(l.label)), 'results list bounty and refund lines', r.lines);
  ok(!r.lines.some((l) => /Street tax/.test(l.label)), 'no income from a node taken in this very match');
  ok(r.leaderLine === lore.LEADERS.nh1_s1.lines.playerWins, 'leader line on results');

  // income: owned at start, >= minFullMoves
  const before = c.state.cash;
  const r2 = play(c, 'nh1_s2', { result: 'loss', reason: 'checkmate', captures: {}, survivors: {}, moves: 30 });
  const inc = Math.round(balance.NODES.nh1_s1.income * balance.INCOME.byResult.loss);
  ok(r2.lines.find((l) => /Street tax/.test(l.label))?.amount === inc && c.state.cash === before - 2000 + inc, 'loss pays half street tax, army gone', r2.lines);
  const r3 = play(c, 'nh1_s2', { result: 'win', captures: {}, survivors: {}, moves: 3 });
  ok(r3.lines.find((l) => /Street tax/.test(l.label))?.amount === 0, `short match (< ${balance.INCOME.minFullMoves} moves) pays no income`, r3.lines);
  ok(c.state.gameNo === 3 && c.incomePerGame() === 600, 'income per game = sum of owned nodes', c.incomePerGame());

  // boss unlock + neighborhood unlocks
  play(c, 'nh1_s3', winOutcome());
  ok(c.nodeStatus('nh1_boss') === 'available', 'boss unlocks when all 3 streets owned');
  const rb = play(c, 'nh1_boss', winOutcome(), { p: 2 });
  ok(c.neighborhoodStatus('nh1') === 'controlled' && rb.controlled[0]?.id === 'nh1', 'boss win controls the neighborhood', rb?.controlled);
  ok(rb.unlocks.map((u) => u.id).sort().join() === 'nh2,nh3' && c.nodeStatus('nh2_s1') === 'available', 'nh2 + nh3 unlock after nh1 boss', rb.unlocks);
  ok(rb.unlocks[0].text === lore.STORY.unlocks[rb.unlocks[0].id], 'unlock carries the story beat');
  const pend = c.takePendingUnlocks();
  ok(pend.length === 2 && c.takePendingUnlocks().length === 0, 'pending unlock beats are shown once');
}
{
  // nh4 needs both tier-2 bosses; city boss finale
  const c = mk();
  c.newCampaign('Speedrun');
  c.state.cash = 10_000_000;
  const all = (nh) => [`${nh}_s1`, `${nh}_s2`, `${nh}_s3`, `${nh}_boss`].forEach((id) => play(c, id, winOutcome()));
  all('nh1');
  all('nh2');
  ok(c.neighborhoodStatus('nh4') === 'locked', 'nh4 still locked with only nh2 controlled');
  all('nh3');
  ok(c.neighborhoodStatus('nh4') === 'open', 'nh4 opens after nh2 + nh3 bosses');
  c.state.challenge = null;
  all('nh4');
  ok(c.nodeStatus('city_boss') === 'available', 'city boss available after nh4 boss');
  c.state.challenge = null;
  const rf = play(c, 'city_boss', winOutcome());
  ok(rf.finale && c.state.finished, 'beating the City Boss finishes the campaign');
  ok(c._rollChallenge(true) === null, 'no challenges after the City Boss');
}
{
  // challenges: generation, deadline tick, defense win/loss, decline
  const c = mk(constRng(0)); // rng 0 -> every chance roll succeeds
  c.newCampaign('Defenders');
  c.state.cash = 1_000_000;
  play(c, 'nh1_s1', winOutcome());
  play(c, 'nh1_s2', winOutcome());
  ok(!c.state.challenge, 'no challenge during the grace period');
  play(c, 'nh1_s3', winOutcome());
  play(c, 'nh1_boss', { result: 'loss', captures: {}, survivors: {}, moves: 12 });
  ok(!c.state.challenge && c.state.gameNo === 4, 'still no challenge at game 4 (graceGames 4)');
  const r5 = play(c, 'nh1_boss', { result: 'standoff', captures: {}, survivors: { p: 2 }, moves: 40 });
  ok(!!c.state.challenge && r5.newChallenge && r5.newChallenge.gamesLeft === balance.CHALLENGES.deadlineGames, 'challenge appears after game 5', c.state.challenge);
  const t = c.state.challenge.targetNodeId;
  ok(c.nodeStatus(t) === 'contested' && c.view().challenge.message, 'target shows as contested, view has message');
  ok(c.incomePerGame() === 900 - balance.NODES[t].income, 'contested node pays no income');
  // tick down
  play(c, 'nh1_boss', { result: 'loss', captures: {}, survivors: {}, moves: 12 });
  ok(c.state.challenge?.gamesLeft === 1, 'an attack match ticks the challenge down');
  const rx = play(c, 'nh1_boss', { result: 'loss', captures: {}, survivors: {}, moves: 12 });
  ok(!c.isOwned(t) && rx.lost.includes(t) && rx.challengeExpired === t, 'ignored challenge: node falls at 0', rx.lost);
  ok(c.nodeStatus('nh1_boss') === 'locked', 'boss locked again after losing a street');
  // retake pays retakeWinMult
  const m = c.prepareMatch(t);
  ok(m.retake && m.reward.win === Math.round(balance.NODES[t].reward.win * balance.CHALLENGES.retakeWinMult), 'retaking a lost node pays reduced reward', m.reward);
  c.startMatch(m, { p: 2 });
  c.resolveMatch(winOutcome());
  // force + defend win
  c.state.challenge = null;
  c.state.lastChallengeEnd = -Infinity;
  const ch = c.forceChallenge();
  ok(ch && ch.attacker?.name, 'forceChallenge creates a challenge with an attacker', ch);
  const cash0 = c.state.cash;
  const rd = play(c, 'defense', { result: 'win', captures: {}, survivors: {}, moves: 5 });
  ok(rd.kind === 'defense' && c.isOwned(ch.targetNodeId) && !c.state.challenge, 'defense win keeps node, clears challenge', rd);
  ok(c.state.cash === cash0 - 2000 + balance.NODES[ch.targetNodeId].defense.reward, 'defense win pays defense.reward', c.state.cash - cash0);
  ok(c.state.immunity[ch.targetNodeId] === c.state.gameNo + balance.CHALLENGES.immunityGames, 'defended node gets immunity');
  // defense loss
  c.state.lastChallengeEnd = -Infinity;
  const ch2 = c.forceChallenge();
  ok(ch2 && ch2.targetNodeId !== ch.targetNodeId, 'immune node is not targeted', ch2);
  const rl = play(c, 'defense', { result: 'loss', captures: {}, survivors: {}, moves: 5 });
  ok(!c.isOwned(ch2.targetNodeId) && rl.lost.includes(ch2.targetNodeId), 'defense loss loses the node');
  // decline
  c.state.lastChallengeEnd = -Infinity;
  const ch3 = c.forceChallenge();
  const cash1 = c.state.cash;
  const declined = c.declineChallenge();
  ok(ch3 && declined === ch3.targetNodeId && !c.isOwned(declined) && c.state.cash === cash1, 'decline: node lost, no money spent');
}
{
  // bankruptcy safety net
  const c = mk();
  c.newCampaign('Broke');
  c.state.cash = 500;
  const m = c.prepareMatch('nh1_s1');
  ok(m.freePawns === balance.BANKRUPTCY.freePawns && m.loan?.label === balance.BANKRUPTCY.label, 'broke player gets the loan', m.loan);
  ok(m.maxArmy.p === balance.MAX_ARMY.p - m.freePawns, 'loan pawns count toward MAX_ARMY');
  const st = c.startMatch(m, {});
  ok(st.ok && c.state.cash === 500, 'can start with only the free pawns, no cash spent', st);
  const r = c.resolveMatch({ result: 'win', captures: {}, survivors: { p: 2 }, moves: 12 });
  ok(!r.lines.some((l) => /resold/.test(l.label)), 'free pawns are never refunded', r.lines);
  c.state.cash = 0;
  ok(c.loanFor() > 0 && c.prepareMatch('nh1_s2').freePawns > 0, 'zero cash never soft-locks: loan again');
}
{
  // promoted pawns resell as pawns, never as the piece they became
  const c = mk();
  c.newCampaign('Promoters');
  const rate = balance.REFUNDS.win || 0;
  const r = play(c, 'nh1_s1', { result: 'win', reason: 'checkmate', captures: {}, survivors: { p: 1, q: 1 }, moves: 13 });
  const line = r.lines.find((l) => /resold/.test(l.label));
  ok(rate === 0 || (line && line.amount === Math.round(2 * balance.PRICES.p * rate)), 'promoted queen refunds at pawn price', r.lines);
}
{
  // puzzles
  const c = mk();
  c.newCampaign('Nerds');
  const p1 = { id: 'abc', rating: 900 };
  ok(c.puzzleRewardFor(p1) === 200 && c.puzzleRewardFor(p1, { firstTry: false }) === 100, 'puzzle reward by rating + retryMult');
  const cash0 = c.state.cash;
  ok(c.creditPuzzle(p1, { firstTry: true }) === 200 && c.state.cash === cash0 + 200, 'creditPuzzle pays');
  ok(c.puzzleRewardFor(p1) === 0 && c.solvedPuzzleIds().has('abc'), 'repeat pays repeatReward (0)');
  for (let i = 0; i < 10; i++) c.creditPuzzle({ id: 'x' + i, rating: 2500 });
  ok(c.state.puzzles.sessionEarned === balance.PUZZLES.perSessionCap, 'per-session cap', c.state.puzzles.sessionEarned);
  play(c, 'nh1_s1', winOutcome());
  ok(c.state.puzzles.sessionEarned === 0 && c.puzzleRewardFor({ id: 'new', rating: 2500 }) === 800, 'cap resets after a match');
}
{
  // save round-trip, export/import, corrupted data, abandoned match, storage failures
  const store = new MemoryStorage();
  const c = mk(seeded(1), store);
  c.newCampaign('Savers');
  play(c, 'nh1_s1', winOutcome());
  const c2 = mk(seeded(1), store);
  ok(c2.load() && c2.state.gangName === 'Savers' && c2.isOwned('nh1_s1') && c2.state.cash === c.state.cash, 'save round-trip');
  ok(JSON.stringify(c2.view()) === JSON.stringify(c.view()), 'view identical after reload');
  const json = c.exportJSON();
  const c3 = mk(seeded(1), new MemoryStorage());
  ok(c3.importJSON(json).ok && c3.isOwned('nh1_s1'), 'export -> import');
  ok(!c3.importJSON('{"nope":1}').ok && !c3.importJSON('garbage').ok, 'import rejects junk');
  store.setItem(SAVE_KEY, '{broken');
  ok(!mk(seeded(1), store).load(), 'corrupted save -> load() false (no throw)');
  store.setItem(SAVE_KEY, JSON.stringify({ gangName: 'X', cash: 'lots', owned: { bogus: 1, nh1_s1: 2 }, challenge: { targetNodeId: 'nh9' } }));
  const c4 = mk(seeded(1), store);
  ok(c4.load() && c4.state.cash === balance.START_CASH && c4.isOwned('nh1_s1') && !c4.state.owned.bogus && !c4.state.challenge, 'sanitize repairs bad fields');
  // abandoned match
  const c5 = mk(seeded(1), store);
  c5.newCampaign('Quitter');
  c5.startMatch(c5.prepareMatch('nh1_s1'), { p: 2 });
  const c6 = mk(seeded(1), store);
  c6.load();
  ok(!!c6.state.activeMatch, 'active match survives reload');
  const ra = c6.abandonActiveMatch();
  ok(ra?.result === 'loss' && !c6.state.activeMatch && c6.state.cash === balance.START_CASH - 2000, 'reload mid-match counts as walking out (loss)');
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const c7 = mk(seeded(1), throwing);
  c7.newCampaign('NoStorage');
  ok(!c7.hasSave() && !c7.load() && c7.save() === false && c7.view().gangName === 'NoStorage', 'runs without storage');
  ok(NODE_IDS.every((id) => balance.NODES[id] && lore.LEADERS[id]), 'balance + lore cover all 17 node ids');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL OK');
process.exit(failures ? 1 : 0);
