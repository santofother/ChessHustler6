# HUSTLE BOARD — chess puzzles in Hustler Mode

Puzzles are the side hustle: short tactics played on the 3D board for a bit of extra cash. The campaign opens them
from the map's PUZZLES button (HUSTLER_SPEC §4.6).

## Files
| File | Role |
|---|---|
| `src/puzzles/PuzzleMode.js` | The overlay and game flow (`PuzzleMode` class, the public API) |
| `src/puzzles/session.js` | Pure puzzle logic on top of chess.js (`PuzzleSession`); no DOM, also used by the Node validator |
| `src/puzzles/data.js` | Loads and normalizes `public/puzzles/puzzles.json` (`loadPuzzles`, `parsePack`, `byTier`) |
| `src/puzzles/tiers.js` | Rating tiers and friendly theme labels (shared by the browser and the tools) |
| `src/puzzles/puzzles.css` | Overlay styles, in the same visual language as `hud.css` |
| `src/puzzles/demo.js` | `demo(el)`: World + Hud + PuzzleMode with a made-up payout table (logs to the console) |
| `public/puzzles/puzzles.json` | The bundled pack: 480 puzzles, about 82 KB |
| `tools/puzzles/extract.mjs` | Builds the pack |
| `tools/puzzles/validate.mjs` | Checks the pack: every move is legal and every puzzle is solvable through `PuzzleSession` |

