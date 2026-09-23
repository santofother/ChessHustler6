// Grand Theft Chess — bootstrap.
// Wires World (src/world), Hud (src/ui), Sfx, AI and GameController together.
//
// URL params:
//   ?demo=world | ?demo=hud   -> run the standalone demo of that module instead of the game
//   ?stubs=1                  -> use the throwaway stubs in src/_stubs/ for World/Hud (dev only)
//
// World/Hud/demo modules are resolved through import.meta.glob so that the build and the page keep
// working (with a readable on-screen message) while those modules do not exist yet.

import { Sfx } from './audio/Sfx.js';
import { AI } from './chess/ai.js';
import { GameController } from './game/GameController.js';

const worldMods = import.meta.glob('./world/World.js');
const hudMods = import.meta.glob('./ui/Hud.js');
const demoMods = import.meta.glob(['./world/demo.js', './ui/demo.js']);
const stubMods = import.meta.glob('./_stubs/*.js');

const DEMOS = { world: './world/demo.js', hud: './ui/demo.js' };

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

async function loadModule(mods, path, what) {
  const loader = mods[path];
  if (!loader) {
    const e = new Error(`${what} module "${path.replace('./', 'src/')}" does not exist yet.`);
    e.missing = true;
    throw e;
  }
  return loader();
}

async function runDemo(name) {
  const path = DEMOS[name];
  if (!path) {
    showMessage('Unknown demo', `Use <code>?demo=world</code> or <code>?demo=hud</code>.`);
    return;
  }
  const mod = await loadModule(demoMods, path, `Demo "${name}"`);
  if (typeof mod.demo !== 'function') throw new Error(`${path} must export async function demo(el)`);
  // world demo renders into #app, hud demo into #hud
  await mod.demo(name === 'world' ? appEl : hudEl);
}

async function resolveWorldAndHud() {
  const useStubs = params.get('stubs') === '1';
  if (useStubs) {
    const [w, h] = await Promise.all([stubMods['./_stubs/World.js']?.(), stubMods['./_stubs/Hud.js']?.()]);
    if (!w || !h) throw new Error('?stubs=1 requested but src/_stubs/World.js / Hud.js are missing.');
    console.warn('[GTC] running with stub World/Hud');
    return { World: w.World, Hud: h.Hud };
  }
  const [w, h] = await Promise.all([
    loadModule(worldMods, './world/World.js', 'World'),
    loadModule(hudMods, './ui/Hud.js', 'Hud'),
  ]);
  if (typeof w.World !== 'function') throw new Error('src/world/World.js must export class World');
  if (typeof h.Hud !== 'function') throw new Error('src/ui/Hud.js must export class Hud');
  return { World: w.World, Hud: h.Hud };
}

async function runGame() {
  const { World, Hud } = await resolveWorldAndHud();

  const hud = new Hud(hudEl);
  hud.setLoading?.(0);

  const world = new World(appEl);
  await world.init({ onProgress: (p) => hud.setLoading?.(Math.min(0.99, p)) });
  hud.setLoading?.(1);

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
    if (err && err.missing) {
      showMessage(
        'Under construction',
        `${escapeHtml(err.message)}<br/>The crew is still building this part of Vice City. ` +
          `Try <a href="?demo=world">?demo=world</a>, <a href="?demo=hud">?demo=hud</a> ` +
          `or <a href="?stubs=1">?stubs=1</a> (dev stubs).`,
      );
    } else {
      showMessage('WASTED (boot error)', 'Something blew up while starting the game.', errText(err));
    }
  }
}

window.addEventListener('error', (e) => {
  if (!document.querySelector('.gtc-boot-msg') && e.error) console.error('[GTC] uncaught:', e.error);
});

boot();
