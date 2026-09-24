// Hustler Mode — flow controller (HUSTLER_SPEC §6).
//   Title → HUSTLER MODE → start card (continue | new: gang name + story) → City Map hub
//   hub: 'play' → Recruit → Deploy (3D board) → match (GameController.startCustom) → Results → hub
//        'defend' → same with the challenge's raiding party   ·   'puzzles' → PuzzleMode   ·   'menu' → title
//
// Handler ownership: while the hub/recruit/deploy/results are up, GameController is suspended. Deploy and
// PuzzleMode borrow world.onSquareClick and restore it; before every match GameController.startCustom()
// re-attaches its own handlers, and leaving to the main menu goes through game.showMenu() (which does too).
// Every async step checks `this.flow` (a token bumped on exit) so a stale await can never drive the UI.
import * as balance from './data/balance.js';
import * as lore from './data/lore.js';
import { CityMap } from './map/CityMap.js';
import { PuzzleMode } from '../puzzles/PuzzleMode.js';
import { loadPuzzles } from '../puzzles/data.js';
import { Campaign } from './Campaign.js';
import { botPlacement, placementBoard } from './army.js';
import { Screens } from './ui/Screens.js';
import { Deploy } from './ui/Deploy.js';
import { VoiceLines } from './VoiceLines.js';

const PLAYER_COLORS = { primary: '#29e3d6', accent: '#ff5fa2' };

export class HustlerController {
  constructor({ world, hud, sfx, game, hudEl }) {
    this.world = world;
    this.hud = hud;
    this.sfx = sfx;
    this.game = game;
    this.flow = 0;
    this.active = false;
    this.campaign = new Campaign({ balance, lore });

    this.layer = document.createElement('div');
    this.layer.className = 'gth';
    hudEl.appendChild(this.layer);
    this.mapRoot = document.createElement('div');
    this.mapRoot.className = 'gth-maproot';
    this.layer.appendChild(this.mapRoot);

    this.screens = new Screens(this.layer, { sfx });
    this.deploy = new Deploy({ world, rootEl: this.layer, sfx });
    this.map = null; // created lazily (it builds a lot of DOM)
    this.puzzles = null;
    this.puzzleCount = null;
    this._busy = false;
  }

  // =================================================================== entry / exit
  async open() {
    const f = ++this.flow;
    this.active = true;
    this.game.suspend?.();
    this.hud.hideAll?.();
    this.hud.setInGame?.(false);
    this._idleBoard();
    const c = this.campaign;

    // a match that was running when the page closed counts as walking out
    const had = c.load();
    if (had && c.state.activeMatch) {
      const r = c.abandonActiveMatch();
      if (r) {
        await this.screens.story({
          kicker: 'Last time',
          title: 'WALKED OUT',
          lines: [`You left the job at ${r.nodeName} mid-game. The crew you hired went home without you.`],
          cta: 'OKAY',
        });
        if (f !== this.flow) return;
      }
    }

    for (;;) {
      const peek = c.peek();
      const choice = await this.screens.start({ peek, city: lore.CITY });
      if (f !== this.flow) return;
      if (choice === 'continue' && c.load()) break;
      if (choice === 'new') {
        if (peek) {
          const sure = await this.screens.confirm({
            kicker: 'New campaign',
            title: 'START OVER?',
            text: `This wipes ${peek.gangName} (${peek.owned} turf, $${peek.cash.toLocaleString('en-US')}). Export first if you want a backup.`,
            yes: 'WIPE IT',
            danger: true,
          });
          if (f !== this.flow) return;
          if (!sure) continue;
        }
        if (await this._newCampaign(f)) break;
        if (f !== this.flow) return;
        continue;
      }
      if (choice === 'import') {
        await this._import(f);
        if (f !== this.flow) return;
        continue;
      }
      return this.exit(); // 'menu' / null
    }
    if (f !== this.flow) return;
    this.hub();
  }

  async _newCampaign(f) {
    const name = await this.screens.newCampaign({ defaultName: lore.PLAYER_DEFAULT_GANG || 'The Crew', city: lore.CITY });
    if (f !== this.flow || !name) return false;
    this.campaign.newCampaign(name);
    await this.screens.story({ kicker: lore.CITY?.name || 'Vice City', title: name.toUpperCase(), lines: lore.STORY?.intro || [], cta: "LET'S GET PAID" });
    if (f !== this.flow) return false;
    this.campaign.markIntroSeen();
    return true;
  }

  async _import(f) {
    const io = this.screens.saveText({ mode: 'import' });
    const text = await io.promise;
    if (f !== this.flow || text == null) return false;
    const res = this.campaign.importJSON(text);
    this.screens.toast(res.ok ? 'Save imported.' : res.error);
    return res.ok;
  }

