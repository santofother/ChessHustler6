// Generate the fixed Hustler Mode voice lines with Google Gemini and write src/hustler/data/voicelines.js.
// The lines are generated ONCE (this script) and shipped as data — every playthrough uses the same set.
//
//   GEMINI_API_KEY must be set (Google AI Studio key); it is never printed.
//   node tools/lines/generate.mjs                  generate all speakers missing from voicelines.js
//   node tools/lines/generate.mjs --only nh1_s1    regenerate specific speakers (comma list; 'player' = your Boss)
//   node tools/lines/generate.mjs --force          regenerate everyone
//   node tools/lines/generate.mjs --model gemini-2.5-flash
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as lore from '../../src/hustler/data/lore.js';
import * as balance from '../../src/hustler/data/balance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'hustler', 'data', 'voicelines.js');
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const MODELS = opt('--model') ? [opt('--model')] : ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'];
const only = opt('--only')?.split(',').map((s) => s.trim());
const force = args.includes('--force');

// When each line is said. Keep in sync with src/hustler/VoiceLines.js (the runtime trigger logic).
export const TRIGGERS = {
  intro: 'first thing said when the match starts (the leader sizes up the player)',
  capture: 'the speaker just took one of the opponent’s pieces',
  lose_piece: 'the speaker just lost one of their own pieces',
  lose_big: 'the speaker just lost their most valuable piece (queen/heli, or a rook/truck if they had no queen)',
  give_check: 'the speaker just put the opponent’s king (Boss) in check',
  in_check: 'the speaker’s own king (Boss) was just put in check',
  winning: 'the speaker is clearly ahead in material (up 3+ points) — gloating',
  losing: 'the speaker is clearly behind in material (down 3+ points) — rattled, bargaining, excuses',
  promotion: 'a pawn (Street Thug) just reached the last rank and upgraded — speaker reacts to their own or the enemy’s',
  castle: 'the speaker castled (“valet parking” — king tucked behind the armored truck)',
  idle: 'the opponent has been thinking a long time (20+ seconds) — impatient needling',
  checkmated: 'the speaker just got checkmated and lost the street — last words',
  win: 'the speaker just checkmated the opponent — victory line',
  standoff: 'the game ended in a draw (stalemate, repetition or not enough pieces)',
};
const PER_TRIGGER = 3;

function speakers() {
  const list = Object.keys(lore.LEADERS).map((id) => {
    const L = lore.LEADERS[id];
    const g = lore.GANGS[L.gangId] || {};
    const nhId = id === 'city_boss' ? 'downtown' : id.slice(0, 3);
    const nh = lore.NEIGHBORHOODS[nhId] || {};
    const node = balance.NODES[id] || {};
    const army = Object.entries(node.army || {}).filter(([, n]) => n).map(([t, n]) => `${n}×${{ p: 'Street Thug (pawn)', n: 'Sport Bike (knight)', b: 'Touring Car (bishop)', r: 'Armored Truck (rook)', q: 'Heli (queen)' }[t]}`).join(', ');
    return {
      id,
      brief:
        `${L.name}, aka "${L.alias}" — ${L.title} of ${g.name || 'a local crew'} in ${nh.name || 'Vice City'} (${nh.vibe || ''}).\n` +
        `Who they are: ${L.blurb}\nPlay style: ${L.gimmick || ''}\nTheir army: King (their Boss) + ${army || 'pawns'}.\n` +
        `Their existing lines for tone reference: intro "${L.lines?.intro}", when they lose "${L.lines?.playerWins}", ` +
        `when they win "${L.lines?.playerLoses}".` +
        (id.endsWith('_boss') || id === 'city_boss' ? '\nThis is a boss: more menacing and memorable than street leaders.' : ''),
    };
  });
  list.push({
    id: 'player',
    brief:
      'The PLAYER’s own Boss (king) — the leader of an up-and-coming crew taking over Vice City street by street. ' +
      'Cocky, charming, quick-witted, a little reckless; lines must work against ANY rival leader and at any point ' +
      'in the campaign. Use the token {gang} where the crew name should appear (sparingly) and {rival} for the ' +
      'opponent’s alias (sparingly). Lines are said by the player’s king in a speech bubble.',
  });
  return list;
}

