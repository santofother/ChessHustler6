// Grand Theft Chess — 2D DOM HUD (owned by agent C).
// Public API: see docs/PLAN.md §1.5. Vanilla DOM + CSS, no external libs.
import './hud.css';
import {
  PIECE_NAMES,
  pieceSvg,
  piecePath2D,
  actionSvg,
  starSvg,
  signalSvg,
  batterySvg,
} from './icons.js';

const CREWS = {
  w: { name: 'VICE CREW', short: 'VICE', side: 'WHITE' },
  b: { name: 'CARTEL NOCTURNO', short: 'CARTEL', side: 'BLACK' },
};

const LEVELS = [
  { id: 1, name: 'STREET', desc: 'Corner-boy chess. Blunders pieces for pocket change.' },
  { id: 2, name: 'HUSTLER', desc: 'Knows a fork from a spoon. Still gets greedy.' },
  { id: 3, name: 'KINGPIN', desc: 'Calculates. Punishes every loose piece on the block.' },
  { id: 4, name: 'BOSS', desc: 'Runs the whole city. Nobody walks away clean.' },
];

const PRIORITY = { wasted: 3, passed: 3, busted: 3, wanted: 2, info: 1 };
const DURATION = { wasted: 3600, passed: 3600, busted: 3300, wanted: 1900, info: 3600 };
const FADE_MS = 380;

const PROMO = [
  { t: 'q', name: 'HELI', role: 'Queen', note: 'Goes anywhere. Top value.', key: '1' },
  { t: 'r', name: 'ARMORED TRUCK', role: 'Rook', note: 'Owns the boulevards.', key: '2' },
  { t: 'b', name: 'TOURING CAR', role: 'Bishop', note: 'Drifts the diagonals.', key: '3' },
  { t: 'n', name: 'SPORT BIKE', role: 'Knight', note: 'Jumps the traffic.', key: '4' },
];

const REASONS = {
  checkmate: 'CHECKMATE — THE BOSS HAS NOWHERE TO RUN',
  stalemate: 'STALEMATE — NOBODY CAN MAKE A MOVE',
  threefold: 'THREEFOLD REPETITION — SAME CORNER, THIRD TIME',
  insufficient: 'INSUFFICIENT FIREPOWER TO FINISH THE JOB',
  'fifty-move': 'FIFTY-MOVE RULE — THE HEAT DIED DOWN',
  resign: 'RESIGNED — THE CREW WALKED AWAY',
};

const TIPS = [
  'The Sport Bike (knight) is the only ride in town that can jump traffic.',
  'Armored Trucks (rooks) love open boulevards. Clear the lanes early.',
  'Touring Cars (bishops) only drift on their own color of asphalt.',
  'The Heli (queen) goes anywhere. Don’t lose her to a Street Thug.',
  'Protect The Boss. Cornered with no way out means WASTED.',
  'Valet parking: castle early to tuck The Boss behind an Armored Truck.',
  'A Street Thug that crosses the whole city gets a free upgrade.',
  'Every takedown pays. A Heli is worth $9,000 to whoever grabs it.',
  'Checks raise the heat. Five stars and the whole city is watching.',
  'En passant: a Thug can jump a rival who tries to sneak past.',
  'Stalemate isn’t a win. Everybody just gets BUSTED.',
  'Same position three times and the cops lose interest. Draw.',
];

