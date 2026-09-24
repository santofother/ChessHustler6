# Arenas & Living Crowds — spec

Feature: every Hustler district gets its own **arena** (the whole setting around the 8×8 board) populated with
animated low-poly **NPC people**; VS AI / Local 2P can pick any arena from a LOCATION row on the title menu.
Owner of this doc: the arenas lead. Workers and the Blender agent re-read it; changes are logged under `### Changes`.

Hard rules for everyone
- The 8×8 play area must stay perfectly readable: light/dark squares, highlights, pieces. Nothing may be built in
  the board zone (see Zones) and nothing may occlude the board from the `white` / `black` / `top` presets.
- **No flashing.** The user gets headaches from intense flashing. No strobes, no fast blinking or flicker, no hard
  light flashes. Any pulsing/breathing light: period ≥ 1.5 s, soft (sinusoidal, amplitude ≤ 35 % of base).
  Respect `prefers-reduced-motion` (`ctx.reducedMotion`): then stop pulsing entirely and slow ambient motion.
- Performance: 60 fps on a mid laptop. Per-arena download < 3–4 MB (NPCs are shared). Lazy-load per arena.
- Paths: always relative to `import.meta.env.BASE_URL` (vite `base: './'`, GitHub Pages). Use `ctx.url('models/..')`.
- Workers don't commit. Don't touch files owned by someone else — request changes via this doc / your report.

## 1. Arena list

| id | name (HUD) | district | time / mood | identity |
|---|---|---|---|---|
| `classic` | Vice City Grand Prix | — (default VS AI) | sunset | the current street-race track (Environment.js moved into an arena) |
| `strand` | Sunset Strand Boardwalk | nh1 | golden hour, warm orange/pink sky, turquoise sea | board sits on a raised boardwalk deck on the sand; pier + ferris wheel, lifeguard tower, umbrellas, food cart, surfboards, beachgoers, volleyball kids, slow waves |
| `docks` | Rustwater Docks | nh2 | dusk → night, teal sky, sodium-orange pools of light on wet concrete | container yard: stacked containers walls, gantry cranes with slow moving trolley, forklifts, bollards, dark water with glowing canal, tugboat; dockworkers + a graffiti hangout corner (couch, oil-drum fire, fluoro light) like `docs/ref_hangout.png` |
| `neon` | Neon Mile Street Meet | nh3 | night, purple/magenta sky, warm neon | EXACTLY like `docs/ref_street_race.png`: the board is the start line in the middle of a palm-lined boulevard, tuner cars (pink, gold, orange) with soft underglow, crowd lining both sides, a flag-waver, festoon (string) lights across the street, club/casino signs |
| `crown` | Crown Hills Estate | nh4 | twilight/blue hour, lavender sky, warm window light | marble terrace of a gated mansion: the board is inlaid in the terrace; pool with glowing water, hedges/topiary, fountain, balustrades, polo lawn in the distance, gold horse statue, rich party guests with drinks, valet cars |
| `tower` | Nocturno Tower Rooftop | downtown (city boss) | night high above the city, deep blue + gold | rooftop helipad (the board is on the H pad) with glass railings, a parked luxury helicopter (slow idle rotor), skyline spread all around below, aviation lights (slow soft pulse), bodyguards in suits, lounge chairs, a gold throne-sofa |
| `trap` | The Trap (bonus) | — (VS AI only / puzzles) | interior, fluorescent-cool + warm lamp | indoor hangout from `ref_hangout.png`: concrete walls with graffiti, fluorescent tube ceiling fixtures (NO flicker), couches, notice board, arcade cabinet, people leaning/sitting |

Hustler mapping (`arenaForNode(nodeId)` in `src/world/arenas/registry.js`):
- `nh1_*` → `strand`, `nh2_*` → `docks`, `nh3_*` → `neon`, `nh4_*` → `crown`, `city_boss` → `tower` (variant boss).
- Street variation: `variant = { street: 1|2|3, time: 'day'|'dusk'|'night', boss: bool }`.
  s1 = earliest time (e.g. strand afternoon, docks dusk, neon early-night), s2 = mid, s3 = latest; `*_boss` =
  night + `boss: true` (extra crowd, boss car/decor, gang-color accents). Arenas MUST treat unknown variants as default.
