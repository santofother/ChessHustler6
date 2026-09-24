// LEGACY: the Vice City Grand Prix street-race setting moved to src/world/arenas/classic.js (built by the
// ArenaManager like every other arena); shared helpers live in src/world/arenas/kit.js. World no longer uses this
// file — it only keeps old imports working.
export { normalizeProp, propLength } from './arenas/kit.js';
export { default as ClassicArena } from './arenas/classic.js';