  /** Leave Hustler Mode for the main title menu. */
  exit() {
    this.flow++;
    this.active = false;
    this.deploy.cancel(null);
    this.puzzles?.stop?.();
    this.voice?.dispose();
    this.voice = null;
    this.screens.clear(null);
    this.map?.hide();
    this.game.showMenu(); // re-attaches GameController handlers, restores colors/crews, shows the title
  }

  // =================================================================== hub
  _ensureMap() {
    if (this.map) return this.map;
    this.map = new CityMap(this.mapRoot);
    this.map.onAction = (name, payload) => this._onMapAction(name, payload);
    return this.map;
  }

  view() {
    const v = this.campaign.view();
    if (!v) return v;
    v.playerColors = PLAYER_COLORS;
    if (this.puzzleCount != null) v.puzzles.unsolved = Math.max(0, this.puzzleCount - v.puzzles.solved);
    // optional extras CityMap understands
    for (const n of v.nodes) {
      if (n.status === 'locked') n.lockReason = this._lockReason(n);
      if (this.campaign.state.owned[n.id] != null) n.ownedSince = this.campaign.state.owned[n.id];
    }
    return v;
  }

  _lockReason(n) {
    const c = this.campaign;
    const nh = n.neighborhoodId;
    if (!c.isUnlocked(nh)) {
      if (nh === 'nh2' || nh === 'nh3') return 'Take down the Sunset Strand boss first.';
      if (nh === 'nh4') return 'Control both Rustwater Docks and Neon Mile.';
      if (nh === 'downtown') return 'Control Crown Hills first.';
    }
    if (n.type === 'boss') return 'Own all three streets in this neighborhood first.';
    return 'Locked.';
  }

  async hub({ celebrate = [], focus = null } = {}) {
    const f = this.flow;
    this.game.suspend?.();
    this.hud.hideAll?.();
    this.hud.setInGame?.(false);
    this.screens.clear(null);
    this._idleBoard();
    this._loadPuzzleCount();
    const map = this._ensureMap();
    map.show(this.view());
    if (this.sfx?.music?.available) this.sfx.startRadio('hub');
    // story beats that have not been shown (e.g. after an import)
    const pend = this.campaign.takePendingUnlocks();
    for (const u of pend) {
      await this.screens.story({ kicker: 'New territory', title: u.name.toUpperCase(), lines: [u.text], cta: 'SHOW ME' });
      if (f !== this.flow) return;
    }
    for (const id of celebrate) {
      try {
        await map.celebrate(id);
      } catch {
        /* ignore */
      }
      if (f !== this.flow) return;
    }
    if (!focus && typeof innerWidth === 'number' && innerWidth < 760) {
      // phone widths: the fitted city is tiny, so zoom to the next job
      const v = map.view || this.view();
      focus = (v.challenge && v.challenge.targetNodeId) || v.nodes.find((n) => n.status === 'available')?.id || null;
    }
    if (focus) {
      try {
        await map.focus(focus);
      } catch {
        /* ignore */
      }
    }
  }

  async _loadPuzzleCount() {
    if (this.puzzleCount != null) return;
    try {
      const list = await loadPuzzles();
      this.puzzleCount = list.length;
      if (this.map?.visible && this.active && !this._busy) this.map.update(this.view());
    } catch {
      /* no pack: unsolved stays null */
    }
  }

  _onMapAction(name, payload = {}) {
    if (!this.active || this._busy) return;
    try {
      this.sfx?.resume?.();
    } catch {
      /* ignore */
    }
    switch (name) {
      case 'play':
        return this._runJob(() => this.campaign.prepareMatch(payload.nodeId));
      case 'defend':
        return this._runJob(() => this.campaign.prepareDefense());
      case 'puzzles':
        return this._runPuzzles();
      case 'stats':
        return this._runStats();
      case 'audio':
        return this.game.onAudio?.();
      case 'menu':
        this.sfx?.play?.('click');
        return this.exit();
      default:
        console.warn('[Hustler] unknown map action', name);
    }
  }

