// Grand Theft Chess — bootstrap.
// Wires World (src/world), Hud (src/ui), Sfx, AI and GameController together.
//
// URL params:
//   ?demo=world | ?demo=hud   -> run the standalone demo of that module instead of the game
//   ?demo=arena&arena=<id>&cam=white|black|top|cinematic[&time=..&boss=1][&react=capture|finale]
//                             -> static arena viewer (start position, no HUD, window.__world)
//   ?fps=1                    -> tiny fps meter (World)
//   ?quality=low|high         -> force arena quality
//   ?arena=<id>[&time=day|dusk|night][&boss=1] -> start in that arena (docs/arenas/ARENAS_SPEC.md)
//   ?cam=white|black|top|cinematic             -> camera preset after load (screenshots)

import { Sfx } from './audio/Sfx.js';
import { Music } from './audio/Music.js';
import { AudioSettings } from './ui/AudioSettings.js';
import { AI } from './chess/ai.js';
import { GameController } from './game/GameController.js';
import { World } from './world/World.js';
import { Hud } from './ui/Hud.js';

const DEMOS = {
  world: () => import('./world/demo.js'),
  arena: () => import('./world/demo.js').then((m) => ({ demo: m.arenaDemo })),
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
    showMessage('Unknown demo', `Use <code>?demo=world</code>, <code>?demo=arena&amp;arena=classic</code> or <code>?demo=hud</code>.`);
    return;
  }
  const mod = await load();
  // world demo renders into #app, hud demo into #hud
  await mod.demo(name === 'hud' ? hudEl : appEl);
}

/** ?arena=docks&time=night&boss=1 → { arena, variant } (empty object when absent). */
export function arenaFromUrl() {
  const id = params.get('arena');
  if (!id) return {};
  const variant = {};
  if (params.get('time')) variant.time = params.get('time');
  if (params.get('boss') || params.get('variant') === 'boss') variant.boss = true;
  if (params.get('street')) variant.street = Number(params.get('street')) || 1;
  return { arena: id, variant };
}

async function runGame() {
  const hud = new Hud(hudEl);
  hud.setLoading(0);

  const world = new World(appEl);
  await world.init({ onProgress: (p) => hud.setLoading(Math.min(0.99, p)), ...arenaFromUrl() });
  hud.setLoading(1);

  const sfx = new Sfx();
  // generated soundtrack (public/music, see tools/music/generate.mjs); without it Sfx keeps its synth loop
  const music = new Music(sfx);
  sfx.music = music;
  await music.load();
  music.onNowPlaying = (t) => {
    if (music.tag !== 'title') hud.flash(`${t.station}: Now playing “${t.title}”`, 'info');
  };
  // volume settings panel (phone SOUND button, title AUDIO SETTINGS, city map AUDIO, V key)
  sfx.onChange = (st) => hud.setMuted?.(st.muted);
  const audioPanel = new AudioSettings(hudEl, { sfx, music });
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA/.test(e.target?.tagName)) return;
    if (e.key === 'n' || e.key === 'N') music.next();
    if (e.key === 'v' || e.key === 'V') audioPanel.toggle();
  });
  const ai = new AI();
  const game = new GameController({ world, hud, sfx, ai });
  game.onAudio = () => audioPanel.toggle();

  // Hustler Mode (campaign) is loaded on demand the first time it is picked on the title menu
  let hustler = null;
  let hustlerLoading = null;
  game.onHustler = async () => {
    try {
      if (!hustler) {
        hustlerLoading ??= import('./hustler/HustlerController.js');
        const { HustlerController } = await hustlerLoading;
        hustler ??= new HustlerController({ world, hud, sfx, game, hudEl });
        window.__gtc.hustler = hustler;
      }
      await hustler.open();
    } catch (err) {
      console.error('[GTC] Hustler Mode failed to start', err);
      hustlerLoading = null;
      game.showMenu();
    }
  };
  game.showMenu();

  const cam = params.get('cam');
  if (cam) setTimeout(() => world.setCameraPreset(cam, { animate: false }), 300);

  // handy for debugging from the console
  window.__gtc = { world, hud, sfx, ai, game, hustler };
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
