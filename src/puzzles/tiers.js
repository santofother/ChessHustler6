// Puzzle rating tiers ("street smarts" ranks). Shared by the browser PuzzleMode and tools/puzzles/*.
// Ranges are inclusive and contiguous; tierOf() clamps nothing — ratings outside all tiers return null.
export const TIERS = [
  { id: 'corner', index: 0, name: 'CORNER BOY', min: 600, max: 999, blurb: 'Hanging pieces and one-move mates. Learn the block.', icon: 'p' },
  { id: 'hustler', index: 1, name: 'HUSTLER', min: 1000, max: 1399, blurb: 'Forks, pins and quick two-move combos.', icon: 'n' },
  { id: 'shot', index: 2, name: 'SHOT CALLER', min: 1400, max: 1799, blurb: 'Deflections, skewers, cleaner kills.', icon: 'r' },
  { id: 'kingpin', index: 3, name: 'KINGPIN', min: 1800, max: 2200, blurb: 'Deep cuts. Only the city\'s sharpest eyes.', icon: 'q' },
];

export function tierOf(rating) {
  const r = Number(rating);
  return TIERS.find((t) => r >= t.min && r <= t.max) || null;
}

// Friendly labels for Lichess theme tags (anything missing falls back to a de-camel-cased tag)
export const THEME_LABELS = {
  mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mate: 'Checkmate',
  fork: 'Fork', pin: 'Pin', skewer: 'Skewer', hangingPiece: 'Free piece', discoveredAttack: 'Discovered attack',
  promotion: 'Promotion', backRankMate: 'Back-rank mate', smotheredMate: 'Smothered mate', doubleCheck: 'Double check',
  deflection: 'Deflection', attraction: 'Attraction', capturingDefender: 'Remove the defender',
  trappedPiece: 'Trapped piece', xRayAttack: 'X-ray', sacrifice: 'Sacrifice', advancedPawn: 'Runaway pawn',
};

// Themes worth showing as the puzzle's "job type" chip, in priority order
export const HEADLINE_THEMES = Object.keys(THEME_LABELS);

export function themeLabel(t) {
  return THEME_LABELS[t] || String(t).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
