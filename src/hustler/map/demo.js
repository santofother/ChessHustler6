// Standalone demo for the Hustler City Map.  export async function demo(el)
// Uses real lore/balance data when present (import.meta.glob → no error if missing), else a built-in fake.
// The tiny "campaign" logic below exists ONLY to fabricate view models for the demo.

import { CityMap } from './CityMap.js';

const DATA = import.meta.glob('../data/*.js', { eager: true });
const lore = DATA['../data/lore.js'] || {};
const bal = DATA['../data/balance.js'] || {};

const NHS = ['nh1', 'nh2', 'nh3', 'nh4'];
const IDS = [...NHS.flatMap((h) => [`${h}_s1`, `${h}_s2`, `${h}_s3`, `${h}_boss`]), 'city_boss'];

const FAKE_NH = {
  nh1: { name: 'Sunset Strand', vibe: 'sunburnt, scrappy', colors: { primary: '#ff9f1c', accent: '#ffe29a' }, blurb: 'Boardwalk hustles.' },
  nh2: { name: 'Rustwater Docks', vibe: 'rusted, heavy', colors: { primary: '#3d8bff', accent: '#ffb347' }, blurb: 'The port.' },
  nh3: { name: 'Neon Mile', vibe: 'neon, flashy', colors: { primary: '#a259ff', accent: '#f9f871' }, blurb: 'Clubs and casinos.' },
  nh4: { name: 'Crown Hills', vibe: 'gated, cold', colors: { primary: '#e5383b', accent: '#f4ede0' }, blurb: 'Old money.' },
  downtown: { name: 'Downtown Vice', vibe: 'glass, gold', colors: { primary: '#b8ff3c', accent: '#e8b923' }, blurb: 'The tower.' },
};

function nodeInfo(id) {
  const nh = id === 'city_boss' ? 'downtown' : id.slice(0, 3);
  const type = id === 'city_boss' ? 'city' : id.endsWith('_boss') ? 'boss' : 'street';
  const L = lore.LEADERS?.[id];
  const S = lore.STREETS?.[id];
  const N = bal.NODES?.[id];
  const tier = N?.tier ?? { nh1: 1, nh2: 2, nh3: 2, nh4: 3, downtown: 4 }[nh];
  const gang = L && lore.GANGS?.[L.gangId];
  const nhName = (lore.NEIGHBORHOODS?.[nh] || FAKE_NH[nh]).name;
  return {
    id,
    type,
    neighborhoodId: nh,
    name: S?.name || (type === 'street' ? `${nhName} Street ${id.slice(-1)}` : type === 'boss' ? `${nhName} HQ` : 'Nocturno Tower'),
    blurb: S?.blurb || (type === 'boss' ? lore.NEIGHBORHOODS?.[nh]?.blurb : '') || 'A corner worth fighting for.',
    leader: L
      ? { name: L.name, alias: L.alias, title: L.title, blurb: L.blurb, portrait: L.portrait, gangName: gang?.name || '' }
      : { name: 'Rico Vance', alias: 'Rook', title: 'Street Boss', blurb: 'Runs the corner.', portrait: { initials: 'RV', emoji: '🎲', bg: '#ff5fa2', fg: '#1b1036' }, gangName: 'The Palm Kings' },
    tier,
    difficulty: N?.stars ?? Math.min(5, tier + (type !== 'street' ? 1 : 0)),
    botLabel: bal.BOT_PROFILES?.[N?.bot]?.label || ['Lookout', 'Runner', 'Enforcer', 'Hawk', 'Kingpin'][tier - 1],
    army: N?.army || { p: 2 + tier * 2, n: tier > 1 ? 1 : 0, b: tier > 2 ? 1 : 0, r: tier > 2 ? 1 : 0, q: tier > 3 ? 1 : 0 },
    reward: N?.reward || { win: 3000 * tier, standoff: 600 * tier },
    captureBounty: N?.captureBounty || { p: 100, n: 300, b: 300, r: 500, q: 900 },
    income: N?.income ?? 300 * tier,
  };
}

