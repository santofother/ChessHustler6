# GRAND THEFT CHESS — Vice City Gambit (working spec)

Browser game: real chess rules, dressed as GTA VI. Three.js + Vite, vanilla JS (ES modules), no framework.
Reference images: `docs/1.webp` (street race: palm-lined track, chain-link fences, race barriers, liveried
touring cars, minimap bottom-left, LAP / POS / timer HUD bottom-right), `docs/2.png` (Leonida nightlife:
guy in floral shirt with phone, warm neon, palms, pink/orange "VI" logo), `docs/3.png` (standard chessboard).

## Concept
The board is a 8x8 downtown Vice City intersection at golden-hour → neon dusk. Squares are asphalt tiles
(light squares = sun-bleached concrete / crosswalk paint, dark squares = wet asphalt). The board is ringed by
race barriers (red/white kerb stripes), chain-link fences, palm trees, street lights, and a skyline backdrop.

Two crews:
- **WHITE — "The Vice Crew"**: white bodywork, teal + hot-pink accents (image 1 white touring car livery).
- **BLACK — "Cartel Nocturno"**: matte black bodywork, gold + acid-green accents (image 1 black/green car).

| Chess piece | GTA piece                      | Model idea                                                    | Move animation              |
|-------------|--------------------------------|---------------------------------------------------------------|-----------------------------|
| Pawn        | Street Thug                    | stylized low-poly guy in floral shirt, holding phone          | walks/hops                  |
| Knight      | Sport Bike                     | motorcycle with rider                                         | stunt jump arc w/ wheelie   |
| Bishop      | Touring Race Car               | wedge race car with rear wing (image 1)                       | drifts diagonally           |
| Rook        | Armored Truck / Security Van   | boxy armored van                                              | heavy drive, camera shake   |
| Queen       | Police/News Helicopter         | helicopter w/ spinning rotor                                  | flies (rises, glides, lands)|
| King        | The Boss                       | bigger character, floral shirt, gold chain, sunglasses        | swagger walk                |

Chess events → GTA events:
- Capture → victim gets "WASTED" treatment (explosion/particles, ragdoll-ish fling), `+$` cash popup.
- Check → WANTED stars flash + police siren light (red/blue) sweeping the board; "WANTED" banner.
- Checkmate → giant "WASTED" (loser) / "MISSION PASSED — RESPECT +" (winner) screen.
- Stalemate / draw → "BUSTED" style grey screen "MISSION FAILED: STALEMATE".
- Promotion → "UPGRADE" phone menu to choose Heli/Truck/Car/Bike.
- Castling → "valet parking" (king + truck swap move together).

## Tech / file layout (contract between agents — do not deviate without updating this file)
```
index.html            # mounts #app canvas container + #hud root
package.json          # vite, three, chess.js
src/main.js           # bootstrap: creates World, Hud, GameController; wires them
src/chess/rules.js    # thin wrapper around chess.js
src/chess/ai.worker.js# alpha-beta AI in a Web Worker (difficulty = depth 1..4 + randomness)
src/chess/ai.js       # promise API around the worker: getBestMove(fen, level) -> {from,to,promotion}
src/game/GameController.js  # turn flow, modes, glue between World and Hud
src/world/World.js    # renderer, scene, camera, OrbitControls, post, render loop, public API below
src/world/Board.js    # board tiles, square highlights, coords <-> world
src/world/Environment.js    # sky, lights, palms, fences, barriers, skyline, street lights
src/world/Pieces.js   # GLB loading (with procedural fallback), per-team tinting, move animations per type
src/world/Effects.js  # explosion/particles, siren lights, camera shake, cash popups (world-space)
src/ui/Hud.js         # DOM HUD (all 2D UI), styles in src/ui/hud.css
src/audio/Sfx.js      # WebAudio-synthesized sfx (no audio files needed)
public/models/*.glb   # Blender-made models (see below)
```

