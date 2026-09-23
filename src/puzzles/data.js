// Puzzle pack loader. Fetches the bundled JSON (public/puzzles/puzzles.json) once and normalizes it:
//   { id, fen, moves: ['e2e4', ...], rating, themes: ['fork', ...], tier: 'corner'|'hustler'|'shot'|'kingpin' }
// fen = position BEFORE the opponent's setup move; moves[0] is that setup move (Lichess format).
import { TIERS, tierOf, HEADLINE_THEMES } from './tiers.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
export const PACK_URL = `${BASE}puzzles/puzzles.json`;

let cache = null;

/** Normalize a raw pack object ({ puzzles:[{id,fen,moves:'..',rating,themes:'..'}] }). Drops malformed rows. */
export function parsePack(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.puzzles) ? data.puzzles : [];
  const out = [];
  for (const r of list) {
    if (!r || !r.id || !r.fen) continue;
    const moves = Array.isArray(r.moves) ? r.moves.slice() : String(r.moves || '').trim().split(/\s+/);
    if (moves.length < 2 || moves.length % 2) continue;
    const themes = Array.isArray(r.themes) ? r.themes.slice() : String(r.themes || '').trim().split(/\s+/).filter(Boolean);
    const rating = Number(r.rating) || 0;
    const tier = tierOf(rating);
    if (!tier) continue;
    out.push({
      id: String(r.id),
      fen: String(r.fen),
      moves,
      rating,
      themes,
      tier: tier.id,
      headline: HEADLINE_THEMES.find((t) => themes.includes(t)) || null,
      playerMoves: moves.length / 2,
    });
  }
  out.sort((a, b) => a.rating - b.rating);
  return out;
}

/** Load (and cache) the bundled pack. Resolves to the normalized array; rejects if it can't be fetched. */
export function loadPuzzles(url = PACK_URL) {
  if (!cache) {
    cache = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`puzzle pack HTTP ${r.status}`);
        return r.json();
      })
      .then(parsePack)
      .catch((e) => {
        cache = null; // allow a retry
        throw e;
      });
  }
  return cache;
}

/** Group puzzles by tier id → array (easy → hard). */
export function byTier(puzzles) {
  const g = Object.fromEntries(TIERS.map((t) => [t.id, []]));
  for (const p of puzzles) if (g[p.tier]) g[p.tier].push(p);
  return g;
}
