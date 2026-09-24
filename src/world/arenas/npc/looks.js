// Outfit palettes ("look" families) and the GLB character variant table for NpcCrowd.
// Colours are sRGB hex; NpcCrowd converts them to linear vertex colours.

export const LOOKS = {
  beach: {
    top: ['#ff6f91', '#2ec4d6', '#ffd23f', '#ffffff', '#ff9f1c', '#7bdff2', '#f4f2ee'],
    bottom: ['#1f6f8b', '#f4e1c1', '#ff6f91', '#2b2d42', '#29b8d6', '#ffb347'],
    accent: ['#ff5fa2', '#ffd23f', '#29e3d6', '#ffffff'],
    shoes: ['#f4f2ee', '#e0c9a6', '#2b2d42'],
    longSleeves: 0.05, longPants: 0.15,
  },
  dock: {
    top: ['#ff8c1a', '#3d8bff', '#6b705c', '#d9d9d9', '#b5651d', '#3f5566'],
    bottom: ['#2b2d42', '#3a3f58', '#4a4e69', '#56503f'],
    accent: ['#ffcf1a', '#ff7a12', '#e6eef2'],
    shoes: ['#3b2a1e', '#2b2b2b', '#5a4632'],
    longSleeves: 0.55, longPants: 0.95,
  },
  club: {
    top: ['#ff3ea5', '#a259ff', '#2de2e6', '#f9f871', '#111111', '#ffffff', '#ff3d7f'],
    bottom: ['#111111', '#2b2d42', '#3c1642', '#1b1b2f'],
    accent: ['#ffc23d', '#ff3ea5', '#2de2e6', '#e8e8f0'],
    shoes: ['#111111', '#f4f2ee', '#ff3ea5'],
    longSleeves: 0.25, longPants: 0.7,
  },
  rich: {
    top: ['#ffffff', '#f2d49b', '#b8e0d2', '#f7c6d9', '#1d3557', '#efe6d2'],
    bottom: ['#f4f1de', '#1d3557', '#e0c9a6', '#e8dfc9'],
    accent: ['#f2c14e', '#e8e8f0', '#b3122e'],
    shoes: ['#5a3a22', '#f4f2ee', '#111111'],
    longSleeves: 0.6, longPants: 0.85,
  },
  suit: {
    top: ['#111111', '#1c1c24', '#2b2b35'],
    bottom: ['#111111', '#1c1c24'],
    accent: ['#b3122e', '#e8e8f0', '#f2c14e'],
    shoes: ['#0b0b0b'],
    longSleeves: 1, longPants: 1,
  },
  street: {
    top: ['#e63946', '#ffb703', '#8ecae6', '#ffffff', '#6a4c93', '#2a9d8f', '#7a3cff'],
    bottom: ['#1d3557', '#2b2d42', '#6c757d', '#343a40', '#4b6a9b'],
    accent: ['#ff9a3c', '#ff5fa2', '#29e3d6', '#ffffff'],
    shoes: ['#f4f2ee', '#111111', '#e63946'],
    longSleeves: 0.3, longPants: 0.7,
  },
  racer: {
    top: ['#ff3ea5', '#ffd23f', '#ff7a1a', '#ffffff', '#111111', '#29e3d6'],
    bottom: ['#111111', '#2b2d42', '#1d3557'],
    accent: ['#ffd23f', '#ff3ea5', '#29e3d6'],
    shoes: ['#f4f2ee', '#111111', '#ff3ea5'],
    longSleeves: 0.3, longPants: 0.75,
  },
};

export const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c', '#5e3a26', '#e2b08c'];
export const HAIRS = ['#1b1b1b', '#3b2314', '#6a4e42', '#d6b370', '#b55239', '#2b2b2b', '#140e0b'];

/**
 * Rigged GLB characters from public/models/npc/<name>.glb (docs/arenas/NPC_ASSETS.md).
 * body: 'm'|'f'; looks: families this outfit fits (first = best fit); hair: optional hair palette override.
 */
export const GLB_VARIANTS = {
  floral_guy: { body: 'm', looks: ['street', 'racer', 'club', 'beach', 'rich'] },
  tank_woman: { body: 'f', looks: ['beach', 'street', 'racer', 'club'] },
  hoodie_guy: { body: 'm', looks: ['street', 'racer', 'dock', 'club'] },
  party_woman: { body: 'f', looks: ['club', 'rich', 'racer', 'street'] },
  dock_worker: { body: 'm', looks: ['dock'] },
  bodyguard: { body: 'm', looks: ['suit'] },
  beach_guy: { body: 'm', looks: ['beach'] },
  rich_old: { body: 'm', looks: ['rich'], hair: ['#cfcfd2', '#e8e8ea', '#9a9a9e'] },
};

export const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
