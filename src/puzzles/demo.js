// Standalone PuzzleMode demo: builds a World in #app and a Hud in #hud, then runs the Hustle Board with a
// fake payout table. Usage: import('./puzzles/demo.js').then(m => m.demo(document.getElementById('hud')))
import { World } from '../world/World.js';
import { Hud } from '../ui/Hud.js';
import { Sfx } from '../audio/Sfx.js';
import { PuzzleMode } from './PuzzleMode.js';

// stand-in for balance.PUZZLES (the campaign supplies the real one)
const FAKE = { rewardByRating: [[999, 300], [1399, 600], [1799, 1000], [2200, 1600]], repeatReward: 0.2, assisted: 0.5 };

export async function demo(el) {
  const hudEl = el || document.getElementById('hud');
  const hud = new Hud(hudEl);
  hud.setLoading(0);
  const world = new World(document.getElementById('app'));
  await world.init({ onProgress: (p) => hud.setLoading(Math.min(0.99, p)) });
  hud.setLoading(1);

  let sfx = null;
  try {
    sfx = new Sfx();
    const wake = () => sfx.resume();
    window.addEventListener('pointerdown', wake, { once: true });
  } catch (_) {
    sfx = null;
  }

  const root = document.createElement('div');
  hudEl.appendChild(root);
  const pm = new PuzzleMode({ world, hud, sfx, rootEl: root });
  const solvedIds = new Set();
  const log = [];
  window.__puzzles = { pm, world, hud, solvedIds, log };

  const rewardFor = (p, { firstTry, repeat }) => {
    const row = FAKE.rewardByRating.find(([max]) => p.rating <= max) || FAKE.rewardByRating.at(-1);
    let v = row[1];
    if (!firstTry) v *= FAKE.assisted;
    if (repeat) v *= FAKE.repeatReward;
    return Math.round(v / 50) * 50;
  };
  const onSolved = (p, info) => {
    solvedIds.add(p.id);
    log.push({ id: p.id, ...info });
    console.log('[puzzle demo] solved', p.id, p.rating, info);
  };

  for (;;) {
    const res = await pm.run({ solvedIds, rewardFor, onSolved });
    console.log('[puzzle demo] exited to map', res);
    await new Promise((r) => setTimeout(r, 800)); // pretend the map was shown, then reopen
  }
}
