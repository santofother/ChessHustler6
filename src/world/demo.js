// Standalone world demo (?demo=world): builds the world and auto-plays a scripted sequence that exercises
// every animation — each piece type, captures, en passant, both castles, promotion + underpromotion,
// setWanted cycling and all camera presets. Does NOT import chess.js.
import { World } from './World.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

class MiniPos {
  constructor(fen) { this.set(fen); }
  set(fen) {
    this.map = new Map();
    const rows = fen.split(' ')[0].split('/');
    rows.forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        const sq = String.fromCharCode(97 + f) + (8 - i);
        this.map.set(sq, { type: ch.toLowerCase(), color: ch === ch.toLowerCase() ? 'b' : 'w' });
        f++;
      }
    });
  }
  board() {
    const out = [];
    for (let r = 8; r >= 1; r--) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        const sq = String.fromCharCode(97 + f) + r;
        const p = this.map.get(sq);
        row.push(p ? { square: sq, type: p.type, color: p.color } : null);
      }
      out.push(row);
    }
    return out;
  }
  get(sq) { return this.map.get(sq) || null; }
  /** Applies a move and returns animateMove args. */
  play({ from, to, ep = false, promo, castle }) {
    const piece = this.get(from);
    let captured = null;
    const capSq = ep ? to[0] + from[1] : to;
    const victim = this.get(capSq);
    if (victim) captured = { type: victim.type, color: victim.color, square: capSq };
    this.map.delete(capSq);
    this.map.delete(from);
    this.map.set(to, promo ? { type: promo, color: piece.color } : piece);
    let c = null;
    if (castle) {
      const r = piece.color === 'w' ? '1' : '8';
      c = castle === 'k' ? { rookFrom: 'h' + r, rookTo: 'f' + r } : { rookFrom: 'a' + r, rookTo: 'd' + r };
      const rook = this.get(c.rookFrom);
      this.map.delete(c.rookFrom);
      this.map.set(c.rookTo, rook);
    }
    return { from, to, piece: { type: piece.type, color: piece.color }, captured, promotion: promo, castle: c };
  }
}

// Scripted sequence. `targets` just feed the highlight preview before each move.
const SCRIPT = [
  { cam: 'white', say: 'VICE CREW vs CARTEL NOCTURNO' },
  { m: { from: 'e2', to: 'e4' }, say: 'Street thug hustles forward', targets: ['e3', 'e4'] },
  { m: { from: 'a7', to: 'a6' }, say: 'Cartel thug steps up' },
  { m: { from: 'e4', to: 'e5' } },
  { m: { from: 'd7', to: 'd5' } },
  { m: { from: 'e5', to: 'd6', ep: true }, say: 'EN PASSANT — drive-by!', caps: ['d6'], wanted: 1 },
  { m: { from: 'b8', to: 'c6' }, say: 'Sport bike stunt jump', targets: ['c6', 'a6'] },
  { m: { from: 'g1', to: 'f3' }, say: 'Vice Crew bike wheelie' },
  { m: { from: 'd8', to: 'd6' }, say: 'Heli swoops in — WASTED', caps: ['d6'], wanted: 2 },
  { m: { from: 'f1', to: 'c4' }, say: 'Race car drift' },
  { m: { from: 'c8', to: 'g4' }, say: 'Cartel racer drifts' },
  { m: { from: 'e1', to: 'g1', castle: 'k' }, say: 'Valet parking (O-O)' },
  { cam: 'black', say: 'Flip to Cartel side' },
  { m: { from: 'e8', to: 'c8', castle: 'q' }, say: 'Valet parking (O-O-O)' },
  { m: { from: 'f1', to: 'e1' }, say: 'Armored truck rolls', wanted: 1 },
  { cam: 'top', say: 'Top-down view' },
  { m: { from: 'c8', to: 'b8' }, say: 'The Boss swaggers' },
  { m: { from: 'c4', to: 'f7' }, say: 'Car rams a thug', caps: ['f7'], wanted: 2 },
  { cam: 'white' },
  { m: { from: 'd6', to: 'd2' }, say: 'Heli strike', caps: ['d2'], wanted: 3 },
  { m: { from: 'f3', to: 'd2' }, say: 'Bike takes down the heli  +$9,000', caps: ['d2'], wanted: 4 },
  { m: { from: 'g4', to: 'd1' }, say: 'Racer wrecks the heli', caps: ['d1'], wanted: 5 },
  { m: { from: 'e1', to: 'd1' }, say: 'Armored truck crushes it', caps: ['d1'], wanted: 5 },
  { m: { from: 'h7', to: 'h5' }, wanted: 4 },
  { fen: 'r5k1/1P6/8/8/8/4K3/2p5/7R w - - 0 1', say: 'ACT II — UPGRADE', wanted: 2 },
  { m: { from: 'b7', to: 'a8', promo: 'q' }, say: 'Capture + promotion → HELI', caps: ['a8'], wanted: 3, check: 'g8' },
  { m: { from: 'g8', to: 'h7' }, say: 'Boss escapes', wanted: 2 },
  { m: { from: 'e3', to: 'd2' }, wanted: 1 },
  { m: { from: 'c2', to: 'c1', promo: 'n' }, say: 'Underpromotion → BIKE', wanted: 1 },
  { m: { from: 'h1', to: 'h7' }, say: 'Truck takes the Boss down', caps: ['h7'], wanted: 5 },
  { cam: 'cinematic', say: 'MISSION PASSED', wait: 6, wanted: 0 },
];