function promptFor(sp) {
  const trig = Object.entries(TRIGGERS).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  return (
    'You write in-game dialogue for "Grand Theft Chess: Vice City Gambit", a crime-comedy chess game that parodies ' +
    'GTA VI (sunny neon Vice City, Leonida). Chess pieces are street characters: pawns = Street Thugs, knights = Sport Bikes, ' +
    'bishops = Touring Cars, rooks = Armored Trucks, queen = Heli, king = the Boss. Lines appear as short speech bubbles ' +
    'coming from the speaker’s king during a match.\n\n' +
    `SPEAKER:\n${sp.brief}\n\n` +
    `Write exactly ${PER_TRIGGER} different lines for EACH trigger below:\n${trig}\n\n` +
    'Rules: each line max 90 characters, one sentence (two very short ones at most); strongly in character with a ' +
    'distinct voice; funny GTA-style satire; reference chess or the piece nicknames often but not every line; vary ' +
    'the three lines per trigger (different jokes, not rephrasings); PG-13, no slurs, no real people, brands or real gangs; ' +
    'no emojis, no hashtags, no quotation marks around the line.'
  );
}

const SCHEMA = {
  type: 'OBJECT',
  properties: Object.fromEntries(Object.keys(TRIGGERS).map((k) => [k, { type: 'ARRAY', items: { type: 'STRING' } }])),
  required: Object.keys(TRIGGERS),
};

async function callGemini(prompt, key) {
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.0, responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
        signal: AbortSignal.timeout(120000),
      });
      const raw = await res.text();
      if (res.ok) {
        const txt = JSON.parse(raw).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        return { model, data: JSON.parse(txt) };
      }
      lastErr = new Error(`${model} HTTP ${res.status}: ${raw.slice(0, 300)}`);
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      break; // 4xx other than 429: try the next model
    }
  }
  throw lastErr;
}

const clean = (s) =>
  String(s || '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function loadExisting() {
  if (!fs.existsSync(OUT)) return {};
  try {
    const m = await import(pathToFileURL(OUT).href + '?t=' + Date.now());
    return m.VOICE_LINES?.speakers || {};
  } catch {
    return {};
  }
}

function write(speakersOut, models) {
  const body = {
    generatedWith: [...models].join(', '),
    triggers: TRIGGERS,
    speakers: speakersOut,
  };
  fs.writeFileSync(
    OUT,
    '// Hustler Mode voice lines — GENERATED by tools/lines/generate.mjs with Google Gemini. Fixed data: the same\n' +
      '// lines every playthrough. Edit freely; regenerate one speaker with `--only <nodeId|player>`.\n' +
      '// speakers[nodeId | "player"][trigger] = [line, ...]; "player" lines may contain {gang} / {rival}.\n' +
      `export const VOICE_LINES = ${JSON.stringify(body, null, 2)};\n`,
  );
}

async function main() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error('GEMINI_API_KEY is not set.');
    process.exit(1);
  }
  const out = await loadExisting();
  const models = new Set();
  let failed = 0;
  for (const sp of speakers()) {
    if (only ? !only.includes(sp.id) : !force && out[sp.id]) continue;
    process.stdout.write(`${sp.id}... `);
    try {
      const { model, data } = await callGemini(promptFor(sp), key);
      models.add(model);
      const lines = {};
      for (const t of Object.keys(TRIGGERS)) {
        lines[t] = (Array.isArray(data[t]) ? data[t] : []).map(clean).filter((l) => l && l.length <= 140).slice(0, PER_TRIGGER);
      }
      const missing = Object.keys(TRIGGERS).filter((t) => !lines[t].length);
      out[sp.id] = lines;
      console.log(`ok (${model})${missing.length ? ' missing: ' + missing.join(',') : ''}`);
    } catch (err) {
      failed++;
      console.log('FAILED ' + String(err.message || err).replace(key, '[key]'));
    }
    await new Promise((r) => setTimeout(r, 1500)); // stay well under free-tier rate limits
  }
  // one write at the end: rewriting a src/ file mid-run makes a running dev server reload the game
  if (models.size) write(out, models);
  if (failed) process.exitCode = 1;
}

main();
