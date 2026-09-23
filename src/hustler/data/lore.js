// HUSTLER MODE — lore data (owned by the Lore agent).
// Contract: docs/hustler/HUSTLER_SPEC.md §4.1. Human-readable bible: docs/hustler/LORE.md.
//
// Piece vocabulary used in the writing (matches the rest of the game):
//   pawn = Street Thug · knight = Sport Bike · bishop = Touring Car · rook = Armored Truck
//   queen = Heli · king = The Boss
//
// OPTIONAL extra fields (safe to ignore; documented in LORE.md):
//   CITY.region, CITY.downtownName
//   NEIGHBORHOODS[id].gangId, NEIGHBORHOODS[id].tagline
//   GANGS[id].neighborhoodId, GANGS[id].kind ('street' | 'neighborhood' | 'city')
//   LEADERS[id].gimmick   short chess-flavored hook shown under the blurb
//   LEADERS[id].taunts    extra in-match SMS lines (array of short strings)
//   STORY.controlled      { nh1..nh4 } line shown when a neighborhood boss falls
//   STORY.defeat          lines for a lost boss/city fight (random pick)

export const CITY = {
  name: 'Vice City',
  region: 'Leonida',
  downtownName: 'Downtown Vice',
  tagline: 'Sixty-four squares of sunshine. Every one of them is taken.',
  blurb:
    'Palm trees, pastel condos and a skyline built on bad decisions. Every street in Vice City belongs to somebody — ' +
    'and the only way to change the deed is across a chessboard.',
};

export const PLAYER_DEFAULT_GANG = 'The Gambit Crew';

// Colors are chosen to read on a dark night map and stay clear of the player's teal (#2de2e6) / pink (#ff3ea5).
export const NEIGHBORHOODS = {
  nh1: {
    name: 'Sunset Strand',
    gangId: 'strand_rats',
    tagline: 'Where hustles go to get a tan.',
    blurb:
      'Sun-bleached strip malls, a sticky boardwalk and a pier held together by gum. The crime here is small, loud ' +
      'and mostly involves knockoff sunglasses.',
    vibe: 'sunburnt, scrappy, loud',
    colors: { primary: '#ff9f1c', accent: '#ffe29a' },
  },
  nh2: {
    name: 'Rustwater Docks',
    gangId: 'local_64',
    tagline: 'Everything arrives here. Nothing gets inspected.',
    blurb:
      'Cranes, containers and a canal that glows at night for reasons nobody investigates. The union runs the ' +
      'port, the port runs the city, and the forklifts run on spite.',
    vibe: 'rusted, heavy, blue-collar',
    colors: { primary: '#3d8bff', accent: '#ffb347' },
  },
  nh3: {
    name: 'Neon Mile',
    gangId: 'velvet_syndicate',
    tagline: 'Bottle service for your bad ideas.',
    blurb:
      'Clubs, casinos and a drag strip that doubles as a boulevard on weekdays. The money is loud, the lights are ' +
      'louder, and the velvet rope is the most guarded border in Leonida.',
    vibe: 'neon, flashy, after-hours',
    colors: { primary: '#a259ff', accent: '#f9f871' },
  },
  nh4: {
    name: 'Crown Hills',
    gangId: 'crown_hoa',
    tagline: 'Gated. Guarded. Governed by bylaws.',
    blurb:
      'Mansions on the ridge, hedges trimmed with lasers, and an HOA that has quietly annexed three police ' +
      'precincts. Up here nobody shoots. They just make sure you were never here.',
    vibe: 'gated, cold, old money',
    colors: { primary: '#e5383b', accent: '#f4ede0' },
  },
  downtown: {
    name: 'Downtown Vice',
    gangId: 'cartel_nocturno',
    tagline: 'One tower. One boss. One very long game.',
    blurb:
      'Glass towers and gold lobbies around Nocturno Tower, the tallest thing in Leonida. Every hustle in the city ' +
      'pays tribute up here eventually.',
    vibe: 'glass, gold, untouchable',
    colors: { primary: '#b8ff3c', accent: '#e8b923' },
  },
};

