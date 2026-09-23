# GRAND THEFT CHESS — Implementation Plan (parallel build)

Supplements `SPEC.md`; **where they conflict, this plan wins.**

## 0. Ownership
- **A (World/3D)**: `src/world/*` (+ `src/world/demo.js`).
- **B (Gameplay)**: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/chess/*`, `src/game/*`, `src/audio/*`.
- **C (UI/design)**: `src/ui/*` (`Hud.js`, `hud.css`, `demo.js`).
- World and Hud never import `chess.js` and never import each other. They get plain data from GameController.
- Standalone testing: A adds `src/world/demo.js`, C adds `src/ui/demo.js`, each `export async function demo(el)`.
  `main.js` reads `?demo=world|hud` and dynamically imports that demo instead of the game.

## 1. Integration contract

### 1.1 DOM & bootstrap
- `index.html`: `<div id="app"></div><div id="hud"></div>` + Google Fonts link (Bebas Neue, Anton, Inter).
- `#app` is `position:fixed; inset:0`; World appends its own `<canvas>`.
- `#hud` is `position:fixed; inset:0; pointer-events:none; z-index:10`. Every interactive HUD child sets
  `pointer-events:auto` (otherwise the canvas never gets clicks).
- `Hud.js` does `import './hud.css'` and builds all HUD DOM inside `rootEl`. Nothing else touches `#hud`.
- Boot order: `hud = new Hud(el); hud.setLoading(0)` → `world = new World(el); await world.init({ onProgress: p => hud.setLoading(p) })`
  → `hud.setLoading(1)` → `hud.showTitle(...)`. Title Start click = user gesture → `sfx.resume()`.

### 1.2 `boardArray` (exact)
chess.js 1.x `board()` output: 8x8, `board[0]` = **rank 8**, `board[7]` = rank 1, columns a..h.
Cell = `{ square:'e4', type:'p'|'n'|'b'|'r'|'q'|'k', color:'w'|'b' }` or `null`. **Use `cell.square`**, never indices.
Shared math (copy it, 3 lines): `fileIdx = sq.charCodeAt(0)-97; rankIdx = +sq[1]-1; x = fileIdx-3.5; z = 3.5-rankIdx`.
Light square when `(fileIdx+rankIdx)%2===1` (a1 dark).

### 1.3 World API (final)
```js
new World(containerEl)
await world.init({ onProgress?(0..1) })        // never rejects; missing GLBs → procedural fallback
world.setPosition(boardArray)                  // DIFF-based & instant: keep meshes whose square+type+color match,
                                               // create/remove the rest. After animateMove it must be a no-op.
world.onSquareClick = (square|null) => {}      // null = off-board. Fired only if pointer moved <6px between down/up.
                                               // Raycast pieces first (mesh.userData.square), then tiles.
world.onFx = (name, data) => {}                // World→audio bridge (1.6). Controller routes to Sfx.
world.onFrame = (dt, t) => {}                  // each rAF after render (controller drives the clock)
world.highlight({ selected=null, moves=[], captures=[], lastMove=null, check=null })
                                               // REPLACES all highlights; omitted key = cleared. check = king square.
await world.animateMove(args)                  // 1.4. Never rejects; hard timeout 3s → snap to final state.
world.setWanted(0..5)                          // siren light intensity/speed; 0 = off
world.playCaptureFx(square, victim={type,color})
world.setCameraPreset('white'|'black'|'top'|'cinematic', { animate=true })
world.flipTo(color)                            // = setCameraPreset(color==='w'?'white':'black')
world.setInputEnabled(bool)                    // hover cursor/highlight on/off; clicks still fire (controller gates)
world.setAnimSpeed(mult=1)                     // nice-to-have
```
Resize: `ResizeObserver` on containerEl (not window) → renderer, camera aspect, composer, bloom sizes.
Pixel ratio `min(devicePixelRatio, 2)`.

### 1.4 `animateMove(args)`
```js
{ from, to,
  piece:     { type, color },                 // ORIGINAL type (pawn when promoting)
  captured:  { type, color, square } | null,  // square = victim square (≠ to for en passant)
  promotion: 'q'|'r'|'b'|'n' | undefined,
  castle:    { rookFrom, rookTo } | null,
  san }                                       // optional, flavor
```
1. Tween mover with its type animation. Durations: pawn 0.6s, knight 0.9, bishop 0.8, rook 1.0, queen 1.2, king 0.8.
2. At ~80% progress, if `captured`: `playCaptureFx(captured.square, captured)`, fling/remove victim mesh, `onFx('explosion')`.
3. If `castle`: rook tween runs **concurrently** with the king (starts 0.15s later) — "valet parking".
4. If `promotion`: after landing, swap mesh to new type with a flash, `onFx('upgrade')`.
5. Resolve once board state matches post-move position (lingering particles may continue).

GameController mapping (chess.js v1 move → args):
```js
function toAnimArgs(m) {
  const ep = m.flags.includes('e');
  const capSq = ep ? m.to[0] + m.from[1] : m.to;
  const r = m.color === 'w' ? '1' : '8';
  const castle = m.flags.includes('k') ? { rookFrom: 'h'+r, rookTo: 'f'+r }
               : m.flags.includes('q') ? { rookFrom: 'a'+r, rookTo: 'd'+r } : null;
  return { from: m.from, to: m.to, piece: { type: m.piece, color: m.color },
           captured: m.captured ? { type: m.captured, color: m.color === 'w' ? 'b' : 'w', square: capSq } : null,
           promotion: m.promotion, castle, san: m.san };
}
```
Flags combine (`'cp'`) — always `includes()`.

### 1.5 Hud API (final)
```js
new Hud(rootEl)
hud.setLoading(0..1)                            // loading bar; 1 = hide
hud.showTitle({ onStart(opts) })                // hides on start; opts {mode:'ai'|'local', playerColor:'w'|'b', level:1..4}
hud.setTurn(color, isPlayerTurn)
hud.setThinking(bool)                           // "CARTEL IS PLANNING..." phone typing indicator
hud.setMoves(sanList)                           // full list each time (idempotent)
hud.setCash({ w, b })                           // count-up animation; $000,000
hud.setWanted(0..5)
hud.flash(text, style) -> Promise<void>         // resolves when hidden. Priority wasted/passed/busted > wanted > info.
                                                // Higher interrupts lower; equal queues; 'info' dropped if busy.
hud.showPromotion(color) -> Promise<'q'|'r'|'b'|'n'>   // modal; Esc/outside = 'q'
hud.showGameOver({ result:'w'|'b'|'draw', reason, perspective:'w'|'b'|null, onRematch, onMenu })
      // reason: 'checkmate'|'stalemate'|'threefold'|'insufficient'|'fifty-move'|'resign'
      // perspective = human color in AI mode (WASTED vs MISSION PASSED); null in local mode (show winning crew)
hud.updateMinimap(boardArray, lastMove|null, orientation='w')
hud.setClock({ moveNo, elapsedMs })             // may be called every frame; write DOM only on text change
hud.onAction = (name) => {}                     // 'resign'|'undo'|'flip'|'camera'|'mute'|'menu'
hud.hideAll()                                   // clean state for rematch/menu
```

### 1.6 Sound bridge
Only B imports `Sfx`. World emits `world.onFx(name, data)`: `'move' {type}` (engine/rotor/footsteps by type),
`'land'`, `'explosion'`, `'upgrade'`, `'castle'`. Controller plays check siren, click/select, illegal, game over.

### 1.7 Turn flow (GameController state machine)
States: `menu | human | animating | ai | promoting | gameover`. `onSquareClick` ignored unless `human`.
- Click own piece → select, `world.highlight` with legal targets split into `moves`/`captures` (flags `c`/`e`).
- Click legal target → move; if any legal from→to has promotion → `promoting`, `await hud.showPromotion`.
- Anything else → deselect.
`commit(move)`: 1) `m = rules.move(...)` 2) state `animating`, `world.setInputEnabled(false)`
3) `await world.animateMove(toAnimArgs(m))` 4) `world.setPosition(rules.board())` (resync, normally no-op)
5) `world.highlight({lastMove, check})`, `hud.setMoves`, `hud.updateMinimap` 6) cash/wanted (1.8); on check
`hud.flash('WANTED','wanted')` 7) game over → `endGame()`, else next turn.
AI turn: state `ai`, `hud.setThinking(true)`, `Promise.all([ai.getBestMove(fen, level), delay(600)])`, commit.
Every game has a `gameId`; stale AI results/await continuations are dropped (rematch/menu during thinking).
Undo in AI mode = 2 plies, only in `human`, then `setPosition`.
Camera: AI mode `flipTo(playerColor)` at start; local mode no auto-flip ('flip' action flips);
`'cinematic'` only on game over. World disables OrbitControls during camera tweens.

### 1.8 Economy & heat (B owns numbers)
Cash to capturer: pawn 1,000, knight/bishop 3,000, rook 5,000, queen 9,000; check +500; mate +50,000.
Wanted (global, 0..5): capture +1, check +2, quiet move −1, mate = 5. Always call `world.setWanted` + `hud.setWanted` together.

## 2. AI (`ai.worker.js`)
- Pin `"chess.js"` to an exact 1.x version. `import { Chess } from 'chess.js'` in the worker.
- `ai.js`: `new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' })`; `vite.config.js` `worker: { format: 'es' }`.
- Protocol: `{id, fen, level}` → `{id, move:{from,to,promotion}, depth, score, nodes}` or `{id, error}`.
  On error/6s timeout: terminate + recreate worker, return a random legal move from main thread. Post plain objects only.
- Public `moves({verbose:true})` / `move()` build SAN (slow, ~20–50k nodes/s). Fast path via internals
  (`_moves({legal:true})`, `_makeMove`, `_undoMove`, `_board` 0x88) behind a feature check with public-API fallback.
  **Confirm names in `node_modules/chess.js/dist` first.**
- Negamax alpha-beta, iterative deepening, time budget (check every 1024 nodes, throw TIMEOUT, use last completed depth).
  Ordering: PV move, MVV-LVA captures, promotions, 2 killers/ply, rest. Quiescence (captures, max 4 plies) at level ≥3.
  Mate ±(100000−ply); draws 0. No TT in v1.
- Eval: material (P100 N320 B330 R500 Q900) + Simplified Evaluation Function PSTs, MG/EG king tables
  (EG when no queens or ≤2 minors). Mirror for black; score from side to move.

| Level | Depth | Quiescence | Budget | Root noise |
|---|---|---|---|---|
| 1 "Street" | 1 | no | 200ms | 35% random among top 5; ±80cp |
| 2 "Hustler" | 2 | no | 500ms | ±40cp |
| 3 "Kingpin" | 3 | yes | 1500ms | ±10cp |
| 4 "Boss" | 4 | yes | 2500ms | 0 |

## 3. Game-feel checklist
**A World** — Must: distinct move per type (knight arc + wheelie pitch, bishop drift with yaw overshoot, rook
shake, queen rise→glide→land with rotor spin-up, pawn hop); explosion (additive sprites + debris + light flash),
victim flung with spin; tile overlays for selected/move/capture/last-move/check (emissive, light bloom);
red/blue siren lights scaled by `setWanted`; sunset sky + fog, palms, kerb barriers, fences, street lights.
Should: camera shake on rook moves/captures; world-space `+$3,000` sprite; idle bob; rotor always spins;
neon emissive trim; wet-asphalt roughness on dark squares; game-over cinematic orbit.
Nice: skid marks, dust puffs, heat-haze skyline, "VI" neon signs.

**B Gameplay** — Must: all rules (promotion, en passant, castling, all draws); input-lock state machine; min AI delay;
cash/wanted; WebAudio sfx (engine rev, rotor, explosion, siren, click, cash cha-ching, WASTED stinger).
Should: mute in localStorage; undo & resign; illegal buzz. Nice: ambient radio synth loop, AI "text message" taunts.

**C UI** — Must: title screen (pink/orange "VI" styling, mode/color/difficulty); top-right green cash + 5 flashing
stars; WASTED (grey desaturated, slow zoom), MISSION PASSED (gold), BUSTED (grey); promotion phone menu
(Heli/Truck/Car/Bike); canvas minimap (DPR-correct, rounded rect, dots, last-move arrow); bottom-right
`MOVE 10 / 00:19.68`. Should: collapsible phone move list; turn banner; loading bar. Nice: vignette/scanline on WANTED, loading tips.

## 4. Risks
- three: pin one minor version; import `three/addons/...` with `.js` extensions; never mix with `three/examples/jsm`.
- ACES tone mapping with **OutputPass last** in composer; no manual gamma.
- Fences: `CanvasTexture` + `alphaTest:0.5`, `transparent:false`, `DoubleSide`. Bloom threshold ~0.9, strength ~0.6, radius ~0.4.
- Shadows: one DirectionalLight, PCFSoft, 2048, ortho camera ±6, bias −0.0005, normalBias 0.02. Pieces cast; board receives.
  ≤4 non-shadow PointLights for street lights.
- **Vite dev server returns index.html (200) for a missing .glb** → GLTFLoader throws → catch as "missing" → fallback.
  `Promise.allSettled`; normalize via Box3 to spec height, base at origin. Loose name match (`/^TEAM_PRIMARY/`, `/^rotor/`…,
  Blender adds `.001`). Clone TEAM materials once per team and share.
- Build: test `npm run build && npm run preview` early (module worker).
- Soft-locks: `gameId` guard, `animateMove` never rejects + 3s snap; dev watchdog if `animating` > 5s.
- Orbit: 6px click threshold, `enablePan=false`, clamp distances, `maxPolarAngle ≈ 80°`.
- Integration test: scholar's mate, en passant, both castles, underpromotion to knight, stalemate FEN, rematch while AI thinking.
