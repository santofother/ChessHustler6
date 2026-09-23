# HUSTLER MODE — Lore Bible

> *Vice City, Leonida. Sixty-four squares of sunshine. Every one of them is taken.*

Source of truth for all in-game text: `src/hustler/data/lore.js`. This doc is the readable version. Edit the
JS to change what the game shows, and this doc if you want the bible to stay in sync.

**Piece slang** (same as the rest of the game): pawn = **Street Thug**, knight = **Sport Bike**,
bishop = **Touring Car**, rook = **Armored Truck**, queen = **Heli**, king = **The Boss**.

**Tone:** GTA-style crime comedy, PG-13. The early bosses are small-time clowns, the later ones get
colder and scarier. No real people, brands or gangs. Keep lines short, because they show up as phone SMS
toasts and small cards.

---

## The City

Palm trees, pastel condos and a skyline built on bad decisions. Every street in Vice City belongs to
somebody, and the only way to change the deed is across a chessboard.

You are the new crew in town (default name **The Gambit Crew**, and the player can rename it). You play in
the Vice Crew colors, teal and pink. You arrive with a Boss, a borrowed car and cash for about two Street
Thugs. At the top of it all sits **Cartel Nocturno**, the matte-black, gold and acid-green syndicate that
every other gang pays. Its leader, **El Largo**, runs the city from Nocturno Tower.

```
                 [ DOWNTOWN VICE ]  Cartel Nocturno · El Largo
                         |
                  [ CROWN HILLS ]   tier 3 · Crown Hills HOA
                   /          \
       [ RUSTWATER DOCKS ] — [ NEON MILE ]   tier 2
                   \          /
                 [ SUNSET STRAND ]  tier 1 · start
```

| Id | Neighborhood | Tier | Vibe | Primary | Accent | Gang |
|---|---|---|---|---|---|---|
| nh1 | **Sunset Strand** | 1 | sunburnt, scrappy, loud | `#ff9f1c` amber | `#ffe29a` sand | The Strand Rats |
| nh2 | **Rustwater Docks** | 2 | rusted, heavy, blue-collar | `#3d8bff` cobalt | `#ffb347` container orange | Longshore Local 64 |
| nh3 | **Neon Mile** | 2 | neon, flashy, after-hours | `#a259ff` violet | `#f9f871` neon yellow | The Velvet Syndicate |
| nh4 | **Crown Hills** | 3 | gated, cold, old money | `#e5383b` crimson | `#f4ede0` marble | Crown Hills HOA |
| downtown | **Downtown Vice** | final | glass, gold, untouchable | `#b8ff3c` acid green | `#e8b923` gold | Cartel Nocturno |

The primary hues are spread around the color wheel (amber 35°, cobalt 215°, violet 270°, crimson 0°,
acid green 85°). None of them is close to the player's teal (#2de2e6) or pink (#ff3ea5), and all of them
read well on a dark map.

---

## nh1 · Sunset Strand: *"Where hustles go to get a tan."*

Sun-bleached strip malls, a sticky boardwalk and a pier held together by gum. The crime here is small, loud
and mostly involves knockoff sunglasses.

**Gang: The Strand Rats.** Beach hustlers, sunglass pirates and parking-lot kings. More mouth than muscle,
but a lot of mouth.
**Street crew: The Pier Patrol.** One jet-ski rental, one guy, one very loyal pelican. Legally a "fleet".

| Node | Street | Leader | Gimmick |
|---|---|---|---|
| nh1_s1 | **Coquina Plaza Lot**: a strip-mall parking lot between a vape shop and a closed tanning salon. | 📣 **Desmond "Two-Pawn Dez" Varga**, Parking Lot Boss | Has two pawns and talks like he has twenty. |
| nh1_s2 | **Boardwalk Row**: airbrushed tees, deep-fried everything, sunglasses that fall apart in the rain. | 🕶️ **Brenda "Flip-Flop" Okafor**, Boardwalk Boss | Never moves her King: "The Boss stays in the shade." |
| nh1_s3 | **Pelican Pier**: bait shops, jet-ski rentals and one very aggressive pelican. | 🛥️ **Rusty "Captain Jet Ski" Mulroney**, Pier Boss (Pier Patrol) | Has one knight and big dreams. Every move is a "maneuver". |
| nh1_boss | the whole Strand | 🏖️ **Reginald "The Mayor" Fontaine**, Boss of Sunset Strand | Builds pawn chains: "Every square is prime oceanfront property." |