const MAT = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const TAU = Math.PI * 2;

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function money(n) {
  n = Math.max(0, Math.round(n || 0));
  const s = String(n).padStart(6, '0');
  return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtClock(ms) {
  ms = Math.max(0, ms || 0);
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const hr = Math.floor(ms / 3600000);
  const p = (v) => String(v).padStart(2, '0');
  return (hr ? hr + ':' : '') + p(m) + ':' + p(s) + '.' + p(cs);
}
function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function reflow(el) {
  void el.offsetWidth; // restart CSS animations
}
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem('gtc.title') || 'null') || {};
  } catch {
    return {};
  }
}
function savePrefs(o) {
  try {
    localStorage.setItem('gtc.title', JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function statusBar() {
  return `<div class="gtc-sb"><span class="gtc-sb__time">${nowHHMM()}</span><span class="gtc-sb__notch"></span>` +
    `<span class="gtc-sb__right"><span class="gtc-sb__car">LEONIDA</span>${signalSvg()}${batterySvg()}</span></div>`;
}

function logoHTML(size = '') {
  return `<div class="gtc-logo ${size}">
    <div class="gtc-logo__badge" aria-hidden="true">
      <div class="gtc-logo__tile"><div class="gtc-logo__checks"></div>${pieceSvg('k', 'gtc-logo__king')}</div>
    </div>
    <div class="gtc-logo__words">
      <div class="gtc-logo__small">GRAND<br>THEFT</div>
      <div class="gtc-logo__big">CHESS</div>
      <div class="gtc-logo__sub"><span>VICE CITY GAMBIT</span></div>
    </div>
  </div>`;
}

export class Hud {
  constructor(rootEl) {
    this.root = rootEl;
    rootEl.classList.add('gtc-root');
    this.onAction = null;

    // state
    this._moves = [];
    this._movesKey = null;
    this._cash = { w: 0, b: 0 };
    this._cashShown = { w: 0, b: 0 };
    this._wanted = 0;
    this._turn = 'w';
    this._isPlayerTurn = true;
    this._thinking = false;
    this._opts = { mode: 'ai', playerColor: 'w', level: 2, ...loadPrefs() };
    this._clockText = '';
    this._moveNoText = '';
    this._elapsed = 0;
    this._mm = { board: null, last: null, orient: 'w' };
    this._flashActive = null;
    this._flashQueue = [];
    this._promo = null;
    this._over = null;
    this._title = null;
    this._muted = false;
    this._unread = 0;
    this._phoneOpen = !(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);

    this._build();

    this._onKey = (e) => this._handleKey(e);
    window.addEventListener('keydown', this._onKey);
    this._sbTimer = setInterval(() => {
      const t = nowHHMM();
      rootEl.querySelectorAll('.gtc-sb__time').forEach((el) => (el.textContent = t));
    }, 15000);
  }

  /* ------------------------------------------------------------------ build */
  _build() {
    const r = this.root;
    const E = (this.el = {});

    // --- loading
    E.loading = h('div', 'gtc-loading gtc-layer', `
      <div class="gtc-loading__bg"></div><div class="gtc-scan"></div>
      <div class="gtc-loading__center">${logoHTML('gtc-logo--md')}</div>
      <div class="gtc-loading__foot">
        <div class="gtc-loading__tip"><span class="gtc-tag">TIP</span><span class="gtc-loading__tiptext"></span></div>
        <div class="gtc-loading__row"><div class="gtc-loading__bar"><i></i></div><span class="gtc-loading__pct">0%</span></div>
      </div>
      <div class="gtc-spinner" aria-hidden="true"></div>`);
    E.loadBar = E.loading.querySelector('.gtc-loading__bar i');
    E.loadPct = E.loading.querySelector('.gtc-loading__pct');
    E.loadTip = E.loading.querySelector('.gtc-loading__tiptext');

    // --- in-game HUD
    E.game = h('div', 'gtc-game');
    // top-right cash + stars
    E.tr = h('div', 'gtc-tr', `
      <div class="gtc-cash" data-c="w"><span class="gtc-cash__crew"><i class="gtc-chip gtc-chip--w"></i>VICE CREW</span><span class="gtc-cash__amt">$000,000</span><span class="gtc-cash__pop"></span></div>
      <div class="gtc-cash" data-c="b"><span class="gtc-cash__crew"><i class="gtc-chip gtc-chip--b"></i>CARTEL</span><span class="gtc-cash__amt">$000,000</span><span class="gtc-cash__pop"></span></div>
      <div class="gtc-stars">${[0, 1, 2, 3, 4].map(() => starSvg()).join('')}</div>`);
    E.cash = {
      w: E.tr.querySelector('[data-c="w"]'),
      b: E.tr.querySelector('[data-c="b"]'),
    };
    E.stars = E.tr.querySelector('.gtc-stars');

    // bottom-left radar
    E.radar = h('div', 'gtc-radar', `
      <div class="gtc-radar__frame"><canvas class="gtc-radar__cv"></canvas></div>
      <div class="gtc-radar__bars">
        <span class="gtc-radar__bar gtc-radar__bar--w" title="Vice Crew firepower"><b></b></span>
        <span class="gtc-radar__bar gtc-radar__bar--b" title="Cartel Nocturno firepower"><b></b></span>
      </div>`);
    E.canvas = E.radar.querySelector('canvas');
    E.barW = E.radar.querySelector('.gtc-radar__bar--w b');
    E.barB = E.radar.querySelector('.gtc-radar__bar--b b');

    // notification feed (above radar)
    E.feed = h('div', 'gtc-feed');

    // bottom-right race block
    E.race = h('div', 'gtc-race', `
      <div class="gtc-race__row gtc-race__row--sm"><span class="gtc-race__lbl">TURN</span><i class="gtc-race__div"></i><span class="gtc-race__turn"><i class="gtc-chip gtc-chip--w"></i><b>VICE CREW</b></span></div>
      <div class="gtc-race__row gtc-race__row--md"><span class="gtc-race__lbl">MOVE</span><i class="gtc-race__div"></i><span class="gtc-race__move">1</span></div>
      <div class="gtc-race__row gtc-race__row--lg"><span class="gtc-race__clock">00:00.00</span></div>`);
    E.raceTurn = E.race.querySelector('.gtc-race__turn');
    E.raceMove = E.race.querySelector('.gtc-race__move');
    E.raceClock = E.race.querySelector('.gtc-race__clock');

    // subtitle (turn banner)
    E.subtitle = h('div', 'gtc-subtitle');

    // phone
    E.phoneTab = h('button', 'gtc-phonetab gtc-int', `${actionSvg('phone')}<span>MOVES</span><em class="gtc-phonetab__badge"></em><i class="gtc-phonetab__dots"><b></b><b></b><b></b></i>`);
    E.phoneTab.type = 'button';
    E.phoneTab.setAttribute('aria-label', 'Open phone');
    E.phone = h('div', 'gtc-phone gtc-int', `
      <div class="gtc-phone__screen">
        ${statusBar()}
        <div class="gtc-app__head">
          <div class="gtc-app__avatar">${pieceSvg('k')}</div>
          <div class="gtc-app__title"><b>CREW CHAT</b><span class="gtc-app__subt">Move log</span></div>
          <button class="gtc-app__min" type="button" aria-label="Minimize phone">${actionSvg('chevron')}</button>
        </div>
        <div class="gtc-moves"><div class="gtc-moves__list"></div>
          <div class="gtc-typing"><span class="gtc-typing__who">CARTEL IS PLANNING…</span><span class="gtc-typing__bub"><b></b><b></b><b></b></span></div>
        </div>
        <div class="gtc-dock">
          ${[
            ['undo', 'UNDO'],
            ['resign', 'RESIGN'],
            ['flip', 'FLIP'],
            ['camera', 'CAMERA'],
            ['mute', 'SOUND'],
            ['menu', 'MENU'],
          ]
            .map(
              ([a, l]) =>
                `<button type="button" class="gtc-app gtc-app--${a}" data-action="${a}"><span class="gtc-app__ico">${actionSvg(a)}</span><span class="gtc-app__lbl">${l}</span></button>`,
            )
            .join('')}
        </div>
      </div>`);
    E.moveList = E.phone.querySelector('.gtc-moves__list');
    E.movesScroll = E.phone.querySelector('.gtc-moves');
    E.typing = E.phone.querySelector('.gtc-typing');
    E.typingWho = E.phone.querySelector('.gtc-typing__who');
    E.appSubt = E.phone.querySelector('.gtc-app__subt');
    E.muteBtn = E.phone.querySelector('[data-action="mute"]');
    E.resignBtn = E.phone.querySelector('[data-action="resign"]');

    E.phone.querySelector('.gtc-app__min').addEventListener('click', () => this._setPhone(false));
    E.phoneTab.addEventListener('click', () => this._setPhone(true));
    E.phone.querySelector('.gtc-dock').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (b) this._action(b.dataset.action, b);
    });

    E.game.append(E.tr, E.radar, E.feed, E.race, E.subtitle, E.phone, E.phoneTab);

    // --- overlays
    E.banner = h('div', 'gtc-banner gtc-layer');
    E.promo = h('div', 'gtc-modal gtc-layer');
    E.over = h('div', 'gtc-over gtc-layer');
    E.title = h('div', 'gtc-title gtc-layer');

    r.append(E.game, E.banner, E.title, E.promo, E.over, E.loading);

    this._setPhone(this._phoneOpen, true);
    this._renderRadarBars();

    // radar: DPR-correct redraw on resize
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._drawMinimap());
      this._ro.observe(E.canvas);
    } else {
      window.addEventListener('resize', () => this._drawMinimap());
    }
    this._drawMinimap();
  }

  /* --------------------------------------------------------------- loading */
  setLoading(p) {
    p = Math.max(0, Math.min(1, +p || 0));
    const E = this.el;
    E.loadBar.style.transform = `scaleX(${p})`;
    E.loadPct.textContent = Math.round(p * 100) + '%';
    if (p < 1) {
      clearTimeout(this._loadHideT);
      if (!E.loading.classList.contains('is-open')) {
        E.loading.classList.add('is-open');
        E.loading.classList.remove('is-closing');
        this._tipIdx = Math.floor(Math.random() * TIPS.length);
        this._showTip();
        clearInterval(this._tipT);
        this._tipT = setInterval(() => this._showTip(), 3400);
      }
    } else if (E.loading.classList.contains('is-open')) {
      clearTimeout(this._loadHideT);
      this._loadHideT = setTimeout(() => {
        E.loading.classList.add('is-closing');
        this._loadHideT = setTimeout(() => {
          E.loading.classList.remove('is-open', 'is-closing');
          clearInterval(this._tipT);
        }, 500);
      }, 350);
    }
  }
  _showTip() {
    const t = this.el.loadTip;
    this._tipIdx = (this._tipIdx + 1) % TIPS.length;
    t.classList.remove('is-in');
    reflow(t);
    t.textContent = TIPS[this._tipIdx];
    t.classList.add('is-in');
  }

  /* ----------------------------------------------------------------- title */
  showTitle({ onStart } = {}) {
    this._closeOver();
    this._closePromo('q');
    this._clearFlashes();
    this.setThinking(false);
    this.root.classList.remove('is-ingame');
    const E = this.el;
    const o = this._opts;
    if (![1, 2, 3, 4].includes(o.level)) o.level = 2;
    if (o.mode !== 'local') o.mode = 'ai';
    if (o.playerColor !== 'b') o.playerColor = 'w';

    E.title.innerHTML = `
      <div class="gtc-title__bg"></div><div class="gtc-title__glow"></div><div class="gtc-scan"></div>
      <div class="gtc-title__left">
        ${logoHTML('gtc-logo--lg')}
        <p class="gtc-title__tag">One board. Thirty-two criminals. Real chess rules.</p>
      </div>
      <div class="gtc-title__menu gtc-int">
        <div class="gtc-pm">
          ${statusBar()}
          <div class="gtc-pm__head"><span class="gtc-pm__kicker">LEONIDA · NEW MISSION</span><b>SET UP THE JOB</b></div>
          <div class="gtc-pm__row" data-row="mode">
            <div class="gtc-pm__lbl">MODE</div>
            <div class="gtc-seg" data-key="mode">
              <button type="button" data-v="ai"></button>
              <button type="button" data-v="local">LOCAL 2P</button>
            </div>
          </div>
          <div class="gtc-pm__row" data-row="playerColor">
            <div class="gtc-pm__lbl">YOUR CREW</div>
            <div class="gtc-seg gtc-seg--crew" data-key="playerColor">
              <button type="button" data-v="w"><i class="gtc-chip gtc-chip--w"></i><span>VICE CREW<small>WHITE · MOVES FIRST</small></span></button>
              <button type="button" data-v="b"><i class="gtc-chip gtc-chip--b"></i><span>CARTEL NOCTURNO<small>BLACK</small></span></button>
            </div>
          </div>
          <div class="gtc-pm__row" data-row="level">
            <div class="gtc-pm__lbl">DIFFICULTY</div>
            <div class="gtc-seg gtc-seg--lvl" data-key="level">
              ${LEVELS.map((l) => `<button type="button" data-v="${l.id}"><span>${l.name}</span><em>${'<i></i>'.repeat(l.id)}</em></button>`).join('')}
            </div>
            <div class="gtc-pm__desc"></div>
          </div>
          <button type="button" class="gtc-start" data-row="start"><span>START MISSION</span>${actionSvg('chevron')}</button>
          <div class="gtc-pm__hint"><span><kbd>↑</kbd><kbd>↓</kbd> SELECT</span><span><kbd>←</kbd><kbd>→</kbd> CHANGE</span><span><kbd>ENTER</kbd> START</span></div>
        </div>
      </div>`;

    const rows = () => [...E.title.querySelectorAll('[data-row]')].filter((x) => !x.classList.contains('is-hidden'));
    const render = () => {
      E.title.querySelector('[data-v="ai"]').textContent = `VS ${CREWS[o.playerColor === 'w' ? 'b' : 'w'].short} AI`;
      E.title.querySelectorAll('.gtc-seg').forEach((seg) => {
        const k = seg.dataset.key;
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-sel', String(o[k]) === b.dataset.v));
      });
      const ai = o.mode === 'ai';
      E.title.querySelector('[data-row="playerColor"]').classList.toggle('is-hidden', !ai);
      E.title.querySelector('[data-row="level"]').classList.toggle('is-hidden', !ai);
      E.title.querySelector('.gtc-pm__desc').textContent = LEVELS[o.level - 1].desc;
      const rs = rows();
      if (this._titleFocus >= rs.length) this._titleFocus = rs.length - 1;
      rs.forEach((x, i) => x.classList.toggle('is-focus', i === this._titleFocus));
    };
    const start = () => {
      if (!this._title) return;
      const opts = { mode: o.mode, playerColor: o.playerColor, level: o.level };
      savePrefs(opts);
      this._title = null;
      E.title.classList.add('is-closing');
      setTimeout(() => {
        E.title.classList.remove('is-open', 'is-closing');
        E.title.innerHTML = '';
      }, 420);
      this.root.classList.add('is-ingame');
      this._drawMinimap();
      try {
        onStart?.(opts);
      } catch (err) {
        console.error(err);
      }
    };
    const change = (key, dir) => {
      const vals = key === 'mode' ? ['ai', 'local'] : key === 'playerColor' ? ['w', 'b'] : [1, 2, 3, 4];
      const i = vals.indexOf(o[key]);
      o[key] = vals[Math.max(0, Math.min(vals.length - 1, i + dir))];
      render();
    };

    E.title.querySelectorAll('.gtc-seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const k = seg.dataset.key;
        o[k] = k === 'level' ? +b.dataset.v : b.dataset.v;
        this._titleFocus = rows().indexOf(seg.closest('[data-row]'));
        render();
      });
    });
    E.title.querySelector('.gtc-start').addEventListener('click', start);

    this._titleFocus = rows().length - 1; // START focused by default
    this._title = {
      key: (e) => {
        const rs = rows();
        const cur = rs[this._titleFocus];
        switch (e.key) {
          case 'ArrowUp':
            this._titleFocus = (this._titleFocus - 1 + rs.length) % rs.length;
            render();
            return true;
          case 'ArrowDown':
          case 'Tab':
            this._titleFocus = (this._titleFocus + 1) % rs.length;
            render();
            return true;
          case 'ArrowLeft':
          case 'ArrowRight':
            if (cur && cur.dataset.row !== 'start') change(cur.dataset.row, e.key === 'ArrowLeft' ? -1 : 1);
            return true;
          case 'Enter':
          case ' ':
            start();
            return true;
        }
        return false;
      },
    };
    render();
    E.title.classList.remove('is-closing');
    E.title.classList.add('is-open');
  }

  /* ------------------------------------------------------------ turn/clock */
  setTurn(color, isPlayerTurn) {
    color = color === 'b' ? 'b' : 'w';
    const changed = color !== this._turn || !!isPlayerTurn !== this._isPlayerTurn || !this._turnShown;
    this._turn = color;
    this._isPlayerTurn = !!isPlayerTurn;
    this._turnShown = true;
    if (!this._title) this.root.classList.add('is-ingame');
    const E = this.el;
    E.raceTurn.innerHTML = `<i class="gtc-chip gtc-chip--${color}"></i><b>${esc(this._crews[color].name)}</b>`;
    E.cash.w.classList.toggle('is-turn', color === 'w');
    E.cash.b.classList.toggle('is-turn', color === 'b');
    this._updateTyping();
    if (changed) {
      const who = `<span class="gtc-name gtc-name--${color}">${esc(this._crews[color].name)}</span>`;
      const line = isPlayerTurn
        ? this._opts.mode === 'ai'
          ? `Your move, ${who}.`
          : `${who}, you're up.`
        : `${who} is making moves…`;
      this._subtitle(line);
    }
  }

  _subtitle(html) {
    const s = this.el.subtitle;
    clearTimeout(this._subT);
    s.innerHTML = `<span>${html}</span>`;
    s.classList.remove('is-on');
    reflow(s);
    s.classList.add('is-on');
    this._subT = setTimeout(() => s.classList.remove('is-on'), 2200);
  }

  setThinking(on) {
    this._thinking = !!on;
    this._updateTyping();
  }
  _updateTyping() {
    const E = this.el;
    E.typingWho.textContent = `${this._crews[this._turn].short} IS PLANNING…`;
    E.typing.classList.toggle('is-on', this._thinking);
    E.phoneTab.classList.toggle('is-typing', this._thinking);
    E.race.classList.toggle('is-thinking', this._thinking);
    if (this._thinking) this._scrollMoves();
  }

  setClock({ moveNo, elapsedMs } = {}) {
    this._elapsed = elapsedMs || 0;
    const t = fmtClock(elapsedMs);
    if (t !== this._clockText) {
      this._clockText = t;
      this.el.raceClock.textContent = t;
    }
    const m = String(moveNo ?? 1);
    if (m !== this._moveNoText) {
      this._moveNoText = m;
      this.el.raceMove.textContent = m;
    }
  }

  /* ------------------------------------------------------------ move list */
  setMoves(sanList = []) {
    const list = Array.isArray(sanList) ? sanList.map(String) : [];
    const key = list.join(' ');
    if (key === this._movesKey) return;
    const grew = list.length > this._moves.length;
    this._movesKey = key;
    this._moves = list;
    let html = '';
    for (let i = 0; i < list.length; i += 2) {
      const n = i / 2 + 1;
      html += `<div class="gtc-mv"><span class="gtc-mv__n">${n}</span>${this._sanCell(list[i], 'w', i === list.length - 1)}${
        list[i + 1] != null ? this._sanCell(list[i + 1], 'b', i + 1 === list.length - 1) : '<span class="gtc-mv__c gtc-mv__c--empty"></span>'
      }</div>`;
    }
    if (!list.length) html = `<div class="gtc-moves__empty">${pieceSvg('p')}<span>No moves yet.<br>Make the first play.</span></div>`;
    this.el.moveList.innerHTML = html;
    this.el.appSubt.textContent = list.length ? `${list.length} move${list.length > 1 ? 's' : ''} logged` : 'Move log';
    this._scrollMoves();
    if (grew && !this._phoneOpen) {
      this._unread += list.length - (this._prevLen || 0);
      this._renderUnread();
    }
    this._prevLen = list.length;
  }
  _sanCell(san, color, latest) {
    let s = san;
    let type = 'p';
    let castle = false;
    if (/^O-O/.test(s)) {
      type = 'k';
      castle = true;
    } else if (/^[KQRBN]/.test(s)) {
      type = s[0].toLowerCase();
      s = s.slice(1);
    }
    let suffix = '';
    const chk = s.match(/[+#]+$/);
    if (chk) {
      s = s.slice(0, -chk[0].length);
      suffix = chk[0].includes('#') ? '<b class="gtc-mv__mate">#</b>' : '<b class="gtc-mv__chk">+</b>';
    }
    let promo = '';
    const pm = s.match(/=([QRBN])/);
    if (pm) {
      s = s.replace(/=([QRBN])/, '');
      promo = `<span class="gtc-mv__promo">→${pieceSvg(pm[1].toLowerCase())}</span>`;
    }
    const txt = esc(s).replace('x', '<i class="gtc-mv__x">x</i>');
    const tip = castle ? 'Valet parking (castle)' : PIECE_NAMES[type];
    return `<span class="gtc-mv__c gtc-mv__c--${color}${latest ? ' is-latest' : ''}" title="${esc(tip)}">${pieceSvg(type)}<span class="gtc-mv__san">${txt}</span>${promo}${suffix}</span>`;
  }
  _scrollMoves() {
    const sc = this.el.movesScroll;
    requestAnimationFrame(() => (sc.scrollTop = sc.scrollHeight));
  }

  _setPhone(open, instant) {
    this._phoneOpen = !!open;
    this.root.classList.toggle('is-phone-open', this._phoneOpen);
    if (instant) {
      this.el.phone.classList.add('no-anim');
      requestAnimationFrame(() => this.el.phone.classList.remove('no-anim'));
    }
    if (open) {
      this._unread = 0;
      this._renderUnread();
      this._scrollMoves();
    }
  }
  _renderUnread() {
    const b = this.el.phoneTab.querySelector('.gtc-phonetab__badge');
    b.textContent = this._unread > 9 ? '9+' : String(this._unread);
    b.classList.toggle('is-on', this._unread > 0);
  }

  _action(name, btn) {
    if (name === 'resign') {
      // two-tap confirm
      if (!this._resignArmed) {
        this._resignArmed = true;
        btn.classList.add('is-armed');
        btn.querySelector('.gtc-app__lbl').textContent = 'SURE?';
        clearTimeout(this._resignT);
        this._resignT = setTimeout(() => this._disarmResign(), 2600);
        return;
      }
      this._disarmResign();
    }
    if (name === 'mute') this.setMuted(!this._muted);
    btn.classList.remove('is-tap');
    reflow(btn);
    btn.classList.add('is-tap');
    try {
      this.onAction?.(name);
    } catch (err) {
      console.error(err);
    }
  }
  _disarmResign() {
    this._resignArmed = false;
    clearTimeout(this._resignT);
    const b = this.el.resignBtn;
    b.classList.remove('is-armed');
    b.querySelector('.gtc-app__lbl').textContent = 'RESIGN';
  }
  /** Optional extra (not in the contract): reflect mute state set elsewhere. */
  setMuted(m) {
    this._muted = !!m;
    const b = this.el.muteBtn;
    b.querySelector('.gtc-app__ico').innerHTML = actionSvg(this._muted ? 'muted' : 'mute');
    b.querySelector('.gtc-app__lbl').textContent = this._muted ? 'MUTED' : 'SOUND';
    b.classList.toggle('is-off', this._muted);
  }

  /* ------------------------------------------------------------ cash/heat */
  setCash({ w, b } = {}) {
    const prev = { ...this._cash };
    if (Number.isFinite(+w)) this._cash.w = +w;
    if (Number.isFinite(+b)) this._cash.b = +b;
    for (const c of ['w', 'b']) {
      const d = this._cash[c] - prev[c];
      if (d > 0) this._cashPop(c, d);
    }
    if (typeof document !== 'undefined' && document.hidden) {
      // rAF is paused in background tabs: jump straight to the value
      this._cashShown = { ...this._cash };
      for (const c of ['w', 'b']) this.el.cash[c].querySelector('.gtc-cash__amt').textContent = money(this._cash[c]);
      return;
    }
    this._cashFrom = { ...this._cashShown };
    this._cashT0 = performance.now();
    if (!this._cashRaf) this._cashRaf = requestAnimationFrame((t) => this._cashTick(t));
  }
  _cashTick(t) {
    const k = Math.min(1, (t - this._cashT0) / 750);
    const e = 1 - Math.pow(1 - k, 3);
    for (const c of ['w', 'b']) {
      const v = this._cashFrom[c] + (this._cash[c] - this._cashFrom[c]) * e;
      this._cashShown[c] = v;
      const txt = money(v);
      const amt = this.el.cash[c].querySelector('.gtc-cash__amt');
      if (amt.textContent !== txt) amt.textContent = txt;
    }
    if (k < 1) this._cashRaf = requestAnimationFrame((tt) => this._cashTick(tt));
    else this._cashRaf = 0;
  }
  _cashPop(c, d) {
    const el = this.el.cash[c];
    const pop = el.querySelector('.gtc-cash__pop');
    pop.textContent = '+$' + Math.round(d).toLocaleString('en-US');
    el.classList.remove('is-gain');
    reflow(el);
    el.classList.add('is-gain');
  }

  setWanted(level) {
    level = Math.max(0, Math.min(5, Math.round(+level || 0)));
    const prev = this._wanted;
    this._wanted = level;
    const stars = [...this.el.stars.children];
    stars.forEach((s, i) => {
      const on = i < level;
      s.classList.toggle('is-on', on);
      if (on && i >= prev) {
        s.classList.remove('is-new');
        reflow(s);
        s.classList.add('is-new');
      }
    });
    this.el.stars.classList.toggle('is-any', level > 0);
    if (level > prev) {
      const st = this.el.stars;
      st.classList.remove('is-flash');
      reflow(st);
      st.classList.add('is-flash');
      clearTimeout(this._starT);
      this._starT = setTimeout(() => st.classList.remove('is-flash'), 1600);
    }
  }

  /* ---------------------------------------------------------------- flash */
  flash(text, style = 'info') {
    if (!PRIORITY[style]) style = 'info';
    const pr = PRIORITY[style];
    return new Promise((resolve) => {
      const item = { text: String(text ?? ''), style, pr, resolve };
      const a = this._flashActive;
      if (!a) return this._startFlash(item);
      if (pr > a.pr) {
        this._endFlash(true);
        this._flashQueue = this._flashQueue.filter((q) => (q.pr >= pr ? true : (q.resolve(), false)));
        this._startFlash(item);
      } else if (pr === a.pr) {
        this._flashQueue.push(item);
      } else {
        resolve(); // lower priority while busy -> dropped
      }
    });
  }
  _startFlash(item) {
    this._flashActive = item;
    if (item.style === 'info') this._showToast(item);
    else this._showBanner(item);
    item.timer = setTimeout(() => this._endFlash(false), DURATION[item.style]);
  }
  _endFlash(instant) {
    const a = this._flashActive;
    if (!a) return;
    clearTimeout(a.timer);
    this._flashActive = null;
    const done = () => {
      a.resolve();
      if (!this._flashActive && this._flashQueue.length) this._startFlash(this._flashQueue.shift());
    };
    if (a.style === 'info') {
      const card = a.card;
      if (instant) {
        card?.remove();
        a.resolve();
        return;
      }
      card?.classList.add('is-out');
      setTimeout(() => {
        card?.remove();
        done();
      }, FADE_MS);
      return;
    }
    const b = this.el.banner;
    if (instant) {
      b.className = 'gtc-banner gtc-layer';
      b.innerHTML = '';
      a.resolve();
      return;
    }
    b.classList.add('is-out');
    setTimeout(() => {
      if (this._flashActive && this._flashActive.style !== 'info') return done(); // new banner took over
      b.className = 'gtc-banner gtc-layer';
      b.innerHTML = '';
      done();
    }, FADE_MS);
  }
  _clearFlashes() {
    const q = this._flashQueue;
    this._flashQueue = [];
    q.forEach((x) => x.resolve());
    this._endFlash(true);
    this.el.feed.innerHTML = '';
  }

  _showBanner({ text, style }) {
    const b = this.el.banner;
    const [main, ...rest] = text.split('\n');
    let sub = rest.join(' ');
    if (style === 'passed' && !sub) sub = 'RESPECT +';
    const extra =
      style === 'wanted'
        ? `<div class="gtc-banner__stars">${[0, 1, 2, 3, 4].map((i) => starSvg(i < this._wanted ? 'is-on' : '')).join('')}</div>`
        : '';
    b.className = `gtc-banner gtc-layer gtc-banner--${style}`;
    b.innerHTML = `<div class="gtc-banner__fx"></div>${style === 'wanted' ? '<div class="gtc-scan gtc-scan--hot"></div>' : ''}
      <div class="gtc-banner__band"><div class="gtc-banner__text" data-text="${esc(main)}">${esc(main)}</div>${
        sub ? `<div class="gtc-banner__sub">${esc(sub)}</div>` : ''
      }${extra}</div>`;
    reflow(b);
    b.classList.add('is-on');
  }

  _showToast(item) {
    let sender;
    let msg = item.text;
    const m = msg.match(/^([A-Z0-9 .'&-]{2,24}):\s*(.+)$/s);
    if (m) {
      sender = m[1];
      msg = m[2];
    } else if (this._opts.mode === 'ai') {
      sender = this._crews[this._opts.playerColor === 'w' ? 'b' : 'w'].name;
    } else {
      sender = 'VICE CITY RADIO';
    }
    const aiColor =
      sender === this._crews.b.name || /CARTEL/.test(sender) ? 'b' : sender === this._crews.w.name || /VICE/.test(sender) ? 'w' : 'x';
    const card = h('div', `gtc-toast gtc-toast--${aiColor}`, `
      <div class="gtc-toast__av">${pieceSvg(aiColor === 'x' ? 'q' : 'k')}</div>
      <div class="gtc-toast__body"><div class="gtc-toast__top"><b>${esc(sender)}</b><span>now</span></div>
      <div class="gtc-toast__msg">${esc(msg)}</div></div>`);
    item.card = card;
    this.el.feed.appendChild(card);
  }

  /* ------------------------------------------------------------ promotion */
  showPromotion(color = 'w') {
    this._closePromo('q');
    color = color === 'b' ? 'b' : 'w';
    return new Promise((resolve) => {
      const E = this.el;
      let focus = 0;
      E.promo.innerHTML = `
        <div class="gtc-modal__dim"></div>
        <div class="gtc-promo gtc-int gtc-promo--${color}" role="dialog" aria-label="Upgrade your ride">
          ${statusBar()}
          <div class="gtc-promo__head"><span class="gtc-pm__kicker">AUTO SHOP · ${esc(this._crews[color].name)}</span><b>UPGRADE YOUR RIDE</b>
          <p>Your Street Thug crossed the whole city. Pick the new wheels.</p></div>
          <div class="gtc-promo__grid">
            ${PROMO.map(
              (p, i) => `<button type="button" class="gtc-promo__card" data-t="${p.t}" data-i="${i}">
                <span class="gtc-promo__ico">${pieceSvg(p.t)}</span>
                <b>${p.name}</b><small>${p.role} · ${p.note}</small>
                <kbd>${p.t.toUpperCase()}</kbd></button>`,
            ).join('')}
          </div>
          <div class="gtc-pm__hint"><span><kbd>Q</kbd><kbd>R</kbd><kbd>B</kbd><kbd>N</kbd> PICK</span><span><kbd>ENTER</kbd> CONFIRM</span></div>
        </div>`;
      const cards = [...E.promo.querySelectorAll('.gtc-promo__card')];
      const paint = () => cards.forEach((c, i) => c.classList.toggle('is-focus', i === focus));
      const pick = (t) => this._closePromo(t);
      cards.forEach((c) => {
        c.addEventListener('click', () => pick(c.dataset.t));
        c.addEventListener('mouseenter', () => {
          focus = +c.dataset.i;
          paint();
        });
      });
      E.promo.querySelector('.gtc-modal__dim').addEventListener('click', () => pick('q'));
      this._promo = {
        resolve,
        key: (e) => {
          const k = e.key.toLowerCase();
          if ('qrbn'.includes(k) && k.length === 1) return pick(k), true;
          if ('1234'.includes(k) && k.length === 1) return pick(PROMO[+k - 1].t), true;
          if (k === 'escape') return pick('q'), true;
          if (k === 'enter' || k === ' ') return pick(PROMO[focus].t), true;
          if (k === 'arrowright' || k === 'arrowdown') return (focus = (focus + (k === 'arrowdown' ? 2 : 1)) % 4), paint(), true;
          if (k === 'arrowleft' || k === 'arrowup') return (focus = (focus + (k === 'arrowup' ? 2 : 3)) % 4), paint(), true;
          return false;
        },
      };
      paint();
      reflow(E.promo);
      E.promo.classList.add('is-open');
    });
  }
  _closePromo(val) {
    const p = this._promo;
    if (!p) return;
    this._promo = null;
    const m = this.el.promo;
    m.classList.add('is-closing');
    setTimeout(() => {
      if (this._promo) return;
      m.classList.remove('is-open', 'is-closing');
      m.innerHTML = '';
    }, 260);
    p.resolve(val);
  }

  /* ------------------------------------------------------------- game over */
  showGameOver({ result = 'draw', reason = 'checkmate', perspective = null, onRematch, onMenu } = {}) {
    this._closeOver(true);
    this._closePromo('q');
    this.setThinking(false);
    const E = this.el;
    let kind;
    let head;
    let sub;
    if (result === 'draw') {
      kind = 'busted';
      head = 'MISSION FAILED';
      sub = 'NOBODY GETS PAID';
    } else if (perspective === 'w' || perspective === 'b') {
      const won = result === perspective;
      kind = won ? 'passed' : 'wasted';
      head = won ? 'MISSION PASSED' : 'WASTED';
      sub = won ? 'RESPECT +' : `${CREWS[result].name} RUNS THE CITY`;
    } else {
      kind = 'passed';
      head = `${CREWS[result].name} WINS`;
      sub = `${CREWS[result === 'w' ? 'b' : 'w'].name} GOT WASTED`;
    }
    const why = REASONS[reason] || String(reason || '').toUpperCase();
    const moves = this._moves.length;
    const stat = (k, v) => `<div class="gtc-over__stat"><span>${k}</span><i></i><b>${v}</b></div>`;
    E.over.className = `gtc-over gtc-layer gtc-over--${kind}`;
    E.over.innerHTML = `
      <div class="gtc-over__dim"></div>
      <div class="gtc-over__card gtc-int" role="dialog" aria-label="${esc(head)}">
        <div class="gtc-over__kicker">${esc(why)}</div>
        <div class="gtc-over__head${head.length > 10 ? ' is-long' : ''}">${esc(head)}</div>
        <div class="gtc-over__sub">${esc(sub)}</div>
        <div class="gtc-over__stats">
          ${stat('MOVES PLAYED', moves)}
          ${stat('TIME ON THE JOB', fmtClock(this._elapsed))}
          ${stat('VICE CREW TAKE', money(this._cash.w))}
          ${stat('CARTEL NOCTURNO TAKE', money(this._cash.b))}
          ${stat('HEAT', `<span class="gtc-over__stars">${[0, 1, 2, 3, 4].map((i) => starSvg(i < this._wanted ? 'is-on' : '')).join('')}</span>`)}
        </div>
        <div class="gtc-over__btns">
          <button type="button" class="gtc-btn gtc-btn--primary" data-b="rematch">REMATCH</button>
          <button type="button" class="gtc-btn" data-b="menu">MAIN MENU</button>
        </div>
      </div>`;
    const go = (which) => {
      if (!this._over) return;
      this._closeOver();
      try {
        (which === 'rematch' ? onRematch : onMenu)?.();
      } catch (err) {
        console.error(err);
      }
    };
    E.over.querySelector('[data-b="rematch"]').addEventListener('click', () => go('rematch'));
    E.over.querySelector('[data-b="menu"]').addEventListener('click', () => go('menu'));
    this._over = {
      key: (e) => {
        const k = e.key.toLowerCase();
        if (k === 'enter' || k === 'r') return go('rematch'), true;
        if (k === 'm' || k === 'escape') return go('menu'), true;
        return false;
      },
    };
    reflow(E.over);
    E.over.classList.add('is-open');
  }
  _closeOver(instant) {
    if (!this._over && !this.el.over.classList.contains('is-open')) return;
    this._over = null;
    const o = this.el.over;
    if (instant) {
      o.className = 'gtc-over gtc-layer';
      o.innerHTML = '';
      return;
    }
    o.classList.add('is-closing');
    setTimeout(() => {
      if (this._over) return;
      o.className = 'gtc-over gtc-layer';
      o.innerHTML = '';
    }, 320);
  }

  /* --------------------------------------------------------------- hideAll */
  hideAll() {
    this._clearFlashes();
    this._closePromo('q');
    this._closeOver(true);
    this.setThinking(false);
    this._disarmResign();
    clearTimeout(this._subT);
    this.el.subtitle.classList.remove('is-on');
    if (this._title) {
      this._title = null;
      this.el.title.classList.remove('is-open', 'is-closing');
      this.el.title.innerHTML = '';
    }
    const L = this.el.loading;
    L.classList.remove('is-open', 'is-closing');
    clearInterval(this._tipT);
  }

  /* --------------------------------------------------------------- keyboard */
  _handleKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    let handled = false;
    if (this._promo) handled = this._promo.key(e);
    else if (this._over) handled = this._over.key(e);
    else if (this._title) handled = this._title.key(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /* ---------------------------------------------------------------- minimap */
  updateMinimap(boardArray, lastMove = null, orientation = 'w') {
    this._mm = { board: boardArray, last: lastMove, orient: orientation === 'b' ? 'b' : 'w' };
    this._renderRadarBars();
    this._drawMinimap();
  }
  _renderRadarBars() {
    const mat = { w: 0, b: 0 };
    const board = this._mm.board;
    if (board) {
      for (const row of board) for (const c of row || []) if (c) mat[c.color] += MAT[c.type] || 0;
    } else {
      mat.w = mat.b = 39;
    }
    this.el.barW.style.transform = `scaleX(${Math.min(1, mat.w / 39)})`;
    this.el.barB.style.transform = `scaleX(${Math.min(1, mat.b / 39)})`;
  }
  _drawMinimap() {
    const cv = this.el.canvas;
    const cw = cv.clientWidth;
    const ch = cv.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.round(cw * dpr);
    const H = Math.round(ch * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const { board, last, orient } = this._mm;
    const bs = Math.floor(Math.min(ch - 18, cw * 0.62));
    const s = bs / 8;
    const bx = Math.round((cw - bs) / 2 - cw * 0.06);
    const by = Math.round((ch - bs) / 2);

    // land
    ctx.fillStyle = '#5b6e66';
    ctx.fillRect(0, 0, cw, ch);
    // city blocks
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = -10; x < cw; x += 26) for (let y = -6; y < ch; y += 22) ctx.fillRect(x + ((y / 22) % 2) * 6, y, 18, 14);
    // ocean (right)
    const ox = bx + bs + 16;
    const g = ctx.createLinearGradient(ox, 0, cw, 0);
    g.addColorStop(0, '#3f8fae');
    g.addColorStop(1, '#2c6d8f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox + 8, 0);
    for (let y = 0; y <= ch; y += 12) ctx.lineTo(ox + Math.sin(y * 0.09) * 5 + (y / ch) * 10, y);
    ctx.lineTo(cw, ch);
    ctx.lineTo(cw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9c99a'; // beach strip
    ctx.globalAlpha = 0.35;
    ctx.fillRect(ox - 4, 0, 4, ch);
    ctx.globalAlpha = 1;
    // roads
    ctx.strokeStyle = '#9aa7a1';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, s * 0.34);
    ctx.beginPath();
    ctx.moveTo(0, by + bs * 0.5);
    ctx.lineTo(bx, by + bs * 0.5);
    ctx.moveTo(bx + bs * 0.5, 0);
    ctx.lineTo(bx + bs * 0.5, by);
    ctx.moveTo(bx + bs * 0.5, by + bs);
    ctx.lineTo(bx + bs * 0.5, ch);
    ctx.moveTo(bx + bs, by + bs * 0.5);
    ctx.lineTo(ox, by + bs * 0.5);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, s * 0.22);
    ctx.strokeRect(bx - 5, by - 5, bs + 10, bs + 10);

    // board
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx + 2, by + 3, bs, bs);
    const toXY = (sq) => {
      const f = sq.charCodeAt(0) - 97;
      const r = +sq[1] - 1;
      const col = orient === 'w' ? f : 7 - f;
      const row = orient === 'w' ? 7 - r : r;
      return [bx + (col + 0.5) * s, by + (row + 0.5) * s, col, row];
    };
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const light = (f + r) % 2 === 1;
        const col = orient === 'w' ? f : 7 - f;
        const row = orient === 'w' ? 7 - r : r;
        ctx.fillStyle = light ? '#b9c6bf' : '#3c4a47';
        ctx.fillRect(bx + col * s, by + row * s, Math.ceil(s), Math.ceil(s));
      }
    // last move tint
    if (last && last.from && last.to) {
      ctx.fillStyle = 'rgba(255,211,107,0.45)';
      for (const sq of [last.from, last.to]) {
        const [, , col, row] = toXY(sq);
        ctx.fillRect(bx + col * s, by + row * s, Math.ceil(s), Math.ceil(s));
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);

    // last-move arrow (under blips)
    if (last && last.from && last.to) {
      const [x1, y1] = toXY(last.from);
      const [x2, y2] = toXY(last.to);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const head = Math.max(6, s * 0.55);
      const end = Math.max(0, len - s * 0.36);
      ctx.save();
      ctx.translate(x1, y1);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(end - head * 0.8, 0);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(20,10,30,0.7)';
      ctx.lineWidth = Math.max(4, s * 0.26);
      ctx.stroke();
      ctx.strokeStyle = '#ffd36b';
      ctx.lineWidth = Math.max(2, s * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(end, 0);
      ctx.lineTo(end - head, -head * 0.55);
      ctx.lineTo(end - head, head * 0.55);
      ctx.closePath();
      ctx.fillStyle = '#ffd36b';
      ctx.strokeStyle = 'rgba(20,10,30,0.7)';
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // blips
    if (board) {
      for (const row of board)
        for (const c of row || []) {
          if (!c || !c.square) continue;
          const [x, y] = toXY(c.square);
          const big = c.type !== 'p';
          const rad = s * (big ? 0.43 : 0.3);
          const white = c.color === 'w';
          ctx.beginPath();
          ctx.arc(x, y + 1, rad, 0, TAU);
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, TAU);
          ctx.fillStyle = white ? '#f7f5ef' : '#17151c';
          ctx.fill();
          ctx.lineWidth = Math.max(1.2, s * 0.09);
          ctx.strokeStyle = white ? '#ff5fa2' : '#c6ff3d';
          if (c.type === 'k') ctx.strokeStyle = white ? '#29e3d6' : '#ffcc4d';
          ctx.stroke();
          const p2d = big && s >= 13 ? piecePath2D(c.type) : null;
          if (p2d) {
            const sz = rad * 1.35;
            ctx.save();
            ctx.translate(x - sz / 2, y - sz / 2);
            ctx.scale(sz / 24, sz / 24);
            ctx.fillStyle = white ? '#1b1036' : '#ffcc4d';
            ctx.fill(p2d);
            ctx.restore();
          }
        }
    }

    // north marker
    const nx = bx + bs / 2;
    const ny = Math.max(9, by - 2);
    ctx.beginPath();
    ctx.arc(nx, ny, 7, 0, TAU);
    ctx.fillStyle = 'rgba(10,10,14,0.85)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(orient === 'w' ? 'N' : 'S', nx, ny + 0.5);

    // edge vignette
    const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cw, ch);
  }
}

export default Hud;
