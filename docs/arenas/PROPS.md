# Arena props (Blender -> `public/models/props/`, `public/models/arenas/<district>/`)

Built from `docs/arenas/ARENAS_SPEC.md` "Blender asset list" (the lead's list; every P1 **and** P2 item is
delivered). Source: `tools/blender/arenas/*.py` (one module per district, shared helpers in `propkit.py`,
geometry helpers from `tools/blender/common.py`). Previews: `docs/models/arenas/preview_<name>.png`.

```
blender --background --factory-startup --python tools/blender/arenas/build_arenas.py            # all (~2 min)
blender ... build_arenas.py -- ferris_wheel lifeguard_tower                                       # subset
```

Conventions: glTF binary, metres, +Y up, **front faces +Z**, origin at the base centre on the ground,
transforms applied, no textures, no Draco. `TINT_*` = recolourable (authored in a representative colour),
`EMISSIVE_*` = steady emission strength 1 (no baked flashing), `GLASS`, `WATER`. Animated parts are separate
named nodes with the pivot at the rotation centre. Size column = X width x Z depth x Y height (m).

| file | prio | tris | KB | size X x Z x Y | nodes | tint/emissive materials | notes |
|---|---|---|---|---|---|---|---|
| `props/car_tuner.glb` | P1 | 1536 | 88 | 1.91 x 4.59 x 1.23 | Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR | EMISSIVE_Headlight, EMISSIVE_Taillight, EMISSIVE_Underglow, GLASS, TINT_Body, TINT_Rims, TINT_Stripe | front +Z; Wheel_* pivots at hubs (spin about X); underglow = floor plane + skirt strips |
| `props/speaker_stack.glb` | P1 | 800 | 32 | 0.8 x 0.64 x 1.66 | - | EMISSIVE_Ring, TINT_Cabinet |  |
| `props/food_cart.glb` | P1 | 784 | 47 | 2.27 x 1.24 x 2.44 | - | EMISSIVE_Sign, GLASS, TINT_Body, TINT_Canopy |  |
| `props/lounge_chair.glb` | P1 | 384 | 23 | 0.67 x 1.9 x 1 | - | TINT_Cushion | head end at the back (-Z) |
| `props/car_muscle.glb` | P2 | 1360 | 80 | 2 x 5.04 x 1.38 | Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR | EMISSIVE_Headlight, EMISSIVE_Taillight, EMISSIVE_Underglow, GLASS, TINT_Body, TINT_Rims, TINT_Seats, TINT_Stripe | open convertible; extra TINT_Seats |
| `props/car_luxury.glb` | P2 | 1300 | 72 | 2.07 x 5.14 x 1.41 | Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR | EMISSIVE_Headlight, EMISSIVE_Taillight, EMISSIVE_Underglow, GLASS, TINT_Body, TINT_Rims, TINT_Stripe | gold rims/stripe by default |
| `props/plant_pot.glb` | P2 | 870 | 24 | 0.8 x 0.8 x 1.91 | - | TINT_Pot |  |
| `props/cooler.glb` | P2 | 124 | 9 | 0.66 x 0.42 x 0.46 | - | TINT_Body |  |
| `arenas/strand/ferris_wheel.glb` | P1 | 3884 | 208 | 5.4 x 21.8 x 22.5 | Wheel > Gondola_00..11 | EMISSIVE_Bulbs, TINT_Frame, TINT_Gondola | Wheel pivot = hub (11.8 m up), spins about local X; Gondola_* are children of Wheel, pivot at hang point (keep upright) |
| `arenas/strand/lifeguard_tower.glb` | P1 | 372 | 22 | 2.3 x 4.33 x 4.45 | - | GLASS, TINT_Hut, TINT_Trim | ramp comes down toward the front (+Z) |
| `arenas/strand/beach_umbrella.glb` | P1 | 128 | 8 | 2.24 x 2.24 x 2.36 | - | TINT_Canopy, TINT_Canopy2 |  |
| `arenas/strand/surfboard.glb` | P2 | 108 | 7 | 0.55 x 2.1 x 0.18 | - | TINT_Board |  |
| `arenas/strand/pier_section.glb` | P2 | 504 | 26 | 5.02 x 10 x 4.01 | - | TINT_Wood | deck top 3.0 m, tileable along Z (10 m) |
| `arenas/strand/volleyball_net.glb` | P2 | 500 | 28 | 9.12 x 0.12 x 2.5 | - | - |  |
| `arenas/docks/gantry_crane.glb` | P1 | 1268 | 74 | 15.4 x 43.23 x 40.9 | Trolley > Spreader | EMISSIVE_Warning, GLASS, TINT_Steel | boom along Z, outreach toward +Z; Trolley rides the boom (move on Z), Spreader is its child (move on Y), hoist ropes ride with it |
| `arenas/docks/container.glb` | P1 | 252 | 14 | 12.23 x 2.44 x 2.59 | - | TINT_Body | length along X, doors at +X, zig-zag corrugated sides |
| `arenas/docks/forklift.glb` | P1 | 648 | 35 | 1.26 x 3.39 x 2.24 | Forks | TINT_Body | Forks pivot at the fork heel on the ground (lift on Y); forks at front (+Z) |
| `arenas/docks/light_mast.glb` | P1 | 188 | 13 | 1.52 x 1.52 x 13.95 | - | EMISSIVE_Lamp |  |
| `arenas/docks/bollard.glb` | P2 | 144 | 6 | 0.48 x 0.54 x 0.59 | - | - |  |
| `arenas/docks/tugboat.glb` | P2 | 1345 | 46 | 4.16 x 14.44 x 7.3 | - | EMISSIVE_Windows, TINT_Hull |  |
| `arenas/docks/oil_drum_fire.glb` | P2 | 356 | 17 | 0.63 x 0.6 x 0.89 | - | TINT_Drum |  |
| `arenas/trap/couch.glb` | P1 | 544 | 33 | 2.1 x 0.9 x 0.98 | - | TINT_Fabric | worn, cushions askew |
| `arenas/trap/fluoro_light.glb` | P1 | 108 | 8 | 1.3 x 0.3 x 0.1 | - | EMISSIVE_Tube | origin at the TOP (ceiling mount), hangs 0.1 m down |
| `arenas/trap/armchair.glb` | P2 | 312 | 19 | 0.9 x 0.9 x 0.98 | - | TINT_Fabric |  |
| `arenas/trap/arcade_cabinet.glb` | P2 | 264 | 18 | 0.75 x 0.91 x 1.8 | - | EMISSIVE_Marquee, EMISSIVE_Screen, TINT_Cabinet |  |
| `arenas/trap/pool_table.glb` | P2 | 808 | 43 | 2.5 x 1.4 x 0.85 | - | TINT_Felt |  |
| `arenas/crown/mansion.glb` | P1 | 2000 | 104 | 24.4 x 14.65 x 11 | - | EMISSIVE_Windows, GLASS, TINT_Roof, TINT_Wall |  |
| `arenas/crown/topiary.glb` | P1 | 260 | 13 | 0.78 x 0.78 x 1.8 | - | TINT_Leaves |  |
| `arenas/crown/fountain.glb` | P1 | 932 | 33 | 3.56 x 3.56 x 2.65 | Water | TINT_Stone, WATER | node Water holds all WATER surfaces + the falling sheet |
| `arenas/crown/balustrade.glb` | P1 | 800 | 28 | 2 x 0.3 x 1 | - | TINT_Stone | tileable along X (2 m) |
| `arenas/crown/horse_statue.glb` | P2 | 564 | 21 | 1.6 x 2.75 x 3.94 | - | TINT_Gold |  |
| `arenas/crown/golf_cart.glb` | P2 | 812 | 45 | 1.21 x 2.43 x 1.85 | - | GLASS, TINT_Body, TINT_Roof |  |
| `arenas/tower/helicopter.glb` | P1 | 736 | 43 | 8.29 x 13.35 x 3.7 | Rotor, TailRotor | EMISSIVE_Nav, EMISSIVE_NavGreen, GLASS, TINT_Body, TINT_Stripe | nose +Z; Rotor pivot on mast (spin Y), TailRotor at tail hub (spin X) |
| `arenas/tower/hvac_unit.glb` | P2 | 496 | 24 | 2.1 x 2.03 x 1.36 | Fan | - | Fan spins about Y |
| `arenas/tower/antenna_mast.glb` | P2 | 652 | 33 | 1 x 1 x 15.04 | - | EMISSIVE_Beacon | EMISSIVE_Beacon steady (code pulses) |
| `arenas/tower/throne_sofa.glb` | P2 | 1046 | 44 | 2.43 x 0.96 x 1.77 | - | TINT_Gold, TINT_Velvet |  |
| `arenas/neon/start_tree.glb` | P2 | 816 | 42 | 0.6 x 0.6 x 3.02 | - | EMISSIVE_Amber, EMISSIVE_Green, EMISSIVE_Red | 3 amber / green / red rows, steady colours |
| `arenas/neon/club_front.glb` | P2 | 752 | 38 | 10.2 x 3.74 x 7.25 | SignBoard | EMISSIVE_Trim, GLASS, TINT_Rope, TINT_Wall | SignBoard = blank white panel for a code texture (faces +Z) |
| `arenas/neon/traffic_light.glb` | P2 | 500 | 27 | 0.34 x 3.17 x 6 | - | EMISSIVE_Amber, EMISSIVE_Green, EMISSIVE_Red | mast arm reaches forward over the lane (+Z); heads face +Z |

Deviations from the list: ferris wheel is 3.9k tris (budget 5k) and ~22.5 m tall; the crane is 15 x 43 x 41 m
(41 m boom so the trolley has travel; the game normalises it to 36 m height); the container is 252 tris
(budget 150) to keep visible corrugation; the cars are 1.3-1.5k tris (budget 3k).
