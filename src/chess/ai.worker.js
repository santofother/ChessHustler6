// AI Web Worker. Protocol (PLAN §2):
//   in:  { id, fen, level }
//   out: { id, move:{from,to,promotion}, depth, score, nodes, ms } | { id, error }
import { search } from './engine.js';

self.onmessage = (e) => {
  const { id, fen, level } = e.data || {};
  try {
    const r = search(fen, level);
    if (!r.move) throw new Error('no legal moves');
    self.postMessage({
      id,
      move: { from: r.move.from, to: r.move.to, promotion: r.move.promotion || undefined },
      depth: r.depth,
      score: r.score,
      nodes: r.nodes,
      ms: r.ms,
      fast: r.fast,
    });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