- **Two-Pawn Dez**: owns two Street Thugs, one folding chair and the loudest mouth on the Strand. He calls the parking lot his "empire". *"This lot is MINE. Me and my two guys run it. Both of them."*
- **Flip-Flop**: sells "Ray-Bands" and "Oakleez" off a folding table and hasn't left her beach umbrella since 2019. *"Five bucks a pair, ten for the board."*
- **Captain Jet Ski**: runs one rented Sport Bike he calls "the fleet". His pelican does the enforcing. *"The fleet remains undefeated. The fleet is one bike."*
- **The Mayor**: a former timeshare salesman who declared himself Mayor. There was no election and there is no office, just one very firm handshake. *"Let me show you a presentation about losing."*

## nh2 · Rustwater Docks: *"Everything arrives here. Nothing gets inspected."*

Cranes, containers and a canal that glows at night for reasons nobody investigates. The union runs the
port, the port runs the city, and the forklifts run on spite.

**Gang: Longshore Local 64.** Sixty-four members, one for every square. It is a dockworkers' union that
smuggles on the side, or the other way round.
**Street crew: The Magnet Boys.** A chop-shop crew that runs the scrapyard crane.

| Node | Street | Leader | Gimmick |
|---|---|---|---|
| nh2_s1 | **Container Row**: a maze of stacked boxes where Armored Trucks idle like guard dogs. | 🚚 **Frankie "Forklift" Dunn**, Yard Boss | Loves rooks and doubles them on any open lane. |
| nh2_s2 | **Customs Wharf**: the official inspection point for everything entering Vice City. Officially. | 📋 **Carmen "Customs" Ruiz**, Wharf Boss | Trades everything: "Piece for piece, paperwork for paperwork." |
| nh2_s3 | **Scrapyard Lane**: crushed cars and a crane magnet the size of a hot tub. | 🧲 **Otis "Magnet" Greer**, Scrapyard Boss (Magnet Boys) | Punishes hanging pieces. |
| nh2_boss | the whole port | 🏗️ **Harlan "The Foreman" Voss**, Boss of Rustwater Docks | Plays closed, grinding positions and waits for you to crack. |

- **Forklift**: twenty years moving containers and ten years moving product in them. He talks to his trucks like they're family.
- **Customs**: the most corrupt inspector in Leonida, and she's proud of it. *"Anything to declare? No? Then everything is mine."*
- **Magnet**: can smell an undefended piece from three containers away. *"Clunk. Mine now."*
- **The Foreman**: president of Local 64. Sixty-four squares, sixty-four members, zero days off. *"Union vote's in. The docks are yours. I voted no."*

## nh3 · Neon Mile: *"Bottle service for your bad ideas."*

Clubs, casinos and a drag strip that doubles as a boulevard on weekdays. The velvet rope is the most
guarded border in Leonida.

**Gang: The Velvet Syndicate.** Club owners, promoters and money launderers in very nice shoes.
**Street crew: The Apex Angels.** Street racers who only drive diagonally. Nobody knows how.

| Node | Street | Leader | Gimmick |
|---|---|---|---|
| nh3_s1 | **Flamingo Boulevard**: club row, pink neon, bass you feel in your teeth. | 🎧 **Kenji "DJ Kilowatt" Alvarado**, Club Row Boss | Plays at blitz tempo and moves on the beat. |
| nh3_s2 | **Ocean Mile Drag**: a boulevard by day and a street-racing strip by night. | 🏎️ **Valentina "Double Bishop" Cruz**, Drag Strip Boss (Apex Angels) | Plays the bishop pair: long diagonals, no brakes. |
| nh3_s3 | **Mirage Row**: casinos, crypto lounges and a bank that is just a vending machine. | 🐋 **Trent "The Whale" Blakely**, Casino Row Boss | Plays wild gambits and calls sacrifices "investing". |
| nh3_boss | the whole Mile | 🍸 **Vivienne "Velvet" Sol**, Queen of the Neon Mile | Queen play: keeps the Heli in VIP, then sends it in for the kill. |

- **DJ Kilowatt**: resident DJ at every club on the boulevard, including the ones that don't exist. *"Mic drop. Board drop. You drop."*
- **Double Bishop**: queen of the night races. She drives two gold Touring Cars at once and has never taken a straight line. *"Light squares, dark squares. I own both."*
- **The Whale**: crypto millionaire who owns a digital picture of a yacht. *"That wasn't a loss. It was a strategic dip."*
- **Velvet**: owns every rope, door and bottle on the Mile. *"Darling, you're underdressed for this board."*

## nh4 · Crown Hills: *"Gated. Guarded. Governed by bylaws."*

Mansions on the ridge, hedges trimmed with lasers, and an HOA that has quietly annexed three police
precincts. Up here nobody shoots. They just make sure you were never here.

**Gang: Crown Hills HOA.** A homeowners' association with a private army.
**Street crew: The Stirrup Club.** Polo heirs and superbike collectors.

