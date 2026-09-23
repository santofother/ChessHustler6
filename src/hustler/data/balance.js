// Hustler Mode — economy & difficulty data (owned by the Economy agent).
// Contract: docs/hustler/HUSTLER_SPEC.md §4.2. Plain-language rules: docs/hustler/ECONOMY.md.
// Validated by tools/hustler_sim.mjs (node tools/hustler_sim.mjs --help).
//
// Everything here is pure data (+ two tiny pure helpers at the bottom). No imports, no side effects.

/** Cash in the player's pocket when a new campaign starts: 2 pawns + change. */
export const START_CASH = 2500;

/** Recruit prices. The King ("the Boss") is free and mandatory. Same scale as GameController CASH. */
export const PRICES = { p: 1000, n: 3000, b: 3000, r: 5000, q: 9000 };

/** Max pieces of each type the player may hire for one match (never more than a real chess set). */
export const MAX_ARMY = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/**
 * Bot profiles, consumed by ai.getBestMove(fen, profile) (spec §4.3).
 *  maxDepth      0..4 plies of alpha-beta. 0 = no search (random legal move, see captureBias).
 *  timeMs        search time budget (ms) — same meaning as LEVELS[x].budget in engine.js.
 *  quiescence    capture-search at the leaves (big strength jump: stops hanging pieces).
 *  noiseCp       +-random centipawns added to each root move's score (LEVELS[x].noise).
 *  randomChance  chance per move to pick uniformly among the topN root moves (LEVELS[x].randomChance).
 *  topN          size of that pool (LEVELS[x].randomTop).
 *  blunderChance chance per move to ignore the search and play a uniformly random legal move.
 * ADDED field (documented in ECONOMY.md):
 *  captureBias   maxDepth 0 only: chance per move to pick a random *capture* when one exists
 *                (otherwise a uniformly random legal move).
 * Implementation hint: depth>=1 profiles map 1:1 onto an engine.js LEVELS entry
 *   { depth:maxDepth, quiesce:quiescence, budget:timeMs, noise:noiseCp, randomTop:topN, randomChance }
 * plus the blunderChance coin flip before searching (this is exactly what tools/hustler_sim.mjs does).
 */
export const BOT_PROFILES = {
  lookout: {
    label: 'Lookout',
    maxDepth: 0, timeMs: 0, quiescence: false, noiseCp: 0, randomChance: 0, topN: 0, blunderChance: 0, // no search
    captureBias: 0.35,
  },
  corner_kid: {
    label: 'Corner Kid',
    maxDepth: 0, timeMs: 0, quiescence: false, noiseCp: 0, randomChance: 0, topN: 0, blunderChance: 0, // no search
    captureBias: 0.8,
  },
  runner: {
    label: 'Runner',
    maxDepth: 1, timeMs: 150, quiescence: false, noiseCp: 120, randomChance: 0.45, topN: 6, blunderChance: 0.25,
  },
  enforcer: {
    label: 'Enforcer',
    maxDepth: 1, timeMs: 200, quiescence: false, noiseCp: 80, randomChance: 0.35, topN: 5, blunderChance: 0.12,
  },
  // gimmick profiles (lore: DJ Kilowatt = blitz, Magnet = punishes loose pieces, The Whale = wild gambits)
  blitzer: {
    label: 'Blitzer',
    maxDepth: 2, timeMs: 60, quiescence: false, noiseCp: 70, randomChance: 0.25, topN: 4, blunderChance: 0.1,
  },
  hawk: {
    label: 'Hawk',
    maxDepth: 1, timeMs: 250, quiescence: true, noiseCp: 60, randomChance: 0.15, topN: 3, blunderChance: 0.08,
  },
  gambler: {
    label: 'Gambler',
    maxDepth: 2, timeMs: 400, quiescence: false, noiseCp: 150, randomChance: 0.3, topN: 4, blunderChance: 0.06,
  },
  lieutenant: {
    label: 'Lieutenant',
    maxDepth: 2, timeMs: 400, quiescence: false, noiseCp: 60, randomChance: 0.2, topN: 3, blunderChance: 0.08,
  },
  captain: {
    label: 'Captain',
    maxDepth: 2, timeMs: 500, quiescence: true, noiseCp: 40, randomChance: 0.08, topN: 3, blunderChance: 0.05,
  },
  kingpin: {
    label: 'Kingpin',
    maxDepth: 3, timeMs: 1200, quiescence: true, noiseCp: 25, randomChance: 0, topN: 0, blunderChance: 0.03,
  },
  shot_caller: {
    label: 'Shot Caller',
    maxDepth: 3, timeMs: 1500, quiescence: true, noiseCp: 10, randomChance: 0, topN: 0, blunderChance: 0.015,
  },
  don: {
    label: 'The Don',
    maxDepth: 4, timeMs: 2500, quiescence: true, noiseCp: 0, randomChance: 0, topN: 0, blunderChance: 0,
  },
};