## Data source and license
All puzzles come from the **Lichess puzzle database** (https://database.lichess.org/#puzzles). Lichess releases it
under **CC0 1.0** (public domain), so we can bundle it without attribution. We credit Lichess anyway, on the
picker screen and in the JSON's `source` and `license` fields. Each puzzle card links to its Lichess training page.

`extract.mjs` merges two sources and removes duplicate ids:
1. The Chess_Trainer project's local SQLite copy (`../Chess_Trainer/data/puzzles.db`). It is opened read-only,
   using that project's `better-sqlite3`. It only covers ratings 800–1300.
2. A small streamed slice from the start of `lichess_db_puzzle.csv.zst`. It is decompressed in memory with
   Chess_Trainer's `fzstd` and never saved to disk. The stream stops once every tier has enough candidates;
   the last run read about 1.3 MB. Use `--offline` to skip this source.

Selection filters:
- Popularity ≥ 80 and at least 150 plays.
- At most 2 player moves (3 in the top two tiers).
- No puzzles tagged `long`, `veryLong`, `mateIn4+` or `equality`.
- The puzzle needs a "headline" theme, picked from the first matching entry in this list: mateIn1, mateIn2,
  promotion, fork, hangingPiece, skewer, pin, discoveredAttack, backRankMate, smotheredMate, doubleCheck,
  mateIn3, deflection, attraction, capturingDefender, trappedPiece, xRayAttack, sacrifice, advancedPawn.

Within each tier, puzzles are picked round-robin across headline themes (the most popular first). Mates and the
classic motifs get extra weight. Each tier is sorted from easiest to hardest.

JSON row: `{ "id", "fen", "moves": "uci uci ...", "rating", "themes": "space separated" }`. The **Lichess format**
works like this: `fen` is the position *before* the opponent's setup move, and `moves[0]` is that setup move,
which is played automatically. After that the player and the opponent alternate: the player finds `moves[1]`,
the opponent replies with `moves[2]`, and so on.

Rebuild: `node tools/puzzles/extract.mjs [--offline] [--per-tier 120] [--seed 7]`, then run
`node tools/puzzles/validate.mjs`.

## Tiers
| id | Name | Rating | Count |
|---|---|---|---|
| `corner` | CORNER BOY | 600–999 | 120 |
| `hustler` | HUSTLER | 1000–1399 | 120 |
| `shot` | SHOT CALLER | 1400–1799 | 120 |
| `kingpin` | KINGPIN | 1800–2200 | 120 |

Across the whole pack there are 129 mate puzzles and 39 where the player promotes a pawn, some of them to a
knight.

## API (HUSTLER_SPEC §4.6)
```js
const pm = new PuzzleMode({ world, hud, sfx, rootEl });   // hud and sfx may be null
const { solved, earned } = await pm.run({ solvedIds, rewardFor, onSolved });
pm.stop();                                                 // force-exit; resolves run()
```
- `rewardFor(puzzle, { firstTry, repeat })`: `repeat` is an extra flag. It is true when the id is already in
  `solvedIds` or was solved earlier in this visit. The picker also calls `rewardFor` with `{ firstTry: true }`
  on each tier's easiest and hardest puzzle to show the pay range. A return value of 0 or less shows as
  "STREET CRED" instead of a cash amount.
- `onSolved(puzzle, { reward, firstTry })` fires once per solve. PuzzleMode never changes the caller's
  `solvedIds`; it keeps its own copy.
- `puzzle` = `{ id, fen, moves: [...], rating, themes: [...], tier, headline, playerMoves }`.
- While it runs, PuzzleMode takes over `world.onSquareClick`, `onFx` and `onFrame` (`onFx` is routed to
  `sfx.fx`). All three are restored on exit. On exit it also clears highlights, re-enables input and sets the
  camera to `'white'`. **It does not restore the board position.** The caller must `setPosition` its own board
  afterwards.
- The overlay sits at z-index 25 inside `rootEl`. That is above HUD banners (20) and below the Hud's promotion
  modal (40), which PuzzleMode uses through `hud.showPromotion`. Without a `hud`, promotions default to a queen.

## UX rules
- **Picker ("PICK YOUR CORNER")**: a phone screen listing the 4 tiers. Each tier shows how many puzzles are
  solved, a progress bar and the pay range. The camera goes to the cinematic view, and the board shows the next
  job's position. Keys: `1`–`4` pick a tier, `Esc` goes back to the map.
- A tier serves its next unsolved puzzle, working from easiest to hardest. Once every puzzle in the tier is
  solved, it serves random replays.
- **Play**: the board is set from the FEN, and the camera turns to the side to move (`flipTo`). The setup move is
  animated after about 0.9 s. Player input works like the main game: click a piece to highlight its moves and
  captures, then click a target square. The opponent's replies play automatically.
- **Correct answers**: only the exact solution move is accepted. The one exception follows Lichess: **any move
  that delivers checkmate counts as solved**, even if it differs from the listed solution.
- **Wrong move**: a soft "NOPE" message appears, the move is not played, and the player can try again. The
  first-try rate is lost (`firstTry = false`), and the quoted payout updates to show that.
- **HINT** (`H`): the first press lifts and selects the piece that should move. The second press also shows the
  target square. Any hint sets `firstTry = false`.
- **SOLUTION**: animates the rest of the solution line. That puzzle then pays nothing for the rest of the visit,
  and `onSolved` does not fire; a RETRY is a practice run.
- **Solved**: a gentle "+$X" toast in GTA green, a `cash` sound, and the puzzle's themes are shown (they stay
  hidden until then so they don't give the answer away). Buttons: NEXT JOB (`N`/`Enter`), RETRY (`R`),
  BACK (`Esc`).
- **Comfort**: no flashing, strobing, screen shake or full-screen color pulses. All feedback uses fades and
  short slides. `prefers-reduced-motion` turns animations off. Sounds are optional (`sfx` may be null) and
  come from the existing Sfx set: click, select, illegal and cash.

## Testing
- `node tools/puzzles/validate.mjs` checks each of the 480 puzzles:
  - the FEN loads;
  - every UCI move is legal;
  - puzzles with a mate theme end in checkmate;
  - `PuzzleSession` rejects a wrong move and solves the scripted line.
- Browser (dev server): load `src/puzzles/demo.js` (see its header), then use `window.__puzzles`
  (`{ pm, world, hud, solvedIds, log }`) to script clicks through `world.onSquareClick`.

## Known limitations
- The dataset is fixed at build time. Getting new puzzles means re-running the extractor.
- A replayed puzzle calls `rewardFor` with `repeat: true`; the campaign decides what a repeat pays.
- The Lichess link on the card opens an external site in a new tab.