  // =================================================================== job: recruit → deploy → match → results
  async _runJob(prepare) {
    const f = this.flow;
    const match = prepare();
    if (!match) {
      this.screens.toast("That job isn't available.");
      return;
    }
    this._busy = true;
    try {
      this.map?.hide();
      const bot = botPlacement(match.botArmy);
      const gangColors = match.leader.colors;
      let cart = null;
      let placement = null;
      for (;;) {
        // --- recruit
        this.world.setTeamColors?.('b', gangColors);
        this.world.setPosition(placementBoard({ e1: 'k' }, bot));
        this.world.setCameraPreset?.('white');
        const pick = await this.screens.recruit(match, { cart });
        if (f !== this.flow) return;
        if (!pick || pick.action === 'back') {
          this.world.setTeamColors?.('b', null);
          return this.hub({ focus: match.kind === 'attack' ? match.nodeId : null });
        }
        if (pick.action === 'decline') {
          const sure = await this.screens.confirm({
            kicker: 'Rival challenge',
            title: 'GIVE IT UP?',
            text: `${match.nodeName} goes to ${match.leader.alias || match.leader.name} without a fight. No money spent.`,
            yes: 'HAND IT OVER',
            danger: true,
          });
          if (f !== this.flow) return;
          if (!sure) {
            cart = null;
            continue;
          }
          this.campaign.declineChallenge();
          this.world.setTeamColors?.('b', null);
          return this.hub();
        }
        cart = pick.army;
        const chk = this.campaign.checkArmy(match, cart);
        if (!chk.ok) {
          this.screens.toast(chk.error);
          continue;
        }
        // --- deploy
        this.screens.clear(null);
        const dep = await this.deploy.run({
          army: cart,
          freePawns: match.freePawns,
          botPlacement: bot,
          title: match.kind === 'defense' ? `DEFEND ${match.nodeName.toUpperCase()}` : 'DEPLOY YOUR CREW',
          initial: placement,
        });
        if (f !== this.flow) return;
        if (!dep) continue; // back to recruit (cart kept)
        placement = dep.placement;
        // --- pay + play
        const st = this.campaign.startMatch(match, cart);
        if (!st.ok) {
          this.screens.toast(st.error);
          continue;
        }
        const summary = await this._playMatch(f, match, dep.fen);
        if (f !== this.flow) return;
        return this._results(f, match, summary);
      }
    } finally {
      if (f === this.flow) this._busy = false;
    }
  }

  _playMatch(f, match, fen) {
    return new Promise((resolve) => {
      const L = match.leader;
      this.world.setTeamColors?.('b', L.colors);
      this.hud.setInGame?.(true);
      this._matchResolve = resolve;
      // soundtrack follows the turf: each neighborhood has its own station, bosses get boss themes
      if (this.sfx?.music) {
        const id = match.nodeId;
        this.sfx.music.matchTag = id === 'city_boss' ? 'city_boss' : id.endsWith('_boss') ? 'boss' : id.slice(0, 3);
      }
      // fixed Gemini-written lines as speech bubbles from both kings (see VoiceLines.js)
      this.voice?.dispose();
      const voice = (this.voice = new VoiceLines({
        world: this.world,
        rootEl: this.layer,
        speakerId: match.leaderId || match.nodeId,
        speakerName: L.alias || L.name,
        speakerColor: L.colors?.accent || L.colors?.primary,
        gangName: this.campaign.state.gangName,
        rivalName: L.alias || L.name,
      }));
      this.game.startCustom({
        fen,
        profile: match.profile,
        cashTable: this.campaign.node(match.nodeId)?.captureBounty || null,
        voice,
        opponent: { name: L.alias || L.name, crew: L.gangName, lines: L.lines, taunts: L.taunts },
        player: { name: this.campaign.state.gangName },
        onGameEnd: (summary) => {
          this._matchResolve = null;
          setTimeout(() => {
            voice.dispose();
            if (this.voice === voice) this.voice = null;
          }, 3000); // let the last words finish over the results screen
          resolve(summary);
        },
        onMenu: async () => {
          const sure = await this.screens.confirm({
            kicker: 'Leave the job',
            title: 'WALK AWAY?',
            text: 'Walking out counts as a loss. Your crew is gone either way.',
            yes: 'WALK AWAY',
            no: 'KEEP PLAYING',
            danger: true,
          });
          if (f !== this.flow || !sure) return;
          this.game.resign();
        },
      });
    });
  }