| Node | Street | Leader | Gimmick |
|---|---|---|---|
| nh4_s1 | **Gatehouse Road**: the only road in. Three checkpoints, two moats. | 🚧 **Bernard "The Gatekeeper" Ashby**, Chief of Security | Plays a fortress defense: castles early behind a wall of Thugs. |
| nh4_s2 | **Polo Grounds Lane**: stables, a polo field and superbikes named after horses. | 🐎 **Sebastian "Stirrup" Whitcombe III**, Master of the Polo Grounds (Stirrup Club) | Knight fanatic: forks, jumps and "cavalry charges". |
| nh4_s3 | **Sermon Hill Drive**: a megachurch with a helipad and a lot full of gold Touring Cars. | 📺 **Silas "The Bishop" Crane**, Prosperity Preacher | Puts his bishops on long diagonals to "bless" both wings. |
| nh4_boss | the whole Hill | 🏛️ **Cordelia "The Chairwoman" Vance-Ashgrove**, Boss of Crown Hills | Zugzwang specialist: makes every legal move a violation. |

- **The Gatekeeper**: ex-military and a lifelong fan of walls. Nobody has entered uninvited in eleven years.
- **Stirrup**: refuses to tell horses and bikes apart. *"Meet Duchess and Thunderhoof. They're bikes. They're also horses."*
- **The Bishop**: TV prosperity preacher. Every sermon ends with a card reader. *"Blessed be the house. The house always wins."*
- **The Chairwoman**: has chaired the HOA for twenty-two years. She doesn't threaten, she cites bylaws. *"You are in violation of Section 4, Subsection Checkmate."*

## Downtown Vice: *"One tower. One boss. One very long game."*

Glass towers and gold lobbies around **Nocturno Tower**, the tallest thing in Leonida.

**Gang: Cartel Nocturno** (the default AI crew from VS mode): matte black, gold trim, acid-green eyes in
the dark.

- ⌛ **Aurelio "El Largo" Noche**, City Boss. He has been playing one game against Vice City for thirty years, and you are move one. He never rushes, never forgets and never blunders twice. He watched you take every street, and he let you.
  *"I watched you take every street. I let you. Sit."* On defeat: *"Well played. The tower is yours. Mind the view, it gets lonely."*

---

## Story arc

1. **Arrival**: you roll in broke, with a Boss and a borrowed car. The deed to a street changes hands one way: across a chessboard.
2. **Sunset Strand**: comedic small-timers. Beating the Mayor unlocks both tier-2 districts.
3. **Docks and Mile**: two contrasting worlds, heavy industry and flashy nightlife. They can be taken in either order.
4. **Crown Hills**: opens only when both tier-2 districts are yours. It opens with an embossed letter: *"Please don't."*
5. **Nocturno Tower**: a private number texts you: *"Top floor. Come alone."*
6. **Finale**: El Largo tips his king and slides you the tower keys: *"Now you get to find out how heavy they are."*

Unlock, control and defeat texts are in `STORY.unlocks`, `STORY.controlled` and `STORY.defeat`.

## Leader line types

Each leader has five one-sentence lines in `lines`:
- `intro`: before the match
- `playerWins` / `playerLoses`: after the match
- `challenge`: when they attack turf you own
- `defended`: when you hold them off

## Optional fields (beyond spec §4.1)

All optional. Consumers can ignore them safely.

| Field | Type | Meaning |
|---|---|---|
| `CITY.region` | string | `'Leonida'` |
| `CITY.downtownName` | string | `'Downtown Vice'` |
| `NEIGHBORHOODS[id].gangId` | string | key into `GANGS` for the district's ruling gang |
| `NEIGHBORHOODS[id].tagline` | string | one-line slogan for the district |
| `GANGS[id].kind` | `'street' \| 'neighborhood' \| 'city'` | the gang's scale |
| `GANGS[id].neighborhoodId` | string | home district |
| `LEADERS[id].gimmick` | string | short chess-flavored play-style hook, for cards |
| `LEADERS[id].taunts` | string[] | extra in-match SMS lines (2–3 per leader) |
| `STORY.controlled` | `{ nh1..nh4: string }` | shown when a neighborhood boss falls |
| `STORY.defeat` | string[] | random line after a lost match |

Note for Economy: the gimmicks suggest bot armies, but they are only suggestions. Examples: Dez gets 2
pawns, Rusty 1 knight, Forklift heavy on rooks, Double Bishop 2 bishops, Stirrup 2 knights, The Bishop
2 bishops, Velvet a queen.

## Tips

`TIPS` has 20 loading and hub tips that mix real chess advice (develop, center, castle, forks, bishop pair,
trade when ahead, avoid stalemate, active king in the endgame) with city jokes and campaign hints
(turf income, defense cash, puzzles as side hustles).