export const STREETS = {
  nh1_s1: {
    name: 'Coquina Plaza Lot',
    blurb: 'A strip-mall parking lot between a vape shop and a closed tanning salon. Surprisingly contested real estate.',
  },
  nh1_s2: {
    name: 'Boardwalk Row',
    blurb: 'Airbrushed tees, deep-fried everything and sunglasses that fall apart in the rain. Rent is paid in cash and sunburn.',
  },
  nh1_s3: {
    name: 'Pelican Pier',
    blurb: 'Bait shops, jet-ski rentals and one very aggressive pelican. Whoever owns the pier owns the tourist money.',
  },
  nh2_s1: {
    name: 'Container Row',
    blurb: 'A maze of stacked shipping boxes where Armored Trucks idle like guard dogs. Lanes open and close by the hour.',
  },
  nh2_s2: {
    name: 'Customs Wharf',
    blurb: 'The official inspection point for everything entering Vice City. Officially.',
  },
  nh2_s3: {
    name: 'Scrapyard Lane',
    blurb: 'Rows of crushed cars and a crane with a magnet the size of a hot tub. If it is left hanging, it gets taken.',
  },
  nh3_s1: {
    name: 'Flamingo Boulevard',
    blurb: 'Club row. Pink neon, bass you feel in your teeth, and a line around the block for a club with no name.',
  },
  nh3_s2: {
    name: 'Ocean Mile Drag',
    blurb: 'A straight boulevard by day, a street-racing strip by night. The cops time the races for fun.',
  },
  nh3_s3: {
    name: 'Mirage Row',
    blurb: 'Casinos, crypto lounges and a bank that is just a vending machine. Money here moves fast and never lands.',
  },
  nh4_s1: {
    name: 'Gatehouse Road',
    blurb: 'The only road into Crown Hills. Three checkpoints, two moats and a guard who remembers faces.',
  },
  nh4_s2: {
    name: 'Polo Grounds Lane',
    blurb: 'Private stables, a polo field and a garage full of superbikes named after horses. Hooves or wheels, it all jumps.',
  },
  nh4_s3: {
    name: 'Sermon Hill Drive',
    blurb: 'A megachurch with a helipad, a TV studio and a parking lot full of gold Touring Cars. Donations are mandatory.',
  },
};

export const GANGS = {
  // Neighborhood gangs
  strand_rats: {
    name: 'The Strand Rats',
    kind: 'neighborhood',
    neighborhoodId: 'nh1',
    blurb: 'Beach hustlers, sunglass pirates and parking-lot kings. More mouth than muscle, but a lot of mouth.',
    colors: { primary: '#ff9f1c', accent: '#ffe29a' },
  },
  local_64: {
    name: 'Longshore Local 64',
    kind: 'neighborhood',
    neighborhoodId: 'nh2',
    blurb: 'Sixty-four members, one for every square. A dockworkers’ union that smuggles on the side, or the other way round.',
    colors: { primary: '#3d8bff', accent: '#ffb347' },
  },
  velvet_syndicate: {
    name: 'The Velvet Syndicate',
    kind: 'neighborhood',
    neighborhoodId: 'nh3',
    blurb: 'Club owners, promoters and money launderers in very nice shoes. They own the night and rent it back to you.',
    colors: { primary: '#a259ff', accent: '#f9f871' },
  },
  crown_hoa: {
    name: 'Crown Hills HOA',
    kind: 'neighborhood',
    neighborhoodId: 'nh4',
    blurb: 'A homeowners’ association with a private army. They fine you for your mailbox, then for existing.',
    colors: { primary: '#e5383b', accent: '#f4ede0' },
  },
  cartel_nocturno: {
    name: 'Cartel Nocturno',
    kind: 'city',
    neighborhoodId: 'downtown',
    blurb: 'Matte black, gold trim, acid-green eyes in the dark. The syndicate every other gang in Vice City pays.',
    colors: { primary: '#b8ff3c', accent: '#e8b923' },
  },
  // Street crews
  pier_patrol: {
    name: 'The Pier Patrol',
    kind: 'street',
    neighborhoodId: 'nh1',
    blurb: 'One jet-ski rental, one guy, one very loyal pelican. Legally a "fleet".',
    colors: { primary: '#ffd166', accent: '#06a77d' },
  },
  magnet_boys: {
    name: 'The Magnet Boys',
    kind: 'street',
    neighborhoodId: 'nh2',
    blurb: 'Chop-shop crew that runs the scrapyard crane. If your piece is hanging, it is already theirs.',
    colors: { primary: '#8d99ae', accent: '#ff6b35' },
  },
  apex_angels: {
    name: 'The Apex Angels',
    kind: 'street',
    neighborhoodId: 'nh3',
    blurb: 'Street racers who only drive diagonally. Nobody knows how. Nobody asks.',
    colors: { primary: '#ff5d8f', accent: '#caffbf' },
  },
  stirrup_club: {
    name: 'The Stirrup Club',
    kind: 'street',
    neighborhoodId: 'nh4',
    blurb: 'Polo heirs and superbike collectors. Membership requires a horse, a bike and a trust fund.',
    colors: { primary: '#bc6c25', accent: '#fefae0' },
  },
};