// ---- helpers used to build the node table (kept explicit in the objects below for readability) ----------
const army = (p = 0, n = 0, b = 0, r = 0, q = 0) => ({ p, n, b, r, q });
/** Capture bounty = share of the piece's recruit price. Tier 1 pays the biggest share (cheap armies). */
const bounty = (rate) => ({
  p: Math.round((PRICES.p * rate) / 50) * 50,
  n: Math.round((PRICES.n * rate) / 50) * 50,
  b: Math.round((PRICES.b * rate) / 50) * 50,
  r: Math.round((PRICES.r * rate) / 50) * 50,
  q: Math.round((PRICES.q * rate) / 50) * 50,
});
const B1 = bounty(0.5); // { p:500,  n:1500, b:1500, r:2500, q:4500 }
const B2 = bounty(0.4); // { p:400,  n:1200, b:1200, r:2000, q:3600 }
const B3 = bounty(0.35); // { p:350, n:1050, b:1050, r:1750, q:3150 }
const BC = bounty(0.3); // { p:300,  n:900,  b:900,  r:1500, q:2700 }

/**
 * All 17 campaign nodes. ADDED fields (documented in ECONOMY.md):
 *  stars    1..5 difficulty shown on the map card (view.nodes[].difficulty).
 *  defense  { bot, army, reward } — the raiding party a rival sends when this node is challenged
 *           (player defends with any army they buy; `reward` is the flat cash for holding it).
 *           null = can never be challenged.
 */
