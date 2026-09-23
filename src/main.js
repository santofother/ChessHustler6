// Grand Theft Chess — bootstrap.
// Wires World (src/world), Hud (src/ui), Sfx, AI and GameController together.
//
// URL params:
//   ?demo=world | ?demo=hud   -> run the standalone demo of that module instead of the game

import { Sfx } from './audio/Sfx.js';
import { AI } from './chess/ai.js';
import { GameController } from './game/GameController.js';
import { World } from './world/World.js';
import { Hud } from './ui/Hud.js';

const DEMOS = {
  world: () => import('./world/demo.js'),
  hud: () => import('./ui/demo.js'),
};

const params = new URLSearchParams(location.search);
const appEl = document.getElementById('app');
const hudEl = document.getElementById('hud');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showMessage(title, body, detail) {
  let el = document.querySelector('.gtc-boot-msg');
  if (!el) {
    el = document.createElement('div');
    el.className = 'gtc-boot-msg';
    document.body.appendChild(el);
  }
  el.innerHTML =
    `<h1>${escapeHtml(title)}</h1><div>${body}</div>` + (detail ? `<pre>${escapeHtml(detail)}</pre>` : '');
  return el;
}

function errText(err) {
  if (!err) return 'Unknown error';
  return (err.stack || err.message || String(err)).split('\n').slice(0, 8).join('\n');
}

async function runDemo(name) {
  const load = DEMOS[name];
  if (!load) {
    showMessage('Unknown demo', `Use <code>?demo=world</code> or <code>?demo=hud</code>.`);
    return;
  }
  const mod = await load();
  // world demo renders into #app, hud demo into #hud
  await mod.demo(name === 'world' ? appEl : hudEl);
}

async function runGame() {
  const hud = new Hud(hudEl);
  hud.setLoading(0);

  const world = new World(appEl);
  await world.init({ onProgress: (p) => hud.setLoading(Math.min(0.99, p)) });
  hud.setLoading(1);

  const sfx = new Sfx();
  const ai = new AI();
  const game = new GameController({ world, hud, sfx, ai });
  game.showMenu();

  // handy for debugging from the console
  window.__gtc = { world, hud, sfx, ai, game };
}

async function boot() {
  const demo = params.get('demo');
  try {
    if (demo) await runDemo(demo);
    else await runGame();
  } catch (err) {
    console.error('[GTC] boot failed:', err);
    showMessage('WASTED (boot error)', 'Something blew up while starting the game.', errText(err));
  }
}

boot();