- Puzzles: `trap` (calm) by default, or the current district's arena when launched from Hustler.
- Deploy phase (before a Hustler match) already shows the match arena.

## 2. Files & ownership

```
src/world/World.js                 A   (setArena, react hooks, raycast exclusions, perf)
src/world/Board.js                 A   (setSurround(style))
src/world/Environment.js           A   (becomes thin/legacy; content moves into arenas/classic.js)
src/world/demo.js, src/main.js     A   (?arena=<id>&variant=… preview param)
src/world/arenas/Arena.js          A   base class + helpers (contract below)
src/world/arenas/ArenaManager.js   A   lazy load, fade, dispose, leak-free switching
src/world/arenas/registry.js       A   (G may request fields)
src/world/arenas/kit.js            A   shared procedural helpers (sky dome, palms, skyline, neon sign text, festoon lights, water…)
src/world/arenas/npc/*             A   NPC system (NpcCrowd)
src/world/arenas/classic.js        A
src/world/arenas/strand.js (+ strand/*)   B
src/world/arenas/docks.js  (+ docks/*)    C
src/world/arenas/trap.js   (+ trap/*)     C
src/world/arenas/neon.js   (+ neon/*)     D
src/world/arenas/crown.js  (+ crown/*)    E
src/world/arenas/tower.js  (+ tower/*)    F
src/ui/Hud.js, src/ui/hud.css, src/game/GameController.js,
src/hustler/HustlerController.js, src/hustler/ui/Deploy.js,
src/puzzles/PuzzleMode.js           G   (LOCATION row, hookups, arena-name intro card)
docs/arenas/ARENAS_SPEC.md          lead
tools/blender/**, public/models/npc/**, public/models/props/**, public/models/arenas/**   Blender agent ONLY
```
Arena builders (B–F) may add arena-local helper files under `src/world/arenas/<id>/`. If you need something in
`kit.js` / `Arena.js`, copy it locally or note the request in your report — don't edit A's files.

## 3. API contract

### World (public)
```js
await world.setArena(id, { variant } = {})   // lazy loads + swaps; latest call wins; resolves when visible
world.arenaId                                  // current id
world.onArenaLoading = (loading:boolean, info:{id,name}) => {}   // G shows a small "Driving to …" chip
world.react(event, data)                       // forwards to arena + crowd (World also calls it itself:)
//   'capture'  {square, victim}   from playCaptureFx
//   'check'    {color}            (G calls if convenient; optional)
//   'wanted'   {level}            from setWanted
//   'finale'   {}                 when setCameraPreset('cinematic') is used (game over)
//   'start'    {}                 new match started (G calls)
```
`world.init()` loads the `classic` arena by default (or `?arena=`).

### Registry (`src/world/arenas/registry.js`)
```js
export const ARENAS = [{ id, name, short, district, tagline, swatch: ['#hex','#hex'], load: () => import('./x.js') }, …];
export function getArena(id)            // entry or classic
export function arenaForNode(nodeId)    // → { id, variant }
export const TITLE_ARENAS               // ids offered on the title menu (all, in display order)
```

### Arena module
Each `src/world/arenas/<id>.js` `export default class XArena extends Arena`:
```js
async build()          // populate this.group; set this.mood / this.boardStyle; spawn NPCs; await GLBs via this.glb()
update(dt, t)          // ambient animation (called every frame; keep it cheap)
react(event, data)     // optional: fireworks-free fun (crowd cheer is automatic via NpcCrowd)
dispose()              // base class disposes everything under this.group + tracked textures; call super.dispose()
```
Base class (`Arena.js`) provides:
- `this.ctx` = `{ scene, renderer, world, variant, models /* palm, streetlight, barrier, fence GLBs already loaded */, reducedMotion, quality /* 'high'|'low' */, url(path) }`
- `this.group` (added to scene by the manager), `this.variant`, `this.crowd` (NpcCrowd bound to this arena)
- `await this.glb('models/arenas/docks/crane.glb')` → a fresh clone `THREE.Group` or `null` if missing/failed (never throws). Cached per session.
- `this.prop(glbRoot, { height })` → normalised holder (feet on ground, centred), same as `normalizeProp` in Environment.
- `this.tint(root, { TINT_Body: '#ff3ea5', … })` → clones + recolours materials whose name starts with the key.
- `this.addSky({ top, mid, horizon, bottom, sunDir, sunColor, stars })` → gradient dome (owned + disposed).
- `this.addSun({ color, intensity, dir, shadow:true })`, `this.addHemi(sky, ground, i)`, `this.addLight(light)`.
- `this.mood = { background, fog: {color, near, far} | null, exposure, bloom: {strength, radius, threshold}, envIntensity }` — the manager applies it (and restores sane defaults).
- `this.boardStyle` — see Board surround.
- `this.track(texture|geometry|material)` for anything not under `this.group` that needs disposal.
- `this.pulse(t, periodSec, phase)` → 0..1 soft sine respecting reduced motion (returns 0.5 constant when reduced).
- Coordinates: board centred at origin, squares 1 m, a1 at (x=−3.5, z=+3.5); white sits at +Z, black at −Z.
  Ground/street level `STREET_Y = −0.42` (import from `../Board.js`). Board top y=0.