### Coordinates
Square size = 1 world unit. Board centered at origin, on the XZ plane, y=0 is the tile top.
File a..h → x = -3.5 .. +3.5. Rank 1..8 → z = +3.5 .. -3.5 (white sits at +z, camera starts behind white).

### World public API (implemented by world agent, consumed by GameController)
```js
const world = new World(containerEl);
await world.init();                           // loads models, builds scene
world.setPosition(boardArray)                 // boardArray = chess.js board() (8x8 of {type,color}|null); instant
world.onSquareClick = (square) => {}          // 'e4' etc, set by controller
world.highlight({ selected, moves:[sq], captures:[sq], lastMove:{from,to}, check: sq|null })
await world.animateMove({ from, to, piece:{type,color}, captured:{type,color,square}|null,
                          promotion:'q'|'r'|'b'|'n'|undefined, castle:{rookFrom,rookTo}|null })
world.setWanted(level0to5)                    // siren lights intensity
world.playCaptureFx(square)                   // also called inside animateMove
world.setCameraPreset('white'|'black'|'top'|'cinematic')
world.flipTo(color)
```

### Hud public API (implemented by core agent)
```js
const hud = new Hud(rootEl);
hud.showTitle({ onStart(opts) })              // opts: { mode:'ai'|'local', playerColor:'w'|'b', level:1..4 }
hud.setTurn(color, isPlayerTurn)
hud.setMoves(sanList)
hud.setCash({ w:number, b:number })
hud.setWanted(level)                          // 0..5 stars
hud.flash(text, style)                        // 'wasted'|'busted'|'wanted'|'passed'|'info'
hud.showPromotion(color) -> Promise<'q'|'r'|'b'|'n'>
hud.showGameOver({ result, reason, onRematch, onMenu })
hud.updateMinimap(boardArray, lastMove)
hud.setClock({ moveNo, elapsedMs })
```

### Blender model contract (`public/models/`)
- Files: `pawn.glb knight.glb bishop.glb rook.glb queen.glb king.glb` + props
  `palm.glb fence.glb barrier.glb streetlight.glb`.
- glTF 2.0 binary, +Y up (default exporter setting), meters. Origin at base center, piece faces **-Z**
  (toward black's side); the game rotates black pieces 180°.
- Footprint fits inside 0.8 x 0.8. Heights: pawn ~0.7, knight ~0.8, bishop ~0.7 (long car, ~0.75 long),
  rook ~0.85, queen ~1.1 (heli hovering on a stand/skid), king ~1.2.
- Low-poly stylized, flat/principled materials, no image textures needed. < 3k tris per piece.
- **Team color convention**: material named exactly `TEAM_PRIMARY` (bodywork/shirt) and `TEAM_ACCENT`
  (stripes/trim) — the game overrides their colors per team. Everything else (tires, glass, skin, chrome)
  keeps its own material.
- Animated sub-parts are separate named nodes: `rotor` (queen main rotor, spins around Y), `tail_rotor`,
  `wheel_*` (optional).
- Also export `preview_*.png` renders to `docs/models/` for review.
- The game MUST work even if a GLB is missing (Pieces.js builds a procedural fallback).

## Look & feel
Palette: sunset gradient #ff5fa2 → #ff9a3c → #ffd36b, deep navy/purple night #1b1036, neon teal #29e3d6.
Fonts (Google Fonts): "Pricedown"-like → use **"Bebas Neue"** / **"Anton"** for headers; "Inter" for body.
HUD: minimap bottom-left (rounded rect, top-down board, pieces as dots, like image 1), bottom-right
"MOVE 10 / 00:19.68" block like the LAP/POS/timer in image 1, top-right cash `$000,000` in green GTA style +
wanted stars, move list on a "phone" UI on the right side that can be collapsed.
Post-processing: bloom (neon), ACES tone mapping, soft shadows, fog tinted to sunset.
