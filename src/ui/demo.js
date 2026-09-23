// Standalone HUD demo: `?demo=hud` (via main.js) or src/ui/_test.html.
// Exercises every Hud method on a timeline with fake data. No chess.js, no world code.
// Add `&hold` to the URL to stop the timeline from auto-advancing past the title / promotion.
import { Hud } from './Hud.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// FEN placement -> chess.js-style board() (board[0] = rank 8)
function fenToBoard(fen) {
  return fen
    .split(' ')[0]
    .split('/')
    .map((row, r) => {
      const out = [];
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null);
        else
          out.push({
            square: String.fromCharCode(97 + out.length) + (8 - r),
            type: ch.toLowerCase(),
            color: ch === ch.toUpperCase() ? 'w' : 'b',
          });
      }
      return out;
    });
}
const at = (b, sq) => b[8 - +sq[1]][sq.charCodeAt(0) - 97];
function put(b, sq, cell) {
  b[8 - +sq[1]][sq.charCodeAt(0) - 97] = cell ? { ...cell, square: sq } : null;
}
function move(b, from, to, promo) {
  const p = at(b, from);
  put(b, from, null);
  put(b, to, promo ? { ...p, type: promo } : p);
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const VAL = { p: 1000, n: 3000, b: 3000, r: 5000, q: 9000 };

// Fried Liver Attack, with a bit of flavor
const SCRIPT = [
  ['e2', 'e4', 'e4'],
  ['e7', 'e5', 'e5'],
  ['g1', 'f3', 'Nf3'],
  ['b8', 'c6', 'Nc6', 'CARTEL NOCTURNO: Welcome to Leonida, tourist.'],
  ['f1', 'c4', 'Bc4'],
  ['g8', 'f6', 'Nf6'],
  ['f3', 'g5', 'Ng5'],
  ['d7', 'd5', 'd5'],
  ['e4', 'd5', 'exd5'],
  ['f6', 'd5', 'Nxd5', 'Cute thug. Shame about him.'],
  ['g5', 'f7', 'Nxf7'],
  ['e8', 'f7', 'Kxf7', 'EL JEFE: You sent a bike into my house?'],
  ['d1', 'f3', 'Qf3+'],
  ['f7', 'e6', 'Ke6'],
  ['b1', 'c3', 'Nc3'],
  ['c6', 'b4', 'Nb4'],
  ['e1', 'g1', 'O-O'],
  ['c7', 'c6', 'c6'],
];

export async function demo(el) {
  const params = new URLSearchParams(location.search);
  const hold = params.has('hold');

  const bg = document.createElement('div');
  bg.style.cssText =
    'position:fixed;inset:0;z-index:-1;pointer-events:none;' +
    'background:radial-gradient(90% 60% at 70% 100%,rgba(255,154,60,.55),transparent 60%),' +
    'radial-gradient(70% 50% at 15% 95%,rgba(255,95,162,.5),transparent 60%),' +
    'linear-gradient(180deg,#0c0718 0%,#1b1036 50%,#4a1d5c 80%,#7a2a55 100%)';
  const grid = document.createElement('div');
  grid.style.cssText =
    'position:absolute;left:50%;top:58%;width:min(70vh,70vw);height:min(70vh,70vw);' +
    'transform:translate(-50%,-50%) perspective(900px) rotateX(58deg) rotateZ(0deg);' +
    'background:conic-gradient(#2c2a33 25%,#c9c2b3 0 50%,#2c2a33 0 75%,#c9c2b3 0) 0 0/25% 25%;' +
    'box-shadow:0 0 0 14px #b8202b,0 0 0 20px #eee,0 40px 80px rgba(0,0,0,.6);opacity:.85;border-radius:4px';
  bg.appendChild(grid);
  el.prepend(bg);

  const hud = new Hud(el);
  window.__hud = hud; // dev convenience
  let orient = 'w';
  let board = fenToBoard(START);
  let last = null;
  let token = 0;
  let resignReq = false;
  let clockStopped = false;

  hud.onAction = (a) => {
    if (a === 'flip' || a === 'camera') {
      orient = orient === 'w' ? 'b' : 'w';
      hud.updateMinimap(board, last, orient);
    }
    if (a === 'resign') resignReq = true;
    if (a === 'menu') {
      token++;
      hud.hideAll();
      toTitle();
      return;
    }
    hud.flash(`LIFEINVADER: You tapped ${a.toUpperCase()}.`, 'info');
  };

  // --- loading
  hud.setLoading(0);
  for (let p = 0; p <= 1.0001; p += 0.04) {
    hud.setLoading(Math.min(0.99, p));
    await sleep(110);
  }
  hud.setLoading(1);
  await sleep(700);

  function toTitle() {
    return new Promise((resolve) => {
      hud.showTitle({
        onStart(opts) {
          console.log('[hud demo] onStart', opts);
          resolve(opts);
          play(opts);
        },
      });
      if (!hold)
        setTimeout(() => {
          const b = el.querySelector('.gtc-start');
          if (b) b.click();
        }, 9000);
    });
  }

  async function play(opts) {
    const my = ++token;
    const alive = () => my === token;
    const human = opts.mode === 'ai' ? opts.playerColor : null;
    board = fenToBoard(START);
    last = null;
    orient = human === 'b' ? 'b' : 'w';
    resignReq = false;
    clockStopped = false;
    const cash = { w: 0, b: 0 };
    let wanted = 0;
    const sans = [];
    const t0 = performance.now();
    let moveNo = 1;

    hud.hideAll();
    hud.setCash(cash);
    hud.setWanted(0);
    hud.setMoves([]);
    hud.updateMinimap(board, null, orient);
    const tick = () => {
      if (!alive() || clockStopped) return;
      hud.setClock({ moveNo, elapsedMs: performance.now() - t0 });
      requestAnimationFrame(tick);
    };
    tick();

    for (let i = 0; i < SCRIPT.length; i++) {
      const [from, to, san, taunt] = SCRIPT[i];
      const color = i % 2 ? 'b' : 'w';
      const isHuman = human ? color === human : true;
      hud.setTurn(color, isHuman);
      if (!isHuman || human === null) {
        hud.setThinking(!isHuman);
        await sleep(isHuman ? 700 : 1100);
        hud.setThinking(false);
      } else await sleep(800);
      if (!alive()) return;
      if (resignReq) return endGame(alive, color === 'w' ? 'b' : 'w', 'resign', human);

      const victim = at(board, to);
      move(board, from, to);
      if (san === 'O-O') move(board, 'h1', 'f1');
      last = { from, to };
      sans.push(san);
      if (victim) {
        cash[color] += VAL[victim.type] || 0;
        wanted = Math.min(5, wanted + 1);
      } else wanted = Math.max(0, wanted - 1);
      if (san.includes('+')) {
        cash[color] += 500;
        wanted = Math.min(5, wanted + 2);
      }
      if (color === 'b') moveNo++;
      hud.setMoves(sans);
      hud.updateMinimap(board, last, orient);
      hud.setCash(cash);
      hud.setWanted(wanted);
      if (san.includes('+')) hud.flash('WANTED', 'wanted');
      if (taunt) hud.flash(taunt, 'info');
      await sleep(500);
    }
    if (!alive()) return;

    // --- promotion scene (jump to an endgame)
    await sleep(900);
    board = fenToBoard('8/3P1k2/8/8/8/2K5/8/8');
    hud.updateMinimap(board, null, orient);
    hud.setTurn('w', true);
    hud.flash('LEONIDA NEWS: Street Thug spotted near the 8th rank.', 'info');
    await sleep(1200);
    if (!alive()) return;
    const pp = hud.showPromotion('w');
    if (!hold)
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })), 4200);
    const choice = await pp;
    if (!alive()) return;
    move(board, 'd7', 'd8', choice);
    last = { from: 'd7', to: 'd8' };
    sans.push('d8=' + choice.toUpperCase() + '+');
    hud.setMoves(sans);
    hud.updateMinimap(board, last, orient);
    wanted = 5;
    hud.setWanted(wanted);
    cash.w += 500;
    hud.setCash(cash);
    await hud.flash('WANTED', 'wanted');
    if (!alive()) return;

    // --- banner reel
    await hud.flash('BUSTED\nMISSION FAILED: STALEMATE', 'busted');
    if (!alive()) return;
    await hud.flash('MISSION PASSED', 'passed');
    if (!alive()) return;
    cash.w += 50000;
    hud.setCash(cash);
    await hud.flash('WASTED', 'wasted');
    if (!alive()) return;
    endGame(alive, 'w', 'checkmate', human);
  }

  function endGame(alive, result, reason, human) {
    if (!alive()) return;
    clockStopped = true;
    hud.setThinking(false);
    hud.showGameOver({
      result,
      reason,
      perspective: human,
      onRematch: () => play({ mode: human ? 'ai' : 'local', playerColor: human || 'w', level: 2 }),
      onMenu: () => {
        token++;
        hud.hideAll();
        toTitle();
      },
    });
  }

  await toTitle();
}
