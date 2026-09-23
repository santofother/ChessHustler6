# HUSTLER MODE — contract spec (shared by all agents)

A campaign mode added next to "VS Cartel AI" and "Local 2P". The player names their gang, starts broke with a
tiny budget, **buys an army before every game**, and takes over Vice City one street at a time. Street
leaders → neighborhood boss → more neighborhoods → **the City Boss**. Owned territory pays passive income;
rival leaders sometimes challenge territory you own and you must defend it. Chess puzzles earn small extra cash.

Read first: `SPEC.md`, `docs/PLAN.md` (existing architecture), `src/ui/hud.css` (visual language: fonts,
gradients, phone UI, colors — **new UI must look like it belongs to the same game**), `src/game/GameController.js`,
`src/chess/engine.js`, `src/chess/ai.js`.

## 1. City structure (FIXED ids — every agent uses exactly these)

```
nh1  (tier 1, unlocked at start)     streets nh1_s1 nh1_s2 nh1_s3   boss nh1_boss
nh2  (tier 2, unlocks after nh1_boss) streets nh2_s1 nh2_s2 nh2_s3   boss nh2_boss
nh3  (tier 2, unlocks after nh1_boss) streets nh3_s1 nh3_s2 nh3_s3   boss nh3_boss
nh4  (tier 3, unlocks after nh2_boss AND nh3_boss)
                                      streets nh4_s1 nh4_s2 nh4_s3   boss nh4_boss
city_boss (final, unlocks after nh4_boss)
```
- Node types: `'street' | 'boss' | 'city'`. 17 nodes total.
- Within an unlocked neighborhood the 3 streets can be taken **in any order**; its boss unlocks when the player
  owns all 3 of its streets. Beating the boss = neighborhood "controlled".
- Neighborhood adjacency (for map drawing and rival challenges): nh1–nh2, nh1–nh3, nh2–nh3, nh2–nh4, nh3–nh4.
  `city_boss` sits in its own downtown district (id `downtown`) adjacent to nh4.
- The player is always **white** (moves first) and the opponent is black, including in defense games.