export const NODES = {
  // ---------------- Tier 1 — nh1 (open from the start). Pawn wars. ----------------
  nh1_s1: { // Two-Pawn Dez: "army of two pawns"
    tier: 1, stars: 1, bot: 'lookout', army: army(2),
    reward: { win: 3000, standoff: 500 }, captureBounty: B1, income: 300,
    recommended: army(2),
    defense: { bot: 'corner_kid', army: army(2), reward: 1500 },
  },
  nh1_s2: { // never moves her King
    tier: 1, stars: 1, bot: 'corner_kid', army: army(3),
    reward: { win: 3500, standoff: 600 }, captureBounty: B1, income: 300,
    recommended: army(3),
    defense: { bot: 'corner_kid', army: army(3), reward: 1500 },
  },
  nh1_s3: { // Captain Jet Ski: one knight ("the fleet")
    tier: 1, stars: 2, bot: 'runner', army: army(2, 1),
    reward: { win: 4500, standoff: 900 }, captureBounty: B1, income: 300,
    recommended: army(4),
    defense: { bot: 'runner', army: army(2, 1), reward: 2000 },
  },
  nh1_boss: { // The Mayor: pawn chains
    tier: 1, stars: 2, bot: 'enforcer', army: army(6),
    reward: { win: 8000, standoff: 1500 }, captureBounty: B1, income: 1000,
    recommended: army(4, 1, 1),
    defense: { bot: 'enforcer', army: army(6), reward: 4000 },
  },

  // ---------------- Tier 2 — nh2 & nh3. Minor pieces arrive. ----------------
  nh2_s1: { // Forklift: doubled rooks (weak bot, heavy but clumsy pieces)
    tier: 2, stars: 2, bot: 'runner', army: army(3, 0, 0, 2),
    reward: { win: 6000, standoff: 1200 }, captureBounty: B2, income: 500,
    recommended: army(4, 1, 1),
    defense: { bot: 'runner', army: army(3, 0, 0, 2), reward: 3000 },
  },
  nh2_s2: { // trades everything
    tier: 2, stars: 3, bot: 'enforcer', army: army(5, 1, 1),
    reward: { win: 6500, standoff: 1300 }, captureBounty: B2, income: 500,
    recommended: army(5, 2, 1),
    defense: { bot: 'enforcer', army: army(5, 1, 1), reward: 3000 },
  },
  nh2_s3: { // Magnet: punishes hanging pieces (quiescence)
    tier: 2, stars: 3, bot: 'hawk', army: army(5, 1),
    reward: { win: 7000, standoff: 1400 }, captureBounty: B2, income: 500,
    recommended: army(5, 1, 1),
    defense: { bot: 'hawk', army: army(5, 1), reward: 3500 },
  },
  nh2_boss: { // closed, grinding positions
    tier: 2, stars: 3, bot: 'lieutenant', army: army(7, 1, 1, 1),
    reward: { win: 14000, standoff: 2800 }, captureBounty: B2, income: 1800,
    recommended: army(6, 2, 2, 1),
    defense: { bot: 'lieutenant', army: army(7, 1, 1, 1), reward: 7000 },
  },
  nh3_s1: { // DJ Kilowatt: blitz tempo
    tier: 2, stars: 2, bot: 'blitzer', army: army(4, 0, 1),
    reward: { win: 6000, standoff: 1200 }, captureBounty: B2, income: 500,
    recommended: army(4, 1, 1),
    defense: { bot: 'blitzer', army: army(4, 0, 1), reward: 3000 },
  },
  nh3_s2: { // Double Bishop: the bishop pair
    tier: 2, stars: 3, bot: 'enforcer', army: army(5, 0, 2),
    reward: { win: 6500, standoff: 1300 }, captureBounty: B2, income: 500,
    recommended: army(5, 1, 2),
    defense: { bot: 'enforcer', army: army(5, 0, 2), reward: 3000 },
  },
  nh3_s3: { // The Whale: wild gambits (high noise)
    tier: 2, stars: 3, bot: 'gambler', army: army(5, 1, 1),
    reward: { win: 7000, standoff: 1400 }, captureBounty: B2, income: 500,
    recommended: army(5, 1, 2),
    defense: { bot: 'gambler', army: army(5, 1, 1), reward: 3500 },
  },
  nh3_boss: { // Velvet: queen play
    tier: 2, stars: 3, bot: 'lieutenant', army: army(6, 0, 1, 0, 1),
    reward: { win: 14000, standoff: 2800 }, captureBounty: B2, income: 1800,
    recommended: army(6, 2, 2, 1),
    defense: { bot: 'lieutenant', army: army(6, 0, 1, 0, 1), reward: 7000 },
  },

  // ---------------- Tier 3 — nh4. Rooks and the queen. ----------------
  nh4_s1: { // fortress: castles early, wall of pawns
    tier: 3, stars: 4, bot: 'captain', army: army(7, 1, 0, 1),
    reward: { win: 9000, standoff: 1800 }, captureBounty: B3, income: 800,
    recommended: army(6, 1, 1, 0, 1),
    defense: { bot: 'captain', army: army(7, 1, 0, 1), reward: 4500 },
  },
  nh4_s2: { // Stirrup: two knights
    tier: 3, stars: 4, bot: 'captain', army: army(6, 2, 0, 1),
    reward: { win: 9500, standoff: 1900 }, captureBounty: B3, income: 800,
    recommended: army(6, 1, 1, 1, 1),
    defense: { bot: 'captain', army: army(6, 2, 0, 1), reward: 4500 },
  },
  nh4_s3: { // The Bishop: two bishops on long diagonals
    tier: 3, stars: 4, bot: 'kingpin', army: army(6, 0, 2, 1),
    reward: { win: 10000, standoff: 2000 }, captureBounty: B3, income: 800,
    recommended: army(6, 1, 1, 1, 1),
    defense: { bot: 'captain', army: army(6, 0, 2, 1), reward: 5000 },
  },
  nh4_boss: { // The Chairwoman: grinding, strong
    tier: 3, stars: 5, bot: 'shot_caller', army: army(7, 2, 1, 1, 1),
    reward: { win: 18000, standoff: 3600 }, captureBounty: B3, income: 3000,
    recommended: army(8, 2, 2, 1, 1),
    defense: { bot: 'kingpin', army: army(7, 2, 1, 1, 1), reward: 9000 },
  },

  // ---------------- Final — downtown. El Largo: full army, strongest profile. ----------------
  city_boss: {
    tier: 4, stars: 5, bot: 'don', army: army(8, 2, 2, 2, 1),
    reward: { win: 100000, standoff: 10000 }, captureBounty: BC, income: 0,
    recommended: army(8, 2, 2, 2, 1),
    defense: null,
  },
};

/**
 * Passive income ("the street tax"). Credited on the Results screen of every Hustler match (attack or
 * defense), for nodes owned at the START of that match that are not currently contested.
 */
export const INCOME = {
  creditWhen: 'afterEveryMatch',
  countNodesOwnedAtMatchStart: true, // a node you just took starts paying from the next match
  contestedPays: false,               // a node under an open challenge pays nothing
  byResult: { win: 1.0, standoff: 1.0, loss: 0.5 }, // loss = your crew still collected, half of it
  minFullMoves: 10,                   // match must last >= 10 of the player's moves to pay any income
};