  async _results(f, match, summary) {
    this.screens.clear(null);
    this.game.suspend?.();
    const r = this.campaign.resolveMatch(summary || { result: 'loss', reason: 'error' });
    this.hud.hideAll?.();
    this.hud.setInGame?.(false);
    if (!r) return this.hub();
    const names = {};
    for (const id of [...r.gained, ...r.lost]) names[id] = this.campaign.nodeName(id);
    await this.screens.results({ ...r, names }, { nodeName: r.nodeName });
    if (f !== this.flow) return;
    this.world.setTeamColors?.('b', null);
    for (const c of r.controlled) {
      await this.screens.story({ kicker: 'Neighborhood controlled', title: c.name.toUpperCase(), lines: [c.text], cta: 'NICE' });
      if (f !== this.flow) return;
    }
    if (r.finale) {
      await this.screens.story({ kicker: 'Nocturno Tower', title: 'THE CITY IS YOURS', lines: lore.STORY?.finale || [], cta: 'OWN IT' });
      if (f !== this.flow) return;
      this.campaign.markFinaleShown();
    }
    const unlockIds = r.unlocks.map((u) => u.id);
    for (const u of r.unlocks) {
      await this.screens.story({ kicker: 'New territory', title: u.name.toUpperCase(), lines: [u.text], cta: 'SHOW ME' });
      if (f !== this.flow) return;
    }
    if (unlockIds.length) this.campaign.markUnlocksShown(unlockIds);
    if (r.newChallenge) {
      const ch = r.newChallenge;
      await this.screens.story({
        kicker: `SMS · ${(ch.attacker.alias || ch.attacker.name).toUpperCase()}`,
        title: 'TURF UNDER ATTACK',
        lines: [ch.message, `${ch.attacker.gangName} is coming for ${ch.targetName}. Defend it within ${ch.gamesLeft} jobs or lose it.`],
        cta: 'SEE THE MAP',
      });
      if (f !== this.flow) return;
    }
    this._busy = false;
    return this.hub({ celebrate: r.gained, focus: r.newChallenge ? r.newChallenge.targetNodeId : null });
  }

  // =================================================================== puzzles / stats
  async _runPuzzles() {
    const f = this.flow;
    this._busy = true;
    try {
      this.map?.hide();
      this.hud.setInGame?.(false);
      if (this.sfx?.music?.available) this.sfx.startRadio('puzzle');
      if (!this.puzzles) this.puzzles = new PuzzleMode({ world: this.world, hud: this.hud, sfx: this.sfx, rootEl: this.layer });
      const c = this.campaign;
      await this.puzzles.run({
        solvedIds: c.solvedPuzzleIds(),
        rewardFor: (p, { firstTry } = {}) => c.puzzleRewardFor(p, { firstTry }),
        onSolved: (p, { firstTry } = {}) => c.creditPuzzle(p, { firstTry }),
      });
    } catch (err) {
      console.error('[Hustler] puzzles failed', err);
    } finally {
      if (f === this.flow) this._busy = false;
    }
    if (f !== this.flow) return;
    this.hub();
  }

  async _runStats() {
    const f = this.flow;
    this._busy = true;
    try {
      for (;;) {
        const a = await this.screens.stats(this.view());
        if (f !== this.flow) return;
        if (a === 'export') {
          await this.screens.saveText({ mode: 'export', text: this.campaign.exportJSON() }).promise;
          if (f !== this.flow) return;
          continue;
        }
        if (a === 'import') {
          const ok = await this._import(f);
          if (f !== this.flow) return;
          if (ok) break;
          continue;
        }
        if (a === 'new') {
          const sure = await this.screens.confirm({
            kicker: 'New campaign',
            title: 'START OVER?',
            text: 'This wipes the current campaign for good. Export first if you want a backup.',
            yes: 'WIPE IT',
            danger: true,
          });
          if (f !== this.flow) return;
          if (!sure) continue;
          this.map?.hide();
          if (!(await this._newCampaign(f))) {
            if (f !== this.flow) return;
            if (!this.campaign.state) return this.exit();
          }
          break;
        }
        break;
      }
    } finally {
      if (f === this.flow) this._busy = false;
    }
    if (f !== this.flow) return;
    this.hub();
  }

  // =================================================================== helpers
  _idleBoard() {
    // standard set-up behind the hub (puzzles / deploy / finished matches leave their own positions)
    try {
      this.game.rules.reset();
      this.world.setPosition(this.game.rules.board());
    } catch {
      /* ignore */
    }
    this.world.setInputEnabled?.(false);
    this.world.highlight?.({});
    this.world.setWanted?.(0);
    this.hud.setWanted?.(0);
    this.world.setCameraPreset?.('cinematic');
  }

  // ---- debug hooks (window.__gtc.hustler) for automated testing ----
  /** Force the running Hustler match to end with a result ('win'|'loss'|'standoff'). */
  debugEndMatch(result = 'win', extra = {}) {
    const g = this.game;
    if (!g.custom || !['human', 'ai', 'animating', 'promoting'].includes(g.state)) return false;
    const me = g.opts.playerColor;
    const over = { result: result === 'win' ? me : result === 'loss' ? (me === 'w' ? 'b' : 'w') : 'draw', reason: result === 'standoff' ? 'stalemate' : 'checkmate' };
    g.gameId++;
    g.ai?.cancel?.();
    const sum = g.matchSummary(over);
    Object.assign(sum, extra);
    g.state = 'menu';
    g.custom.onGameEnd?.(sum);
    return true;
  }
}