export const LEADERS = {
  // ─── nh1 · Sunset Strand (tier 1: small-time, comedic) ───────────────────────
  nh1_s1: {
    name: 'Desmond Varga',
    alias: 'Two-Pawn Dez',
    title: 'Parking Lot Boss',
    gangId: 'strand_rats',
    blurb:
      'Owns two Street Thugs, one folding chair and the loudest mouth on the Strand. Calls the parking lot his "empire".',
    gimmick: 'Army of two pawns. Talks like he has twenty.',
    portrait: { initials: 'DV', emoji: '📣', bg: '#ff9f1c', fg: '#1a1a2e' },
    lines: {
      intro: 'This lot is MINE. Me and my two guys run it. Both of them.',
      playerWins: 'Okay, okay. Keep the lot. The vape shop owes you forty bucks.',
      playerLoses: 'HA! Two pawns! TWO! Tell your friends!',
      challenge: 'I got my two guys back from lunch. Parking lot rematch, now.',
      defended: 'Fine. Both my guys quit. You happy?',
    },
    taunts: ['Pawns are the soul of chess. I read that on a napkin.', 'My cousin says you’re soft.'],
  },
  nh1_s2: {
    name: 'Brenda Okafor',
    alias: 'Flip-Flop',
    title: 'Boardwalk Boss',
    gangId: 'strand_rats',
    blurb:
      'Sells "Ray-Bands" and "Oakleez" off a folding table. Hasn’t left her beach umbrella since 2019 and neither has her Boss.',
    gimmick: 'Never moves her King. "The Boss stays in the shade."',
    portrait: { initials: 'BO', emoji: '🕶️', bg: '#ffe29a', fg: '#7a2e00' },
    lines: {
      intro: 'Five bucks a pair, ten for the board. You want the board? Play for it.',
      playerWins: 'My Boss never left the shade. Maybe that was the problem.',
      playerLoses: 'Take a pair of shades on your way out. You’ll need them to hide.',
      challenge: 'Somebody’s selling on my boardwalk. It’s you. Stop that.',
      defended: 'Fine. Keep the boardwalk. The sunglasses were fake anyway.',
    },
    taunts: ['UV protection? Baby, this is chess protection.', 'Don’t touch the merchandise.'],
  },
  nh1_s3: {
    name: 'Rusty Mulroney',
    alias: 'Captain Jet Ski',
    title: 'Pier Boss',
    gangId: 'pier_patrol',
    blurb:
      'Runs one rented Sport Bike he calls "the fleet" and a bait shop that sells mostly lottery tickets. His pelican does the enforcing.',
    gimmick: 'One knight, big dreams. Every move is a "maneuver".',
    portrait: { initials: 'RM', emoji: '🛥️', bg: '#06a77d', fg: '#ffd166' },
    lines: {
      intro: 'You’re trespassing on a naval facility. It’s a pier. Same thing.',
      playerWins: 'Abandon ship! ...It’s a pier. We’re just gonna stand here.',
      playerLoses: 'The fleet remains undefeated. The fleet is one bike.',
      challenge: 'The fleet has been refueled. Prepare to be boarded.',
      defended: 'Retreat! The pelican’s hungry and I’m out of bait.',
    },
    taunts: ['Knight to... somewhere wet.', 'That pelican has a record, you know.'],
  },
  nh1_boss: {
    name: 'Reginald Fontaine',
    alias: 'The Mayor',
    title: 'Boss of Sunset Strand',
    gangId: 'strand_rats',
    blurb:
      'A former timeshare salesman who declared himself Mayor of the Strand. No election, no office, one very firm handshake.',
    gimmick: 'Pawn chains. "Every square is prime oceanfront property."',
    portrait: { initials: 'RF', emoji: '🏖️', bg: '#ff7b00', fg: '#fff3d6' },
    lines: {
      intro: 'Friend! Sit down. Let me show you a presentation about losing.',
      playerWins: 'I’m… prepared to offer you the whole Strand. Non-refundable.',
      playerLoses: 'Sign here, here and here. Congratulations, you own nothing.',
      challenge: 'Your lease on my Strand has expired. Collections is on the way.',
      defended: 'I’ll be back with a better offer. And a bigger pawn chain.',
    },
    taunts: ['Location, location, checkmate.', 'Every square’s a time-share. I own all the weeks.'],
  },

  // ─── nh2 · Rustwater Docks (tier 2: heavy industry) ──────────────────────────
  nh2_s1: {
    name: 'Frankie Dunn',
    alias: 'Forklift',
    title: 'Yard Boss',
    gangId: 'local_64',
    blurb:
      'Twenty years moving containers, ten years moving product in them. Talks to his Armored Trucks like they’re family.',
    gimmick: 'Loves his rooks. Doubles them on any open lane he can find.',
    portrait: { initials: 'FD', emoji: '🚚', bg: '#3d8bff', fg: '#0b1a33' },
    lines: {
      intro: 'Open lane, two trucks, no brakes. Your move, pal.',
      playerWins: 'You parked on my lane. Nobody parks on my lane.',
      playerLoses: 'Beep beep. That’s the sound of you backing out.',
      challenge: 'My trucks want their lanes back. Clear the row.',
      defended: 'Shift’s over. I’m clocking out. This isn’t over.',
    },
    taunts: ['Rooks on the seventh. Trucks in your living room.', 'Safety first. Your safety, not so much.'],
  },
  nh2_s2: {
    name: 'Carmen Ruiz',
    alias: 'Customs',
    title: 'Wharf Boss',
    gangId: 'local_64',
    blurb:
      'The most corrupt inspector in Leonida, and she’s proud of it. Everything that crosses her board pays a tariff.',
    gimmick: 'Trades everything. "Piece for piece, paperwork for paperwork."',
    portrait: { initials: 'CR', emoji: '📋', bg: '#ffb347', fg: '#10233f' },
    lines: {
      intro: 'Anything to declare? No? Then everything is mine.',
      playerWins: 'Fine. Stamped, cleared, released. Get out of my wharf.',
      playerLoses: 'Confiscated. All of it. Including your dignity.',
      challenge: 'Your paperwork on that street is… irregular. I’m coming to inspect.',
      defended: 'Inspection postponed. Indefinitely. Don’t get comfortable.',
    },
    taunts: ['Even trade. I love an even trade.', 'That piece has no receipt. Seized.'],
  },
  nh2_s3: {
    name: 'Otis Greer',
    alias: 'Magnet',
    title: 'Scrapyard Boss',
    gangId: 'magnet_boys',
    blurb:
      'Runs the chop shop and the crane with the giant magnet. Can smell an undefended piece from three containers away.',
    gimmick: 'Punishes hanging pieces. Leave something loose and it’s scrap.',
    portrait: { initials: 'OG', emoji: '🧲', bg: '#8d99ae', fg: '#ff6b35' },
    lines: {
      intro: 'Anything you leave hanging, I pick up. That’s the whole business.',
      playerWins: 'Nothing loose, nothing to grab. You’re no fun.',
      playerLoses: 'Crushed into a cube. I’ll use you as a doorstop.',
      challenge: 'Heard you’ve got loose parts lying around my old lane.',
      defended: 'Magnet’s broken. Must be the heat. I’ll be back.',
    },
    taunts: ['Is that piece protected? Didn’t think so.', 'Clunk. Mine now.'],
  },
  nh2_boss: {
    name: 'Harlan Voss',
    alias: 'The Foreman',
    title: 'Boss of Rustwater Docks',
    gangId: 'local_64',
    blurb:
      'President of Longshore Local 64. Sixty-four squares, sixty-four members, zero days off. Solid as a dry dock and twice as patient.',
    gimmick: 'Closed, grinding positions. Waits for you to crack.',
    portrait: { initials: 'HV', emoji: '🏗️', bg: '#1d4ed8', fg: '#ffb347' },
    lines: {
      intro: 'Every crate in this port moves because I say so. Including you.',
      playerWins: 'Union vote’s in. The docks are yours. I voted no.',
      playerLoses: 'Back of the line, rookie. Seniority matters here.',
      challenge: 'The Local wants its port back. Strike starts now.',
      defended: 'The Local will remember this. The Local remembers everything.',
    },
    taunts: ['Slow and heavy. Like the tide.', 'You’re on my clock now.'],
  },

  // ─── nh3 · Neon Mile (tier 2: nightlife & money) ─────────────────────────────
  nh3_s1: {
    name: 'Kenji Alvarado',
    alias: 'DJ Kilowatt',
    title: 'Club Row Boss',
    gangId: 'velvet_syndicate',
    blurb:
      'Resident DJ at every club on Flamingo Boulevard, including the ones that don’t exist. Plays fast, drops the bass, drops pieces.',
    gimmick: 'Blitz tempo. Moves on the beat and dares you to keep up.',
    portrait: { initials: 'KA', emoji: '🎧', bg: '#a259ff', fg: '#f9f871' },
    lines: {
      intro: 'You’re not on the list. But I’ll let you in to lose.',
      playerWins: 'Crowd’s chanting your name. I hate this song.',
      playerLoses: 'Mic drop. Board drop. You drop.',
      challenge: 'Flamingo misses my sound. Turning it back up.',
      defended: 'Set’s over. Lights up. Everybody go home.',
    },
    taunts: ['Tempo, baby. Feel it.', 'That move was off-beat.'],
  },
  nh3_s2: {
    name: 'Valentina Cruz',
    alias: 'Double Bishop',
    title: 'Drag Strip Boss',
    gangId: 'apex_angels',
    blurb:
      'Queen of the Ocean Mile night races. Drives two gold Touring Cars at once, diagonally, and has never taken a straight line in her life.',
    gimmick: 'The bishop pair. Long diagonals, open roads, no brakes.',
    portrait: { initials: 'VC', emoji: '🏎️', bg: '#ff5d8f', fg: '#1b0a2e' },
    lines: {
      intro: 'Straight lines are for tourists. Try to keep up on the diagonal.',
      playerWins: 'You cut the corner. Respect. I still want a rematch.',
      playerLoses: 'You got drifted on. Both lanes. Both colors.',
      challenge: 'My cars miss that strip. Green light in three… two…',
      defended: 'Blew a tire. Blaming the road. See you next race.',
    },
    taunts: ['Light squares, dark squares. I own both.', 'Drift check.'],
  },
  nh3_s3: {
    name: 'Trent Blakely',
    alias: 'The Whale',
    title: 'Casino Row Boss',
    gangId: 'velvet_syndicate',
    blurb:
      'Crypto millionaire, casino whale, owner of a digital picture of a yacht. Sacrifices pieces like they’re airdrops.',
    gimmick: 'Wild gambits. Throws material at you and calls it "investing".',
    portrait: { initials: 'TB', emoji: '🐋', bg: '#f9f871', fg: '#3a0ca3' },
    lines: {
      intro: 'I’m going all in. I’m always all in. It’s a lifestyle.',
      playerWins: 'That wasn’t a loss. It was a strategic dip.',
      playerLoses: 'To the moon! You, meanwhile, to the curb.',
      challenge: 'Market says Mirage Row is undervalued. Buying back in.',
      defended: 'Rug pulled. Mine, this time. Weird feeling.',
    },
    taunts: ['Sacrifice? No. Liquidity event.', 'Diamond hands, wooden pieces.'],
  },
  nh3_boss: {
    name: 'Vivienne Sol',
    alias: 'Velvet',
    title: 'Queen of the Neon Mile',
    gangId: 'velvet_syndicate',
    blurb:
      'Owns every rope, every door and every bottle on the Mile. Her Heli never leaves the VIP section — until the moment it does.',
    gimmick: 'Queen play. Holds her Heli back, then sends it in for the kill.',
    portrait: { initials: 'VS', emoji: '🍸', bg: '#6a00f4', fg: '#f9f871' },
    lines: {
      intro: 'Darling, you’re underdressed for this board.',
      playerWins: 'The Mile is yours. Try not to make it tacky.',
      playerLoses: 'Security will show you out. Through the back.',
      challenge: 'You’ve been running my Mile like a bus stop. That ends tonight.',
      defended: 'Keep it, then. I was redecorating anyway.',
    },
    taunts: ['My Heli is on the guest list. You are not.', 'Cute move. Very… affordable.'],
  },

  // ─── nh4 · Crown Hills (tier 3: gated power, menacing) ───────────────────────
  nh4_s1: {
    name: 'Bernard Ashby',
    alias: 'The Gatekeeper',
    title: 'Chief of Security',
    gangId: 'crown_hoa',
    blurb:
      'Ex-military, current HOA security chief, lifelong fan of walls. Nobody has entered Crown Hills uninvited in eleven years.',
    gimmick: 'Fortress defense. Castles early and builds a wall of Thugs.',
    portrait: { initials: 'BA', emoji: '🚧', bg: '#e5383b', fg: '#f4ede0' },
    lines: {
      intro: 'Name? Resident code? No? Then turn your car around.',
      playerWins: 'Gate’s open. I’ll be filing a report about myself.',
      playerLoses: 'Access denied. Permanently.',
      challenge: 'Unauthorized residents detected on Gatehouse Road. Removing them.',
      defended: 'Perimeter breached. Reinforcing. Expect me.',
    },
    taunts: ['Walls work. Ask anyone outside them.', 'I see everything. Including that blunder.'],
  },
  nh4_s2: {
    name: 'Sebastian Whitcombe III',
    alias: 'Stirrup',
    title: 'Master of the Polo Grounds',
    gangId: 'stirrup_club',
    blurb:
      'Polo heir obsessed with horses and superbikes, which he refuses to tell apart. Names every Sport Bike after a racehorse.',
    gimmick: 'Knight fanatic. Forks, jumps and "cavalry charges" everywhere.',
    portrait: { initials: 'SW', emoji: '🐎', bg: '#bc6c25', fg: '#fefae0' },
    lines: {
      intro: 'Meet Duchess and Thunderhoof. They’re bikes. They’re also horses.',
      playerWins: 'Put Duchess out to pasture. Tell Father nothing.',
      playerLoses: 'Forked! Tally-ho! Somebody fetch my trophy.',
      challenge: 'The Club is riding out to reclaim the lane. Saddle up.',
      defended: 'Thunderhoof threw a chain. Or a shoe. One of those.',
    },
    taunts: ['Nothing jumps like good breeding.', 'Fork. Tally-ho.'],
  },
  nh4_s3: {
    name: 'Silas Crane',
    alias: 'The Bishop',
    title: 'Prosperity Preacher',
    gangId: 'crown_hoa',
    blurb:
      'TV prosperity preacher with a helipad and a fleet of gold Touring Cars. Every sermon ends with a card reader.',
    gimmick: 'Bishops on long diagonals, "blessing" both wings of the board.',
    portrait: { initials: 'SC', emoji: '📺', bg: '#f4ede0', fg: '#9d0208' },
    lines: {
      intro: 'Brother, your army looks tired. Have you considered tithing it to me?',
      playerWins: 'The collection plate is… yours. Tell no one. Especially the cameras.',
      playerLoses: 'Blessed be the house. The house always wins.',
      challenge: 'The Hill has been praying for your eviction. Prayers answered.',
      defended: 'A test of faith. I will return with more Touring Cars.',
    },
    taunts: ['Diagonal is the righteous path.', 'Tap your card to receive forgiveness.'],
  },
  nh4_boss: {
    name: 'Cordelia Vance-Ashgrove',
    alias: 'The Chairwoman',
    title: 'Boss of Crown Hills',
    gangId: 'crown_hoa',
    blurb:
      'Chair of the Crown Hills HOA for twenty-two years. She doesn’t threaten, she cites bylaws. Then people move away.',
    gimmick: 'Zugzwang specialist. Makes every legal move a violation.',
    portrait: { initials: 'CV', emoji: '🏛️', bg: '#9d0208', fg: '#f4ede0' },
    lines: {
      intro: 'You are in violation of Section 4, Subsection Checkmate.',
      playerWins: 'The board will… review this. The Hills are yours. For now.',
      playerLoses: 'Your membership has been revoked. And your address.',
      challenge: 'A resident has filed a complaint. The complaint is you.',
      defended: 'Motion tabled. I have infinite meetings and infinite time.',
    },
    taunts: ['Every move you make is a fine.', 'Your pieces are an eyesore.'],
  },

  // ─── downtown · City Boss ────────────────────────────────────────────────────
  city_boss: {
    name: 'Aurelio Noche',
    alias: 'El Largo',
    title: 'City Boss',
    gangId: 'cartel_nocturno',
    blurb:
      'Head of Cartel Nocturno and owner of Nocturno Tower. He has been playing one game against Vice City for thirty years. You are move one.',
    gimmick: 'Plays the long game. Never rushes, never forgets, never blunders twice.',
    portrait: { initials: 'AN', emoji: '⌛', bg: '#0b0b0b', fg: '#b8ff3c' },
    lines: {
      intro: 'I watched you take every street. I let you. Sit.',
      playerWins: 'Well played. The tower is yours. Mind the view — it gets lonely.',
      playerLoses: 'Thirty years. You thought one summer would do it?',
      challenge: 'Everything you own, I lent you. I’m collecting.',
      defended: 'Patience. I have more of it than you have pieces.',
    },
    taunts: ['I planned this move before you were born.', 'Every piece you take, I allowed.', 'Tick. Tock.'],
  },
};

