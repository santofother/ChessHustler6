// AI Web Worker. Protocol (PLAN §2):
//   in:  { id, fen, level }            level = 1..4 or a plain bot-profile object (Hustler, spec §4.3)
//   out: { id, move:{from,to,promotion}, depth, score, nodes, ms } | { id, error }
import { chooseMove } from './engine.js';

self.onmessage = (e) => {
  const { id, fen, level } = e.data || {};
  try {
    const r = chooseMove(fen, level);
    if (!r.move) throw new Error('no legal moves');
    self.postMessage({
      id,
      move: { from: r.move.from, to: r.move.to, promotion: r.move.promotion || undefined },
      depth: r.depth,
      score: r.score,
      nodes: r.nodes,
      ms: r.ms,
      fast: r.fast,
      kind: r.kind,
    });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
