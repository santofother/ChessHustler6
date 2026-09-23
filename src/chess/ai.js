// Promise API around the AI worker.
//   const ai = new AI();  const mv = await ai.getBestMove(fen, level)  // {from,to,promotion}
// On worker error or 6s timeout: terminate + recreate the worker and return a random legal move.
import { Chess } from 'chess.js';

const TIMEOUT_MS = 6000;

function randomLegal(fen) {
  try {
    const ms = new Chess(fen).moves({ verbose: true });
    if (!ms.length) return null;
    const m = ms[Math.floor(Math.random() * ms.length)];
    return { from: m.from, to: m.to, promotion: m.promotion || undefined };
  } catch {
    return null;
  }
}

export class AI {
  constructor() {
    this.worker = null;
    this.seq = 0;
    this.pending = new Map(); // id -> { resolve, timer, fen }
    this.lastInfo = null;
    this._spawn();
  }

  _spawn() {
    try {
      this.worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this._onMessage(e.data);
      this.worker.onerror = (e) => {
        console.warn('[AI] worker error', e.message || e);
        this._failAll();
      };
    } catch (err) {
      console.warn('[AI] could not start worker, using random moves', err);
      this.worker = null;
    }
  }

  _onMessage(data) {
    const p = data && this.pending.get(data.id);
    if (!p) return; // stale (cancelled) result
    this.pending.delete(data.id);
    clearTimeout(p.timer);
    if (data.error || !data.move) {
      console.warn('[AI] search error:', data.error);
      this._restart();
      p.resolve(randomLegal(p.fen));
      return;
    }
    this.lastInfo = { depth: data.depth, score: data.score, nodes: data.nodes, ms: data.ms, fast: data.fast };
    p.resolve(data.move);
  }

  _restart() {
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
    this._spawn();
  }

  _failAll() {
    const all = [...this.pending.values()];
    this.pending.clear();
    this._restart();
    for (const p of all) {
      clearTimeout(p.timer);
      p.resolve(randomLegal(p.fen));
    }
  }

  /** @returns {Promise<{from,to,promotion}|null>} never rejects */
  getBestMove(fen, level = 2) {
    return new Promise((resolve) => {
      if (!this.worker) {
        resolve(randomLegal(fen));
        return;
      }
      const id = ++this.seq;
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        console.warn('[AI] timeout — restarting worker');
        this.pending.delete(id);
        this._restart();
        resolve(randomLegal(fen));
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve, timer, fen });
      this.worker.postMessage({ id, fen, level });
    });
  }

  /** Drop any in-flight search (rematch/menu). Pending promises resolve with null. */
  cancel() {
    if (!this.pending.size) return;
    const all = [...this.pending.values()];
    this.pending.clear();
    this._restart(); // kill the busy worker so the next game doesn't wait for it
    for (const p of all) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
  }

  dispose() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
