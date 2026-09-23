# Grand Theft Chess: Vice City Gambit

Real chess dressed up as GTA VI. The board is a Vice City intersection at sunset. Two crews fight over it: **The Vice Crew** (white, with teal and hot-pink trim) and **Cartel Nocturno** (black, with gold and acid-green trim).

Built with Three.js 0.180, chess.js 1.4 and Vite 6. It uses vanilla ES modules with no framework. Every sound is synthesized with WebAudio, so the game ships no audio files.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run preview    # serve the production build
```

Dev and test helpers:

| Command | What it does |
|---|---|
| `npm test` | Node tests for the rules wrapper and the controller: en passant, both castles, underpromotion, all draw types, scholar's mate, fool's mate, rematch or resign while the AI is thinking, undo |
| `npm run ai:bench` | AI tactics checks (mate-in-1, hanging queen, promotion) plus nodes/sec and time per level |
| `?demo=world` / `?demo=hud` | Runs the standalone 3D world demo or HUD demo instead of the game |

## How to play

1. On the title screen, pick **vs AI** or **Local 2-player**, your crew (white or black) and the AI level.
2. Click one of your pieces. Legal destinations light up, and captures are shown in red.
3. Click a destination to move there. Click anything else to deselect.
4. When a pawn reaches the last rank, the **UPGRADE** phone menu opens and you choose Heli, Truck, Car or Bike.

### Controls

| Input | Action |
|---|---|
| Left click | Select or move |
| Drag / wheel | Orbit or zoom the camera |
| `U` | Undo (in AI mode this takes back your move and the AI's reply) |
| `F` | Flip the view to the other side |
| `C` | Toggle between the player view and the top-down camera |
| `M` | Mute or unmute (remembered between sessions) |
| `Esc` | Deselect |
| Phone buttons | Undo, resign (tap twice), flip, camera, sound, menu |

### Piece legend

| Chess piece | GTA piece | How it moves |
|---|---|---|
| Pawn | Street Thug (floral shirt, phone) | Walks and hops |
| Knight | Sport Bike | Stunt jump with a wheelie |
| Bishop | Touring Race Car | Drifts along the diagonal |
| Rook | Armored Truck | Heavy drive with camera shake |
| Queen | Police Helicopter | Takes off, glides and lands |
| King | The Boss (gold chain, shades) | Swagger walk |

### Chess events as GTA events

| Chess event | In the game |
|---|---|
| Capture | Explosion, the victim gets **WASTED**, and the capturer earns cash: pawn $1,000, knight or bishop $3,000, rook $5,000, queen $9,000 |
| Check | **WANTED** banner, sirens and +$500 |
| Checkmate | +$50,000, followed by **MISSION PASSED** for the winner or **WASTED** for the loser |
| Stalemate or other draw | **MISSION FAILED** (the BUSTED-style grey screen) |
| Castling | "Valet parking": the Boss and the Truck move together |
| Wanted level (0 to 5 stars) | A capture adds 1 star and a check adds 2. A quiet move removes 1. Checkmate sets the maximum. |

### AI levels

| Level | Name | Search |
|---|---|---|
| 1 | Street | Depth 1. Often plays one of its top 5 moves at random, but never misses a mate. |
| 2 | Hustler | Depth 2 with some noise |
| 3 | Kingpin | Depth 3 plus quiescence search |
| 4 | Boss | Depth 4 plus quiescence, no noise |

The AI runs in a Web Worker (`src/chess/ai.worker.js`), and the search itself lives in `src/chess/engine.js`. It uses iterative-deepening negamax with alpha-beta pruning. Moves are ordered by PV, MVV-LVA, promotions, killer moves and history. Evaluation uses piece-square tables. For speed it calls chess.js internals, which are feature-detected and checked with a perft before use; if they are unavailable it falls back to the public API. In AI mode the opponent also sends you the occasional text message.

## Project layout

```
index.html              #app (canvas container) + #hud (DOM overlay)
src/main.js             bootstrap, ?demo= routing, readable boot errors
src/chess/rules.js      chess.js wrapper + toAnimArgs()
src/chess/engine.js     search core (Node + worker)
src/chess/ai.worker.js  worker wrapper      src/chess/ai.js  promise API, 6s timeout fallback
src/game/GameController.js  state machine, economy, wanted level, taunts
src/audio/Sfx.js        WebAudio synth sfx + ambient radio loop
src/world/*             Three.js world (board, environment, pieces, effects)
src/ui/*                DOM HUD
public/models/*.glb     Blender models (procedural fallback if missing)
tools/                  ai_bench.mjs, rules_test.mjs, blender/ scripts
```

See `SPEC.md` and `docs/PLAN.md` for the contracts between modules.