export async function demo(el) {
  el = el || document.getElementById('app') || document.body;
  const world = new World(el);
  const caption = makeCaption(el);
  caption.textContent = 'LOADING…';
  await world.init({ onProgress: (p) => { caption.textContent = `LOADING ${Math.round(p * 100)}%`; } });
  window.__world = world; // debug handle
  world.onSquareClick = (sq) => console.log('[demo] click', sq);
  world.onFx = (name, data) => console.log('[demo] fx', name, data);

  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
  const pos = new MiniPos(START);
  let lastMove = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    pos.set(START);
    lastMove = null;
    world.setPosition(pos.board());
    world.setWanted(0);
    world.highlight({});
    world.setCameraPreset('white');
    await sleep(1.6);
    for (const step of SCRIPT) {
      if (step.say) caption.textContent = step.say;
      if (step.fen) {
        pos.set(step.fen);
        world.setPosition(pos.board());
        lastMove = null;
        world.highlight({});
        await sleep(1.2);
      }
      if (step.cam) { world.setCameraPreset(step.cam); await sleep(step.wait || 1.7); }
      if (step.m) {
        const mover = pos.get(step.m.from);
        if (!mover) { console.warn('[demo] no piece on', step.m.from); continue; }
        const caps = step.caps || [];
        const moves = (step.targets || [step.m.to]).filter((s) => !caps.includes(s));
        world.highlight({ selected: step.m.from, moves, captures: caps, lastMove });
        await sleep(0.55);
        const args = pos.play(step.m);
        world.setInputEnabled(false);
        const before = new Map(world.pieces.bySquare);
        await world.animateMove(args);
        // resync must be a no-op after animateMove
        world.setPosition(pos.board());
        let changed = 0;
        for (const [sq, p] of world.pieces.bySquare) if (before.get(sq) !== p && !(args.to === sq || (args.castle && args.castle.rookTo === sq))) changed++;
        if (changed) console.warn('[demo] setPosition after animateMove was not a no-op', changed);
        world.setInputEnabled(true);
        lastMove = { from: args.from, to: args.to };
        world.highlight({ lastMove, check: step.check || null });
        await sleep(0.45);
      }
      if (step.wanted !== undefined) world.setWanted(step.wanted);
      if (step.wait && !step.cam) await sleep(step.wait);
    }
    await sleep(1);
  }
}

function makeCaption(el) {
  const d = document.createElement('div');
  Object.assign(d.style, {
    position: 'absolute', left: '50%', top: '18px', transform: 'translateX(-50%)', padding: '8px 18px',
    font: '600 20px "Bebas Neue", Anton, Impact, sans-serif', letterSpacing: '2px', color: '#fff',
    background: 'linear-gradient(90deg, rgba(255,95,162,.85), rgba(255,154,60,.85))', borderRadius: '6px',
    textShadow: '0 2px 0 rgba(0,0,0,.4)', pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap',
  });
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(d);
  return d;
}
