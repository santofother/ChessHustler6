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
| `npm test` | Node tests for the rules wrapper and the controller (en passant, both castles, underpromotion, all draw types, scholar's mate, fool's mate, rematch or resign while the AI is thinking, undo, Hustler custom starts), plus the Hustler campaign tests |
| `npm run ai:bench` | AI tactics checks (mate-in-1, hanging queen, promotion) plus nodes/sec and time per level |
| `?demo=world` / `?demo=hud` | Runs the standalone 3D world demo or HUD demo instead of the game |

## How to play

1. On the title screen, pick **vs AI** or **Local 2-player**, your crew (white or black) and the AI level. Or pick **Hustler** for the campaign (see below).
2. Click one of your pieces, or press on it and drag. Legal destinations light up, and captures are shown in red.
3. Click a destination, or release the dragged piece over it, to move there. Click anything else to deselect.
4. When a pawn reaches the last rank, the **UPGRADE** phone menu opens and you choose Heli, Truck, Car or Bike.

### Controls

| Input | Action |
|---|---|
| Left click | Select or move (with a piece selected, clicking anything that covers a legal square, such as your king's head in front of it, counts as that square) |
| Drag a piece | Pick it up and drop it on a highlighted square; dropping anywhere else puts it back |
| Drag empty space / wheel | Orbit or zoom the camera |
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

## Hustler Mode (campaign)

Pick **HUSTLER** on the title menu. You name your gang, start nearly broke, and take over Vice City one street at a time: the Sunset Strand first, then Rustwater Docks and Neon Mile, then Crown Hills, and finally the City Boss in Downtown Vice.

1. **City map**: pan and zoom the city and click a street to see its leader, their crew, the payout and the street tax it pays. Streets inside an open neighborhood can be taken in any order. The neighborhood boss unlocks once you own all three of its streets.
2. **Recruit**: before every job you hire a crew. The Boss (king) is free; everything else costs cash and is hired for that one job. The shop shows the rival's army, a recommended crew and how much cash you will have left. If you are nearly broke, *Mama's Loan* adds two free Street Thugs so you can always play.
3. **Deploy**: place your crew on ranks 1–2 of the 3D board. Pick a piece in the tray and click a glowing square (Street Thugs go on rank 2 only). Click a placed piece to move it, or use **AUTO-DEPLOY** for the standard setup. You always play white and move first.
4. **The job**: a normal chess game against that leader's bot. There are no takebacks, and the leader texts you trash talk. Checkmate wins; getting mated or resigning loses; any draw is a *standoff*.
5. **Results**: the pay for the job, bounties for every piece you took, part of the hiring cost back for survivors, and the **street tax** from your turf. Owned territory pays after every match (if the match lasted at least 10 moves).
6. **Rival challenges**: from the 5th job on, a rival may come for one of your frontier streets. Hit **DEFEND** on the map to play the defense, give the street up, or ignore it; after 2 more jobs it falls.
7. **Puzzles**: the PUZZLES button opens the Hustle Board, where real Lichess puzzles pay small side cash (capped between jobs).

Progress saves automatically in `localStorage` (`gtc.hustler.v1`). **STATS** on the map has export/import of the save as text and New Campaign. If the page is closed in the middle of a job, the job counts as walked out (a loss). Economy numbers live in `src/hustler/data/balance.js` (explained in `docs/hustler/ECONOMY.md`), and all names and story text are in `src/hustler/data/lore.js`. The contract between the modules is `docs/hustler/HUSTLER_SPEC.md`.

| Hustler file | Role |
|---|---|
| `src/hustler/HustlerController.js` | Screen flow: map, recruit, deploy, match, results, puzzles; hands the world's input between modules |
| `src/hustler/Campaign.js` | Pure campaign rules: unlocks, economy, challenges, save/load, map view model |
| `src/hustler/army.js` | Auto-deploy and the start FEN builder (castling rights, validation) |
| `src/hustler/ui/*` | Recruit/results/story screens and the deploy tray |
| `src/hustler/map/*`, `src/puzzles/*` | City map view and puzzle mode |

`npm test` also runs `tools/hustler_test.mjs`, which covers bot profiles, the FEN builder, unlocks, income, challenges, bankruptcy, puzzles and save round-trips.

## Soundtrack (Google Gemini / Lyria 3.5)

The radio plays instrumental songs generated with Google's Lyria 3.5 music model through the Gemini API.
The song list and prompts live in `tools/music/tracks.mjs` (15 songs across 6 in-game stations). To generate them:

1. Create an API key at https://aistudio.google.com/apikey and set it as the `GEMINI_API_KEY` environment variable.
2. `node tools/music/generate.mjs --dry-run` to preview, then `node tools/music/generate.mjs`.
   It skips songs that already exist; use `--only id1,id2` or `--force` to redo specific ones.

Songs land in `public/music/` with a `manifest.json`. In game the radio shuffles songs that fit the moment
(title, matches, the city map, puzzles, bosses, and a station per Hustler neighborhood) and crossfades between them.
Press **N** to skip a song. Without generated songs the game falls back to the built-in synth loop.

Songs made by hand in the Gemini app (prompts in `docs/music/PROMPTS.md`) can keep whatever file name Gemini gave
them: `tools/music/assignments.json` maps each file to its slot, then `node tools/music/generate.mjs --manifest`.
`node tools/music/identify.mjs` can ask Gemini to guess the mapping by listening, but check its answers.

## Hustler voice lines

Every rival leader (and your own Boss) has a fixed set of lines, written once by Gemini with
`node tools/lines/generate.mjs` and stored in `src/hustler/data/voicelines.js` (756 lines: 18 speakers × 14 moments × 3).
During Hustler matches they appear as speech bubbles above the speaker's king: match start, captures, losing the
queen, checks, pulling ahead or falling behind, promotions, castling, a long think, and the last words at the end.
Edit the file freely; `--only <nodeId|player>` regenerates one speaker. Stop `npm run dev` first (or expect one
page reload), because the script rewrites a source file.

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
"# ChessHustler6" 