### Zones (keep the board readable and clickable)
- **Z0 board** `|x|,|z| ≤ 5.3`: board + surround only (Board.js). Arenas place nothing here.
- **Z1 apron** `5.3 < max(|x|,|z|) ≤ 7`: ground detail + low props ≤ 1.0 m (cones, rope posts, planters, kerbs).
  NPCs allowed only on the long sides `|x| ≥ 6.2, |z| ≤ 5` (crowd lining the "street").
- **Camera corridors**: default cameras sit at ≈ (0, 6, ±9.7) looking at the board; cinematic orbits at horizontal
  radius ≈ 9.8–11.3, height ≈ 3.3. Inside `|x| < 6, 7 < |z| < 16` put nothing taller than 1.2 m (no NPCs standing
  right in front of the lens). Tall props (lamps, palms, cars, people) are fine at `|x| ≥ 6.5` or beyond radius 13.
- **Z3 backdrop** radius > 16: big set pieces (ferris wheel, cranes, mansion, skyline). Fog hides the far edge.
- Everything in arenas is excluded from picking: World raycasts only pieces + board tiles. Do not add arena objects
  to `pieces.group` or `board.group`.

### Board surround (`arena.boardStyle`, applied by `Board.setSurround(style)`)
```js
{ frame: '#2b2530',          // frame top base colour (coordinate letters stay legible, auto contrast)
  frameText: '#f1ede6',
  plinth: '#4a4250', plinthMap: 'concrete'|'wood'|'marble'|'steel'|'none',
  kerb: 'race'|'none'|'rope'|'gold'|'hazard'|'planks',   // ring just outside the frame
  kerbColors: ['#d8232f', '#f1ede6'],
  neon: ['#29e3d6', '#ff5fa2'] | null,   // under-lip strip colours (static, no blinking)
  neonIntensity: 3.0 }
```
Tiles/highlights never change per arena.

### NPCs — `this.crowd` (NpcCrowd)
```js
this.crowd.spawn([
  { at: [x, z], y: STREET_Y, face: 'board' | [x, z] | yawRadians,
    anim: 'idle'|'talk'|'phone'|'cheer'|'clap'|'dance'|'lean'|'sit'|'walk'|'wave_flag'|'drink'|'point',
    look: 'beach'|'dock'|'club'|'rich'|'suit'|'street'|'racer',   // outfit palette family
    colors: { top, bottom, skin, hair }?,      // optional overrides
    body: 'm'|'f'|undefined,                    // undefined = random
    prop: 'phone'|'drink'|'flag'|'bottle'|null, // held item if supported
    path: [[x,z],…], speed: 1.2, loop: true,    // walkers (anim 'walk'); path must avoid Z0/Z1-corridors
    react: true,                                 // cheers on capture/finale (default true)
    scale: 1 },
  …
]);
this.crowd.cluster({ center:[x,z], count:5, radius:1.2, anims:['talk','idle','phone'], look:'club' });  // helper
this.crowd.line({ from:[x,z], to:[x,z], count, face:'board', anims:[…], look, jitter:0.3 });            // helper
```
- Shared rigged GLBs from `public/models/npc/` (see `docs/arenas/NPC_ASSETS.md` from the Blender agent), cloned
  with `SkeletonUtils.clone`, one `AnimationMixer` per NPC, random clip offsets/speeds ±10 %.
