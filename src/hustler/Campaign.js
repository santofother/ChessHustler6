// Hustler Mode — campaign core (HUSTLER_SPEC §1, §4.4, §5). Pure logic, no DOM, Node-testable.
//
//   const c = new Campaign({ balance, lore, storage?, rng? });
//   c.load() || c.newCampaign('The Gambit Crew');
//   const match = c.prepareMatch('nh1_s1');          // or c.prepareDefense()
//   c.startMatch(match, { p: 2 });                    // pays for the army, remembers the job
//   const results = c.resolveMatch({ result:'win', reason:'checkmate', captures:{p:1}, survivors:{p:2}, moves:14 });
//   c.view();                                         // map view model (§4.4)
//
// Economy rules come from balance.js (see docs/hustler/ECONOMY.md); every rule reader has a safe default so a
// partially filled balance file never crashes the campaign.

export const SAVE_KEY = 'gtc.hustler.v1';
export const SAVE_VERSION = 1;
const TYPES = ['p', 'n', 'b', 'r', 'q'];
const LOG_MAX = 40;

export const NH_IDS = ['nh1', 'nh2', 'nh3', 'nh4'];
export const NODE_IDS = [
  ...NH_IDS.flatMap((nh) => [`${nh}_s1`, `${nh}_s2`, `${nh}_s3`, `${nh}_boss`]),
  'city_boss',
];
export const ADJACENCY = {
  nh1: ['nh2', 'nh3'],
  nh2: ['nh1', 'nh3', 'nh4'],
  nh3: ['nh1', 'nh2', 'nh4'],
  nh4: ['nh2', 'nh3', 'downtown'],
  downtown: ['nh4'],
};

export function nodeType(id) {
  if (id === 'city_boss') return 'city';
  return id.endsWith('_boss') ? 'boss' : 'street';
}
export function nodeNeighborhood(id) {
  return id === 'city_boss' ? 'downtown' : id.split('_')[0];
}
export function neighborhoodNodes(nh) {
  return nh === 'downtown' ? ['city_boss'] : [`${nh}_s1`, `${nh}_s2`, `${nh}_s3`, `${nh}_boss`];
}
export function bossOf(nh) {
  return nh === 'downtown' ? 'city_boss' : `${nh}_boss`;
}

const emptyArmy = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0 });
const normArmy = (a) => {
  const o = emptyArmy();
  for (const t of TYPES) o[t] = Math.max(0, Math.floor(+(a && a[t]) || 0));
  return o;
};
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');

/** In-memory Storage stand-in (Node tests, or when localStorage is unavailable). */
export class MemoryStorage {
  constructor() {
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    /* blocked (privacy mode / sandbox) */
  }
  return new MemoryStorage();
}

export class Campaign {
  constructor({ balance, lore, storage, rng } = {}) {
    if (!balance || !lore) throw new Error('Campaign needs balance + lore');
    this.B = balance;
    this.L = lore;
    this.storage = storage || defaultStorage();
    this.rng = rng || Math.random;
    this.state = null;
    this.onChange = null; // optional listener (state saved)
  }

  // =================================================================== rules (balance readers w/ defaults)
  get prices() {
    return { p: 1000, n: 3000, b: 3000, r: 5000, q: 9000, ...(this.B.PRICES || {}) };
  }
  get maxArmy() {
    const cap = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const m = this.B.MAX_ARMY || {};
    const out = {};
    for (const t of TYPES) out[t] = Math.max(0, Math.min(cap[t], num(m[t], cap[t])));
    return out;
  }
  node(id) {
    return (this.B.NODES && this.B.NODES[id]) || null;
  }
  profile(botId) {
    const p = this.B.BOT_PROFILES && this.B.BOT_PROFILES[botId];
    return p ? { ...p } : { label: 'Street', maxDepth: 1, timeMs: 200, quiescence: false, noiseCp: 80, randomChance: 0.3, topN: 5, blunderChance: 0.1 };
  }
  armyCost(a) {
    const P = this.prices;
    return TYPES.reduce((s, t) => s + (a?.[t] || 0) * P[t], 0);
  }
  _ch() {
    const C = this.B.CHALLENGES || {};
    return {
      graceGames: num(C.graceGames, 4),
      minOwnedNodes: num(C.minOwnedNodes, 2),
      baseChance: num(C.baseChance, 0.15),
      perControlled: num(C.perControlledNeighborhood, 0.05),
      maxChance: num(C.maxChance, 0.3),
      cooldownGames: num(C.cooldownGames, 3),
      maxActive: num(C.maxActive, 1),
      deadlineGames: Math.max(1, num(C.deadlineGames, 2)),
      targetWeights: { street: 3, boss: 1, ...(C.targetWeights || {}) },
      frontierOnly: C.frontierOnly !== false,
      immunityGames: num(C.immunityGames, 6),
      standoffRewardMult: num(C.standoffRewardMult, 0.25),
      retakeWinMult: num(C.retakeWinMult, 1),
    };
  }
  _income() {
    const I = this.B.INCOME || {};
    return {
      byResult: { win: 1, standoff: 1, loss: 0.5, ...(I.byResult || {}) },
      contestedPays: !!I.contestedPays,
      minFullMoves: num(I.minFullMoves, 0),
    };
  }
  _refunds() {
    const R = this.B.REFUNDS || {};
    return { win: num(R.win, 0.5), standoff: num(R.standoff, 0.5), loss: num(R.loss, 0) };
  }
  _loss() {
    const L = this.B.LOSS || {};
    return { captureBountiesPaid: L.captureBountiesPaid !== false, rewardPaid: num(L.rewardPaid, 0) };
  }
  _bankruptcy() {
    const K = this.B.BANKRUPTCY || {};
    return {
      threshold: num(K.threshold, 2 * this.prices.p),
      freePawns: Math.max(0, Math.floor(num(K.freePawns, 2))),
      label: K.label || 'Emergency Loan',
      message: K.message || 'A friend spots you a couple of Street Thugs for this job.',
      minArmy: Math.max(0, Math.floor(num(K.minArmy, 1))),
    };
  }
  _puzzles() {
    const P = this.B.PUZZLES || {};
    return {
      table: Array.isArray(P.rewardByRating) && P.rewardByRating.length ? P.rewardByRating : [[Infinity, 250]],
      retryMult: num(P.retryMult, 0.5),
      repeatReward: num(P.repeatReward, 0),
      cap: P.perSessionCap == null ? Infinity : num(P.perSessionCap, Infinity),
    };
  }