export const STORY = {
  intro: [
    'You roll into Vice City with a Boss, a borrowed car and barely enough cash for two Street Thugs.',
    'Every street here belongs to somebody. The deed changes hands one way: across a chessboard.',
    'Start small on the Sunset Strand. Hire a crew, win a lot, collect the rent.',
    'Somewhere at the top of Nocturno Tower, somebody is already watching.',
  ],
  unlocks: {
    nh2: 'The Mayor folded. Word hits the docks: a new crew is moving product through the Strand. Rustwater Docks is open.',
    nh3: 'The Neon Mile heard you’re buying rounds with the Mayor’s money. The velvet rope just lifted. Neon Mile is open.',
    nh4: 'The Docks and the Mile both answer to you now. An embossed letter arrives from Crown Hills: "Please don’t." Crown Hills is open.',
    downtown: 'The HOA has been dissolved. Your phone lights up with a private number: "Nocturno Tower. Top floor. Come alone." Downtown Vice is open.',
  },
  controlled: {
    nh1: 'Sunset Strand is yours. The boardwalk now sells sunglasses with YOUR logo on them. They’re still fake.',
    nh2: 'Rustwater Docks is yours. The Local held a vote. You won it by one vote. Yours.',
    nh3: 'The Neon Mile is yours. Your name is on the velvet rope now. So is the bill.',
    nh4: 'Crown Hills is yours. The HOA sends a fruit basket and a very polite fine.',
  },
  defeat: [
    'Mission failed. The street keeps its owner for now. Regroup, rehire, return.',
    'WASTED. Your crew scatters. Your Boss limps home. The city laughs, but not for long.',
    'Lost this one. Every legend in Vice City lost a few before they owned a block.',
  ],
  finale: [
    'El Largo tips his king over and slides the tower keys across the board.',
    '"Thirty years," he says. "Now you get to find out how heavy they are."',
    'From the top of Nocturno Tower, every light in Vice City is yours — the Strand, the Docks, the Mile, the Hills.',
    'Mission passed. Respect: maximum. The city has a new Boss.',
  ],
};