- Performance: mixers updated at a reduced rate for far/off-screen NPCs (e.g. every 2nd–4th frame), frustum culled,
  NPC meshes don't cast shadows except the nearest ~8 (or a blob shadow decal). Budget: ≤ 40 animated NPCs per
  arena (quality low: ≤ 20).
- Procedural fallback: if NPC GLBs are missing, capsule-bodied low-poly people with simple procedural bob/sway/arm
  animation — never breaks.
- Reactions: on `capture` NPCs with `react` briefly switch to `cheer`/`clap` (staggered 0–0.6 s, 1.5–2.5 s long) then
  crossfade back; on `finale` most of them cheer for ~6 s; `wanted` ≥ 3 → a few 'point' / look toward the board.

### Arena intro
When a match starts G shows a small lower-third card: arena name + tagline (e.g. "RUSTWATER DOCKS — Everything
arrives here. Nothing gets inspected."), fades in/out over ~3 s (no flashing).

## 4. Testing
- **Static arena viewer (use this for screenshots):**
  `http://localhost:<port>/?demo=arena&arena=<id>&cam=white|black|top|cinematic`
  — world only (no HUD / title), pieces in the start position, no scripted moves, camera preset applied without
  animation (cinematic does not auto-orbit unless `&orbit=1`). Optional `&time=day|dusk|night`, `&boss=1`
  (or `&variant=boss`), `&street=1|2|3`, `&react=capture|finale|wanted` (fires `world.react` after ~2 s and every
  8 s after — crowd reaction test), `&switch=classic,docks,neon` (cycles arenas every 4 s — leak/fade test),
  `&fps=1` (tiny fps meter, top-left), `&quality=low|high`. `window.__world` is the World instance
  (`__world.arenas.current` = the Arena, `__world.renderer.info`). When the first arena is shown,
  `document.documentElement.dataset.arenaReady` = its id.
- Also: `?arena=docks` (full game with that arena, title menu on top) and `?demo=world&arena=docks` (scripted world
  demo, auto-plays moves). Both accept the same variant params and `&cam=`.
- Headless screenshot (PowerShell), e.g.:
  `Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--headless=new","--user-data-dir=<scratch>\chrome","--use-angle=swiftshader","--enable-unsafe-swiftshader","--window-size=1280,720","--virtual-time-budget=15000","--screenshot=<scratch>\a.png","http://localhost:<port>/?demo=arena&arena=docks&cam=white" -Wait`
- Each worker uses its own Vite port (see prompt) and headless Chrome screenshots at 1280×720
  (swiftshader: slow; use `--virtual-time-budget=20000`). Check `white`, `black` and `cinematic` views.
- `npm test` and `npm run build` must pass.

## Blender asset list

Conventions (all assets): glTF binary `.glb`, meters, +Y up, the object's **front faces +Z**, origin at the base
centre on the ground (y=0), transforms applied, no Draco, no image textures (flat materials / vertex colours; if a
texture is unavoidable ≤ 256 px). Low-poly, faceted-but-clean stylised look consistent with the existing pieces.
Material naming: `TINT_<Part>` = colour-variable materials (code recolours them; author them in a neutral mid
colour), `EMISSIVE_<Part>` = glowing parts (author emissive colour, strength 1; code scales it), `GLASS` for
windows (code makes them semi-transparent), `WATER` for water surfaces. Animated sub-parts must be **separate
named nodes** with their pivot at the rotation centre (listed per asset). Keep each file under the size budget;
most props ≈ 20–150 KB.

### NPC requests (for the character set already in progress — accommodate what you can)
- Shared skeleton; ≥ 2 body types (m/f) and a few outfit variants via separate meshes or `TINT_Top`, `TINT_Bottom`,
  `TINT_Skin`, `TINT_Hair`, `TINT_Shoes` materials (code recolours per instance).
- Clips (names as listed, looping, in-place): `Idle`, `Talk` (gesturing), `Phone` (hand to ear or texting),
  `Cheer` (arms up), `Clap`, `Dance`, `Lean` (leaning back against wall/car, feet forward), `Sit` (seated on a 0.45 m
  seat), `Walk`, `WaveFlag` (right arm waving overhead — for the race-start flag waver), `Drink` (sip from cup),
  `Point`. Optional: `Dance2`, `Sit_Ground` (beach), `Crossed` (arms crossed bodyguard).
- A bone/empty `hand.R` (and `hand.L`) where held props attach; tiny separate props GLB
  `public/models/npc/npc_props.glb` with nodes `Phone`, `Cup`, `Bottle`, `Flag` (checkered, ~1 m pole), each with
  its grip point at the node origin.
- ~2–4 k triangles per character. Document everything in `docs/arenas/NPC_ASSETS.md`.

### Shared props — `public/models/props/`
| file | description | size (m) | tris | named nodes / materials | prio |
|---|---|---|---|---|---|
| `car_tuner.glb` | 90s/00s JDM-style tuner coupe (ref_street_race: wide body, spoiler, rims) | 4.4 × 1.8 × 1.25 | 3000 | `TINT_Body`, `TINT_Rims`, `GLASS`, `EMISSIVE_Underglow` (thin plane/strip under the body), `EMISSIVE_Headlight`, `EMISSIVE_Taillight`; wheels as nodes `Wheel_FL/FR/RL/RR` | P1 |
| `car_muscle.glb` | 80s Miami muscle car / convertible | 4.8 × 1.9 × 1.3 | 3000 | same as above | P2 |
| `car_luxury.glb` | long luxury sedan / supercar (rich valet, rooftop) | 5.0 × 2.0 × 1.4 | 3000 | same as above | P2 |
| `speaker_stack.glb` | party PA speaker stack on a small stand | 0.8 × 0.6 × 1.7 | 400 | `TINT_Cabinet`, `EMISSIVE_Ring` | P1 |
| `lounge_chair.glb` | sun lounger (white/pastel) | 0.7 × 1.9 × 0.9 | 300 | `TINT_Cushion` | P1 |
| `plant_pot.glb` | tall potted tropical plant (bird of paradise / small palm) | 0.8 × 0.8 × 1.6 | 600 | `TINT_Pot` | P2 |
| `cooler.glb` | beach cooler box | 0.6 × 0.4 × 0.45 | 120 | `TINT_Body` | P2 |
| `food_cart.glb` | street food cart with striped canopy and sign ("TACOS"-style, no text needed) | 2.0 × 1.2 × 2.3 | 1200 | `TINT_Canopy`, `EMISSIVE_Sign` | P1 |

### `public/models/arenas/strand/`
| file | description | size (m) | tris | named nodes / materials | prio |
|---|---|---|---|---|---|
| `ferris_wheel.glb` | pier ferris wheel with 12 gondolas and a support A-frame | ⌀ 20, 22 tall | 5000 | node `Wheel` (pivot at hub, spins around local X), children `Gondola_00…11` (pivot at hang point, kept upright by code), `EMISSIVE_Bulbs` (warm), `TINT_Gondola` | P1 |
| `lifeguard_tower.glb` | classic Miami pastel lifeguard hut on stilts with ramp | 3 × 3 × 4 | 900 | `TINT_Hut`, `TINT_Trim` | P1 |
| `beach_umbrella.glb` | beach umbrella with pole | ⌀ 2.2, 2.3 tall | 250 | `TINT_Canopy` (stripes via 2 materials `TINT_Canopy` + `TINT_Canopy2` ok) | P1 |
| `surfboard.glb` | surfboard (stands upright stuck in sand or lies flat) | 0.55 × 2.1 × 0.08 | 100 | `TINT_Board` | P2 |
| `pier_section.glb` | wooden pier deck segment on piles, tileable along Z | 5 × 10 × 3 | 600 | `TINT_Wood` | P2 |
| `volleyball_net.glb` | net with two poles | 9 × 0.2 × 2.4 | 300 | — | P2 |

### `public/models/arenas/docks/`
| file | description | size (m) | tris | named nodes / materials | prio |
|---|---|---|---|---|---|
| `gantry_crane.glb` | ship-to-shore container crane (legs, boom over water) | 30 × 18 × 40 | 3000 | `TINT_Steel` (default orange-red), node `Trolley` (moves along local Z of boom), node `Spreader` (child of trolley, moves on Y), `EMISSIVE_Warning` (small red lamps) | P1 |
| `container.glb` | 40 ft shipping container, corrugated sides, door end | 12.2 × 2.44 × 2.6 | 150 | `TINT_Body` (instanced by code in many colours) | P1 |
| `forklift.glb` | warehouse forklift | 1.2 × 2.8 × 2.2 | 1500 | `TINT_Body` (yellow), node `Forks` (lifts on Y) | P1 |
| `light_mast.glb` | tall port flood-light mast with 4 sodium lamp heads | 1 × 1 × 14 | 400 | `EMISSIVE_Lamp` (sodium orange) | P1 |
| `bollard.glb` | mooring bollard | 0.5 × 0.5 × 0.6 | 150 | — | P2 |
| `tugboat.glb` | small harbour tugboat | 4 × 14 × 6 | 2500 | `TINT_Hull`, `EMISSIVE_Windows` | P2 |
| `oil_drum_fire.glb` | rusty oil drum (fire done by code) | ⌀ 0.6 × 0.9 | 150 | `TINT_Drum` | P2 |

### `public/models/arenas/trap/` (also used in the docks hangout corner)
| file | description | size (m) | tris | named nodes / materials | prio |
|---|---|---|---|---|---|
| `couch.glb` | worn 3-seat couch | 2.1 × 0.9 × 0.85 | 800 | `TINT_Fabric` | P1 |
| `armchair.glb` | worn armchair | 0.9 × 0.9 × 0.85 | 500 | `TINT_Fabric` | P2 |
| `fluoro_light.glb` | ceiling fluorescent tube fixture (2 tubes) | 1.3 × 0.3 × 0.1 | 80 | `EMISSIVE_Tube` | P1 |
| `arcade_cabinet.glb` | retro arcade cabinet | 0.7 × 0.8 × 1.8 | 600 | `TINT_Cabinet`, `EMISSIVE_Screen` | P2 |
| `pool_table.glb` | pool table | 2.5 × 1.4 × 0.8 | 600 | `TINT_Felt` | P2 |

### `public/models/arenas/neon/`
| file | description | size (m) | tris | named nodes / materials | prio |
|---|---|---|---|---|---|
| `start_tree.glb` | drag-strip starting light "christmas tree" on a post | 0.6 × 0.6 × 3 | 400 | `EMISSIVE_Amber`, `EMISSIVE_Green`, `EMISSIVE_Red` (code turns them on slowly, no blinking) | P2 |
| `club_front.glb` | nightclub entrance facade section: awning, doors, velvet rope posts, blank sign board | 10 × 3 × 7 | 2000 | `TINT_Wall`, `EMISSIVE_Trim`, node `SignBoard` (flat plane code textures) | P2 |
| `traffic_light.glb` | Miami span-wire style traffic light on a pole | 0.5 × 3 × 6 | 400 | `EMISSIVE_Red`, `EMISSIVE_Amber`, `EMISSIVE_Green` | P2 |

### `public/models/arenas/crown/`
| file | description | size (m) | tris | named nodes / materials | prio |
|---|---|---|---|---|---|
| `mansion.glb` | Miami Mediterranean / art-deco mansion facade (arches, balconies, tile roof); only the front half needed | 24 × 10 × 11 | 3500 | `TINT_Wall` (cream), `TINT_Roof` (terracotta), `EMISSIVE_Windows` (warm), `GLASS` | P1 |
| `topiary.glb` | clipped hedge topiary in a planter (cone + ball) | 1 × 1 × 1.8 | 400 | `TINT_Leaves` | P1 |
| `fountain.glb` | tiered marble fountain | ⌀ 3.5 × 2.6 | 1500 | `TINT_Stone`, node `Water` with material `WATER` | P1 |
| `balustrade.glb` | marble balustrade segment (tileable along X) | 2 × 0.3 × 1.0 | 300 | `TINT_Stone` | P1 |
| `horse_statue.glb` | gaudy gold rearing horse statue on plinth (polo) | 1.5 × 3 × 3.5 | 2500 | `TINT_Gold` | P2 |
| `golf_cart.glb` | golf cart with canopy | 1.2 × 2.4 × 1.8 | 1000 | `TINT_Body` | P2 |

### `public/models/arenas/tower/`
| file | description | size (m) | tris | named nodes / materials | prio |
|---|---|---|---|---|---|
| `helicopter.glb` | luxury twin-engine helicopter | 3 × 13 × 4 | 3000 | `TINT_Body` (black/gold), `GLASS`, node `Rotor` (pivot at mast, spins Y), node `TailRotor` (spins X), `EMISSIVE_Nav` | P1 |
| `hvac_unit.glb` | rooftop AC unit with fan grille | 2 × 1.5 × 1.3 | 300 | node `Fan` (spins Y) | P2 |
| `antenna_mast.glb` | tall rooftop antenna spire | 1 × 1 × 15 | 300 | `EMISSIVE_Beacon` (red aviation light — code pulses it slowly) | P2 |
| `throne_sofa.glb` | gaudy gold-and-velvet sofa for the City Boss | 2.4 × 1 × 1.2 | 800 | `TINT_Velvet`, `TINT_Gold` | P2 |

Priority for the Blender agent after NPCs: shared `car_tuner`, `speaker_stack`, `food_cart`, `lounge_chair` → P1 of
docks, strand, crown, tower, trap → then P2. Everything has a procedural fallback in code, so partial delivery is fine.
Please list delivered files (size, tris, node/material names) in `docs/arenas/NPC_ASSETS.md` (or a sibling
`PROPS_ASSETS.md`).

### Changes
- Lead: skeleton landed (registry, Arena.js, ArenaManager, procedural NpcCrowd, classic wrapper, placeholder arenas,
  World.setArena/react). Workers A–G spawned. The Blender asset list above is unchanged — build in the listed order.

### Changes (from the lead integrator, user request): people WALKING AROUND THE BOARD
The user clarified: "characters" means the NPC people — they want **characters walking around the board**, not just
standing crowds. Requirements for every arena:
- **6–12 walkers per arena** (quality 'low': at least 4) that visibly circulate **around the board**: loops that go all
  the way around the play area (outside the board edge and outside the Z0/Z1 corridors), plus paths that cross between
  groups/props. At any moment several people should be in motion in the default white/black camera views.
- **Wander behavior, not just rigid loops** (NPC system, worker A): walk a segment → sometimes stop for 2–6 s and do
  something (look at the board / `point` at the game, `phone`, `talk` to a nearby group, `wave`) → continue; smooth
  turning toward the travel direction, walk speed ~1.0–1.4 m/s with slight per-person variation, feet anim speed
  matched to movement (no ice-skating), simple separation so walkers don't pass through each other or through
  standing NPCs/props, ease in/out when stopping and starting.
- **Reactions**: on a capture, nearby walkers pause and turn toward the explosion (point / cheer) before moving on;
  on checkmate everyone stops and cheers/claps.
- Arena workers (B–F): add walker paths suited to your space (beachgoers strolling the boardwalk, dock workers
  walking between containers, race fans crossing the street at the Neon Mile meet, party guests drifting around the
  pool, security guards patrolling the rooftop).

### Changes (worker A — backbone; all additive, existing API unchanged)
- **World**: `?fps=1` meter (fps, draw calls, tris, geo/tex/programs, NPC count). Pixel ratio ≤ 2 (≤ 1.5 on quality
  low). Capture reactions now fire from the Pieces explosion fx path (`World._emitFx('explosion')` →
  `react('capture', {square, victim})`), once per capture, including `playCaptureFx`. **`'finale'` is no longer a side
  effect of `setCameraPreset('cinematic')`**: `GameController.endGame` calls `world.react('finale', over)`.
- **ArenaManager**: awaits the shared NPC assets before `build()`. Latest call wins, and superseded or failed builds are
  disposed (crowd first). A failing arena falls back to classic. At most one shadow-casting light per arena (extras are
  switched off with a warning). `compileAsync` runs after the swap, with a soft 420 ms fade. `ctx.url` is now set.
  `arenaManager.loading`. `guessQuality()` exported (`?quality=low|high`).
- **Board.setSurround(style)** implemented: `frame`, `frameText` (auto-contrast when omitted), `frameLine`, `plinth`,
  `plinthMap` concrete|wood|marble|steel|none, `kerb` race|none|rope|gold|hazard|planks, `kerbColors`, `neon` (1–2
  colours or null), `neonIntensity`. It can be called before `build()` and repeatedly, and the old surround is
  disposed each time. The gold kerb uses roughness 0.45. `SURROUND_DEFAULT` is exported.
- **NpcCrowd** (real GLBs from `public/models/npc/`, procedural fallback with the same bone names; `?npc=procedural`
  forces the fallback):
  - Each NPC is one skinned mesh with one shared vertex-colour material, plus one `AnimationMixer`.
  - Per-NPC colours come from `look` palettes: TOP/BOTTOM/SKIN/HAIR/ACCENT, plus sleeve and trouser length.
  - Mixers update at 1/2/3/4-frame rates depending on distance and frustum.
  - All NPCs get instanced blob shadows. Up to 8 cast real shadows, and only if their shadow can't reach the board.
  - Clip mapping and extra anims: `idle talk phone cheer clap dance lean sit walk wave_flag drink point` plus `dance2
    sit_ground crossed`. A missing clip falls back to Idle.
  - The walk clip speed is calibrated from the foot stride: GLB 1.257 m/s, the Blender note says 1.25.
- **Walkers — spec "WALKING AROUND THE BOARD"**:
  - `crowd.walkers({ loop|path:[[x,z(,y)],…], count=6, look|looks, speed=[1.0,1.4], reverse=0.5, spread=0.35,
    stops=0.3, pauses=['point','phone','talk','wave_flag','idle'], pauseTime=[2,6], spacing=2.2, closed=true, y, … })`.
    Walkers wander: they pause 2–6 s to point, phone, talk to the nearest standing NPC, wave or watch, then carry on.
    Starts and stops ease in and out, turning is smooth, and the walk clip time scale follows ground speed (no foot
    slide). They keep apart from other NPCs and obstacles, never enter the board zone, and slow down behind someone.
  - `crowd.orbit({ halfW=6.8, halfL=13, corner=1.6, … })` walks a loop all the way around the board, crossing behind
    the cameras.
  - **If an arena declares no walkers, `finalize()` adds a default orbit** (8 walkers, 4 on quality low). Opt out with
    `this.autoWalkers = false`, or tune it with `this.walkerOrbit = {halfW, halfL, …}`, `this.walkerLook`, `this.walkerY`.
  - `crowd.addObstacle(x,z,r)` / `addObstacles([[x,z,r],…])` register props walkers should steer around.
  - Ground height, first match wins: per-NPC `spec.ground(x,z)`, then `crowd.groundAt = (x,z) => y`, then the
    waypoint y in `[x,z,y]` paths.
  - Reactions: on a capture, walkers within 11 m stop, turn to the square and point or cheer. On the finale, everyone
    stops, faces the board and cheers or claps for about 6 s.
  - Also added: `crowd.setAnim(npc, name, {fade, duration})`, `crowd.remove(npc)`, `crowd.backend` ('glb' |
    'procedural'), `crowd.count`, `crowd.walkerCount`.
  - Cap: 40 NPCs, 20 on quality low. When the crowd is full, a walker or a spec with `priority: true` replaces the
    most recent generic standing NPC.
- **kit.js** exports: `softPulse, breathe, normalizeProp, propLength, glowTexture, neonTextTexture, viTexture,
  bannerTexture, windowTexture, sunsetSky, addPalms, addStreetLights, buildSkyline, neonSign, festoon, waterPlane`
  (+ re-exports `canvasTexture, speckle, rng, STREET_Y, mergeGeometries`). All animated lights are slow soft pulses.
- **classic.js** now builds the old Environment directly on kit.js; `Environment.js` is a legacy re-export. Antenna
  beacons and neon signs breathe slowly (3.2–5 s, ≤ 30 %) instead of blinking. The crowd: 25 race fans between the
  barrier and the fence (a flag waver at the start line), 8 sidewalk walkers crossing at zebra crossings z=±17.5, and
  a few sidewalk groups.
- **Viewer extras**: `?demo=arena&lineup=1` (every anim on the board, pieces hidden), `&leaktest=1` (prints
  renderer.info before and after 10 arena round trips; needs a visible tab), `&npc=procedural`.