  // =================================================================== lore readers
  leader(nodeId) {
    const l = (this.L.LEADERS && this.L.LEADERS[nodeId]) || {};
    const gang = (this.L.GANGS && this.L.GANGS[l.gangId]) || {};
    return {
      id: nodeId,
      name: l.name || 'Unknown',
      alias: l.alias || '',
      title: l.title || (nodeType(nodeId) === 'street' ? 'Street Boss' : 'Boss'),
      blurb: l.blurb || '',
      gimmick: l.gimmick || '',
      portrait: l.portrait || { initials: '??', emoji: '', bg: '#333', fg: '#fff' },
      gangId: l.gangId || null,
      gangName: gang.name || 'Rival Crew',
      colors: gang.colors || this.neighborhoodInfo(nodeNeighborhood(nodeId)).colors,
      lines: { intro: '', playerWins: '', playerLoses: '', challenge: '', defended: '', ...(l.lines || {}) },
      taunts: Array.isArray(l.taunts) ? l.taunts.slice() : [],
    };
  }
  neighborhoodInfo(nh) {
    const n = (this.L.NEIGHBORHOODS && this.L.NEIGHBORHOODS[nh]) || {};
    return {
      id: nh,
      name: n.name || nh,
      blurb: n.blurb || '',
      vibe: n.vibe || '',
      tagline: n.tagline || '',
      colors: n.colors || { primary: '#888888', accent: '#dddddd' },
    };
  }
  nodeName(id) {
    const t = nodeType(id);
    if (t === 'street') return (this.L.STREETS && this.L.STREETS[id]?.name) || id;
    const nh = this.neighborhoodInfo(nodeNeighborhood(id));
    return t === 'city' ? nh.name : `${nh.name} HQ`;
  }
  nodeBlurb(id) {
    if (nodeType(id) === 'street') return (this.L.STREETS && this.L.STREETS[id]?.blurb) || '';
    return this.neighborhoodInfo(nodeNeighborhood(id)).blurb;
  }

  // =================================================================== save / load
  _fresh(gangName) {
    return {
      v: SAVE_VERSION,
      gangName: String(gangName || this.L.PLAYER_DEFAULT_GANG || 'The Crew').slice(0, 28),
      cash: num(this.B.START_CASH, 2500),
      gameNo: 0,
      owned: {}, // nodeId -> gameNo acquired
      everOwned: {}, // nodeId -> true
      beaten: {}, // boss/city nodes ever beaten (unlocks are permanent)
      immunity: {}, // nodeId -> gameNo until which it can't be challenged
      challenge: null,
      nextChallengeId: 1,
      lastChallengeEnd: -Infinity,
      puzzles: { solved: [], sessionEarned: 0 },
      stats: { wins: 0, losses: 0, standoffs: 0, earned: 0, spent: 0, puzzleCash: 0, defended: 0, lostNodes: 0 },
      story: { introSeen: false, unlocksShown: { nh1: true }, finaleShown: false },
      finished: false,
      activeMatch: null,
      log: [],
      created: Date.now(),
    };
  }

  newCampaign(gangName) {
    this.state = this._fresh(gangName);
    this._log(`${this.state.gangName} rolls into ${this.L.CITY?.name || 'town'} with ${money(this.state.cash)}.`);
    this.save();
    return this.state;
  }