export const TIPS = [
  'Two Street Thugs and a big mouth can hold a parking lot. They can’t hold a city.',
  'Develop your Sport Bikes and Touring Cars before you brag on social media.',
  'Control the center. It’s where all the good clubs are.',
  'A Touring Car pair on open diagonals is worth more than the sum of its paint jobs.',
  'Armored Trucks love open lanes. Double them up and park on the 7th rank.',
  'Sport Bikes fork. Two targets, one jump, zero insurance.',
  'Castle early. The Boss belongs behind an Armored Truck, not on the boardwalk.',
  'Don’t leave pieces hanging near Scrapyard Lane. The magnet is always on.',
  'Before every move, ask: what does the other crew want? Then ruin it.',
  'Checks, captures, threats — read them in that order, like a rap sheet.',
  'Don’t bring out the Heli too early. Every Street Thug in town will take a swing at it.',
  'Hired muscle is paid per job. Budget your crew like rent is due. Because it is.',
  'A Thug that walks the whole city gets promoted. Crime pays, eventually.',
  'Up material? Trade down. Down material? Make it messy.',
  'Stalemate means nobody gets paid. Leave the enemy Boss a way to move until you mean it.',
  'Owned streets pay rent every game. Protect the portfolio.',
  'Rivals will come back for their turf. Keep some cash for a defense crew.',
  'Puzzles are side hustles. Small money, sharp brain.',
  'In the endgame, The Boss stops hiding and starts walking. Put him to work.',
  'The Cartel didn’t build Nocturno Tower in a day. Neither will you.',
];
