// Hustler Mode — DOM screens (start card, new campaign, story beats, recruit shop, results, confirm, stats,
// save import/export, toast). Every screen returns a Promise that resolves exactly once; showing a new screen
// (or clear()) resolves the previous one with `null`, so async flows can never hang on a dead screen.
import './hustler.css';
import { pieceSvg, PIECE_NAMES, signalSvg, batterySvg } from '../../ui/icons.js';

const TYPES = ['p', 'n', 'b', 'r', 'q'];
const ORDER_BIG = ['q', 'r', 'b', 'n', 'p'];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function money(n, signed = false) {
  const v = Math.round(Number(n) || 0);
  const s = '$' + Math.abs(v).toLocaleString('en-US');
  if (v < 0) return '-' + s;
  return signed ? '+' + s : s;
}
function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function statusBar() {
  const d = new Date();
  const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return `<div class="gtc-sb"><span class="gtc-sb__time">${t}</span><span class="gtc-sb__notch"></span>` +
    `<span class="gtc-sb__right"><span class="gtc-sb__car">LEONIDA</span>${signalSvg()}${batterySvg()}</span></div>`;
}
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);

export function portraitHTML(p = {}, size = '') {
  const bg = isHex(p.bg) ? p.bg : '#333';
  const fg = isHex(p.fg) ? p.fg : '#fff';
  return `<div class="gth-portrait ${size ? 'gth-portrait--' + size : ''}" style="background:${bg};color:${fg}">${esc(
    p.initials || '??',
  )}${p.emoji ? `<em>${esc(p.emoji)}</em>` : ''}</div>`;
}
export function armyHTML(army = {}, withKing = true) {
  const parts = [];
  if (withKing) parts.push(`<span class="gth-army__pc" title="${PIECE_NAMES.k}">${pieceSvg('k')}</span>`);
  for (const t of ORDER_BIG) {
    const n = army[t] || 0;
    if (n > 0) parts.push(`<span class="gth-army__pc" title="${esc(PIECE_NAMES[t])}">${pieceSvg(t)}${n > 1 ? '×' + n : ''}</span>`);
  }
  return `<div class="gth-army">${parts.join('')}</div>`;
}
export function starsHTML(n = 1) {
  return `<span class="gth-stars" aria-label="${n} of 5">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'is-on' : ''}"></i>`).join('')}</span>`;
}

export class Screens {
  constructor(rootEl, { sfx } = {}) {
    this.root = rootEl;
    this.sfx = sfx;
    this.cur = null; // { el, resolve, key }
    this._onKey = (e) => {
      if (!this.cur?.key || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.cur.key(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  click() {
    try {
      this.sfx?.play('click');
    } catch {
      /* ignore */
    }
  }

  /** Close the current screen (its promise resolves with `value`, default null). */
  clear(value = null) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const el = c.el;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
    try {
      c.resolve(value);
    } catch {
      /* ignore */
    }
  }

  _open(html, { cls = '', key = null, dim = true } = {}) {
    this.clear(null);
    const el = h('div', `gth-layer ${cls}`, (dim ? `<div class="gth-dim${dim === 'light' ? ' gth-dim--light' : ''}"></div>` : '') + html);
    this.root.appendChild(el);
    let resolve;
    const p = new Promise((r) => (resolve = r));
    const entry = { el, resolve, key };
    this.cur = entry;
    const done = (v) => {
      if (this.cur !== entry) return;
      this.clear(v);
    };
    return { el, done, promise: p, entry };
  }

  toast(text, ms = 2600) {
    const t = h('div', 'gth-toast', esc(text));
    this.root.appendChild(t);
    setTimeout(() => t.classList.add('is-out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }

  // =================================================================== start card
  /** @returns Promise<'continue'|'new'|'import'|'menu'|null> */
  start({ peek, city }) {
    const { el, done, promise, entry } = this._open(
      `<div class="gth-start">
        <div class="gth-brand">
          <div class="gth-brand__small">GRAND THEFT CHESS</div>
          <div class="gth-brand__big">HUSTLER<br>MODE</div>
          <p class="gth-brand__tag">${esc(city?.tagline || '')} ${esc(city?.blurb || '')}</p>
        </div>
        <div class="gth-phone gth-int">
          ${statusBar()}
          <div class="gth-head"><span class="gth-kicker">${esc(city?.region || 'Leonida')} · Campaign</span><b class="gth-title">RUN THE CITY</b></div>
          ${
            peek
              ? `<div class="gth-save"><b>${esc(peek.gangName)}</b><span class="gth-cash">${money(peek.cash)}</span>
                 <span>${peek.owned} turf · ${peek.gameNo} jobs${peek.finished ? ' · CITY BOSS' : ''}</span></div>`
              : ''
          }
          <div class="gth-btns">
            ${peek ? '<button type="button" class="gth-btn gth-btn--primary" data-a="continue">CONTINUE</button>' : ''}
            <button type="button" class="gth-btn ${peek ? '' : 'gth-btn--primary'}" data-a="new">NEW CAMPAIGN</button>
            <button type="button" class="gth-btn gth-btn--ghost" data-a="import">IMPORT SAVE</button>
            <button type="button" class="gth-btn gth-btn--ghost" data-a="menu">MAIN MENU</button>
          </div>
        </div>
      </div>`,
    );
    el.querySelectorAll('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        this.click();
        done(b.dataset.a);
      }),
    );
    entry.key = (e) => {
      if (e.key === 'Escape') return done('menu'), true;
      if (e.key === 'Enter') return done(peek ? 'continue' : 'new'), true;
      return false;
    };
    return promise;
  }

  // =================================================================== new campaign
  /** @returns Promise<string|null> gang name */
  newCampaign({ defaultName, city }) {
    const { el, done, promise, entry } = this._open(
      `<div class="gth-phone gth-int gth-modal">
        ${statusBar()}
        <div class="gth-head"><span class="gth-kicker">New campaign · ${esc(city?.name || 'Vice City')}</span><b class="gth-title">NAME YOUR CREW</b>
        <p class="gth-p">${esc(city?.tagline || '')}</p></div>
        <label class="gth-label" for="gth-gang">GANG NAME</label>
        <input id="gth-gang" class="gth-input" maxlength="28" autocomplete="off" spellcheck="false" value="${esc(defaultName)}">
        <div class="gth-err"></div>
        <div class="gth-btns">
          <button type="button" class="gth-btn gth-btn--primary" data-a="go">START THE HUSTLE</button>
          <button type="button" class="gth-btn gth-btn--ghost" data-a="back">BACK</button>
        </div>
      </div>`,
    );
    const input = el.querySelector('input');
    const err = el.querySelector('.gth-err');
    const go = () => {
      const name = input.value.replace(/\s+/g, ' ').trim();
      if (name.length < 2) {
        err.textContent = 'Every crew needs a name (2+ characters).';
        input.focus();
        return;
      }
      this.click();
      done(name);
    };
    el.querySelector('[data-a="go"]').addEventListener('click', go);
    el.querySelector('[data-a="back"]').addEventListener('click', () => (this.click(), done(null)));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
      e.stopPropagation(); // keep M/U/F shortcuts out of the text field
    });
    entry.key = (e) => (e.key === 'Escape' ? (done(null), true) : false);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
    return promise;
  }

  // =================================================================== story beats
  /** Paged story popup. @returns Promise<void> */
  story({ kicker = '', title = '', lines = [], cta = 'CONTINUE' }) {
    const list = (lines || []).filter(Boolean);
    let i = 0;
    const { el, done, promise, entry } = this._open(
      `<div class="gth-story gth-int">
        <div class="gth-story__kicker">${esc(kicker)}</div>
        <div class="gth-story__title">${esc(title)}</div>
        <div class="gth-story__line"></div>
        <div class="gth-story__dots">${list.length > 1 ? list.map(() => '<i></i>').join('') : ''}</div>
        <div class="gth-btns"><button type="button" class="gth-btn gth-btn--primary" data-a="next"></button>
        ${list.length > 1 ? '<button type="button" class="gth-btn gth-btn--ghost" data-a="skip">SKIP</button>' : ''}</div>
      </div>`,
    );
    const lineEl = el.querySelector('.gth-story__line');
    const next = el.querySelector('[data-a="next"]');
    const dots = [...el.querySelectorAll('.gth-story__dots i')];
    const paint = () => {
      lineEl.style.animation = 'none';
      void lineEl.offsetWidth;
      lineEl.style.animation = '';
      lineEl.textContent = list[i] || '';
      dots.forEach((d, k) => d.classList.toggle('is-on', k === i));
      next.textContent = i < list.length - 1 ? 'NEXT' : cta;
    };
    const adv = () => {
      this.click();
      if (i < list.length - 1) {
        i++;
        paint();
      } else done();
    };
    next.addEventListener('click', adv);
    el.querySelector('[data-a="skip"]')?.addEventListener('click', () => (this.click(), done()));
    entry.key = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') return adv(), true;
      if (e.key === 'Escape') return done(), true;
      return false;
    };
    paint();
    return promise;
  }

  // =================================================================== confirm
  /** @returns Promise<boolean> */
  confirm({ kicker = 'Heads up', title = 'ARE YOU SURE?', text = '', yes = 'YES', no = 'CANCEL', danger = false }) {
    const { el, done, promise, entry } = this._open(
      `<div class="gth-phone gth-int gth-modal">
        ${statusBar()}
        <div class="gth-head"><span class="gth-kicker">${esc(kicker)}</span><b class="gth-title">${esc(title)}</b>
        ${text ? `<p class="gth-p">${esc(text)}</p>` : ''}</div>
        <div class="gth-btns gth-btns--2">
          <button type="button" class="gth-btn" data-a="no">${esc(no)}</button>
          <button type="button" class="gth-btn ${danger ? 'gth-btn--danger' : 'gth-btn--primary'}" data-a="yes">${esc(yes)}</button>
        </div>
      </div>`,
      { dim: 'light' },
    );
    el.querySelector('[data-a="yes"]').addEventListener('click', () => (this.click(), done(true)));
    el.querySelector('[data-a="no"]').addEventListener('click', () => (this.click(), done(false)));
    el.querySelector('.gth-dim').addEventListener('click', () => done(false));
    entry.key = (e) => {
      if (e.key === 'Escape') return done(false), true;
      if (e.key === 'Enter') return done(true), true;
      return false;
    };
    return promise.then((v) => v === true);
  }

  // =================================================================== save text (export/import)
  /** mode 'export' shows text; 'import' returns pasted text (or null). */
  saveText({ mode, text = '' }) {
    const exp = mode === 'export';
    const { el, done, promise, entry } = this._open(
      `<div class="gth-phone gth-int gth-modal">
        ${statusBar()}
        <div class="gth-head"><span class="gth-kicker">Burner phone · backup</span><b class="gth-title">${exp ? 'EXPORT SAVE' : 'IMPORT SAVE'}</b>
        <p class="gth-p">${exp ? 'Copy this text somewhere safe. Paste it into IMPORT SAVE to restore the campaign.' : 'Paste an exported Hustler save. It replaces the current campaign.'}</p></div>
        <textarea class="gth-text" spellcheck="false" ${exp ? 'readonly' : ''}>${esc(text)}</textarea>
        <div class="gth-err"></div>
        <div class="gth-btns gth-btns--2">
          <button type="button" class="gth-btn" data-a="close">${exp ? 'CLOSE' : 'CANCEL'}</button>
          <button type="button" class="gth-btn gth-btn--primary" data-a="ok">${exp ? 'COPY' : 'IMPORT'}</button>
        </div>
      </div>`,
      { dim: 'light' },
    );
    const ta = el.querySelector('textarea');
    const err = el.querySelector('.gth-err');
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    el.querySelector('[data-a="close"]').addEventListener('click', () => (this.click(), done(null)));
    el.querySelector('[data-a="ok"]').addEventListener('click', async () => {
      this.click();
      if (!exp) return done(ta.value);
      try {
        await navigator.clipboard.writeText(ta.value);
        err.style.color = 'var(--cash)';
        err.textContent = 'Copied to the clipboard.';
      } catch {
        ta.select();
        err.textContent = 'Clipboard blocked: select the text and copy it manually.';
      }
    });
    entry.key = (e) => (e.key === 'Escape' ? (done(null), true) : false);
    return { promise, setError: (t) => (err.textContent = t) };
  }

  // =================================================================== stats
  /** @returns Promise<'export'|'import'|'new'|'close'|null> */
  stats(view) {
    const s = view.stats || {};
    const kv = (k, v) => `<div><span>${esc(k)}</span><b>${v}</b></div>`;
    const owned = view.nodes.filter((n) => n.status === 'owned' || n.status === 'contested').length;
    const { el, done, promise, entry } = this._open(
      `<div class="gth-phone gth-int gth-modal">
        ${statusBar()}
        <div class="gth-head"><span class="gth-kicker">Rap sheet</span><b class="gth-title">${esc(view.gangName)}</b></div>
        <div class="gth-kv">
          ${kv('CASH', `<span class="gth-cash">${money(view.cash)}</span>`)}
          ${kv('TURF', `${owned}/17`)}
          ${kv('JOBS', view.gameNo)}
          ${kv('WINS', s.wins || 0)}
          ${kv('LOSSES', s.losses || 0)}
          ${kv('STANDOFFS', s.standoffs || 0)}
          ${kv('EARNED', money(s.earned))}
          ${kv('SPENT ON CREWS', money(s.spent))}
          ${kv('PUZZLE CASH', money(s.puzzleCash))}
        </div>
        <div class="gth-btns gth-btns--2">
          <button type="button" class="gth-btn" data-a="export">EXPORT SAVE</button>
          <button type="button" class="gth-btn" data-a="import">IMPORT SAVE</button>
        </div>
        <div class="gth-btns">
          <button type="button" class="gth-btn gth-btn--ghost gth-btn--danger" data-a="new">NEW CAMPAIGN</button>
          <button type="button" class="gth-btn gth-btn--primary" data-a="close">BACK TO THE MAP</button>
        </div>
      </div>`,
      { dim: 'light' },
    );
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => (this.click(), done(b.dataset.a))));
    el.querySelector('.gth-dim').addEventListener('click', () => done('close'));
    entry.key = (e) => (e.key === 'Escape' ? (done('close'), true) : false);
    return promise;
  }

  // =================================================================== recruit shop
  /**
   * @param match   Campaign.prepareMatch()/prepareDefense() result
   * @param opts    { cart }  previous selection (coming back from deploy)
   * @returns Promise<{action:'start', army} | {action:'back'} | {action:'decline'} | null>
   */
  recruit(match, { cart } = {}) {
    const L = match.leader;
    const P = match.prices;
    const max = match.maxArmy;
    const buy = { p: 0, n: 0, b: 0, r: 0, q: 0, ...(cart || {}) };
    const defense = match.kind === 'defense';
    const cost = () => TYPES.reduce((s, t) => s + buy[t] * P[t], 0);
    const total = () => TYPES.reduce((s, t) => s + buy[t], 0) + (match.freePawns || 0);
    const gang = L.colors || {};
    const gStyle = `${isHex(gang.primary) ? `--gang:${gang.primary};` : ''}${isHex(gang.accent) ? `--gang-accent:${gang.accent};` : ''}`;
    const bounty = match.captureBounty || {};
    const kicker = defense ? `Defend your turf · ${match.nodeName}` : `${match.type === 'city' ? 'The final job' : match.type === 'boss' ? 'Boss fight' : 'Street job'} · ${match.nodeName}`;
    const line = defense ? L.lines.challenge : L.lines.intro;

    const { el, done, promise, entry } = this._open(
      `<div class="gth-recruit">
        <div class="gth-job gth-int" style="${gStyle}">
          <span class="gth-kicker">${esc(kicker)}</span>
          <div class="gth-leader" style="margin-top:10px">
            ${portraitHTML(L.portrait)}
            <div>
              <div class="gth-leader__name">${esc(L.name)}</div>
              <div class="gth-leader__alias">${L.alias ? `"${esc(L.alias)}"` : ''}</div>
              <div class="gth-leader__meta">${esc(L.title)} · ${esc(L.gangName)}</div>
            </div>
          </div>
          <p class="gth-p">${esc(L.blurb)}</p>
          ${L.gimmick ? `<div class="gth-gimmick">${esc(L.gimmick)}</div>` : ''}
          ${line ? `<div class="gth-sms"><b>SMS · ${esc((L.alias || L.name).toUpperCase())}</b>${esc(line)}</div>` : ''}
          <div class="gth-sect">THEIR CREW · ${starsHTML(match.stars)} <span class="gth-small">${esc(match.profile?.label || '')}</span></div>
          ${armyHTML(match.botArmy)}
          <div class="gth-sect">THE PAYOUT${match.retake ? ' <span class="gth-small">(RETAKE — REDUCED)</span>' : ''}</div>
          <div class="gth-kv">
            <div><span>${defense ? 'HOLD IT' : 'WIN'}</span><b class="gth-cash">${money(match.reward?.win)}</b></div>
            <div><span>STANDOFF</span><b class="gth-cash">${money(match.reward?.standoff)}</b></div>
            <div><span>PER PIECE TAKEN</span><b class="gth-cash">${money(bounty.p)}–${money(Math.max(...TYPES.map((t) => bounty[t] || 0)))}</b></div>
          </div>
          ${defense ? `<p class="gth-p">Lose (or walk away) and ${esc(match.nodeName)} changes hands.</p>` : ''}
        </div>
        <div class="gth-phone gth-int">
          ${statusBar()}
          <div class="gth-head"><span class="gth-kicker">Crew for hire · paid per job</span><b class="gth-title">HIRE A CREW</b></div>
          <div class="gth-shop__rows">
            <div class="gth-row"><div class="gth-row__ico">${pieceSvg('k')}</div>
              <div><div class="gth-row__name">${esc(PIECE_NAMES.k)}</div><div class="gth-row__sub">That's you. Always free, always on the job.</div></div>
              <div class="gth-step"><b>1</b></div></div>
            ${TYPES.map(
              (t) => `<div class="gth-row" data-t="${t}"><div class="gth-row__ico">${pieceSvg(t)}</div>
                <div><div class="gth-row__name">${esc(PIECE_NAMES[t])}</div><div class="gth-row__sub"><span class="gth-cash">${money(P[t])}</span> · max <span data-max></span></div></div>
                <div class="gth-step"><button type="button" data-d="-1" aria-label="Fire one">−</button><b data-n>0</b><button type="button" data-d="1" aria-label="Hire one">+</button></div></div>`,
            ).join('')}
          </div>
          ${match.loan ? `<div class="gth-loan"><b>${esc(match.loan.label.toUpperCase())}</b> · +${match.loan.pawns} free ${esc(PIECE_NAMES.p)}s this job. ${esc(match.loan.message)}</div>` : ''}
          <div class="gth-hint"><span>Recommended: <b data-rec></b></span><button type="button" data-a="rec">USE IT</button></div>
          <div class="gth-total"><span>CASH LEFT</span><span class="gth-cash" data-left></span></div>
          <div class="gth-err" data-err></div>
          <div class="gth-btns">
            <button type="button" class="gth-btn gth-btn--primary" data-a="start">DEPLOY THE CREW</button>
            <div class="gth-btns gth-btns--2" style="margin-top:0">
              <button type="button" class="gth-btn gth-btn--ghost" data-a="back">${defense ? 'NOT NOW' : 'BACK TO MAP'}</button>
              ${defense ? '<button type="button" class="gth-btn gth-btn--ghost gth-btn--danger" data-a="decline">GIVE IT UP</button>' : '<button type="button" class="gth-btn gth-btn--ghost" data-a="clear">FIRE ALL</button>'}
            </div>
          </div>
        </div>
      </div>`,
    );
    const rec = match.recommended || {};
    const recTxt = ORDER_BIG.filter((t) => rec[t]).map((t) => `${rec[t]} ${PIECE_NAMES[t]}${rec[t] > 1 ? 's' : ''}`).join(', ') || 'anything';
    el.querySelector('[data-rec]').textContent = recTxt;
    const errEl = el.querySelector('[data-err]');
    const leftEl = el.querySelector('[data-left]');
    const startBtn = el.querySelector('[data-a="start"]');
    const render = () => {
      const left = match.cash - cost();
      for (const t of TYPES) {
        const row = el.querySelector(`[data-t="${t}"]`);
        row.querySelector('[data-n]').innerHTML = buy[t] + (t === 'p' && match.freePawns ? `<small>+${match.freePawns}</small>` : '');
        row.querySelector('[data-max]').textContent = max[t] + (t === 'p' && match.freePawns ? ` (+${match.freePawns} free)` : '');
        row.querySelector('[data-d="1"]').disabled = buy[t] >= max[t] || left < P[t];
        row.querySelector('[data-d="-1"]').disabled = buy[t] <= 0;
        row.classList.toggle('is-hired', buy[t] > 0 || (t === 'p' && match.freePawns > 0));
      }
      leftEl.textContent = money(left);
      leftEl.classList.toggle('gth-neg', left < 0);
      const okTotal = total() >= (match.minArmy || 0);
      startBtn.disabled = left < 0 || !okTotal;
      errEl.textContent = !okTotal ? 'Hire at least one piece. The Boss does not work alone.' : '';
    };
    el.querySelectorAll('[data-t]').forEach((row) =>
      row.addEventListener('click', (e) => {
        const b = e.target.closest('[data-d]');
        if (!b || b.disabled) return;
        const t = row.dataset.t;
        buy[t] = Math.max(0, Math.min(max[t], buy[t] + +b.dataset.d));
        try {
          this.sfx?.play(+b.dataset.d > 0 ? 'cash' : 'click');
        } catch {
          /* ignore */
        }
        render();
      }),
    );
    el.querySelector('[data-a="rec"]').addEventListener('click', () => {
      this.click();
      // greedy: biggest pieces first, as many of the recommendation as the wallet allows
      for (const t of TYPES) buy[t] = 0;
      let left = match.cash;
      for (const t of ORDER_BIG) {
        const want = Math.max(0, Math.min(max[t], (rec[t] || 0) - (t === 'p' ? match.freePawns || 0 : 0)));
        const n = Math.min(want, Math.floor(left / P[t]));
        buy[t] = n;
        left -= n * P[t];
      }
      render();
    });
    el.querySelector('[data-a="clear"]')?.addEventListener('click', () => {
      this.click();
      for (const t of TYPES) buy[t] = 0;
      render();
    });
    startBtn.addEventListener('click', () => {
      if (startBtn.disabled) return;
      this.click();
      done({ action: 'start', army: { ...buy } });
    });
    el.querySelector('[data-a="back"]').addEventListener('click', () => (this.click(), done({ action: 'back', cart: { ...buy } })));
    el.querySelector('[data-a="decline"]')?.addEventListener('click', () => (this.click(), done({ action: 'decline' })));
    entry.key = (e) => {
      if (e.key === 'Escape') return done({ action: 'back', cart: { ...buy } }), true;
      if (e.key === 'Enter' && !startBtn.disabled) return done({ action: 'start', army: { ...buy } }), true;
      return false;
    };
    render();
    return promise;
  }

  // =================================================================== results
  /** @returns Promise<void> */
  results(r, { nodeName }) {
    const head = r.result === 'win' ? (r.kind === 'defense' ? 'TURF HELD' : 'MISSION PASSED') : r.result === 'loss' ? 'WASTED' : 'STANDOFF';
    const kicker = `${r.kind === 'defense' ? 'Defense' : 'Job'} · ${nodeName}${r.reason ? ' · ' + String(r.reason).replace(/-/g, ' ') : ''}`;
    const rows = r.lines
      .map(
        (l, i) => `<div class="gth-ledger__row" style="animation-delay:${0.25 + i * 0.12}s"><span>${esc(l.label.toUpperCase())}${
          l.note ? `<small>${esc(l.note)}</small>` : ''
        }</span><i></i><b class="${l.amount < 0 ? 'gth-neg' : ''}">${money(l.amount, true)}</b></div>`,
      )
      .join('');
    const chips = [
      ...r.gained.map((id) => `<span class="gth-chip gth-chip--gain">+ ${esc(r.names[id] || id)}</span>`),
      ...r.lost.map((id) => `<span class="gth-chip gth-chip--lost">− ${esc(r.names[id] || id)}</span>`),
    ].join('');
    const L = r.leader;
    const { el, done, promise, entry } = this._open(
      `<div class="gth-results gth-int gth-results--${r.result}">
        <span class="gth-kicker">${esc(kicker)}</span>
        <div class="gth-results__head">${head}</div>
        ${
          r.leaderLine
            ? `<div class="gth-leader" style="margin-top:14px;text-align:left">${portraitHTML(L.portrait, 'sm')}
               <div class="gth-sms" style="margin-top:0;flex:1"><b>SMS · ${esc((L.alias || L.name).toUpperCase())}</b>${esc(r.leaderLine)}</div></div>`
            : ''
        }
        ${chips ? `<div class="gth-chips">${chips}</div>` : ''}
        <div class="gth-ledger">${rows}
          <div class="gth-ledger__row gth-ledger__total" style="animation-delay:${0.3 + r.lines.length * 0.12}s"><span>NET</span><i></i><b class="${r.net < 0 ? 'gth-neg' : ''}">${money(r.net, true)}</b></div>
          <div class="gth-ledger__row" style="animation-delay:${0.35 + r.lines.length * 0.12}s"><span>CASH ON HAND</span><i></i><b>${money(r.cashAfter)}</b></div>
        </div>
        ${r.flavor ? `<div class="gth-flavor">${esc(r.flavor)}</div>` : ''}
        <div class="gth-btns"><button type="button" class="gth-btn gth-btn--primary" data-a="ok">BACK TO THE CITY</button></div>
      </div>`,
    );
    el.querySelector('[data-a="ok"]').addEventListener('click', () => (this.click(), done()));
    entry.key = (e) => (e.key === 'Enter' || e.key === 'Escape' ? (done(), true) : false);
    return promise;
  }

  dispose() {
    this.clear(null);
    window.removeEventListener('keydown', this._onKey, true);
  }
}