/**
 * Rival challenges. Rolled once after each match's Results (never after puzzles).
 * Frontier = owned node whose neighborhood touches a neighborhood (or downtown) the player does NOT control.
 */
export const CHALLENGES = {
  graceGames: 4,           // no challenge can appear before match #5
  minOwnedNodes: 2,        // ...or while the player owns fewer than 2 nodes
  baseChance: 0.15,        // chance per eligible match
  perControlledNeighborhood: 0.05,
  maxChance: 0.3,
  cooldownGames: 3,        // matches after a challenge resolves before another can roll
  maxActive: 1,            // only one open challenge at a time
  deadlineGames: 2,        // view.challenge.gamesLeft starts here; each other match played ticks it down;
                           // at 0 the node falls (same as a lost defense). "DEFEND" is always available.
  targetWeights: { street: 3, boss: 1 }, // among frontier nodes; city_boss is never a target
  frontierOnly: true,
  immunityGames: 6,        // after a successful defense that node can't be targeted for 6 matches
  attacker: 'leader of a random not-owned node in an adjacent, not-controlled neighborhood (flavor only; ' +
    'bot + army come from NODES[target].defense)',
  onWin: 'keep node; +defense.reward + capture bounties + refunds; node immune for immunityGames',
  onStandoff: 'keep node ("held the line"); +25% of defense.reward + bounties + refunds',
  standoffRewardMult: 0.25,
  onLoss: 'node lost (becomes available again); no reward; bounties still paid',
  onDecline: 'node lost immediately; no match, no money spent',
  retakeWinMult: 0.5,      // re-taking a node you lost pays 50% of reward.win (bounties/income unchanged)
  bossLossRule: 'losing a boss node drops the neighborhood to "open" (boss income stops) but unlocks are permanent',
  stopAfter: 'city_boss', // no challenges once the City Boss is beaten
};

/** Surviving hired pieces (by their type on the final board — a promoted pawn counts as its new piece). */
export const REFUNDS = {
  win: 0.5,       // resold at half price
  standoff: 0.5,
  loss: 0,        // everyone left standing gets arrested
  freePieces: 0,  // pieces given by the bankruptcy safety net are never refunded
  promotedAs: 'currentType',
};

/** Losing an ATTACK (being mated or resigning). */
export const LOSS = {
  keepSpent: false,          // the army is gone
  captureBountiesPaid: true, // pieces you took still pay
  rewardPaid: 0,
  territoryLost: false,      // attacking never costs territory — only failed defenses do
  retryAllowed: true,        // the node stays available, retry any time
  incomeMult: INCOME.byResult.loss,
};

/**
 * Puzzles: small side cash. rewardFor(puzzle, { firstTry }) =
 *   firstTry ? tier cash : tier cash * retryMult; already-solved ids pay repeatReward (0).
 * Earnings are capped per hub visit: the cap resets after every Hustler match.
 */
export const PUZZLES = {
  rewardByRating: [
    [1000, 200],
    [1400, 300],
    [1800, 450],
    [2200, 600],
    [Infinity, 800],
  ],
  retryMult: 0.5,
  repeatReward: 0,
  perSessionCap: 1500,     // max puzzle cash between two matches ("session" = one hub visit)
  capResetsOn: 'match',
};

/**
 * Safety net. At the Recruit screen, if cash < BANKRUPTCY.threshold the player gets `freePawns` pawns for
 * that match only (not refundable, no cash). Guarantees the player can always field K+2P and never soft-locks.
 */
export const BANKRUPTCY = {
  threshold: 2 * PRICES.p, // i.e. can't afford 2 pawns
  freePawns: 2,
  label: "Mama's Loan",
  message: 'Mama spotted you two cousins. Pay her back by winning.',
  minArmy: 1,              // Recruit requires at least one non-king piece (bought or free)
};

// ---------------------------------------------------------------------------------------------------------
/** Cost of an army at PRICES. */
export function armyCost(a) {
  let c = 0;
  for (const t of ['p', 'n', 'b', 'r', 'q']) c += (a?.[t] || 0) * PRICES[t];
  return c;
}

/** Puzzle cash for a rating (before retryMult / cap). */
export function puzzleReward(rating, firstTry = true) {
  const row = PUZZLES.rewardByRating.find(([max]) => rating <= max) || PUZZLES.rewardByRating.at(-1);
  return Math.round(row[1] * (firstTry ? 1 : PUZZLES.retryMult));
}
