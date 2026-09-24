// Rules + GameController integration tests (PLAN §4) with mock World/Hud/AI. Run: node tools/rules_test.mjs
import { Rules, toAnimArgs } from '../src/chess/rules.js';

// minimal browser globals for GameController
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

const { GameController, applyEconomy } = await import('../src/game/GameController.js');

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}${!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  if (!cond) failures++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ toAnimArgs
console.log('toAnimArgs:');
{
  const r = new Rules('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
  const m = r.move({ from: 'e5', to: 'f6' });
  const a = toAnimArgs(m);
  ok(
    eq(a.captured, { type: 'p', color: 'b', square: 'f5' }) && a.castle === null,
    'white en passant exf6: victim on f5',
    a,
  );
}
{
  const r = new Rules('rnbqkbnr/pppp1ppp/8/8/3Pp3/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3');
  // black ep: e4xd3, victim on d4
  const m = r.move({ from: 'e4', to: 'd3' });
  const a = toAnimArgs(m);
  ok(eq(a.captured, { type: 'p', color: 'w', square: 'd4' }), 'black en passant exd3: victim on d4', a);
}
{
  const r = new Rules('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  const a = toAnimArgs(r.move('O-O'));
  ok(eq(a.castle, { rookFrom: 'h1', rookTo: 'f1' }) && a.from === 'e1' && a.to === 'g1', 'white O-O', a);
  const b = toAnimArgs(r.move('O-O-O'));
  ok(eq(b.castle, { rookFrom: 'a8', rookTo: 'd8' }) && b.to === 'c8', 'black O-O-O', b);
  const r2 = new Rules('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  const c = toAnimArgs(r2.move('O-O-O'));
  ok(eq(c.castle, { rookFrom: 'a1', rookTo: 'd1' }), 'white O-O-O', c);
  const d = toAnimArgs(r2.move('O-O'));
  ok(eq(d.castle, { rookFrom: 'h8', rookTo: 'f8' }), 'black O-O', d);
}
{
  const r = new Rules('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
  ok(r.isPromotion('a7', 'b8') && r.isPromotion('a7', 'a8'), 'isPromotion detects push and capture-promo');
  const m = r.move({ from: 'a7', to: 'b8', promotion: 'n' });
  const a = toAnimArgs(m);
  ok(
    a.promotion === 'n' && a.piece.type === 'p' && eq(a.captured, { type: 'r', color: 'b', square: 'b8' }),
    'underpromotion axb8=N: piece stays pawn, promotion n, captured rook',
    a,
  );
  ok(r.get('b8')?.type === 'n', 'board has a knight on b8');
}

// ------------------------------------------------------------------ gameOver mapping
console.log('gameOver reasons:');
{
  const r = new Rules();
  for (const s of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) r.move(s);
  ok(eq(r.gameOver(), { result: 'w', reason: 'checkmate' }), "scholar's mate -> w checkmate", r.gameOver());
  ok(r.checkSquare() === 'e8', 'check square is black king e8');
}
{
  const r = new Rules('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  ok(eq(r.gameOver(), { result: 'draw', reason: 'stalemate' }), 'stalemate FEN', r.gameOver());
}
{
  const r = new Rules('8/8/4k3/8/8/4K3/5B2/8 w - - 0 1');
  ok(eq(r.gameOver(), { result: 'draw', reason: 'insufficient' }), 'K+B vs K insufficient');
}
{
  const r = new Rules();
  for (let i = 0; i < 2; i++) for (const s of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) r.move(s);
  ok(eq(r.gameOver(), { result: 'draw', reason: 'threefold' }), 'threefold repetition', r.gameOver());
}
{
  const r = new Rules('8/8/4k3/8/8/4K3/4R3/8 w - - 99 80');
  r.move('Ra2');
  ok(eq(r.gameOver(), { result: 'draw', reason: 'fifty-move' }), 'fifty-move rule', r.gameOver());
}
ok(new Rules().move({ from: 'e2', to: 'e5' }) === null, 'illegal move returns null (no throw)');

// ------------------------------------------------------------------ economy
console.log('economy:');
{
  let e = { cash: { w: 0, b: 0 }, wanted: 0 };
  e = applyEconomy(e, { color: 'w', captured: 'n' }, { check: false, mate: false });
  ok(e.cash.w === 3000 && e.wanted === 1, 'knight capture +3000, wanted +1');
  e = applyEconomy(e, { color: 'b' }, { check: true, mate: false });
  ok(e.cash.b === 500 && e.wanted === 3, 'check +500, wanted +2');
  e = applyEconomy(e, { color: 'w' }, { check: false, mate: false });
  ok(e.wanted === 2, 'quiet move wanted -1');
  e = applyEconomy(e, { color: 'w', captured: 'q' }, { check: true, mate: true });
  ok(e.cash.w === 3000 + 9000 + 500 + 50000 && e.wanted === 5, 'Qx...# = 9000+500+50000, wanted 5');
}

// ------------------------------------------------------------------ controller with mocks
function mocks({ aiDelay = 0, aiMove = null } = {}) {
  const log = [];
  const world = {
    anims: [],
    setPosition: (b) => log.push(['setPosition']),
    highlight: (h) => log.push(['highlight', h]),
    animateMove: async (a) => {
      world.anims.push(a);
      await delay(1);
    },
    setWanted: (w) => log.push(['world.setWanted', w]),
    setCameraPreset: (p) => log.push(['camera', p]),
    flipTo: (c) => log.push(['flipTo', c]),
    setInputEnabled: () => {},
  };
  const hud = {
    flashes: [],
    over: null,
    promo: 'n',
    setLoading() {},
    showTitle(o) {
      hud.title = o;
    },
    setTurn() {},
    setThinking() {},
    setMoves(l) {
      hud.moves = l;
    },
    setCash(c) {
      hud.cash = c;
    },
    setWanted(w) {
      hud.wanted = w;
    },
    flash(t, s) {
      hud.flashes.push([t, s]);
      return Promise.resolve();
    },
    showPromotion: async () => hud.promo,
    showGameOver(o) {
      hud.over = o;
    },
    updateMinimap() {},
    setClock() {},
    hideAll() {},
  };
  const sfx = { played: [], play: (n) => sfx.played.push(n), fx() {}, resume() {}, startRadio() {}, toggleMute: () => true };
  const ai = {
    calls: 0,
    cancelled: 0,
    getBestMove: async (fen) => {
      ai.calls++;
      await delay(aiDelay);
      if (aiMove) return aiMove(fen);
      const ms = new Rules(fen).legalMoves();
      return ms[0];
    },
    cancel: () => ai.cancelled++,
  };
  return { world, hud, sfx, ai, log };
}

async function clickPath(g, squares) {
  for (const sq of squares) {
    g.onSquareClick(sq);
    // wait until the controller is idle for input again (or game over)
    for (let i = 0; i < 400 && !['human', 'gameover', 'menu'].includes(g.state); i++) await delay(5);
  }
}

console.log('controller:');
{
  // local game: scholar's mate by clicks
  const m = mocks();
  const g = new GameController(m);
  g.showMenu();
  m.hud.title.onStart({ mode: 'local', playerColor: 'w', level: 2 });
  ok(g.state === 'human', 'local game starts in human state');
  await clickPath(g, ['e2', 'e4', 'e7', 'e5', 'f1', 'c4', 'b8', 'c6', 'd1', 'h5', 'g8', 'f6', 'h5', 'f7']);
  await delay(20);
  ok(g.state === 'gameover', "scholar's mate by clicks ends the game", g.state);
  ok(m.hud.over && m.hud.over.result === 'w' && m.hud.over.reason === 'checkmate' && m.hud.over.perspective === null, 'showGameOver local: w checkmate, perspective null', m.hud.over);
  ok(m.hud.cash.w === 1000 + 500 + 50000, 'white cash = pawn 1000 + check 500 + mate 50000', m.hud.cash);
  ok(m.hud.wanted === 5, 'wanted 5 on mate');
  ok(m.hud.flashes.some(([t, s]) => s === 'passed'), 'MISSION PASSED style flash in local win');
  ok(m.world.anims.length === 7 && m.world.anims[6].captured?.square === 'f7', '7 animateMove calls, last captures f7');
  g.dispose();
}
{
  // en passant + selection highlight split
  const m = mocks();
  const g = new GameController(m);
  g.newGame({ mode: 'local', playerColor: 'w', level: 1 });
  await clickPath(g, ['e2', 'e4', 'a7', 'a6', 'e4', 'e5', 'd7', 'd5']);
  g.onSquareClick('e5');
  const hl = m.log.filter((x) => x[0] === 'highlight').pop()[1];
  ok(hl.selected === 'e5' && hl.captures.includes('d6') && hl.moves.includes('e6'), 'ep target shown as capture', hl);
  await clickPath(g, ['d6']);
  const a = m.world.anims.at(-1);
  ok(a.captured && a.captured.square === 'd5' && a.to === 'd6', 'controller passes ep victim square d5', a);
  g.dispose();
}
{
  // underpromotion through hud.showPromotion
  const m = mocks();
  m.hud.promo = 'n';
  const g = new GameController(m);
  g.newGame({ mode: 'local', playerColor: 'w', level: 1 });
  g.rules.reset('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
  g.nextTurn();
  await clickPath(g, ['a7', 'b8']);
  const a = m.world.anims.at(-1);
  ok(a.promotion === 'n' && g.rules.get('b8')?.type === 'n', 'underpromotion to knight via promotion menu', a);
  g.dispose();
}
{
  // stalemate from FEN in local mode -> busted
  const m = mocks();
  const g = new GameController(m);
  g.newGame({ mode: 'local', playerColor: 'w', level: 1 });
  g.rules.reset('7k/8/5QK1/8/8/8/8/8 w - - 0 1');
  g.nextTurn();
  await clickPath(g, ['f6', 'f7']);
  await delay(10);
  ok(m.hud.over && m.hud.over.result === 'draw' && m.hud.over.reason === 'stalemate', 'Qf7 stalemate -> draw/stalemate', m.hud.over);
  ok(m.hud.flashes.some(([, s]) => s === 'busted'), 'busted flash on draw');
  g.dispose();
}
{
  // AI mode, human black: AI moves first; undo takes back 2 plies
  const m = mocks();
  const g = new GameController(m);
  g.newGame({ mode: 'ai', playerColor: 'b', level: 1 });
  ok(g.state === 'ai', 'AI (white) thinks first when human plays black');
  for (let i = 0; i < 200 && g.state !== 'human'; i++) await delay(10);
  ok(g.state === 'human' && g.rules.historyLength() === 1, 'AI made its first move after min delay');
  ok(m.log.some((x) => x[0] === 'flipTo' && x[1] === 'b'), 'camera flipped to black');
  const legal = g.rules.legalMoves()[0];
  await clickPath(g, [legal.from, legal.to]);
  for (let i = 0; i < 200 && !(g.state === 'human' && g.rules.historyLength() === 3); i++) await delay(10);
  ok(g.rules.historyLength() === 3, 'human + AI reply = 3 plies');
  g.undo();
  ok(g.rules.historyLength() === 1 && g.state === 'human', 'undo in AI mode removes 2 plies', g.rules.historyLength());
  g.undo();
  ok(g.rules.historyLength() === 1, 'cannot undo the AI opening move alone');
  g.dispose();
}
{
  // rematch while AI is thinking: stale result must be dropped
  const m = mocks({ aiDelay: 300 });
  const g = new GameController(m);
  g.newGame({ mode: 'ai', playerColor: 'b', level: 3 });
  await delay(50);
  ok(g.state === 'ai', 'AI thinking');
  g.newGame({ mode: 'ai', playerColor: 'w', level: 3 }); // rematch as white
  ok(m.ai.cancelled >= 1, 'ai.cancel() called on rematch');
  await delay(900);
  ok(g.rules.historyLength() === 0 && g.state === 'human', 'stale AI move was ignored after rematch', {
    h: g.rules.historyLength(),
    s: g.state,
  });
  g.dispose();
}
{
  // AI mode checkmate perspective: human (white) gets mated -> WASTED
  const m = mocks({
    aiMove: (fen) => {
      const r = new Rules(fen);
      const mate = r.legalMoves().find((x) => x.san.endsWith('#'));
      return mate || r.legalMoves()[0];
    },
  });
  const g = new GameController(m);
  g.newGame({ mode: 'ai', playerColor: 'w', level: 2 });
  g.rules.reset('rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2');
  g.nextTurn();
  await clickPath(g, ['g2', 'g4']);
  for (let i = 0; i < 200 && g.state !== 'gameover'; i++) await delay(10);
  await delay(20);
  ok(m.hud.over?.result === 'b' && m.hud.over?.perspective === 'w', 'fool mate: result b, perspective w', m.hud.over);
  ok(m.hud.flashes.some(([t, s]) => s === 'wasted' && t === 'WASTED'), 'WASTED flash for the human');
  g.dispose();
}
{
  // resign while AI is thinking
  const m = mocks({ aiDelay: 200 });
  const g = new GameController(m);
  g.newGame({ mode: 'ai', playerColor: 'b', level: 2 });
  await delay(20);
  g.onAction('resign');
  await delay(400);
  ok(m.hud.over?.reason === 'resign' && m.hud.over?.result === 'w' && g.rules.historyLength() === 0, 'resign during AI think: w wins, AI move dropped', m.hud.over);
  g.dispose();
}


// ------------------------------------------------------------------ Hustler custom starts
console.log('custom start (Hustler):');
{
  // custom FEN + profile + onGameEnd instead of showGameOver
  const m = mocks();
  m.hud.crews = [];
  m.hud.setCrews = (c) => m.hud.crews.push(c);
  m.world.setTeamColors = () => {};
  const g = new GameController(m);
  let ended = null;
  const profile = { label: 'Test', maxDepth: 1 };
  const levels = [];
  const orig = m.ai.getBestMove;
  m.ai.getBestMove = (fen, lvl) => (levels.push(lvl), orig(fen, lvl));
  g.startCustom({
    fen: '4k3/8/8/8/8/8/3PP3/4K2R w K - 0 1',
    profile,
    opponent: { name: 'Two-Pawn Dez', crew: 'The Strand Rats', lines: { intro: 'hi' }, taunts: ['yo'] },
    player: { name: 'Test Crew' },
    onGameEnd: (s) => (ended = s),
  });
  ok(g.rules.fen() === '4k3/8/8/8/8/8/3PP3/4K2R w K - 0 1' && g.state === 'human', 'starts from the custom FEN, human (white) to move');
  ok(m.hud.crews.at(-1)?.b?.name === 'THE STRAND RATS', 'HUD crew names overridden', m.hud.crews.at(-1));
  await clickPath(g, ['e2', 'e4']);
  for (let i = 0; i < 200 && g.state !== 'human'; i++) await delay(5);
  ok(levels[0] === profile, 'AI called with the bot profile object');
  g.undo();
  ok(g.rules.historyLength() === 2, 'undo disabled in Hustler matches');
  g.onAction('resign');
  for (let i = 0; i < 100 && !ended; i++) await delay(5);
  ok(ended && ended.result === 'loss' && ended.reason === 'resign' && ended.moves === 1, 'resign -> onGameEnd loss', ended);
  ok(ended && ended.survivors.p === 2 && ended.survivors.r === 1, 'survivors counted from the final board', ended?.survivors);
  ok(!m.hud.over, 'normal game-over card not shown');
  g.newGame({ mode: 'ai', playerColor: 'w', level: 3 });
  ok(g.custom === null && g.rules.fen().startsWith('rnbqkbnr/pppppppp'), 'normal newGame after Hustler uses standard start');
  ok(m.hud.crews.at(-1) === null, 'crew names restored');
  g.dispose();
}
{
  const m = mocks();
  const g = new GameController(m);
  let ended = null;
  g.startCustom({ fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', profile: { maxDepth: 1 }, onGameEnd: (s) => (ended = s) });
  await clickPath(g, ['a1', 'a8']);
  for (let i = 0; i < 100 && !ended; i++) await delay(5);
  ok(ended?.result === 'win' && ended.reason === 'checkmate' && ended.winner === 'w', 'Ra8# -> win', ended);
  g.startCustom({ fen: 'not a fen', profile: { maxDepth: 1 }, onGameEnd: () => {} });
  ok(g.rules.fen().startsWith('rnbqkbnr/pppppppp'), 'invalid FEN falls back to the standard start');
  let ended2 = null;
  g.startCustom({ fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', onGameEnd: (s) => (ended2 = s) });
  for (let i = 0; i < 100 && !ended2; i++) await delay(5);
  ok(ended2?.result === 'standoff' && ended2.reason === 'insufficient', 'already-drawn start ends immediately as standoff', ended2);
  let menu = 0;
  g.startCustom({ fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', onMenu: () => menu++, onGameEnd: () => {} });
  g.onAction('menu');
  ok(menu === 1 && g.state === 'human', 'phone MENU in a Hustler match calls onMenu');
  g.dispose();
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL OK');
process.exit(failures ? 1 : 0);