  hasSave() {
    try {
      return !!this.storage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  /** Peek at the save without loading it (for the "continue" card). */
  peek() {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = this._sanitize(JSON.parse(raw));
      return s ? { gangName: s.gangName, cash: s.cash, gameNo: s.gameNo, owned: Object.keys(s.owned).length, finished: s.finished } : null;
    } catch {
      return null;
    }
  }

  load() {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = this._sanitize(JSON.parse(raw));
      if (!s) return false;
      this.state = s;
      return true;
    } catch (err) {
      console.warn('[Hustler] save unreadable:', (err && err.message) || err);
      return false;
    }
  }

  save() {
    if (!this.state) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.state));
      this.onChange?.(this.state);
      return true;
    } catch (err) {
      console.warn('[Hustler] could not save:', (err && err.message) || err);
      return false;
    }
  }

  deleteSave() {
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.state = null;
  }

  exportJSON() {
    return JSON.stringify({ game: 'grand-theft-chess', key: SAVE_KEY, save: this.state }, null, 2);
  }

  importJSON(text) {
    try {
      const obj = JSON.parse(String(text || ''));
      const s = this._sanitize(obj && obj.save ? obj.save : obj);
      if (!s) return { ok: false, error: 'That file is not a Hustler save.' };
      this.state = s;
      this.save();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Could not read that save: ' + ((err && err.message) || err) };
    }
  }

  /** Validate / repair a parsed save; returns a clean state or null. */
  _sanitize(s) {
    if (!s || typeof s !== 'object' || typeof s.gangName !== 'string') return null;
    const f = this._fresh(s.gangName);
    const idSet = new Set(NODE_IDS);
    const pickIds = (o) => {
      const out = {};
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (idSet.has(k)) out[k] = v;
      return out;
    };
    const st = {
      ...f,
      cash: Math.max(0, Math.round(num(s.cash, f.cash))),
      gameNo: Math.max(0, Math.floor(num(s.gameNo, 0))),
      owned: Object.fromEntries(Object.entries(pickIds(s.owned)).map(([k, v]) => [k, num(v, 0)])),
      everOwned: Object.fromEntries(Object.keys(pickIds(s.everOwned)).map((k) => [k, true])),
      beaten: Object.fromEntries(Object.keys(pickIds(s.beaten)).map((k) => [k, true])),
      immunity: Object.fromEntries(Object.entries(pickIds(s.immunity)).map(([k, v]) => [k, num(v, 0)])),
      nextChallengeId: Math.max(1, Math.floor(num(s.nextChallengeId, 1))),
      lastChallengeEnd: s.lastChallengeEnd == null ? -Infinity : num(s.lastChallengeEnd, -Infinity),
      finished: !!s.finished,
      log: Array.isArray(s.log) ? s.log.filter((e) => e && typeof e.text === 'string').slice(0, LOG_MAX) : [],
      created: num(s.created, Date.now()),
    };
    for (const id of Object.keys(st.owned)) st.everOwned[id] = true;
    const c = s.challenge;
    st.challenge =
      c && idSet.has(c.targetNodeId) && st.owned[c.targetNodeId] != null
        ? {
            id: Math.floor(num(c.id, st.nextChallengeId)),
            targetNodeId: c.targetNodeId,
            attackerId: idSet.has(c.attackerId) ? c.attackerId : c.targetNodeId,
            gamesLeft: Math.max(1, Math.floor(num(c.gamesLeft, 1))),
            createdGame: num(c.createdGame, st.gameNo),
          }
        : null;
    const pz = s.puzzles || {};
    st.puzzles = {
      solved: Array.isArray(pz.solved) ? pz.solved.filter((x) => typeof x === 'string').slice(0, 5000) : [],
      sessionEarned: Math.max(0, num(pz.sessionEarned, 0)),
    };
    st.stats = { ...f.stats };
    for (const k of Object.keys(f.stats)) st.stats[k] = Math.max(0, num(s.stats?.[k], 0));
    st.story = {
      introSeen: !!s.story?.introSeen,
      unlocksShown: { nh1: true, ...(s.story?.unlocksShown || {}) },
      finaleShown: !!s.story?.finaleShown,
    };
    const am = s.activeMatch;
    st.activeMatch =
      am && idSet.has(am.nodeId) && (am.kind === 'attack' || am.kind === 'defense')
        ? {
            kind: am.kind,
            nodeId: am.nodeId,
            army: normArmy(am.army),
            freePawns: Math.max(0, Math.floor(num(am.freePawns, 0))),
            cost: Math.max(0, num(am.cost, 0)),
            ownedAtStart: Array.isArray(am.ownedAtStart) ? am.ownedAtStart.filter((x) => idSet.has(x)) : [],
            contestedAtStart: idSet.has(am.contestedAtStart) ? am.contestedAtStart : null,
            challengeId: am.challengeId ?? null,
          }
        : null;
    return st;
  }

  _log(text) {
    const s = this.state;
    if (!s) return;
    s.log.unshift({ gameNo: s.gameNo, text: String(text) });
    if (s.log.length > LOG_MAX) s.log.length = LOG_MAX;
  }

  // =================================================================== progression (§1)
  isOwned(id) {
    return !!this.state && this.state.owned[id] != null;
  }
  isUnlocked(nh) {
    const b = this.state?.beaten || {};
    switch (nh) {
      case 'nh1':
        return true;
      case 'nh2':
      case 'nh3':
        return !!b.nh1_boss;
      case 'nh4':
        return !!(b.nh2_boss && b.nh3_boss);
      case 'downtown':
        return !!b.nh4_boss;
      default:
        return false;
    }
  }
  isControlled(nh) {
    return this.isOwned(bossOf(nh));
  }
  neighborhoodStatus(nh) {
    if (!this.isUnlocked(nh)) return 'locked';
    return this.isControlled(nh) ? 'controlled' : 'open';
  }
  nodeStatus(id) {
    const nh = nodeNeighborhood(id);
    if (this.isOwned(id)) return this.state.challenge?.targetNodeId === id ? 'contested' : 'owned';
    if (!this.isUnlocked(nh)) return 'locked';
    if (nodeType(id) === 'boss') {
      const streets = neighborhoodNodes(nh).filter((n) => nodeType(n) === 'street');
      if (!streets.every((n) => this.isOwned(n))) return 'locked';
    }
    return 'available';
  }
  ownedIds() {
    return NODE_IDS.filter((id) => this.isOwned(id));
  }
  controlledCount() {
    return [...NH_IDS, 'downtown'].filter((nh) => this.isControlled(nh)).length;
  }
  incomePerGame() {
    const inc = this._income();
    let sum = 0;
    for (const id of this.ownedIds()) {
      if (!inc.contestedPays && this.state.challenge?.targetNodeId === id) continue;
      sum += num(this.node(id)?.income, 0);
    }
    return sum;
  }

  // =================================================================== puzzles
  solvedPuzzleIds() {
    return new Set(this.state?.puzzles.solved || []);
  }
  puzzleCapLeft() {
    const cap = this._puzzles().cap;
    return Math.max(0, cap - (this.state?.puzzles.sessionEarned || 0));
  }
  puzzleRewardFor(puzzle, { firstTry = true } = {}) {
    const P = this._puzzles();
    if (!this.state) return 0;
    let r;
    if (puzzle && this.state.puzzles.solved.includes(String(puzzle.id))) r = P.repeatReward;
    else {
      const rating = num(puzzle?.rating, 1500);
      const row = P.table.find(([max]) => rating <= max) || P.table[P.table.length - 1];
      r = Math.round(num(row[1], 0) * (firstTry ? 1 : P.retryMult));
    }
    return Math.max(0, Math.min(r, this.puzzleCapLeft()));
  }
  /** Mark a puzzle solved and bank its reward (clamped to the rule-based amount). Returns cash credited. */
  creditPuzzle(puzzle, { firstTry = true } = {}) {
    if (!this.state || !puzzle) return 0;
    const amt = this.puzzleRewardFor(puzzle, { firstTry });
    const id = String(puzzle.id);
    if (!this.state.puzzles.solved.includes(id)) this.state.puzzles.solved.push(id);
    if (amt > 0) {
      this.state.cash += amt;
      this.state.puzzles.sessionEarned += amt;
      this.state.stats.puzzleCash += amt;
      this.state.stats.earned += amt;
      this._log(`Side hustle: puzzle solved, +${money(amt)}.`);
    }
    this.save();
    return amt;
  }

  // =================================================================== matches
  /** Free pieces from the bankruptcy safety net for the next match (0 if the player can afford a crew). */
  loanFor(cash = this.state?.cash || 0) {
    const K = this._bankruptcy();
    return cash < K.threshold ? K.freePawns : 0;
  }

  _matchBase(kind, nodeId, leaderId, bot, army, extra) {
    const K = this._bankruptcy();
    const free = this.loanFor();
    const max = this.maxArmy;
    const maxBuy = { ...max, p: Math.max(0, max.p - free) };
    return {
      kind,
      nodeId,
      nodeName: this.nodeName(nodeId),
      type: nodeType(nodeId),
      neighborhoodId: nodeNeighborhood(nodeId),
      leader: this.leader(leaderId),
      leaderId,
      botId: bot,
      profile: this.profile(bot),
      botArmy: normArmy(army),
      captureBounty: { ...emptyArmy(), ...(this.node(nodeId)?.captureBounty || {}) },
      recommended: normArmy(this.node(nodeId)?.recommended),
      prices: this.prices,
      maxArmy: maxBuy,
      cash: this.state.cash,
      freePawns: free,
      loan: free ? { label: K.label, message: K.message, pawns: free } : null,
      minArmy: K.minArmy,
      stars: num(this.node(nodeId)?.stars, 1),
      ...extra,
    };
  }

  prepareMatch(nodeId) {
    if (!this.state) return null;
    const st = this.nodeStatus(nodeId);
    if (st !== 'available') return null;
    const n = this.node(nodeId) || {};
    const retake = !!this.state.everOwned[nodeId];
    const mult = retake ? this._ch().retakeWinMult : 1;
    return this._matchBase('attack', nodeId, nodeId, n.bot, n.army, {
      reward: { win: Math.round(num(n.reward?.win, 0) * mult), standoff: num(n.reward?.standoff, 0) },
      retake,
    });
  }

  prepareDefense() {
    const c = this.state?.challenge;
    if (!c) return null;
    const d = this.node(c.targetNodeId)?.defense;
    if (!d) return null;
    const C = this._ch();
    return this._matchBase('defense', c.targetNodeId, c.attackerId, d.bot, d.army, {
      reward: { win: num(d.reward, 0), standoff: Math.round(num(d.reward, 0) * C.standoffRewardMult) },
      challengeId: c.id,
    });
  }

  /** Validate a purchase for a prepared match. Returns { ok, error, cost, total }. */
  checkArmy(match, army) {
    const a = normArmy(army);
    const cost = this.armyCost(a);
    for (const t of TYPES) if (a[t] > match.maxArmy[t]) return { ok: false, error: `Too many ${t.toUpperCase()}.`, cost };
    if (cost > this.state.cash) return { ok: false, error: 'Not enough cash.', cost };
    const total = TYPES.reduce((s, t) => s + a[t], 0) + (match.freePawns || 0);
    if (total < (match.minArmy || 0)) return { ok: false, error: 'Hire at least one piece.', cost, total };
    return { ok: true, cost, total };
  }

  /** Pay for the army and remember the job (saved, so a reload mid-match counts as walking out). */
  startMatch(match, army) {
    if (!this.state || !match) return { ok: false, error: 'No campaign.' };
    if (this.state.activeMatch) return { ok: false, error: 'A job is already running.' };
    if (match.kind === 'attack' && this.nodeStatus(match.nodeId) !== 'available') return { ok: false, error: 'Not available.' };
    if (match.kind === 'defense' && this.state.challenge?.id !== match.challengeId) return { ok: false, error: 'Challenge expired.' };
    const chk = this.checkArmy(match, army);
    if (!chk.ok) return chk;
    const a = normArmy(army);
    this.state.cash -= chk.cost;
    this.state.stats.spent += chk.cost;
    this.state.activeMatch = {
      kind: match.kind,
      nodeId: match.nodeId,
      army: a,
      freePawns: match.freePawns || 0,
      cost: chk.cost,
      ownedAtStart: this.ownedIds(),
      contestedAtStart: this.state.challenge?.targetNodeId ?? null,
      challengeId: match.challengeId ?? null,
    };
    this.save();
    return { ok: true, cost: chk.cost };
  }

  /**
   * Apply a finished match. outcome = { result:'win'|'loss'|'standoff', reason, captures:{p..q}, survivors:{p..q}, moves }
   * (moves = the player's full moves). Returns the Results screen model.
   */
  resolveMatch(outcome = {}) {
    const s = this.state;
    const am = s?.activeMatch;
    if (!am) return null;
    const result = ['win', 'loss', 'standoff'].includes(outcome.result) ? outcome.result : 'loss';
    const captures = normArmy(outcome.captures);
    const survivors = normArmy(outcome.survivors);
    const moves = Math.max(0, Math.floor(num(outcome.moves, 0)));
    const nodeId = am.nodeId;
    const nd = this.node(nodeId) || {};
    const leaderId = am.kind === 'defense' ? s.challenge?.attackerId || nodeId : nodeId;
    const leader = this.leader(leaderId);
    const cashBefore = s.cash + am.cost; // before hiring
    const lines = [];
    const add = (label, amount, note) => lines.push({ label, amount: Math.round(amount), note });
    add('Crew hired', -am.cost);

    s.activeMatch = null;
    s.gameNo += 1;
    const gained = [];
    const lost = [];
    const unlocks = [];
    const controlled = [];
    let finale = false;
    let challengeExpired = null;
    let challengeResolved = null;

    // --- reward
    const C = this._ch();
    if (am.kind === 'attack') {
      const retake = !!s.everOwned[nodeId] && !this.isOwned(nodeId);
      const win = Math.round(num(nd.reward?.win, 0) * (retake ? C.retakeWinMult : 1));
      if (result === 'win') add(retake ? 'Turf retaken' : 'Job pay', win);
      else if (result === 'standoff') add('Standoff cut', num(nd.reward?.standoff, 0));
      else if (this._loss().rewardPaid) add('Consolation', this._loss().rewardPaid);
    } else {
      const d = nd.defense || {};
      if (result === 'win') add('Defense pay', num(d.reward, 0));
      else if (result === 'standoff') add('Held the line', Math.round(num(d.reward, 0) * C.standoffRewardMult));
    }

    // --- capture bounties
    const bountyTable = { ...emptyArmy(), ...(nd.captureBounty || {}) };
    const bountyPaid = result !== 'loss' || this._loss().captureBountiesPaid;
    const bounty = bountyPaid ? TYPES.reduce((sum, t) => sum + captures[t] * num(bountyTable[t], 0), 0) : 0;
    const capCount = TYPES.reduce((sum, t) => sum + captures[t], 0);
    if (capCount) add(`Bounties (${capCount} taken)`, bounty);

    // --- refunds for survivors (free loan pawns are never refunded)
    const rate = this._refunds()[result] || 0;
    // Resell at what was hired: a promoted pawn resells as a pawn, not as the piece it became,
    // and nothing resells beyond the hired count of each type.
    const hired = normArmy(am.army);
    const surv = { ...survivors };
    let promoted = 0;
    for (const t of TYPES) {
      if (t === 'p') continue;
      promoted += Math.max(0, surv[t] - hired[t]);
      surv[t] = Math.min(surv[t], hired[t]);
    }
    surv.p = Math.min(hired.p, Math.max(0, surv.p + promoted - (am.freePawns || 0)));
    const refund = rate > 0 ? TYPES.reduce((sum, t) => sum + surv[t] * this.prices[t] * rate, 0) : 0;
    const survCount = TYPES.reduce((sum, t) => sum + surv[t], 0);
    if (refund > 0) add(`Crew resold (${survCount} x ${Math.round(rate * 100)}%)`, refund);

    // --- passive income for nodes owned at match start
    const inc = this._income();
    const incMult = num(inc.byResult[result], 0);
    let income = 0;
    let incomeNote = '';
    const incomeBase = am.ownedAtStart
      .filter((id) => inc.contestedPays || id !== am.contestedAtStart)
      .reduce((sum, id) => sum + num(this.node(id)?.income, 0), 0);
    if (incomeBase > 0) {
      if (moves < inc.minFullMoves) incomeNote = `Street tax needs ${inc.minFullMoves}+ moves on the job`;
      else income = Math.round(incomeBase * incMult);
      add(`Street tax${incMult !== 1 && income ? ` (${Math.round(incMult * 100)}%)` : ''}`, income, incomeNote || undefined);
    }

    // --- territory
    if (am.kind === 'attack') {
      if (result === 'win') {
        s.owned[nodeId] = s.gameNo;
        s.everOwned[nodeId] = true;
        gained.push(nodeId);
        const t = nodeType(nodeId);
        if (t !== 'street') {
          const nh = nodeNeighborhood(nodeId);
          const before = [...NH_IDS, 'downtown'].filter((x) => this.isUnlocked(x));
          s.beaten[nodeId] = true;
          if (t === 'boss') {
            const line = this.L.STORY?.controlled?.[nh];
            controlled.push({ id: nh, name: this.neighborhoodInfo(nh).name, text: line || `${this.neighborhoodInfo(nh).name} is yours.` });
          }
          for (const x of [...NH_IDS, 'downtown']) {
            if (!before.includes(x) && this.isUnlocked(x)) {
              unlocks.push({ id: x, name: this.neighborhoodInfo(x).name, text: this.L.STORY?.unlocks?.[x] || `${this.neighborhoodInfo(x).name} is open.` });
            }
          }
          if (t === 'city') {
            s.finished = true;
            finale = true;
            if (s.challenge) s.challenge = null; // no more challenges after the City Boss
          }
        }
      }
    } else {
      // defense
      challengeResolved = result;
      if (result === 'loss') {
        this._loseNode(nodeId, 'defense');
        lost.push(nodeId);
      } else {
        if (result === 'win') {
          s.immunity[nodeId] = s.gameNo + C.immunityGames;
          s.stats.defended += 1;
        }
      }
      s.challenge = null;
      s.lastChallengeEnd = s.gameNo;
    }

    // --- an open challenge ticks down on every other match
    if (am.kind === 'attack' && s.challenge) {
      s.challenge.gamesLeft -= 1;
      if (s.challenge.gamesLeft <= 0) {
        challengeExpired = s.challenge.targetNodeId;
        const who = this.leader(s.challenge.attackerId);
        this._loseNode(challengeExpired, 'expired');
        lost.push(challengeExpired);
        this._log(`${who.alias || who.name} walked into ${this.nodeName(challengeExpired)} unopposed. Turf lost.`);
        s.challenge = null;
        s.lastChallengeEnd = s.gameNo;
      }
    }

    // --- apply cash
    const delta = lines.reduce((sum, l) => sum + l.amount, 0) + am.cost; // cost was already paid
    s.cash = Math.max(0, s.cash + delta);
    s.stats.earned += Math.max(0, delta);
    s.stats[result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'standoffs'] += 1;
    s.puzzles.sessionEarned = 0; // puzzle cap resets after every match

    // --- log
    const where = this.nodeName(nodeId);
    const net = s.cash - cashBefore;
    const netTxt = `${net >= 0 ? '+' : '-'}${money(Math.abs(net))}`;
    if (am.kind === 'attack') {
      if (result === 'win') this._log(`Took ${where} from ${leader.alias || leader.name}. ${netTxt}.`);
      else if (result === 'standoff') this._log(`Standoff at ${where}. ${netTxt}.`);
      else this._log(`Lost the job at ${where}. ${netTxt}.`);
    } else if (result === 'loss') this._log(`${leader.alias || leader.name} took ${where}. ${netTxt}.`);
    else this._log(`Defended ${where} against ${leader.alias || leader.name}. ${netTxt}.`);
    for (const u of unlocks) this._log(`${u.name} is open for business.`);

    // --- new rival challenge (rolled after results)
    const newChallenge = this._rollChallenge();

    this.save();

    const lineKey =
      am.kind === 'defense'
        ? result === 'loss'
          ? 'playerLoses'
          : 'defended'
        : result === 'win'
          ? 'playerWins'
          : result === 'loss'
            ? 'playerLoses'
            : 'intro';
    const defeat = this.L.STORY?.defeat;
    return {
      kind: am.kind,
      nodeId,
      nodeName: where,
      result,
      reason: outcome.reason || '',
      leader,
      leaderLine: leader.lines[lineKey] || '',
      flavor: result === 'loss' && Array.isArray(defeat) && defeat.length ? defeat[Math.floor(this.rng() * defeat.length)] : '',
      lines,
      net,
      cashBefore,
      cashAfter: s.cash,
      captures,
      survivors,
      gained,
      lost,
      unlocks,
      controlled,
      finale,
      challengeExpired,
      challengeResolved,
      newChallenge: newChallenge ? this._challengeView(newChallenge) : null,
      gameNo: s.gameNo,
    };
  }

  /** Called on load if a match was running when the page closed: counts as walking out (a loss). */
  abandonActiveMatch() {
    if (!this.state?.activeMatch) return null;
    const r = this.resolveMatch({ result: 'loss', reason: 'walked-out', captures: {}, survivors: {}, moves: 0 });
    if (r) {
      this.state.log[0] && (this.state.log[0].text += ' (walked out)');
      this.save();
    }
    return r;
  }

  _loseNode(id, why) {
    const s = this.state;
    if (s.owned[id] == null) return;
    delete s.owned[id];
    s.stats.lostNodes += 1;
    if (s.challenge?.targetNodeId === id && why !== 'defense') s.challenge = null;
  }

  /** Decline the open challenge: the node is lost immediately, no match, no money spent. */
  declineChallenge() {
    const s = this.state;
    const c = s?.challenge;
    if (!c) return null;
    const who = this.leader(c.attackerId);
    this._loseNode(c.targetNodeId, 'decline');
    s.challenge = null;
    s.lastChallengeEnd = s.gameNo;
    this._log(`Gave ${this.nodeName(c.targetNodeId)} up to ${who.alias || who.name} without a fight.`);
    this.save();
    return c.targetNodeId;
  }

  // =================================================================== challenges
  frontierNodes() {
    return this.ownedIds().filter((id) => {
      if (id === 'city_boss') return false;
      const nh = nodeNeighborhood(id);
      return (ADJACENCY[nh] || []).some((x) => !this.isControlled(x));
    });
  }

  challengeChance() {
    const C = this._ch();
    return Math.min(C.maxChance, C.baseChance + C.perControlled * this.controlledCount());
  }

  /** Roll for a new rival challenge (after a match). Returns the challenge or null. */
  _rollChallenge(force = false) {
    const s = this.state;
    const C = this._ch();
    if (s.finished || s.beaten.city_boss) return null;
    if (s.challenge && C.maxActive <= 1) return null;
    if (!force) {
      if (s.gameNo <= C.graceGames) return null;
      if (this.ownedIds().length < C.minOwnedNodes) return null;
      if (s.gameNo - s.lastChallengeEnd < C.cooldownGames) return null;
      if (this.rng() >= this.challengeChance()) return null;
    }
    let pool = C.frontierOnly ? this.frontierNodes() : this.ownedIds().filter((id) => id !== 'city_boss');
    pool = pool.filter((id) => !(num(s.immunity[id], -1) > s.gameNo) && this.node(id)?.defense);
    if (!pool.length) return null;
    const weights = pool.map((id) => Math.max(0, num(C.targetWeights[nodeType(id)], 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = this.rng() * total;
    let target = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r < 0) {
        target = pool[i];
        break;
      }
    }
    // attacker (flavor): leader of a not-owned node in an adjacent, not-controlled neighborhood
    const nh = nodeNeighborhood(target);
    const cands = (ADJACENCY[nh] || [])
      .filter((x) => !this.isControlled(x))
      .flatMap((x) => neighborhoodNodes(x))
      .filter((id) => !this.isOwned(id));
    const attackerId = cands.length ? cands[Math.floor(this.rng() * cands.length)] : target;
    const c = { id: s.nextChallengeId++, targetNodeId: target, attackerId, gamesLeft: C.deadlineGames, createdGame: s.gameNo };
    s.challenge = c;
    const who = this.leader(attackerId);
    this._log(`${who.alias || who.name} is coming for ${this.nodeName(target)}.`);
    return c;
  }

  /** Test/debug hook: force a challenge now (ignores chance/grace). */
  forceChallenge() {
    const c = this._rollChallenge(true);
    if (c) this.save();
    return c ? this._challengeView(c) : null;
  }

  _challengeView(c) {
    const who = this.leader(c.attackerId);
    const d = this.node(c.targetNodeId)?.defense || {};
    return {
      id: c.id,
      targetNodeId: c.targetNodeId,
      targetName: this.nodeName(c.targetNodeId),
      attacker: {
        name: who.name,
        alias: who.alias,
        title: who.title,
        blurb: who.blurb,
        portrait: who.portrait,
        gangName: who.gangName,
      },
      army: normArmy(d.army),
      reward: num(d.reward, 0),
      message: who.lines.challenge || `${who.alias || who.name} wants ${this.nodeName(c.targetNodeId)}.`,
      gamesLeft: c.gamesLeft,
    };
  }

  // =================================================================== story
  /** Unlock beats not yet shown (e.g. after an import). Marks them shown. */
  takePendingUnlocks() {
    const s = this.state;
    const out = [];
    for (const nh of ['nh2', 'nh3', 'nh4', 'downtown']) {
      if (this.isUnlocked(nh) && !s.story.unlocksShown[nh]) {
        s.story.unlocksShown[nh] = true;
        out.push({ id: nh, name: this.neighborhoodInfo(nh).name, text: this.L.STORY?.unlocks?.[nh] || '' });
      }
    }
    if (out.length) this.save();
    return out;
  }
  markUnlocksShown(ids) {
    for (const id of ids || []) this.state.story.unlocksShown[id] = true;
    this.save();
  }
  markIntroSeen() {
    this.state.story.introSeen = true;
    this.save();
  }
  markFinaleShown() {
    this.state.story.finaleShown = true;
    this.save();
  }

  // =================================================================== view model (§4.4)
  view() {
    const s = this.state;
    if (!s) return null;
    const neighborhoods = [...NH_IDS, 'downtown'].map((nh) => {
      const info = this.neighborhoodInfo(nh);
      const ids = neighborhoodNodes(nh);
      return {
        id: nh,
        name: info.name,
        blurb: info.blurb,
        vibe: info.vibe,
        tagline: info.tagline,
        colors: info.colors,
        status: this.neighborhoodStatus(nh),
        owned: ids.filter((id) => this.isOwned(id)).length,
        total: ids.length,
        bossId: bossOf(nh),
      };
    });
    const nodes = NODE_IDS.map((id) => {
      const n = this.node(id) || {};
      const l = this.leader(id);
      const prof = this.profile(n.bot);
      return {
        id,
        type: nodeType(id),
        neighborhoodId: nodeNeighborhood(id),
        name: this.nodeName(id),
        blurb: this.nodeBlurb(id),
        leader: { name: l.name, alias: l.alias, title: l.title, blurb: l.blurb, gimmick: l.gimmick, portrait: l.portrait, gangName: l.gangName },
        status: this.nodeStatus(id),
        tier: num(n.tier, 1),
        difficulty: Math.max(1, Math.min(5, num(n.stars, num(n.tier, 1)))),
        botLabel: prof.label || n.bot || '',
        army: normArmy(n.army),
        reward: { win: num(n.reward?.win, 0), standoff: num(n.reward?.standoff, 0) },
        captureBounty: { ...emptyArmy(), ...(n.captureBounty || {}) },
        income: num(n.income, 0),
        recommended: normArmy(n.recommended),
        retake: !!s.everOwned[id] && !this.isOwned(id),
      };
    });
    const P = this._puzzles();
    const vals = P.table.map((r) => num(r[1], 0)).filter((v) => v > 0);
    const capLeft = this.puzzleCapLeft();
    return {
      gangName: s.gangName,
      cash: s.cash,
      incomePerGame: this.incomePerGame(),
      gameNo: s.gameNo,
      finished: s.finished,
      neighborhoods,
      nodes,
      challenge: s.challenge ? this._challengeView(s.challenge) : null,
      puzzles: {
        unsolved: null, // filled in by HustlerController when the puzzle pack is known
        solved: s.puzzles.solved.length,
        rewardHint: vals.length
          ? `${money(Math.min(...vals))}–${money(Math.max(...vals))} per puzzle` +
            (Number.isFinite(P.cap) ? ` · ${money(capLeft)} left before the next job` : '')
          : '',
        capLeft: Number.isFinite(capLeft) ? capLeft : null,
      },
      log: s.log.slice(0, 12),
      stats: { ...s.stats },
    };
  }
}
