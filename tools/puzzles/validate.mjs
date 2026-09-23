// Validate public/puzzles/puzzles.json: every puzzle's FEN loads in chess.js, every UCI move is legal
// in sequence, mate-themed puzzles end in checkmate, ids are unique, ratings fall in a tier.
// Also runs the browser loader's parser on it. Usage: node tools/puzzles/validate.mjs  (exit 1 on failure)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { TIERS, tierOf } from '../../src/puzzles/tiers.js';
import { parsePack } from '../../src/puzzles/data.js';
import { PuzzleSession } from '../../src/puzzles/session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'public/puzzles/puzzles.json');

const raw = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(raw);
const errors = [];
const ids = new Set();
const perTier = Object.fromEntries(TIERS.map((t) => [t.id, 0]));
let promos = 0;
let mates = 0;

for (const p of data.puzzles) {
  const where = `puzzle ${p.id}`;
  if (ids.has(p.id)) errors.push(`${where}: duplicate id`);
  ids.add(p.id);
  const t = tierOf(p.rating);
  if (!t) errors.push(`${where}: rating ${p.rating} outside all tiers`);
  else perTier[t.id]++;
  const moves = p.moves.split(' ');
  if (moves.length < 2 || moves.length % 2) errors.push(`${where}: odd/short move list (${moves.length})`);
  let c;
  try {
    c = new Chess(p.fen);
  } catch (e) {
    errors.push(`${where}: bad FEN (${e.message})`);
    continue;
  }
  let ok = true;
  for (const [i, uci] of moves.entries()) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      errors.push(`${where}: malformed move #${i} ${uci}`);
      ok = false;
      break;
    }
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
      if (m.promotion && i % 2 === 1) promos++;
    } catch {
      errors.push(`${where}: illegal move #${i} ${uci} in ${c.fen()}`);
      ok = false;
      break;
    }
  }
  if (ok && /\bmate/.test(p.themes)) {
    if (!c.isCheckmate()) errors.push(`${where}: mate theme but final position is not checkmate`);
    else mates++;
  }
}

const parsed = parsePack(data);
if (parsed.length !== data.puzzles.length) errors.push(`parsePack dropped ${data.puzzles.length - parsed.length} puzzles`);

// drive every puzzle through PuzzleSession: a wrong move is rejected, the scripted line solves it
let sessionsOk = 0;
for (const p of parsed) {
  const s = new PuzzleSession(p);
  s.playOpponent();
  if (!s.isPlayerTurn || s.turn() !== s.playerColor) {
    errors.push(`session ${p.id}: not player's turn after setup`);
    continue;
  }
  const want = s.expected();
  const wrong = s.chess.moves({ verbose: true }).find((m) => {
    if (m.from + m.to === want.from + want.to) return false;
    const c = new Chess(s.chess.fen());
    c.move(m);
    return !c.isCheckmate();
  });
  if (wrong) {
    const r = s.tryMove(wrong);
    if (r.status !== 'wrong' || s.firstTry) errors.push(`session ${p.id}: wrong move not rejected (${r.status})`);
  }
  let last = null;
  while (!s.done) {
    if (s.isPlayerTurn) last = s.tryMove(s.expected());
    else s.playOpponent();
    if (last && last.status === 'illegal') break;
  }
  if (!s.solved || !last || last.status !== 'solved') errors.push(`session ${p.id}: scripted line did not solve (${last && last.status})`);
  else sessionsOk++;
}
console.log(`PuzzleSession replays: ${sessionsOk}/${parsed.length} solved`);

console.log(`${data.puzzles.length} puzzles, ${(raw.length / 1024).toFixed(1)} KB`);
console.log('per tier:', JSON.stringify(perTier), `| mates: ${mates} | player promotions: ${promos}`);
if (raw.length > 300 * 1024) errors.push(`file too large: ${raw.length} bytes`);
if (errors.length) {
  console.error(`FAIL (${errors.length}):\n  ` + errors.slice(0, 40).join('\n  '));
  process.exit(1);
}
console.log('OK — every move legal');
