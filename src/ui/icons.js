// Inline SVG icon set for the HUD (original artwork, 24x24 viewBox).
// Piece icons are filled silhouettes; they are also used on the minimap canvas via Path2D.

export const PIECE_PATHS = {
  // Street Thug (pawn): head + shoulders
  p: 'M12 2.5a4.2 4.2 0 1 1 0 8.4a4.2 4.2 0 1 1 0-8.4z M3.5 21.5c0-5 3.8-8.6 8.5-8.6s8.5 3.6 8.5 8.6z',
  // Sport Bike (knight): two wheels (rings), frame, rider
  n:
    'M1 16.5a4 4 0 1 0 8 0a4 4 0 1 0-8 0z M3 16.5a2 2 0 1 1 4 0a2 2 0 1 1-4 0z ' +
    'M15 16.5a4 4 0 1 0 8 0a4 4 0 1 0-8 0z M17 16.5a2 2 0 1 1 4 0a2 2 0 1 1-4 0z ' +
    'M5.3 16.1L9.2 10.2h5.2l1.8-2.6h3v1.8h-2.1l1.9 6.9l-1.6.5l-1.8-5.2l-3.4 4.9h-5.3z ' +
    'M12.6 3.2a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8z M10.4 9.6l1.3-2.3h2.4l.6 2.3z',
  // Touring Race Car (bishop): wedge body, rear wing, wheels
  b:
    'M1.5 15.6l.9-3.6l5.4-1.4l3.3-3.3h5.8l3.6 3.2l2 .6v4.5z M17.4 5h5.3v1.6h-5.3z M19.6 6.6h1.2v2.6h-1.2z ' +
    'M3.8 16.6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0z M15 16.6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0z',
  // Armored Truck (rook): box + cab + wheels
  r:
    'M1.5 5.5h13.5v11h-13.5z M16 9h3.6l3 3.4v4.1h-6.6z M3.8 17.8a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0z ' +
    'M15.6 17.8a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0z',
  // Helicopter (queen): rotor, mast, body, tail, skids
  q:
    'M2 4.2h18v1.5h-18z M10.3 5.7h1.4v2.4h-1.4z M3.8 12.4a7 4.2 0 1 0 14 0a7 4.2 0 1 0-14 0z ' +
    'M16.6 11.2h5.9v2h-5.9z M21 8.4h1.6v4.8h-1.6z M4.5 18.6h11v1.4h-11z M6.8 16h1.2v3h-1.2z M12.8 16h1.2v3h-1.2z',
  // The Boss (king): crown + head + shoulders
  k:
    'M5.5 2.5l3.2 2.6l3.3-3.4l3.3 3.4l3.2-2.6v5.2h-13z M12 8.6a3.4 3.4 0 1 1 0 6.8a3.4 3.4 0 1 1 0-6.8z ' +
    'M3.5 22.5c0-4.4 3.8-6.4 8.5-6.4s8.5 2 8.5 6.4z',
};

export const PIECE_NAMES = {
  p: 'Street Thug',
  n: 'Sport Bike',
  b: 'Touring Car',
  r: 'Armored Truck',
  q: 'Heli',
  k: 'The Boss',
};

export function pieceSvg(type, cls = '') {
  const d = PIECE_PATHS[type] || PIECE_PATHS.p;
  return `<svg class="gtc-ico gtc-ico--piece ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
}

const path2dCache = {};
export function piecePath2D(type) {
  if (typeof Path2D === 'undefined') return null;
  if (!path2dCache[type]) path2dCache[type] = new Path2D(PIECE_PATHS[type] || PIECE_PATHS.p);
  return path2dCache[type];
}

// Stroke icons for phone actions
const ACTION_PATHS = {
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  resign: '<path d="M5 21V3.5"/><path d="M5 4h12l-2.5 4.2L17 12.5H5"/>',
  flip: '<path d="M7 20V4"/><path d="M3 8l4-4 4 4"/><path d="M17 4v16"/><path d="M13 16l4 4 4-4"/>',
  camera:
    '<path d="M3.5 8h3.5l2-3h6l2 3h3.5v11.5h-17z"/><circle cx="12" cy="13.2" r="3.6"/>',
  mute: '<path d="M4 9.2h3.8L13 5v14l-5.2-4.2H4z"/><path d="M16.5 8.8a4.6 4.6 0 0 1 0 6.4"/><path d="M19 6.3a8 8 0 0 1 0 11.4"/>',
  muted: '<path d="M4 9.2h3.8L13 5v14l-5.2-4.2H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
};

export function actionSvg(name, cls = '') {
  return `<svg class="gtc-ico gtc-ico--line ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ACTION_PATHS[name] || ''}</svg>`;
}

export const STAR_PATH =
  'M12 1.8l3.1 6.4l7 .9l-5.1 4.9l1.3 6.9L12 17.6l-6.3 3.3l1.3-6.9L1.9 9.1l7-.9z';

export function starSvg(cls = '') {
  return `<svg class="gtc-star ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
}

export function signalSvg() {
  return (
    '<svg class="gtc-sb-ico" viewBox="0 0 18 12" aria-hidden="true">' +
    '<rect x="0" y="8" width="3" height="4" rx=".6"/><rect x="5" y="5.5" width="3" height="6.5" rx=".6"/>' +
    '<rect x="10" y="3" width="3" height="9" rx=".6"/><rect x="15" y="0" width="3" height="12" rx=".6"/></svg>'
  );
}

export function batterySvg() {
  return (
    '<svg class="gtc-sb-ico gtc-sb-ico--bat" viewBox="0 0 26 12" aria-hidden="true">' +
    '<rect x=".75" y=".75" width="21.5" height="10.5" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/>' +
    '<rect x="2.6" y="2.6" width="15" height="6.8" rx="1.3"/><rect x="23.3" y="3.8" width="2" height="4.4" rx="1"/></svg>'
  );
}