## 2. Game rules for Hustler matches
- **Army purchase ("Recruit")** before every match (attack or defense). The King (the player's "Boss") is free
  and mandatory. Other pieces are bought at `PRICES` up to `MAX_ARMY`. Bought pieces are consumed by the
  match (hired for one job); economy rules decide any refund for survivors.
- **Deployment**: the player places bought pieces on ranks 1–2 (pawns only on rank 2, others anywhere on
  ranks 1–2). "Auto-deploy" puts them on standard home squares (pawn files in order e,d,f,c,g,b,h,a; extra
  pieces fill empty rank-1 then rank-2 squares). King defaults to e1.
- Bot armies are given as counts and auto-deployed the same way (mirrored, ranks 7–8, king e8).
- Castling rights only for K+R still on standard squares (e1/h1/a1 etc). No en passant square at start.
  The resulting FEN must pass chess.js validation.
- Result: checkmate or bot resign = win; being mated or resigning = loss; any draw = "standoff".
  Economy defines payouts and consequences for each.

## 3. File ownership
| Agent | Owns (create/edit only these) |
|---|---|
| **Economy** | `docs/hustler/ECONOMY.md`, `src/hustler/data/balance.js`, `tools/hustler_sim.mjs` |
| **Lore** | `docs/hustler/LORE.md`, `src/hustler/data/lore.js` |
| **Map** | `src/hustler/map/*` (`CityMap.js`, `cityMap.css`, `layout.js`, `demo.js`) |
| **Puzzles** | `src/puzzles/*`, `public/puzzles/*`, `tools/puzzles/*`, `docs/hustler/PUZZLES.md` |
| **Campaign (integration)** | `src/hustler/*.js` (not data/ or map/), `src/hustler/ui/*`, and edits to `src/game/GameController.js`, `src/chess/*`, `src/main.js`, `src/ui/Hud.js`+`hud.css` (title menu entry only), `src/world/*` (small additions only, e.g. team colors), `README.md` |

Nobody edits another agent's files. If you need something from another module, code against this contract and
note it in your final report.

## 4. Data contracts

### 4.1 `src/hustler/data/lore.js` (Lore)
```js
export const CITY = { name, tagline, blurb };                     // e.g. "Vice City" framing, 1–2 sentences
export const PLAYER_DEFAULT_GANG = 'The ...';                     // default suggestion for the name field
export const NEIGHBORHOODS = {                                    // keys: nh1 nh2 nh3 nh4 downtown
  nh1: { name, blurb, vibe /* 3–5 word mood */, colors: { primary:'#hex', accent:'#hex' } }, ...
};
export const STREETS = { nh1_s1: { name, blurb }, ... };          // all 12 street ids
export const GANGS = { [gangId]: { name, blurb, colors: { primary:'#hex', accent:'#hex' } } };
export const LEADERS = {                                          // keyed by NODE id (all 17 nodes)
  nh1_s1: {
    name, alias /* nickname */, title /* 'Street Boss' etc */, gangId,
    blurb,                                                        // 1–3 punchy sentences, who they are
    portrait: { initials, emoji, bg:'#hex', fg:'#hex' },          // map/cards render this, no images
    lines: { intro, playerWins, playerLoses, challenge, defended } // short chat/SMS lines, 1 sentence each
  }, ...
};
export const STORY = {
  intro: [ '...' ],                                               // 2–4 short beats shown at campaign start
  unlocks: { nh2: '...', nh3: '...', nh4: '...', downtown: '...' },// shown when unlocked
  finale: [ '...' ],                                              // after beating city_boss
};
export const TIPS = [ '...' ];                                    // loading/hub flavor tips
```
Tone: GTA-style satire — funny, sharp, crime-comedy; no slurs, no real people, no real brands or real gang
names; PG-13. Original names (Leonida/Vice City parody geography is fine).

### 4.2 `src/hustler/data/balance.js` (Economy)
```js
export const START_CASH;                                          // enough for ~2–3 pawns
export const PRICES = { p, n, b, r, q };                          // king free
export const MAX_ARMY = { p:8, n:2, b:2, r:2, q:1 };              // may be tuned but not exceed these
export const BOT_PROFILES = {                                     // consumed by the AI (see 4.3)
  [id]: { label, maxDepth /*0..4*/, timeMs, quiescence /*bool*/, noiseCp, randomChance /*0..1*/, topN,
          blunderChance /*0..1: prob. to play a random legal move instead*/ }
};
export const NODES = {                                            // all 17 node ids
  nh1_s1: {
    tier, bot /* BOT_PROFILES id */, army: { p, n, b, r, q },     // bot's pieces (king implicit)
    reward: { win, standoff },                                    // flat cash
    captureBounty: { p, n, b, r, q },                             // cash per enemy piece taken
    income,                                                       // passive cash per game while owned
    recommended: { p, n, b, r, q },                               // shown in the shop as a hint
  }, ...
};
export const INCOME = { /* how/when passive income is credited, e.g. per game played */ };
export const CHALLENGES = { /* chance per game, which nodes can be targeted, attacker = which leader/bot/army,
                              grace period, what happens on loss/decline/standoff, defend reward */ };
export const REFUNDS = { /* e.g. surviving pieces refunded at X% (or 0) */ };
export const LOSS = { /* consequences of losing an attack: e.g. nothing but spent money */ };
export const PUZZLES = { rewardByRating: [[maxRating, cash], ...], repeatReward, perSessionCap /* or null */ };
export const BANKRUPTCY = { /* safety net so the player can never soft-lock: e.g. free pawns/loan */ };
```
Every export must exist; each rule must also be explained in plain words in `ECONOMY.md`.

### 4.3 AI bot profiles (Campaign implements)
`ai.getBestMove(fen, levelOrProfile)` accepts either the existing level number (1..4) or a profile object
from `BOT_PROFILES`. `maxDepth: 0` = no search: random legal move, preferring captures with some probability.
`blunderChance` = chance per move to play a uniformly random legal move. Existing levels stay unchanged.

### 4.4 Campaign view model (Campaign builds it; Map renders it)
```js
view = {
  gangName, cash, incomePerGame, gameNo,
  neighborhoods: [{ id, name, blurb, vibe, colors, status: 'locked'|'open'|'controlled', owned, total, bossId }],
  nodes: [{
    id, type: 'street'|'boss'|'city', neighborhoodId, name, blurb,
    leader: { name, alias, title, blurb, portrait, gangName },
    status: 'locked'|'available'|'owned'|'contested',              // contested = under a rival challenge
    tier, difficulty /* 1..5 stars */, botLabel,
    army: { p,n,b,r,q }, reward: { win, standoff }, captureBounty, income,
  }],
  challenge: null | { id, targetNodeId, attacker: { name, alias, title, blurb, portrait, gangName },
                      army, message, gamesLeft },
  puzzles: { unsolved, rewardHint },
  log: [ { gameNo, text } ],                                       // recent events, newest first
}
```

### 4.5 `CityMap` API (Map implements, Campaign calls)
```js
import { CityMap } from './hustler/map/CityMap.js';
const map = new CityMap(rootEl);             // builds its DOM inside rootEl (a child of #hud), hidden initially
map.onAction = (name, payload) => {};        // 'play' {nodeId} | 'defend' {challengeId} | 'puzzles' | 'menu' | 'stats'
map.show(view);  map.update(view);  map.hide();
map.focus(nodeId);                            // pan/zoom to a node and open its card
map.celebrate(nodeId);                        // animate a node flipping to owned
```
Interactive: pan/zoom (mouse + touch), hover/tap a node → card with leader portrait, blurb, bot army preview,
rewards, income, and a "HIT THE STREET" / "TAKE THE NEIGHBORHOOD" / "DEFEND" button. Territory is shaded in
the player's colors when owned, rival colors when not, greyed/fogged when locked, pulsing when contested.
Top bar: gang name, cash, income per game, PUZZLES button, MENU button. Pure view: no game rules in the map.

### 4.6 Puzzle API (Puzzles implements, Campaign calls)
```js
import { PuzzleMode } from './puzzles/PuzzleMode.js';
const pm = new PuzzleMode({ world, hud, sfx, rootEl });
await pm.run({
  solvedIds: Set<string>,                     // skip / mark already solved
  rewardFor: (puzzle, { firstTry }) => number, // Campaign supplies from balance.PUZZLES
  onSolved: (puzzle, { reward, firstTry }) => void,
});                                           // resolves when the player exits back to the map
```
PuzzleMode takes over `world.onSquareClick`, `world.onFx`, `world.onFrame` while running and restores the
previous handlers on exit. It uses chess.js itself to validate moves, `world.setPosition` / `animateMove` /
`highlight` to show them, and the opponent's reply moves are auto-played. Puzzle data: small bundled JSON of
real puzzles (Lichess puzzle DB is CC0), rating-tiered.

## 5. Save data
`localStorage['gtc.hustler.v1']` (wrap every access in try/catch; the game must still run without storage).
One save slot + "New Campaign" (with confirm) + export/import JSON. Campaign owns the schema.

## 6. Screen flow
Title → HUSTLER MODE → (new: gang-name + story intro | continue) → **City Map hub** →
pick node → **Recruit shop** (buy pieces, see bot army, rewards) → **Deploy** on the 3D board (click squares,
or auto-deploy) → match (existing GameController, custom FEN, bot profile, leader's lines as SMS toasts) →
**Results** (win/loss/standoff, cash breakdown: reward + bounties + refunds + income) → map (celebrate new
territory, maybe a rival challenge appears) → … → City Boss → finale.
