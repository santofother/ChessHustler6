// Arena registry: ids, display names, title-menu swatches, lazy loaders and the Hustler node → arena mapping.
// Contract: docs/arenas/ARENAS_SPEC.md §3.

export const ARENAS = [
  {
    id: 'classic', name: 'Vice City Grand Prix', short: 'GRAND PRIX', district: null,
    tagline: 'Sunset, palm trees and a street circuit nobody got a permit for.',
    swatch: ['#ffb24a', '#b03a86'], load: () => import('./classic.js'),
  },
  {
    id: 'strand', name: 'Sunset Strand Boardwalk', short: 'SUNSET STRAND', district: 'nh1',
    tagline: 'Where hustles go to get a tan.',
    swatch: ['#ff9f1c', '#2ec4d6'], load: () => import('./strand.js'),
  },
  {
    id: 'docks', name: 'Rustwater Docks', short: 'RUSTWATER DOCKS', district: 'nh2',
    tagline: 'Everything arrives here. Nothing gets inspected.',
    swatch: ['#3d8bff', '#ffb347'], load: () => import('./docks.js'),
  },
  {
    id: 'neon', name: 'Neon Mile Street Meet', short: 'NEON MILE', district: 'nh3',
    tagline: 'Bottle service for your bad ideas.',
    swatch: ['#a259ff', '#ff3ea5'], load: () => import('./neon.js'),
  },
  {
    id: 'crown', name: 'Crown Hills Estate', short: 'CROWN HILLS', district: 'nh4',
    tagline: 'Old money, new problems, and a very strict HOA.',
    swatch: ['#f2d49b', '#6d8bd8'], load: () => import('./crown.js'),
  },
  {
    id: 'tower', name: 'Nocturno Tower Rooftop', short: 'NOCTURNO TOWER', district: 'downtown',
    tagline: 'The whole city at your feet. Try not to fall.',
    swatch: ['#ffcf5a', '#1b2a6b'], load: () => import('./tower.js'),
  },
  {
    id: 'trap', name: 'The Trap', short: 'THE TRAP', district: null,
    tagline: 'Four walls, three couches, zero questions.',
    swatch: ['#9ee6ff', '#ff7a3d'], load: () => import('./trap.js'),
  },
];

const BY_ID = new Map(ARENAS.map((a) => [a.id, a]));

/** Ids offered on the title LOCATION row, in display order. */
export const TITLE_ARENAS = ['classic', 'strand', 'docks', 'neon', 'crown', 'tower', 'trap'];

export const DEFAULT_ARENA = 'classic';

export function getArena(id) {
  return BY_ID.get(id) || BY_ID.get(DEFAULT_ARENA);
}

const DISTRICT_ARENA = { nh1: 'strand', nh2: 'docks', nh3: 'neon', nh4: 'crown' };
const STREET_TIME = { 1: 'day', 2: 'dusk', 3: 'night' };

/** Hustler node id ('nh2_s1', 'nh1_boss', 'city_boss', …) → { id, variant }. Unknown ids → classic. */
export function arenaForNode(nodeId) {
  const s = String(nodeId || '');
  if (s === 'city_boss' || s.startsWith('downtown')) return { id: 'tower', variant: { boss: true, time: 'night' } };
  const m = /^(nh[1-4])_(?:s(\d)|(boss))/.exec(s);
  if (!m) return { id: DEFAULT_ARENA, variant: {} };
  const id = DISTRICT_ARENA[m[1]];
  if (m[3]) return { id, variant: { boss: true, time: 'night' } };
  const street = Number(m[2]) || 1;
  return { id, variant: { street, time: STREET_TIME[street] || 'dusk', boss: false } };
}

/** District id ('nh1'…'nh4', 'downtown') → arena id. */
export function arenaForDistrict(district) {
  if (district === 'downtown') return 'tower';
  return DISTRICT_ARENA[district] || DEFAULT_ARENA;
}