/** Build a view from a set of owned node ids (+ optional challenge target). Demo-only rules. */
function buildView(owned, { challengeOn = null, gameNo = 1, cash = 2500, log = [] } = {}) {
  owned = new Set(owned);
  const controlled = (h) => owned.has(`${h}_boss`);
  const nhOpen = {
    nh1: true,
    nh2: controlled('nh1'),
    nh3: controlled('nh1'),
    nh4: controlled('nh2') && controlled('nh3'),
  };
  const nodes = IDS.map((id) => {
    const n = nodeInfo(id);
    let status = 'locked';
    if (owned.has(id)) status = id === challengeOn ? 'contested' : 'owned';
    else if (n.type === 'city') status = controlled('nh4') ? 'available' : 'locked';
    else if (nhOpen[n.neighborhoodId]) {
      if (n.type === 'street') status = 'available';
      else status = [1, 2, 3].every((i) => owned.has(`${n.neighborhoodId}_s${i}`)) ? 'available' : 'locked';
    }
    if (owned.has(id)) n.ownedSince = Math.max(1, gameNo - 1 - IDS.indexOf(id) % 5);
    return { ...n, status };
  });
  const neighborhoods = [...NHS, 'downtown'].map((h) => {
    const src = lore.NEIGHBORHOODS?.[h] || FAKE_NH[h];
    const mine = nodes.filter((n) => n.neighborhoodId === h && n.type === 'street' && owned.has(n.id)).length;
    const status =
      h === 'downtown'
        ? owned.has('city_boss') ? 'controlled' : controlled('nh4') ? 'open' : 'locked'
        : controlled(h) ? 'controlled' : nhOpen[h] ? 'open' : 'locked';
    return { id: h, name: src.name, blurb: src.blurb, vibe: src.vibe, colors: src.colors, status, owned: h === 'downtown' ? +owned.has('city_boss') : mine, total: h === 'downtown' ? 1 : 3, bossId: h === 'downtown' ? 'city_boss' : `${h}_boss` };
  });
  let challenge = null;
  if (challengeOn) {
    const atk = lore.LEADERS?.nh3_s1 || null;
    challenge = {
      id: 'ch_demo_1',
      targetNodeId: challengeOn,
      attacker: atk
        ? { name: atk.name, alias: atk.alias, title: atk.title, blurb: atk.blurb, portrait: atk.portrait, gangName: lore.GANGS?.[atk.gangId]?.name || '' }
        : { name: 'Vic Morales', alias: 'Velvet', title: 'Club Boss', blurb: '', portrait: { initials: 'VM', emoji: '🪩', bg: '#a259ff', fg: '#fff' }, gangName: 'Velvet Syndicate' },
      army: { p: 4, n: 1, b: 1 },
      message: atk?.lines?.challenge || 'Nice corner. Would be a shame if somebody took it back.',
      gamesLeft: 2,
    };
  }
  const income = nodes.filter((n) => n.status === 'owned' || n.status === 'contested').reduce((s, n) => s + (n.income || 0), 0);
  return {
    gangName: lore.PLAYER_DEFAULT_GANG || 'The Gambit Crew',
    cash,
    incomePerGame: income,
    gameNo,
    neighborhoods,
    nodes,
    challenge,
    puzzles: { unsolved: 12, rewardHint: 'up to $1,500 each' },
    log,
  };
}

const STATES = {
  fresh: () => buildView([], { gameNo: 1, cash: bal.START_CASH ?? 2500, log: [{ gameNo: 1, text: 'You rolled into Vice City with pocket change and a dream.' }] }),
  mid: () =>
    buildView(['nh1_s1', 'nh1_s2', 'nh1_s3', 'nh1_boss', 'nh2_s1', 'nh2_s3', 'nh3_s2'], {
      challengeOn: 'nh2_s1',
      gameNo: 11,
      cash: 18450,
      log: [
        { gameNo: 11, text: 'The Velvet Syndicate wants Container Row back. Defend it within 2 games.' },
        { gameNo: 10, text: 'You took Ocean Mile Drag. Passive income +$600/game.' },
        { gameNo: 9, text: 'Scrapyard Lane is yours.' },
        { gameNo: 8, text: 'Standoff at Container Row — $1,200 for your trouble.' },
        { gameNo: 6, text: 'Sunset Strand is under your control.' },
      ],
    }),
  late: () =>
    buildView(['nh1_s1', 'nh1_s2', 'nh1_s3', 'nh1_boss', 'nh2_s1', 'nh2_s2', 'nh2_s3', 'nh2_boss', 'nh3_s1', 'nh3_s2', 'nh3_s3', 'nh3_boss', 'nh4_s1', 'nh4_s2', 'nh4_s3'], {
      gameNo: 27,
      cash: 64200,
    }),
  final: () =>
    buildView(IDS.filter((i) => i !== 'city_boss'), { gameNo: 33, cash: 98000, challengeOn: 'nh4_s2' }),
  won: () => buildView(IDS, { gameNo: 35, cash: 250000 }),
};

export async function demo(el) {
  const map = new CityMap(el);
  const logEl = document.createElement('div');
  logEl.style.cssText =
    'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:100;pointer-events:auto;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;max-width:94vw;padding:6px 8px;border-radius:10px;background:rgba(0,0,0,.72);font:600 11px/1.2 Inter,system-ui,sans-serif;color:#fff';
  document.body.appendChild(logEl);
  const out = document.createElement('span');
  out.style.cssText = 'min-width:150px;opacity:.8';
  out.textContent = 'onAction: —';
  let cur = 'mid';
  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:700 11px Inter,sans-serif;padding:5px 8px;border-radius:6px;border:0;background:#ff5fa2;color:#1b1036;cursor:pointer';
    b.onclick = fn;
    logEl.appendChild(b);
  };
  for (const s of Object.keys(STATES)) btn(s, () => map.update(STATES[(cur = s)]()));
  btn('celebrate', async () => {
    const v = STATES[cur]();
    const target = v.nodes.find((n) => n.status === 'available') || v.nodes[0];
    target.status = 'owned';
    map.update(v);
    await map.focus(target.id);
    map.celebrate(target.id);
  });
  btn('focus', () => {
    const v = map.view;
    const t = v.challenge?.targetNodeId || v.nodes.find((n) => n.status === 'available')?.id || 'nh1_s1';
    map.focus(t);
  });
  btn('hide/show', () => (map.visible ? map.hide() : map.show()));
  logEl.appendChild(out);

  map.onAction = (name, payload) => {
    console.log('[CityMap] onAction', name, payload);
    out.textContent = `onAction: ${name} ${payload ? JSON.stringify(payload) : ''}`;
  };
  const q = new URLSearchParams(location.search);
  if (q.get('state') && STATES[q.get('state')]) cur = q.get('state');
  map.show(STATES[cur]());
  if (q.get('focus')) setTimeout(() => map.focus(q.get('focus'), { animate: !q.get('shot') }), 300);
  if (q.get('log')) map._toggleLog(true);
  window.__map = map;
  return map;
}

export default demo;
